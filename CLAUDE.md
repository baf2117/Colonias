# Colonias — guía para Claude Code

Sistema de administración de una colonia residencial: pagos de residentes (comprobante + validación manual), gastos administrativos, nómina de guardias de seguridad y control de acceso. Este archivo es el resumen operativo para trabajar en el repo; el detalle narrativo completo de cada decisión de arquitectura (por qué se eligió cada servicio, alternativas evaluadas, límites de los tiers gratuitos) vive en el proyecto de Claude "Colonias" (`claude/arquitectura-infraestructura.md`), no en este repositorio — si hace falta ese nivel de detalle, pedíselo al usuario o consultá ese documento.

**El `README.md` de la raíz está desactualizado** (dice que el API es "Node/TypeScript"): el API real es **C#/.NET**, ver más abajo.

## Stack

- **Frontend** (`web/`): React Admin 5 + MUI 6, Vite, TypeScript. Desplegado en Azure Static Web Apps (plan gratuito, sin dominio propio).
- **API** (`api/`): Azure Functions en **C#/.NET 10** (modelo de trabajo aislado, `Microsoft.Azure.Functions.Worker`), con la extensión de integración de ASP.NET Core. Todas las operaciones pasan por acá — el frontend nunca habla directo con la base ni con el storage.
- **Base de datos**: Azure SQL Database (free offer), acceso con `Microsoft.Data.SqlClient` (sin ORM).
- **Archivos**: Azure Blob Storage (comprobantes de pago), acceso siempre vía SAS emitida por el API — nunca lectura pública del contenedor.
- **Autenticación**: Auth0 (SPA + JWT validado en cada función). La autorización real (rol, unidad) vive en `dbo.Residents`/`dbo.SecurityStaff`, no en Auth0.
- **Notificaciones**: Brevo (correo transaccional, implementado) y Kapso (WhatsApp, todavía sin ningún endpoint conectado).
- **Monitoreo**: Azure Application Insights vía OpenTelemetry.

## Estructura del repositorio

```
api/                    Azure Functions (C#/.NET)
  Auth/                 CurrentUser/CurrentStaff (usuario resuelto del JWT) y JwtAuthenticationMiddleware
  Database/             SqlConnectionFactory
  Email/                EmailService.cs (Brevo)
  Storage/              BlobStorageService.cs (SAS de Blob Storage)
  db/                   schema.sql (fuente única del esquema) + scripts sueltos fechados + README.md
  *.cs                  Un archivo por recurso (Payments.cs, Units.cs, Residents.cs, Expenses.cs, ...)
  local.settings.json   Secretos locales (NUNCA en git, ver .gitignore)
web/
  src/
    <recurso>/          Un directorio por recurso de react-admin (payments/, units/, expenses/, ...)
                        con Create/Edit/Show/List + campos custom del recurso
    components/         AppFormRow/AppFormCol (grilla de 12 columnas), AppPageTitle, RequireRole.tsx
    layout/             AppLayout, AppMenu, AppSidebar, AppTopBar
    dashboard/          Panel general (MyUnitSection, etc.)
    authProvider.ts      Wrapper sobre Auth0 + GET /api/Me para permisos
    dataProvider.ts      ra-data-simple-rest apuntando al API
    theme.ts             Paleta "Modernist" (ver más abajo)
```

## Comandos

**Frontend** (`cd web`):
- `npm run dev` — servidor de desarrollo (Vite).
- `npx tsc --noEmit` — chequeo de tipos. **Correr esto después de CUALQUIER cambio en `web/`** — es la única verificación automatizada real que tiene el frontend hoy (no hay tests).
- `npm run build` — build de producción (`tsc -b && vite build`).
- `npm run lint` — ESLint.

**API** (`cd api`):
- `dotnet build` — compilar. **Correr esto después de cualquier cambio en `api/`** — no hay tests automatizados, así que compilar es la única red de seguridad.
- `func start` (Azure Functions Core Tools) o `dotnet run` — correr localmente. Necesita `local.settings.json` con los secretos (connection strings, Auth0, Brevo) que el usuario ya tiene configurados; no existe un `local.settings.json.example` en el repo, así que no lo sobrescribas ni lo borres.
- Storage local: Azurite (emulador), `AzureWebJobsStorage` queda como `UseDevelopmentStorage=true` en desarrollo.

No hay CI configurado todavía (pendiente, ver "Estado y pendientes" abajo).

## Convenciones de código

- **Todo el código en inglés** (clases, columnas, endpoints, variables) — la documentación y los comentarios en el código sí van en español, siguiendo el resto del repo. Los comentarios explican el *por qué*, no el *qué* (el código ya dice el qué).
- **Un archivo de Functions por recurso** (`Payments.cs`, `Units.cs`, ...), con sus DTOs como `record` anidados y un helper `RequireXxx` privado cuando el recurso necesita bloqueo total por rol.
- **Patrón de pantallas del frontend**: toda pantalla de Crear/Ver/Editar usa `AppPageTitle` (título centrado en negrita, con el dato real del registro, no el nombre genérico del recurso) + `AppFormRow`/`AppFormCol`, una grilla CSS de 12 columnas (`span={n}`), nunca anchos fijos en píxeles.
- **`web/src/components/RequireRole.tsx`** es el único punto de verdad para predicados de rol en el frontend: `isSuperAdministrador`, `isAdminOrSuperAdmin`, `isPureResident` (Residente=true, Administrador=false, SuperAdministrador=false). Siempre usar estos predicados en vez de repetir la lógica booleana a mano.
- **La protección real siempre es del lado del servidor.** Cualquier ocultamiento de campo/pantalla en el frontend (`condición ? <X/> : null`, nunca `&&` — con `&&` un `false` puede quedar como hijo literal de un `Datagrid`/`AppFormRow`) es solo para UX; el API tiene que rechazar la operación igual si alguien la llama directo.
- **Seguridad a nivel de fila resuelta en código, no RLS de motor.** Azure SQL no llena `SESSION_CONTEXT` automáticamente como Supabase/Postgres — cada función valida rol y unidad del usuario autenticado a mano antes de armar la consulta (ver `Payments.cs`: `GetList`/`GetOne` fuerzan `UnitId` para un residente puro).
- **`SqlDataReader` no soporta MARS**: no se puede abrir un segundo `SqlCommand` en la misma conexión mientras un reader anterior sigue abierto. Patrón estándar del repo: `await using (var reader = ...) { ... }` en un bloque anidado para forzar el `Dispose` antes de reutilizar la conexión (ver `UpdatePayment` en `Payments.cs`).
- **Nunca usar `CultureInfo`/formateo de fecha dependiente de la cultura del sistema en el API** — el runtime de Azure Functions puede no tener esos datos de globalización cargados. Ver `SpanishMonths` en `Payments.cs` como patrón (array hardcodeado).
- **Moneda por colonia**: `Neighborhoods.Currency` (ISO 4217). Nunca asumir una moneda fija — todo componente que muestre un monto resuelve la moneda real saltando hasta `Neighborhoods` (`Unit → Neighborhood` o `Vendor/Unit → Neighborhood`) antes de formatear con `Intl.NumberFormat`.
- **Un residente puro (`isPureResident`) no tiene acceso a `/api/units` ni `/api/residents`** (bloqueados del todo por privacidad/alcance — ver tabla de permisos abajo). Cualquier componente que necesite datos de "su propia unidad" para ese rol debe usar `GET /api/units/mine` (`useMyUnit()` en `web/src/dashboard/MyUnitSection.tsx`), nunca `useGetOne('units', {id})` — ese patrón ya causó un bug real (el monto de un pago no se mostraba para residentes porque el `useGetOne('units', ...)` subyacente devolvía 403 en silencio).
- **`theme.ts`** define la paleta "Modernist": un solo acento de rojo para casi todo, con una única excepción deliberada (`success.main`, un verde real, usado solo en el estado "approved" de Payments). No inventar colores sueltos fuera de esta paleta — extender las constantes `red`/`neutral`/`green` de `theme.ts` en vez de hardcodear hex en un componente.

## Permisos por rol (resumen — el detalle completo está en el doc de arquitectura)

Rol resuelto en `dbo.Residents` (`Administrador`, `SuperAdministrador`, `Residente`, todas booleanas independientes) o `dbo.SecurityStaff` (identidad paralela, para guardias). Un JWT válido sin fila en ninguna de las dos tablas recibe 403, salvo en los endpoints de auto-registro (`Me`, `RegisterResident`, `RegisterSecurityStaff`).

| Recurso | Lectura | Escritura |
|---|---|---|
| Colonia (`/api/neighborhoods`) | Cualquier autenticado | Solo SuperAdministrador |
| Unidades, Guardias (`/api/units`, `/api/security-staff`) | Solo Admin/SuperAdmin | Solo Admin/SuperAdmin |
| Residentes (`/api/residents`) | Solo Admin/SuperAdmin | Solo Admin/SuperAdmin |
| Gastos (`/api/expenses`) | Cualquier autenticado | Solo Admin/SuperAdmin |
| Pagos (`/api/payments`) | Cualquiera, pero un residente puro solo ve/crea los de su propia unidad (alcance por fila, no bloqueo) | Un residente puro no puede editar NADA (`UpdatePayment` es 403 total para ese rol, no alcance por fila) |
| Nómina (`/api/payroll`) | Sin check de rol todavía (pendiente) | Sin check de rol todavía (pendiente) |

Excepciones de autoservicio (evitan reabrir un recurso bloqueado entero): `GET /api/units/mine` (datos básicos de la propia unidad de un residente), `GET /api/me` (permisos + estado de registro).

## Base de datos

- **`api/db/schema.sql`** es la fuente única y completa del esquema actual — NO son migraciones incrementales (se descartó ese enfoque). Sirve para crear una base desde cero o como referencia de lectura, no para "aplicar" contra una base que ya tiene datos.
- Cambios puntuales posteriores a un `schema.sql` ya aplicado van como scripts sueltos en `api/db/` con la fecha en el nombre (`YYYY-MM-DD_descripcion.sql`), documentados en `api/db/README.md`, para correr **a mano** contra Azure.
- **Nunca ejecutes una migración/script SQL directo contra la base real** — son para que el usuario los corra él mismo. Si hace falta un cambio de esquema, generá el script con el mismo patrón (agregar columna, rellenar con `TRY_CONVERT`/`COALESCE`, verificar, reemplazar) y avisale al usuario.

## Secretos

Todo secreto (connection string de Azure SQL, `BlobStorageConnectionString`, `BrevoApiKey`, client secret de Auth0) vive solo en `api/local.settings.json` (fuera de git) en desarrollo y en la configuración del Function App en Azure — nunca en el código, nunca en un commit, nunca pegado en el chat. Si una tarea necesita un secreto nuevo, pedile al usuario que lo agregue él mismo a `local.settings.json`.

## Cosas para no hacer sin permiso explícito

- No ejecutar SQL contra la base de datos real (el usuario corre los scripts a mano).
- No borrar archivos del repo sin confirmar — si hace falta, dejarlos marcados/comentados como candidatos a borrar en vez de borrarlos directo.
- No commitear ni pushear sin que el usuario lo pida.
- No tocar `local.settings.json` más allá de agregar una clave que el usuario pidió explícitamente.

## Estado actual y pendientes conocidos

Recursos con CRUD completo de punta a punta: Colonia, Unidades, Gastos, Guardias, Residentes, Pagos (más Nómina, sin pantalla propia — se registra desde la vista de un guardia). El Panel general todavía es en parte un cascarón con datos de ejemplo (KPIs de dinero ya son reales). Pendiente, sin resolver todavía: permisos por rol en Nómina, asociar un residente/administrador a una colonia activa (hoy no hay ese vínculo), extender la subida a Blob Storage de `Payments.ReceiptBlobPath` (ya implementado) a `Expenses.ReceiptBlobPath` (sigue siendo texto libre), migrar Azure SQL/Blob Storage de connection string a Managed Identity, unificar el formato de error del API (hoy solo `Payments.cs` manda `message` además de `error`, que es lo único que react-admin muestra), correo de bienvenida y recordatorio de pago pendiente, y cualquier integración de WhatsApp (Kapso). No hay CI/CD configurado todavía.
