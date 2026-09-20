-- Agrega Units.RegistrationCode: el código que un residente usa para
-- auto-registrarse desde el login de Auth0 (ver RegisterResident en
-- Residents.cs), en vez de que el administrador lo dé de alta a mano.

ALTER TABLE dbo.Units ADD RegistrationCode NVARCHAR(10) NULL;
GO

-- Backfill de las unidades existentes: 6 caracteres tomados de un GUID
-- nuevo (NEWID() se evalúa por fila, así que cada unidad recibe un
-- código distinto en la misma sentencia).
UPDATE dbo.Units
SET RegistrationCode = UPPER(LEFT(CONVERT(NVARCHAR(36), NEWID()), 6))
WHERE RegistrationCode IS NULL;
GO

ALTER TABLE dbo.Units ALTER COLUMN RegistrationCode NVARCHAR(10) NOT NULL;
GO

CREATE UNIQUE INDEX UX_Units_RegistrationCode ON dbo.Units(RegistrationCode);
GO

-- VERIFICACIÓN: debe devolver 0 filas (sin duplicados ni nulos).
SELECT RegistrationCode, COUNT(*) AS Repeticiones
FROM dbo.Units
GROUP BY RegistrationCode
HAVING COUNT(*) > 1;

SELECT * FROM dbo.Units WHERE RegistrationCode IS NULL;
