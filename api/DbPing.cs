using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Neighborhood.Database;

namespace Neighborhood;

public class DbPing
{
    private readonly ILogger<DbPing> _logger;

    public DbPing(ILogger<DbPing> logger)
    {
        _logger = logger;
    }

    // Quick connectivity check: opens a connection and counts the tables
    // in the database. Not meant to stay long-term — it's here to confirm
    // the connection works end to end before building real endpoints.
    [Function("DbPing")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequest req)
    {
        try
        {
            await using var connection = SqlConnectionFactory.Create();
            await connection.OpenAsync();

            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM sys.tables";
            var tableCount = (int)(await command.ExecuteScalarAsync() ?? 0);

            return new OkObjectResult(new { connected = true, tableCount });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to the database.");
            return new ObjectResult(new { connected = false, error = ex.Message }) { StatusCode = 500 };
        }
    }
}
