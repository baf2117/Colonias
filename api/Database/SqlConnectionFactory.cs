using Microsoft.Data.SqlClient;

namespace Neighborhood.Database;

/// <summary>
/// Creates connections to the Azure SQL Database using Microsoft Entra ID
/// authentication ("Authentication=Active Directory Default" in the
/// connection string) — no password is stored anywhere. Locally it uses
/// whatever account you're signed in with (Azure CLI or Visual Studio);
/// once deployed, it uses the Function App's managed identity.
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
