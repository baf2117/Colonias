# Autenticación (Auth0)

El middleware de validación de JWT (`Auth/JwtAuthenticationMiddleware.cs`) ya está armado y protege todos los endpoints HTTP excepto `Ping` y `DbPing`. Le faltan dos valores de configuración, que salen de registrar un API en tu tenant de Auth0.

## Cómo obtener el dominio y el audience

1. Entra a manage.auth0.com con la cuenta que creaste para el proyecto.
2. Ve a "Applications" → "APIs" → "Create API".
3. Ponle un nombre (por ejemplo "Colonias API"). En "Identifier" escribe una URL lógica que no necesita existir de verdad, por ejemplo `https://colonias-api` — este valor es el **Audience**.
4. El **Domain** de tu tenant aparece en la esquina superior o en cualquier pantalla de "Settings" de una aplicación, con forma `tu-tenant.us.auth0.com` (sin `https://` al inicio).
5. Abre `api/local.settings.json` y reemplaza `<TU_DOMINIO_AUTH0>` y `<TU_AUDIENCE_AUTH0>` con esos dos valores.

## Cómo probar antes de tener el login real de React Admin

Auth0 deja generar un token de prueba directamente desde el dashboard: entra al API que creaste → pestaña "Test" → ahí aparece un ejemplo con `client_id` y `client_secret` de una aplicación de prueba que Auth0 crea automáticamente, para pedir un token por client credentials. Copia el `access_token` de la respuesta y probá:

```
curl -H "Authorization: Bearer <el_token>" http://localhost:7072/api/Me
```

Si todo está bien configurado, responde con `"authenticated": true` y la lista de claims del token.

Un token generado así no tiene un `sub` que corresponda a un residente o guardia real de tu sistema — sirve para confirmar que la validación de firma, emisor y audience funciona, pero no para probar la autorización por rol/unidad. Eso lo probamos más adelante, cuando conectemos el login real desde React Admin.
