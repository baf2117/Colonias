using Neighborhood.Database;

namespace Neighborhood.Auth;

/// <summary>
/// Looks up the CurrentUser record for a validated Auth0 subject. A
/// valid, well-signed token whose "sub" has no matching active row in
/// Residents means the person authenticated successfully but hasn't
/// been provisioned in the system yet — that's an authorization
/// problem (403), not an authentication one (401).
/// </summary>
public class CurrentUserProvider
{
    public async Task<CurrentUser?> LoadBySubAsync(string auth0Sub, CancellationToken cancellationToken)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        // Ya no hace falta el LEFT JOIN hacia Residents que tenía esta
        // consulta antes de la fusión: UnitId vive directo en la fila de
        // Residents.
        command.CommandText = @"
            SELECT ResidentId, Auth0Sub, Name, Email, UnitId, NeighborhoodId,
                   Administrador, SuperAdministrador, Residente
            FROM dbo.Residents
            WHERE Auth0Sub = @sub AND Active = 1";
        command.Parameters.AddWithValue("@sub", auth0Sub);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new CurrentUser
        {
            ResidentId = reader.GetInt32(reader.GetOrdinal("ResidentId")),
            Auth0Sub = reader.GetString(reader.GetOrdinal("Auth0Sub")),
            Name = reader.GetString(reader.GetOrdinal("Name")),
            Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
            UnitId = reader.IsDBNull(reader.GetOrdinal("UnitId")) ? null : reader.GetInt32(reader.GetOrdinal("UnitId")),
            NeighborhoodId = reader.IsDBNull(reader.GetOrdinal("NeighborhoodId")) ? null : reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
            Administrador = reader.GetBoolean(reader.GetOrdinal("Administrador")),
            SuperAdministrador = reader.GetBoolean(reader.GetOrdinal("SuperAdministrador")),
            Residente = reader.GetBoolean(reader.GetOrdinal("Residente")),
        };
    }

    /// <summary>
    /// Igual que LoadBySubAsync pero contra dbo.SecurityStaff: los
    /// guardias no son Residents, tienen su propio Auth0Sub y su
    /// propia relación (directa) con una colonia.
    /// </summary>
    public async Task<CurrentStaff?> LoadStaffBySubAsync(string auth0Sub, CancellationToken cancellationToken)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT StaffId, Auth0Sub, Name, NeighborhoodId
            FROM dbo.SecurityStaff
            WHERE Auth0Sub = @sub AND Active = 1";
        command.Parameters.AddWithValue("@sub", auth0Sub);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new CurrentStaff
        {
            StaffId = reader.GetInt32(reader.GetOrdinal("StaffId")),
            Auth0Sub = reader.GetString(reader.GetOrdinal("Auth0Sub")),
            Name = reader.GetString(reader.GetOrdinal("Name")),
            NeighborhoodId = reader.GetInt32(reader.GetOrdinal("NeighborhoodId")),
        };
    }
}
