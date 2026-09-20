-- ============================================================
-- schema.sql
-- Estructura completa de la base de datos — Sistema de
-- administración de colonia
-- Server: jasaju.database.windows.net
-- Database: free-sql-db-6000256
-- ============================================================
-- Este archivo reemplaza al historial de migraciones incrementales
-- (api/db/migrations/, ya eliminado): es la única fuente de verdad
-- de cómo se ve la base de datos hoy. No se aplica tal cual contra
-- una base que ya tiene datos — sirve para crear la base desde cero
-- (un ambiente nuevo, por ejemplo) y como referencia de lectura.
--
-- De acá en adelante, cada cambio de esquema se hace editando este
-- archivo directamente y aplicando a mano el ALTER/CREATE/DROP
-- equivalente contra la base real (Azure). No queda un registro
-- incremental de cada cambio — ver la nota al final del archivo.
--
-- Algunos campos (sobre todo en Expenses) son un punto de partida
-- razonable y se van a ajustar cuando se cierren los requerimientos
-- que todavía están pendientes (catálogos del administrador, gastos,
-- reportes).
-- ============================================================

-- ============================================================
-- Colonias (multi-colonia): raíz de la que cuelgan Units,
-- Entrances, Vendors y SecurityStaff. También guarda la
-- configuración general de la colonia (antes en ColonySettings,
-- ya no existe como tabla aparte) y su cuota y moneda general.
-- ============================================================

CREATE TABLE dbo.Neighborhoods (
    NeighborhoodId          INT IDENTITY(1,1) PRIMARY KEY,
    Name                    NVARCHAR(150)   NOT NULL,
    Active                  BIT             NOT NULL DEFAULT 1,
    TemporaryCodesEnabled   BIT             NOT NULL DEFAULT 1,
    PermanentCodesEnabled   BIT             NOT NULL DEFAULT 1,
    DenyAccessEnabled       BIT             NOT NULL DEFAULT 0,
    DefaultFeeAmount        DECIMAL(10,2)   NOT NULL DEFAULT 0,
    Currency                NVARCHAR(3)     NOT NULL DEFAULT 'GTQ',   -- ISO 4217; toda la colonia cobra en esta moneda
    CreatedAt               DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Base catalogs
-- ============================================================

CREATE TABLE dbo.Entrances (
    EntranceId      INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(100)   NOT NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    NeighborhoodId  INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId),
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Units and people
-- ============================================================

CREATE TABLE dbo.Units (
    UnitId          INT IDENTITY(1,1) PRIMARY KEY,
    Identifier      NVARCHAR(50)    NOT NULL,   -- e.g. "House 12", "Lot 45"
    Active          BIT             NOT NULL DEFAULT 1,
    NeighborhoodId  INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId),
    Address         NVARCHAR(200)   NULL,       -- dirección completa; obligatoria a nivel de dashboard, no de BD
    FeeAmount       DECIMAL(10,2)   NULL,       -- override de la cuota de la colonia; NULL = usa Neighborhoods.DefaultFeeAmount
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- dbo.Users se fusionó dentro de dbo.Residents: con pocos tipos de
-- usuario y una misma persona pudiendo ser, a la vez, residente y
-- guardia (o administrador y residente), un Role único por fila no
-- alcanzaba. En vez de una tabla de roles aparte, Residents tiene
-- cuatro columnas booleanas independientes y combinables. UnitId y
-- RelationType pasan a ser opcionales porque un administrador o
-- guardia "puro" no vive en ninguna unidad; Auth0Sub también es
-- opcional porque no todo residente inicia sesión en el sistema. Ver
-- la nota al final del archivo.
CREATE TABLE dbo.Residents (
    ResidentId          INT IDENTITY(1,1) PRIMARY KEY,
    UnitId              INT             NULL REFERENCES dbo.Units(UnitId),   -- NULL: administrador/guardia sin unidad propia
    Auth0Sub            NVARCHAR(255)   NULL,   -- NULL: todavía no tiene cuenta para iniciar sesión
    Name                NVARCHAR(150)   NOT NULL,
    Phone               NVARCHAR(30)    NULL,
    Email               NVARCHAR(255)   NULL,
    PhotoBlobPath       NVARCHAR(500)   NULL,
    RelationType        NVARCHAR(20)    NULL CHECK (RelationType IN ('owner','tenant')),   -- NULL: no aplica (no vive en una unidad)
    Administrador       BIT             NOT NULL DEFAULT 0,
    SuperAdministrador  BIT             NOT NULL DEFAULT 0,
    Residente           BIT             NOT NULL DEFAULT 0,
    Guardia             BIT             NOT NULL DEFAULT 0,
    Active              BIT             NOT NULL DEFAULT 1,
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Auth0Sub es único cuando existe; varias filas pueden no tener
-- cuenta todavía (índice único filtrado en vez de UNIQUE a secas,
-- que solo permitiría un NULL en toda la tabla).
CREATE UNIQUE INDEX UX_Residents_Auth0Sub ON dbo.Residents(Auth0Sub) WHERE Auth0Sub IS NOT NULL;

CREATE TABLE dbo.Vehicles (
    VehicleId       INT IDENTITY(1,1) PRIMARY KEY,
    UnitId          INT             NOT NULL REFERENCES dbo.Units(UnitId),
    PlateNumber     NVARCHAR(20)    NOT NULL,
    Description     NVARCHAR(150)   NULL,       -- make / model / color
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Payments and expenses
-- ============================================================
-- dbo.Fees ya no existe (reemplazada por Neighborhoods.DefaultFeeAmount
-- + Units.FeeAmount, ver arriba). Payments trae su propio Amount.
--
-- La deuda es de la unidad, no de quien pagó: UnitId es obligatorio
-- (todo pago abona a la cuota de una unidad) y ResidentId es opcional
-- (quién subió el comprobante — puede ser cualquier residente de la
-- unidad, un familiar, o quedar sin registrar). Antes era al revés
-- (ResidentId obligatorio, sin UnitId), y un pago quedaba "huérfano"
-- de unidad en cuanto ese residente se daba de baja o cambiaba de
-- unidad. Ver la nota al final del archivo.

CREATE TABLE dbo.Payments (
    PaymentId           INT IDENTITY(1,1) PRIMARY KEY,
    UnitId              INT             NOT NULL REFERENCES dbo.Units(UnitId),
    ResidentId          INT             NULL REFERENCES dbo.Residents(ResidentId),   -- quién reportó/subió el comprobante; opcional
    ReceiptBlobPath     NVARCHAR(500)   NOT NULL,
    Status              NVARCHAR(20)    NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending','approved','rejected')),
    RejectionReason     NVARCHAR(500)   NULL,
    ReviewedByUserId    INT             NULL REFERENCES dbo.Residents(ResidentId),   -- quién lo revisó (típicamente un administrador)
    ReviewedAt          DATETIME2       NULL,
    Amount              DECIMAL(10,2)   NOT NULL DEFAULT 0,   -- monto real del comprobante subido
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Vendors (
    VendorId        INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(150)   NOT NULL,
    Phone           NVARCHAR(30)    NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    NeighborhoodId  INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId)
);

CREATE TABLE dbo.Expenses (
    ExpenseId               INT IDENTITY(1,1) PRIMARY KEY,
    VendorId                INT             NOT NULL REFERENCES dbo.Vendors(VendorId),   -- todo gasto tiene proveedor; la colonia se resuelve vía Vendors.NeighborhoodId
    Category                NVARCHAR(100)   NULL,
    Amount                  DECIMAL(10,2)   NOT NULL,
    Description             NVARCHAR(500)   NULL,
    ReceiptBlobPath         NVARCHAR(500)   NULL,   -- comprobante en Blob Storage; sin flujo de subida implementado todavía
    Date                    DATE            NOT NULL,
    RegisteredByUserId      INT             NOT NULL REFERENCES dbo.Residents(ResidentId),   -- resuelto del lado del servidor, nunca viaja en el body del request
    CreatedAt               DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Security: staff and payroll
-- ============================================================

CREATE TABLE dbo.SecurityStaff (
    StaffId         INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(150)   NOT NULL,
    Phone           NVARCHAR(30)    NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    NeighborhoodId  INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId),
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Payroll (
    PayrollId       INT IDENTITY(1,1) PRIMARY KEY,
    StaffId         INT             NOT NULL REFERENCES dbo.SecurityStaff(StaffId),
    Period          CHAR(7)         NOT NULL,
    Amount          DECIMAL(10,2)   NOT NULL,
    Paid            BIT             NOT NULL DEFAULT 0,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Access: codes, visitor links, log
-- ============================================================

CREATE TABLE dbo.AccessCodes (
    AccessCodeId    INT IDENTITY(1,1) PRIMARY KEY,
    ResidentId      INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    Code            NVARCHAR(20)    NOT NULL UNIQUE,
    Type            NVARCHAR(20)    NOT NULL CHECK (Type IN ('temporary','permanent')),
    EntranceId      INT             NULL REFERENCES dbo.Entrances(EntranceId),
    ValidDate       DATE            NULL,       -- only applies to temporary codes
    Used            BIT             NOT NULL DEFAULT 0,   -- only applies to temporary codes
    Active          BIT             NOT NULL DEFAULT 1,   -- permanent: false once replaced
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.VisitorLinks (
    VisitorLinkId   INT IDENTITY(1,1) PRIMARY KEY,
    ResidentId      INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    Token           NVARCHAR(64)    NOT NULL UNIQUE,
    VisitorName     NVARCHAR(150)   NOT NULL,
    ValidDate       DATE            NOT NULL,
    EntranceId      INT             NULL REFERENCES dbo.Entrances(EntranceId),
    Used            BIT             NOT NULL DEFAULT 0,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.AccessLog (
    AccessLogId     INT IDENTITY(1,1) PRIMARY KEY,
    SourceType      NVARCHAR(20)    NOT NULL CHECK (SourceType IN ('resident_request','visitor_link','access_code')),
    ResidentId      INT             NULL REFERENCES dbo.Residents(ResidentId),
    VisitorLinkId   INT             NULL REFERENCES dbo.VisitorLinks(VisitorLinkId),
    AccessCodeId    INT             NULL REFERENCES dbo.AccessCodes(AccessCodeId),
    EntranceId      INT             NULL REFERENCES dbo.Entrances(EntranceId),
    GuardUserId     INT             NULL REFERENCES dbo.Residents(ResidentId),
    Result          NVARCHAR(20)    NOT NULL CHECK (Result IN ('granted','denied','pending')),
    DenialReason    NVARCHAR(500)   NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Notifications (audit trail)
-- ============================================================

CREATE TABLE dbo.Notifications (
    NotificationId  INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    Channel         NVARCHAR(20)    NOT NULL CHECK (Channel IN ('whatsapp','email','push')),
    Type            NVARCHAR(50)    NOT NULL,   -- e.g. 'payment_approved', 'access_denied'
    Content         NVARCHAR(MAX)   NULL,
    SentAt          DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Historial de cómo se llegó a este esquema (referencia, no se
-- ejecuta). El repositorio ya no guarda migraciones incrementales;
-- si hace falta reconstruir el porqué de un cambio pasado, está en
-- el historial de git de este archivo y en el documento de
-- arquitectura del proyecto.
--
--   - Multi-colonia: se agregó Neighborhoods y NeighborhoodId en
--     Units/Entrances/Vendors/SecurityStaff; luego ColonySettings
--     (fila única global) se fusionó dentro de Neighborhoods.
--   - Units.Address: dirección completa de la unidad, opcional en
--     BD, obligatoria a nivel de dashboard.
--   - Se eliminó dbo.Fees (una fila por unidad y por mes, tediosa de
--     mantener) a favor de Neighborhoods.DefaultFeeAmount +
--     Units.FeeAmount (override opcional). Payments perdió FeeId y
--     ganó Amount propio.
--   - Neighborhoods.Currency: la moneda (ISO 4217) en la que cobra
--     toda la colonia; default GTQ (Guatemala).
--   - Registro de gastos: Expenses.VendorId pasó de NULL a NOT NULL
--     (todo gasto tiene un proveedor, que a su vez pertenece a una
--     colonia) y se agregó el CRUD de Vendors — sin pantallas propias
--     en el dashboard a propósito: el proveedor se da de alta al vuelo
--     desde el formulario de Crear/Editar Gasto.
--   - Payments.UnitId pasó a NOT NULL y Payments.ResidentId a NULL:
--     la deuda es de la unidad, no de quien pagó.
--   - dbo.Users se fusionó dentro de dbo.Residents (se eliminó
--     dbo.Users): Role (string) se reemplazó por cuatro columnas
--     booleanas combinables (Administrador, SuperAdministrador,
--     Residente, Guardia), lo que también resuelve la distinción
--     entre administrador y superadministrador. UnitId, RelationType
--     y Auth0Sub pasaron a ser opcionales en Residents. Todas las FK
--     que apuntaban a dbo.Users (Payments.ReviewedByUserId,
--     Expenses.RegisteredByUserId, AccessLog.GuardUserId,
--     Notifications.UserId) ahora apuntan a dbo.Residents — se
--     dejaron con el nombre "UserId" porque describen un rol, no la
--     tabla referenciada (pendiente de decidir si conviene
--     renombrarlas).
-- ============================================================
