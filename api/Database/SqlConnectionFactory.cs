using Microsoft.Data.SqlClient;

namespace Neighborhood.Database;

/// <summary>
/// Creates connections to the Azure SQL Database using the connection
/// string in the 'SqlConnectionString' app setting (SQL authentication,
/// user + password). Moving to a passwordless approach later (Managed
/// Identity / Entra ID) only means changing this connection string —
/// nothing else in the code needs to change.
/// </summary>
public static class SqlConnectionFactory
{
    public static SqlConnection Create()
    {
        var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString")
            ?? throw new InvalidOperationException(
                "Missing 'SqlConnectionString' app setting. Add it to local.settings.json for local development.");

        return new SqlConnection(connectionString);
    }
}
