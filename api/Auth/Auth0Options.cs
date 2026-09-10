namespace Neighborhood.Auth;

/// <summary>
/// Auth0 tenant settings needed to validate JWTs. Both values come from
/// the API you register in the Auth0 dashboard (see AUTH0.md).
/// </summary>
public class Auth0Options
{
    public required string Domain { get; init; }
    public required string Audience { get; init; }

    public static Auth0Options FromEnvironment()
    {
        var domain = Environment.GetEnvironmentVariable("Auth0Domain")
            ?? throw new InvalidOperationException("Missing 'Auth0Domain' app setting.");
        var audience = Environment.GetEnvironmentVariable("Auth0Audience")
            ?? throw new InvalidOperationException("Missing 'Auth0Audience' app setting.");

        return new Auth0Options { Domain = domain, Audience = audience };
    }
}
