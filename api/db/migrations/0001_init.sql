-- ============================================================
-- 0001_init.sql
-- Initial schema — Residential colony administration system
-- Server: jasaju.database.windows.net
-- Database: free-sql-db-6000256
-- ============================================================
-- Some fields (mainly in Expenses and Fees) are a reasonable
-- starting point; they'll be adjusted once the remaining open
-- requirements are closed (administrator catalogs, expenses,
-- reports).
-- ============================================================

-- ============================================================
-- Base catalogs
-- ============================================================

CREATE TABLE dbo.Entrances (
    EntranceId      INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(100)   NOT NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.ColonySettings (
    SettingsId                  INT IDENTITY(1,1) PRIMARY KEY,
    TemporaryCodesEnabled       BIT NOT NULL DEFAULT 1,
    PermanentCodesEnabled       BIT NOT NULL DEFAULT 1,
    DenyAccessEnabled           BIT NOT NULL DEFAULT 0,
    UpdatedAt                   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Single global settings row (one colony for now).
INSERT INTO dbo.ColonySettings (TemporaryCodesEnabled, PermanentCodesEnabled, DenyAccessEnabled)
VALUES (1, 1, 0);

-- ============================================================
-- Units and people
-- ============================================================

CREATE TABLE dbo.Units (
    UnitId          INT IDENTITY(1,1) PRIMARY KEY,
    Identifier      NVARCHAR(50)    NOT NULL,   -- e.g. "House 12", "Lot 45"
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Residents (
    ResidentId      INT IDENTITY(1,1) PRIMARY KEY,
    UnitId          INT             NOT NULL REFERENCES dbo.Units(UnitId),
    Name            NVARCHAR(150)   NOT NULL,
    Phone           NVARCHAR(30)    NULL,
    PhotoBlobPath   NVARCHAR(500)   NULL,
    RelationType    NVARCHAR(20)    NOT NULL CHECK (RelationType IN ('owner','tenant')),
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Users (
    UserId          INT IDENTITY(1,1) PRIMARY KEY,
    Auth0Sub        NVARCHAR(255)   NOT NULL UNIQUE,
    Role            NVARCHAR(20)    NOT NULL CHECK (Role IN ('administrator','guard','resident')),
    ResidentId      INT             NULL REFERENCES dbo.Residents(ResidentId),
    Name            NVARCHAR(150)   NOT NULL,
    Email           NVARCHAR(255)   NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

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

CREATE TABLE dbo.Fees (
    FeeId           INT IDENTITY(1,1) PRIMARY KEY,
    UnitId          INT             NOT NULL REFERENCES dbo.Units(UnitId),
    Period          CHAR(7)         NOT NULL,   -- 'YYYY-MM'
    Amount          DECIMAL(10,2)   NOT NULL,
    DueDate         DATE            NOT NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Payments (
    PaymentId           INT IDENTITY(1,1) PRIMARY KEY,
    FeeId               INT             NOT NULL REFERENCES dbo.Fees(FeeId),
    ResidentId          INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    ReceiptBlobPath     NVARCHAR(500)   NOT NULL,
    Status              NVARCHAR(20)    NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending','approved','rejected')),
    RejectionReason     NVARCHAR(500)   NULL,
    ReviewedByUserId    INT             NULL REFERENCES dbo.Users(UserId),
    ReviewedAt          DATETIME2       NULL,
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Vendors (
    VendorId        INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(150)   NOT NULL,
    Phone           NVARCHAR(30)    NULL,
    Active          BIT             NOT NULL DEFAULT 1
);

CREATE TABLE dbo.Expenses (
    ExpenseId               INT IDENTITY(1,1) PRIMARY KEY,
    VendorId                INT             NULL REFERENCES dbo.Vendors(VendorId),
    Category                NVARCHAR(100)   NULL,
    Amount                  DECIMAL(10,2)   NOT NULL,
    Description             NVARCHAR(500)   NULL,
    ReceiptBlobPath         NVARCHAR(500)   NULL,
    Date                    DATE            NOT NULL,
    RegisteredByUserId      INT             NOT NULL REFERENCES dbo.Users(UserId),
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
    GuardUserId     INT             NULL REFERENCES dbo.Users(UserId),
    Result          NVARCHAR(20)    NOT NULL CHECK (Result IN ('granted','denied','pending')),
    DenialReason    NVARCHAR(500)   NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- Notifications (audit trail)
-- ============================================================

CREATE TABLE dbo.Notifications (
    NotificationId  INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL REFERENCES dbo.Users(UserId),
    Channel         NVARCHAR(20)    NOT NULL CHECK (Channel IN ('whatsapp','email','push')),
    Type            NVARCHAR(50)    NOT NULL,   -- e.g. 'payment_approved', 'access_denied'
    Content         NVARCHAR(MAX)   NULL,
    SentAt          DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
