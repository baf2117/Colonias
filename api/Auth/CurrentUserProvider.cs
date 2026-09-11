using Neighborhood.Database;

namespace Neighborhood.Auth;

/// <summary>
/// Looks up the CurrentUser record for a validated Auth0 subject. A
/// valid, well-signed token whose "sub" has no matching active row in
/// Users means the person authenticated successfully but hasn't been
/// provisioned in the system yet — that's an authorization problem
/// (403), not an authentication one (401).
/// </summary>
public class CurrentUserProvider
{
    public async Task<CurrentUser?> LoadBySubAsync(string auth0Sub, CancellationToken cancellationToken)
    {
        await using var connection = SqlConnectionFactory.Create();
        await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT u.UserId, u.Auth0Sub, u.Role, u.Name, u.Email, u.ResidentId, r.UnitId
            FROM dbo.Users u
            LEFT JOIN dbo.Residents r ON r.ResidentId = u.ResidentId
            WHERE u.Auth0Sub = @sub AND u.Active = 1";
        command.Parameters.AddWithValue("@sub", auth0Sub);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new CurrentUser
        {
            UserId = reader.GetInt32(reader.GetOrdinal("UserId")),
            Auth0Sub = reader.GetString(reader.GetOrdinal("Auth0Sub")),
            Role = reader.GetString(reader.GetOrdinal("Role")),
            Name = reader.GetString(reader.GetOrdinal("Name")),
            Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
            ResidentId = reader.IsDBNull(reader.GetOrdinal("ResidentId")) ? null : reader.GetInt32(reader.GetOrdinal("ResidentId")),
            UnitId = reader.IsDBNull(reader.GetOrdinal("UnitId")) ? null : reader.GetInt32(reader.GetOrdinal("UnitId")),
        };
    }
}
