# Base de datos

Servidor: `jasaju.database.windows.net`
Base de datos: `free-sql-db-6000256`

## Esquema

`schema.sql` es la única fuente de verdad de la estructura de la base de datos: un archivo con la definición completa (todas las tablas, columnas, llaves) tal como se ve hoy. Ya no se guardan migraciones incrementales numeradas — se descartaron en favor de este archivo único porque simplifica leer "cómo es la base hoy" sin tener que sumar mentalmente una serie de archivos.

### Cómo aplicar un cambio de esquema

1. Editá `schema.sql` directamente para que refleje la estructura nueva.
2. Escribí a mano el `ALTER TABLE` / `CREATE TABLE` / `DROP TABLE` equivalente y corrélo contra la base real (Azure), desde el "Editor de consultas (versión preliminar)" del portal de Azure, Azure Data Studio o SQL Server Management Studio (conectándote a `jasaju.database.windows.net,1433`, base de datos `free-sql-db-6000256`, con el usuario y contraseña administradores).
3. `schema.sql` no se corre tal cual contra una base que ya tiene datos — es la definición completa desde cero, útil para crear un ambiente nuevo o como referencia de lectura, pero cada cambio sobre la base real necesita su propio `ALTER`/`DROP`/`CREATE` puntual, igual que antes.

Como ya no queda un archivo por cambio, el porqué de cada decisión de esquema (por ejemplo, por qué se eliminó `Fees`) vive en el historial de git de `schema.sql` y en el documento de arquitectura del proyecto, no en un archivo de migración aparte.

### Scripts puntuales pendientes de correr contra la base real

- `2026-09-21_payment_reminders.sql` — crea `dbo.PaymentReminders` (control de recordatorios de pago ya enviados, usada por el Timer Trigger `PaymentReminders.cs`). Sin esta tabla, ese Timer Trigger falla al intentar leerla/escribirla.
- `2026-09-21_residents_neighborhood_id.sql` — agrega `dbo.Residents.NeighborhoodId` (la colonia que administra un Administrador, independiente de `UnitId`). Sin esta columna, `Residents.cs`/`Units.cs` fallan al leerla/escribirla.
- `2026-09-22_residents_receive_emails.sql` — agrega `dbo.Residents.ReceiveEmails` (opt-out de correos automáticos, default `1`). Sin esta columna, `Residents.cs`/`Payments.cs`/`PaymentReminders.cs` fallan al leerla/escribirla.

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
