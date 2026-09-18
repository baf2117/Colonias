-- ============================================================
-- 0002_neighborhoods.sql
-- Multi-neighborhood support (multi-colonia)
-- ============================================================
-- Hasta ahora el sistema asumía una sola colonia. Esto agrega
-- dbo.Neighborhoods y cuelga de ahí las tablas que son propias de
-- una colonia física: Units, Entrances, Vendors, SecurityStaff y
-- ColonySettings (que pasa de ser una fila única global a una fila
-- por colonia).
--
-- Residents, Users, Vehicles, Fees, Payments, Expenses, Payroll,
-- AccessCodes, VisitorLinks, AccessLog y Notifications NO llevan su
-- propio NeighborhoodId: ya resuelven la colonia indirectamente
-- (Residents/Vehicles/Fees a través de Units.NeighborhoodId; Users a
-- través de Residents cuando aplica), así que duplicar la columna en
-- cada una sería redundante sin sumar nada.
--
-- El sistema ya tiene datos, así que cada columna nueva se agrega
-- NULL primero, se rellena con una colonia por defecto, y recién
-- después se pasa a NOT NULL — corre sin problema aunque las tablas
-- ya tengan filas.
-- ============================================================

CREATE TABLE dbo.Neighborhoods (
    NeighborhoodId  INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(150)   NOT NULL,
    Active          BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Colonia por defecto: todo lo que ya existe en Units/Entrances/
-- Vendors/SecurityStaff/ColonySettings se backfillea contra esta fila.
-- Es la única colonia que va a existir hasta que se cree la segunda.
INSERT INTO dbo.Neighborhoods (Name)
VALUES (N'Colonia principal');
GO

-- ============================================================
-- Units
-- ============================================================

ALTER TABLE dbo.Units ADD NeighborhoodId INT NULL;
GO

UPDATE dbo.Units
SET NeighborhoodId = (SELECT TOP 1 NeighborhoodId FROM dbo.Neighborhoods);

ALTER TABLE dbo.Units ALTER COLUMN NeighborhoodId INT NOT NULL;
GO

ALTER TABLE dbo.Units ADD CONSTRAINT FK_Units_Neighborhoods
    FOREIGN KEY (NeighborhoodId) REFERENCES dbo.Neighborhoods(NeighborhoodId);
GO

-- ============================================================
-- Entrances
-- ============================================================

ALTER TABLE dbo.Entrances ADD NeighborhoodId INT NULL;
GO

UPDATE dbo.Entrances
SET NeighborhoodId = (SELECT TOP 1 NeighborhoodId FROM dbo.Neighborhoods);

ALTER TABLE dbo.Entrances ALTER COLUMN NeighborhoodId INT NOT NULL;
GO

ALTER TABLE dbo.Entrances ADD CONSTRAINT FK_Entrances_Neighborhoods
    FOREIGN KEY (NeighborhoodId) REFERENCES dbo.Neighborhoods(NeighborhoodId);
GO

-- ============================================================
-- Vendors
-- ============================================================

ALTER TABLE dbo.Vendors ADD NeighborhoodId INT NULL;
GO

UPDATE dbo.Vendors
SET NeighborhoodId = (SELECT TOP 1 NeighborhoodId FROM dbo.Neighborhoods);

ALTER TABLE dbo.Vendors ALTER COLUMN NeighborhoodId INT NOT NULL;
GO

ALTER TABLE dbo.Vendors ADD CONSTRAINT FK_Vendors_Neighborhoods
    FOREIGN KEY (NeighborhoodId) REFERENCES dbo.Neighborhoods(NeighborhoodId);
GO

-- ============================================================
-- SecurityStaff
-- ============================================================

ALTER TABLE dbo.SecurityStaff ADD NeighborhoodId INT NULL;
GO

UPDATE dbo.SecurityStaff
SET NeighborhoodId = (SELECT TOP 1 NeighborhoodId FROM dbo.Neighborhoods);

ALTER TABLE dbo.SecurityStaff ALTER COLUMN NeighborhoodId INT NOT NULL;
GO

ALTER TABLE dbo.SecurityStaff ADD CONSTRAINT FK_SecurityStaff_Neighborhoods
    FOREIGN KEY (NeighborhoodId) REFERENCES dbo.Neighborhoods(NeighborhoodId);
GO

-- ============================================================
-- ColonySettings — de fila única global a una fila por colonia.
-- El UNIQUE de abajo es lo que fuerza esa relación 1 a 1.
-- ============================================================

ALTER TABLE dbo.ColonySettings ADD NeighborhoodId INT NULL;
GO

UPDATE dbo.ColonySettings
SET NeighborhoodId = (SELECT TOP 1 NeighborhoodId FROM dbo.Neighborhoods);

ALTER TABLE dbo.ColonySettings ALTER COLUMN NeighborhoodId INT NOT NULL;
GO

ALTER TABLE dbo.ColonySettings ADD CONSTRAINT FK_ColonySettings_Neighborhoods
    FOREIGN KEY (NeighborhoodId) REFERENCES dbo.Neighborhoods(NeighborhoodId);

ALTER TABLE dbo.ColonySettings ADD CONSTRAINT UQ_ColonySettings_NeighborhoodId
    UNIQUE (NeighborhoodId);
GO
