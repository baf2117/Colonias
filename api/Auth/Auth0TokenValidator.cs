using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Neighborhood.Auth;

/// <summary>
/// Validates JWTs issued by Auth0 against the tenant's JWKS endpoint.
/// Signing keys are fetched once and cached/refreshed automatically by
/// ConfigurationManager, so this doesn't hit Auth0 on every request.
/// </summary>
public class Auth0TokenValidator
{
    private readonly Auth0Options _options;
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configManager;
    private readonly JwtSecurityTokenHandler _handler = new();

    public Auth0TokenValidator(Auth0Options options)
    {
        _options = options;
        var metadataAddress = $"https://{_options.Domain}/.well-known/openid-configuration";
        _configManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataAddress,
            new OpenIdConnectConfigurationRetriever());
    }

    public async Task<ClaimsPrincipal> ValidateAsync(string token, CancellationToken cancellationToken)
    {
        var config = await _configManager.GetConfigurationAsync(cancellationToken);

        var validationParameters = new TokenValidationParameters
        {
            ValidIssuer = $"https://{_options.Domain}/",
            ValidAudience = _options.Audience,
            IssuerSigningKeys = config.SigningKeys,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
        };

        return _handler.ValidateToken(token, validationParameters, out _);
    }
}
