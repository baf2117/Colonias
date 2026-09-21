-- Guardias: ya no son un rol booleano en Residents, viven en
-- dbo.SecurityStaff con su propio Auth0Sub y su propio código de
-- auto-registro por colonia (Neighborhoods.StaffRegistrationCode).
-- Ejecutar manualmente contra Azure SQL, en orden, dentro de una sola
-- conexión. Ejecutar el script completo.

-- 1) SecurityStaff.Auth0Sub: igual patrón que Residents.Auth0Sub
--    (índice único filtrado, NULL permitido hasta que el guardia haga
--    su propio registro).
ALTER TABLE dbo.SecurityStaff ADD Auth0Sub NVARCHAR(255) NULL;
GO

CREATE UNIQUE INDEX UX_SecurityStaff_Auth0Sub ON dbo.SecurityStaff(Auth0Sub) WHERE Auth0Sub IS NOT NULL;
GO

-- 2) Neighborhoods.StaffRegistrationCode: igual patrón que
--    Units.RegistrationCode. Se agrega NULL, se rellena para las
--    colonias existentes, y se vuelve NOT NULL.
ALTER TABLE dbo.Neighborhoods ADD StaffRegistrationCode NVARCHAR(10) NULL;
GO

UPDATE dbo.Neighborhoods
SET StaffRegistrationCode = UPPER(LEFT(CONVERT(NVARCHAR(36), NEWID()), 6))
WHERE StaffRegistrationCode IS NULL;
GO

-- Verificación: no debe haber NULLs ni duplicados antes de continuar.
SELECT COUNT(*) AS NullCount FROM dbo.Neighborhoods WHERE StaffRegistrationCode IS NULL;
SELECT StaffRegistrationCode, COUNT(*) AS Cnt
FROM dbo.Neighborhoods
GROUP BY StaffRegistrationCode
HAVING COUNT(*) > 1;
GO

ALTER TABLE dbo.Neighborhoods ALTER COLUMN StaffRegistrationCode NVARCHAR(10) NOT NULL;
GO

CREATE UNIQUE INDEX UX_Neighborhoods_StaffRegistrationCode ON dbo.Neighborhoods(StaffRegistrationCode);
GO

-- 3) AccessLog.GuardUserId: repuntar de dbo.Residents(ResidentId) a
--    dbo.SecurityStaff(StaffId). AccessLog tiene dos columnas que
--    referencian a Residents (ResidentId y GuardUserId), así que hay
--    que ubicar la FK correcta por nombre de columna, no solo por
--    tabla referenciada.
DECLARE @fkGuard NVARCHAR(128);
SELECT @fkGuard = fk.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns col ON col.object_id = fkc.parent_object_id AND col.column_id = fkc.parent_column_id
WHERE fk.parent_object_id = OBJECT_ID('dbo.AccessLog')
  AND fk.referenced_object_id = OBJECT_ID('dbo.Residents')
  AND col.name = 'GuardUserId';
IF @fkGuard IS NOT NULL
    EXEC('ALTER TABLE dbo.AccessLog DROP CONSTRAINT [' + @fkGuard + ']');
GO

-- No existe un mapeo automático de "ResidentId marcado como Guardia"
-- a una fila de SecurityStaff, y AccessLog todavía no tiene API propia
-- (no debería haber filas reales todavía), así que esto en la
-- práctica limpia 0 filas. Se deja explícito por seguridad.
UPDATE dbo.AccessLog SET GuardUserId = NULL WHERE GuardUserId IS NOT NULL;
GO

ALTER TABLE dbo.AccessLog
    ADD CONSTRAINT FK_AccessLog_Guard FOREIGN KEY (GuardUserId) REFERENCES dbo.SecurityStaff(StaffId);
GO

-- 4) Residents.Guardia: eliminar la columna. Tiene un DEFAULT (no un
--    CHECK), hay que tumbar esa constraint primero.
DECLARE @dfGuardia NVARCHAR(128);
SELECT @dfGuardia = dc.name
FROM sys.default_constraints dc
JOIN sys.columns col ON col.object_id = dc.parent_object_id AND col.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Residents')
  AND col.name = 'Guardia';
IF @dfGuardia IS NOT NULL
    EXEC('ALTER TABLE dbo.Residents DROP CONSTRAINT [' + @dfGuardia + ']');
GO

ALTER TABLE dbo.Residents DROP COLUMN Guardia;
GO

-- Verificación final.
SELECT StaffId, Name, Auth0Sub, NeighborhoodId FROM dbo.SecurityStaff;
SELECT NeighborhoodId, Name, StaffRegistrationCode FROM dbo.Neighborhoods;
SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Residents') AND name = 'Guardia'; -- debe devolver 0 filas
GO
