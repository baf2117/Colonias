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
