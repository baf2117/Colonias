-- ============================================================
-- 0003_merge_colonysettings_into_neighborhoods.sql
-- Elimina dbo.ColonySettings: sus columnas pasan a vivir
-- directamente en dbo.Neighborhoods.
-- ============================================================
-- Después de 0002_neighborhoods.sql, ColonySettings ya era una fila
-- por colonia (1 a 1 vía NeighborhoodId) — pero seguía siendo una
-- tabla aparte, sin necesidad. Sus tres columnas se mueven directo a
-- Neighborhoods y la tabla se elimina.
--
-- Nada más referencia a ColonySettings (ninguna otra tabla tiene FK
-- hacia ella), así que se puede borrar directo una vez copiados los
-- datos.
-- ============================================================

ALTER TABLE dbo.Neighborhoods ADD
    TemporaryCodesEnabled   BIT NULL,
    PermanentCodesEnabled   BIT NULL,
    DenyAccessEnabled       BIT NULL;
GO

-- Backfill desde la fila de ColonySettings de cada colonia.
UPDATE n
SET n.TemporaryCodesEnabled = cs.TemporaryCodesEnabled,
    n.PermanentCodesEnabled = cs.PermanentCodesEnabled,
    n.DenyAccessEnabled     = cs.DenyAccessEnabled
FROM dbo.Neighborhoods n
INNER JOIN dbo.ColonySettings cs ON cs.NeighborhoodId = n.NeighborhoodId;

-- Por si alguna colonia quedó sin fila en ColonySettings (no debería
-- pasar después de 0002, pero por las dudas): mismos defaults que
-- tenía ColonySettings.
UPDATE dbo.Neighborhoods
SET TemporaryCodesEnabled = ISNULL(TemporaryCodesEnabled, 1),
    PermanentCodesEnabled = ISNULL(PermanentCodesEnabled, 1),
    DenyAccessEnabled     = ISNULL(DenyAccessEnabled, 0);
GO

ALTER TABLE dbo.Neighborhoods ALTER COLUMN TemporaryCodesEnabled BIT NOT NULL;
ALTER TABLE dbo.Neighborhoods ALTER COLUMN PermanentCodesEnabled BIT NOT NULL;
ALTER TABLE dbo.Neighborhoods ALTER COLUMN DenyAccessEnabled BIT NOT NULL;
GO

ALTER TABLE dbo.Neighborhoods ADD CONSTRAINT DF_Neighborhoods_TemporaryCodesEnabled DEFAULT 1 FOR TemporaryCodesEnabled;
ALTER TABLE dbo.Neighborhoods ADD CONSTRAINT DF_Neighborhoods_PermanentCodesEnabled DEFAULT 1 FOR PermanentCodesEnabled;
ALTER TABLE dbo.Neighborhoods ADD CONSTRAINT DF_Neighborhoods_DenyAccessEnabled DEFAULT 0 FOR DenyAccessEnabled;
GO

DROP TABLE dbo.ColonySettings;
GO
