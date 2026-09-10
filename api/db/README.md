# Base de datos

Servidor: `jasaju.database.windows.net`
Base de datos: `free-sql-db-6000256`

## Migraciones

Los scripts en `migrations/` están numerados y se aplican en orden. `0001_init.sql` crea el esquema inicial completo (catálogos, unidades, residentes, usuarios, pagos, gastos, nómina, accesos y notificaciones).

### Cómo aplicar un script

La forma más simple, sin instalar nada, es desde el propio portal de Azure:

1. Entra al recurso de la base de datos en portal.azure.com.
2. Abre "Editor de consultas (versión preliminar)" en el menú de la izquierda.
3. Inicia sesión con el usuario y contraseña administradores que definiste al crear la base.
4. Pega el contenido del script (`migrations/0001_init.sql`) y ejecútalo.

También puedes usar Azure Data Studio o SQL Server Management Studio conectándote a `jasaju.database.windows.net,1433`, base de datos `free-sql-db-6000256`, con el mismo usuario y contraseña.

Los scripts nuevos siempre se agregan como archivos nuevos (`0002_...sql`, `0003_...sql`), nunca se edita uno que ya se corrió contra la base.

## Conexión desde el API (Azure Functions)

Por simplicidad, de entrada el API se conecta con usuario y contraseña (autenticación SQL) — el mismo usuario administrador que definiste al crear la base de datos. Más adelante, cuando el sistema ya esté funcionando, conviene migrar a una identidad administrada (sin contraseñas guardadas en ningún lado); por ahora esto es más simple de entender y de poner a andar.

La cadena de conexión ya está en `local.settings.json` (que no se sube al repositorio), con placeholders:

```
Server=tcp:jasaju.database.windows.net,1433;Initial Catalog=free-sql-db-6000256;User ID=<TU_USUARIO>;Password=<TU_CONTRASEÑA>;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

Abre ese archivo (`api/local.settings.json`) en Visual Studio (o cualquier editor de texto) y reemplaza `<TU_USUARIO>` y `<TU_CONTRASEÑA>` por el usuario y la contraseña administradores que definiste al crear la base de datos. Ese archivo nunca se sube al repositorio, así que la contraseña se queda solo en tu computadora.

Con eso, el endpoint `GET /api/DbPing` (agregado en el proyecto) abre una conexión real y devuelve cuántas tablas tiene la base — sirve para confirmar que la conexión quedó bien antes de construir los endpoints reales.

### Cuando el Function App esté desplegado en Azure

La misma cadena de conexión (con usuario y contraseña) se agrega como configuración del Function App en Azure (nunca en el código ni en el repositorio) — Azure guarda esa configuración cifrada. Cuando el sistema ya esté estable, vale la pena revisar la opción de migrar a una identidad administrada, que elimina por completo la necesidad de guardar una contraseña, incluso cifrada.
