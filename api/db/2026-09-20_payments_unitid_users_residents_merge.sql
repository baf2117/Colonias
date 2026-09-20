-- ============================================================
-- 2026-09-20_payments_unitid_users_residents_merge.sql
-- Aplica dos cambios de esquema, ya reflejados en schema.sql y en el
-- diagrama ER del proyecto:
--   1) Payments.UnitId pasa a NOT NULL (la deuda es de la unidad) y
--      Payments.ResidentId pasa a ser opcional (quién reportó el pago).
--   2) dbo.Users se fusiona dentro de dbo.Residents: Role (string) se
--      reemplaza por cuatro columnas booleanas combinables
--      (Administrador, SuperAdministrador, Residente, Guardia).
--      dbo.Residents es la tabla que sobrevive (conserva su
--      ResidentId), así que las FK que ya apuntaban a Residents
--      (AccessCodes.ResidentId, VisitorLinks.ResidentId,
--      AccessLog.ResidentId, Payments.ResidentId) no cambian. Solo
--      hay que repuntar las FK que apuntaban a dbo.Users
--      (Payments.ReviewedByUserId, Expenses.RegisteredByUserId,
--      AccessLog.GuardUserId, Notifications.UserId) y, al final,
--      borrar dbo.Users.
--
-- Corré esto contra la base real (Azure) desde el "Editor de
-- consultas" del portal, Azure Data Studio o SSMS, tal como indica
-- api/db/README.md. Está pensado para correrse de arriba hacia abajo,
-- bloque por bloque (los bloques están separados con GO). Hay dos
-- verificaciones (marcadas con "-- VERIFICACIÓN") que conviene
-- correr y revisar antes de seguir con el bloque siguiente.
--
-- No hace falta correr esto si vas a crear una base nueva desde cero:
-- para eso alcanza con el schema.sql ya actualizado.
-- ============================================================


-- ============================================================
-- PARTE 1 — Payments: UnitId obligatorio, ResidentId opcional
-- ============================================================

ALTER TABLE dbo.Payments ADD UnitId INT NULL;
GO

-- Cada pago existente resuelve su unidad a través del residente que
-- lo hizo (Payments.ResidentId -> Residents.UnitId, que hoy es
-- obligatorio en Residents, así que todo pago con ResidentId válido
-- va a quedar con UnitId resuelto).
UPDATE p
SET p.UnitId = r.UnitId
FROM dbo.Payments p
JOIN dbo.Residents r ON r.ResidentId = p.ResidentId
WHERE p.UnitId IS NULL;
GO

-- VERIFICACIÓN: esto debería devolver 0 filas. Si devuelve alguna,
-- son pagos con un ResidentId huérfano/inválido — hay que decidir a
-- mano qué unidad les corresponde antes de seguir (el resto del
-- script asume que ya no queda ninguno).
SELECT PaymentId, ResidentId
FROM dbo.Payments
WHERE UnitId IS NULL;
GO

-- Solo seguí con esto si la verificación de arriba dio 0 filas.
ALTER TABLE dbo.Payments ALTER COLUMN UnitId INT NOT NULL;
GO

ALTER TABLE dbo.Payments ADD CONSTRAINT FK_Payments_Units FOREIGN KEY (UnitId) REFERENCES dbo.Units(UnitId);
GO

-- ResidentId deja de ser obligatorio: ahora es "quién reportó el
-- pago", no "a qué se aplica el pago". El FK hacia Residents sigue
-- funcionando igual con la columna en NULL.
ALTER TABLE dbo.Payments ALTER COLUMN ResidentId INT NULL;
GO


-- ============================================================
-- PARTE 2 — Fusionar dbo.Users dentro de dbo.Residents
-- ============================================================

-- 2.1: nuevas columnas en Residents.
--      Residente se agrega con DEFAULT 1: toda fila que ya existía en
--      Residents es, por definición, alguien que vive en una unidad
--      (owner o tenant) — así que al agregar la columna, SQL Server
--      llena automáticamente esas filas existentes con 1, sin UPDATE
--      aparte. Las filas nuevas que se insertan más abajo (2.4) para
--      cuentas de Users sin unidad especifican su propio valor.
ALTER TABLE dbo.Residents ADD Residente BIT NOT NULL DEFAULT 1;
GO
ALTER TABLE dbo.Residents ADD Administrador BIT NOT NULL DEFAULT 0;
GO
ALTER TABLE dbo.Residents ADD SuperAdministrador BIT NOT NULL DEFAULT 0;
GO
ALTER TABLE dbo.Residents ADD Guardia BIT NOT NULL DEFAULT 0;
GO
ALTER TABLE dbo.Residents ADD Auth0Sub NVARCHAR(255) NULL;
GO
ALTER TABLE dbo.Residents ADD Email NVARCHAR(255) NULL;
GO

-- 2.2: UnitId y RelationType dejan de ser obligatorios — un
--      administrador o guardia "puro" no vive en ninguna unidad. El
--      CHECK de RelationType (IN ('owner','tenant')) sigue intacto:
--      un CHECK no bloquea NULL a menos que lo prohíba explícitamente.
ALTER TABLE dbo.Residents ALTER COLUMN UnitId INT NULL;
GO
ALTER TABLE dbo.Residents ALTER COLUMN RelationType NVARCHAR(20) NULL;
GO

-- 2.3: volcar hacia Residents los datos de los Users que YA estaban
--      vinculados a un residente (Users.ResidentId IS NOT NULL):
--      copia Auth0Sub/Email y prende la bandera de rol que
--      corresponda. No toca Residente (ya quedó en 1 por el DEFAULT
--      del paso 2.1) ni Active (se conserva el de Residents: el
--      estatus del residente, no el de su cuenta de acceso).
UPDATE r
SET r.Auth0Sub      = u.Auth0Sub,
    r.Email         = u.Email,
    r.Administrador = CASE WHEN u.Role = 'administrator' THEN 1 ELSE r.Administrador END,
    r.Guardia       = CASE WHEN u.Role = 'guard'          THEN 1 ELSE r.Guardia       END
FROM dbo.Residents r
JOIN dbo.Users u ON u.ResidentId = r.ResidentId;
GO

-- VERIFICACIÓN: cuántos Users se volcaron sobre un Residents
-- existente vs. cuántos van a necesitar una fila nueva en el paso
-- 2.4 (por no tener ResidentId, típicamente administradores o
-- guardias sin unidad propia). Solo para confirmar que el número
-- tiene sentido antes de seguir.
SELECT
    (SELECT COUNT(*) FROM dbo.Users WHERE ResidentId IS NOT NULL) AS UsersVolcadosSobreResidentExistente,
    (SELECT COUNT(*) FROM dbo.Users WHERE ResidentId IS NULL)     AS UsersQueVanANecesitarFilaNueva;
GO

-- 2.4: Users sin ResidentId no tienen dónde volcarse — se crea una
--      fila nueva en Residents por cada uno, sin unidad
--      (UnitId = NULL) ni tipo de relación. @NewMappings guarda qué
--      UserId vieja corresponde a qué ResidentId nueva, para poder
--      repuntar las FKs del paso 3 (se arma con MERGE + OUTPUT en vez
--      de un INSERT...SELECT normal porque hace falta capturar, para
--      cada fila insertada, tanto su ResidentId nuevo como el UserId
--      de origen que la generó).
DECLARE @NewMappings TABLE (OldUserId INT PRIMARY KEY, NewResidentId INT NOT NULL);

MERGE INTO dbo.Residents AS tgt
USING (
    SELECT UserId, Name, Active, CreatedAt, Auth0Sub, Email, Role
    FROM dbo.Users
    WHERE ResidentId IS NULL
) AS src
ON 1 = 0   -- nunca hay match: cada fila de src siempre se inserta como fila nueva
WHEN NOT MATCHED THEN
    INSERT (UnitId, Name, Phone, PhotoBlobPath, RelationType, Active, CreatedAt,
            Auth0Sub, Email, Administrador, SuperAdministrador, Residente, Guardia)
    VALUES (NULL, src.Name, NULL, NULL, NULL, src.Active, src.CreatedAt,
            src.Auth0Sub, src.Email,
            CASE WHEN src.Role = 'administrator' THEN 1 ELSE 0 END,
            0,   -- SuperAdministrador: no existía como Role, nadie se marca automáticamente; se activa a mano después
            CASE WHEN src.Role = 'resident' THEN 1 ELSE 0 END,
            CASE WHEN src.Role = 'guard' THEN 1 ELSE 0 END)
OUTPUT src.UserId, inserted.ResidentId INTO @NewMappings;

-- Mapa completo Users.UserId -> Residents.ResidentId (los que ya
-- tenían ResidentId, más los recién creados) para repuntar las FKs
-- del paso 3. Es una tabla temporal (#) para que sobreviva a los
-- GO que siguen, dentro de la misma conexión.
SELECT UserId AS OldUserId, ResidentId AS NewResidentId
INTO #UserResidentMap
FROM dbo.Users
WHERE ResidentId IS NOT NULL
UNION ALL
SELECT OldUserId, NewResidentId FROM @NewMappings;
GO

-- VERIFICACIÓN: el mapa debe tener exactamente una fila por cada
-- Users.UserId que existía. Si no coincide, no sigas con la Parte 3.
SELECT
    (SELECT COUNT(*) FROM dbo.Users)             AS TotalUsers,
    (SELECT COUNT(*) FROM #UserResidentMap)      AS TotalMapeados;
GO


-- ============================================================
-- PARTE 3 — Repuntar hacia dbo.Residents las FK que apuntaban a
-- dbo.Users
-- ============================================================
-- Los FK de 0001_init.sql (hoy fusionado en schema.sql) no tienen
-- nombre explícito, así que cada bloque busca el nombre real en
-- sys.foreign_keys antes de borrarlo — mismo patrón que ya se usó en
-- 0005_replace_fees_with_neighborhood_default.sql.

-- 3.1: Payments.ReviewedByUserId
DECLARE @fk1 NVARCHAR(128);
SELECT @fk1 = fk.name FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.Payments')
  AND fk.referenced_object_id = OBJECT_ID('dbo.Users');
IF @fk1 IS NOT NULL EXEC('ALTER TABLE dbo.Payments DROP CONSTRAINT ' + @fk1);
GO

UPDATE p
SET p.ReviewedByUserId = m.NewResidentId
FROM dbo.Payments p
JOIN #UserResidentMap m ON m.OldUserId = p.ReviewedByUserId
WHERE p.ReviewedByUserId IS NOT NULL;
GO

ALTER TABLE dbo.Payments ADD CONSTRAINT FK_Payments_ReviewedBy FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Residents(ResidentId);
GO

-- 3.2: Expenses.RegisteredByUserId
DECLARE @fk2 NVARCHAR(128);
SELECT @fk2 = fk.name FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.Expenses')
  AND fk.referenced_object_id = OBJECT_ID('dbo.Users');
IF @fk2 IS NOT NULL EXEC('ALTER TABLE dbo.Expenses DROP CONSTRAINT ' + @fk2);
GO

UPDATE e
SET e.RegisteredByUserId = m.NewResidentId
FROM dbo.Expenses e
JOIN #UserResidentMap m ON m.OldUserId = e.RegisteredByUserId;
GO

ALTER TABLE dbo.Expenses ADD CONSTRAINT FK_Expenses_RegisteredBy FOREIGN KEY (RegisteredByUserId) REFERENCES dbo.Residents(ResidentId);
GO

-- 3.3: AccessLog.GuardUserId
DECLARE @fk3 NVARCHAR(128);
SELECT @fk3 = fk.name FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.AccessLog')
  AND fk.referenced_object_id = OBJECT_ID('dbo.Users');
IF @fk3 IS NOT NULL EXEC('ALTER TABLE dbo.AccessLog DROP CONSTRAINT ' + @fk3);
GO

UPDATE a
SET a.GuardUserId = m.NewResidentId
FROM dbo.AccessLog a
JOIN #UserResidentMap m ON m.OldUserId = a.GuardUserId
WHERE a.GuardUserId IS NOT NULL;
GO

ALTER TABLE dbo.AccessLog ADD CONSTRAINT FK_AccessLog_Guard FOREIGN KEY (GuardUserId) REFERENCES dbo.Residents(ResidentId);
GO

-- 3.4: Notifications.UserId
DECLARE @fk4 NVARCHAR(128);
SELECT @fk4 = fk.name FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.Notifications')
  AND fk.referenced_object_id = OBJECT_ID('dbo.Users');
IF @fk4 IS NOT NULL EXEC('ALTER TABLE dbo.Notifications DROP CONSTRAINT ' + @fk4);
GO

UPDATE n
SET n.UserId = m.NewResidentId
FROM dbo.Notifications n
JOIN #UserResidentMap m ON m.OldUserId = n.UserId;
GO

ALTER TABLE dbo.Notifications ADD CONSTRAINT FK_Notifications_Resident FOREIGN KEY (UserId) REFERENCES dbo.Residents(ResidentId);
GO


-- ============================================================
-- PARTE 4 — Eliminar dbo.Users y cerrar
-- ============================================================

DROP TABLE dbo.Users;
GO

DROP TABLE #UserResidentMap;
GO

-- Auth0Sub único cuando existe (varias filas de Residents pueden no
-- tener cuenta todavía, así que un UNIQUE a secas no serviría: solo
-- permitiría un NULL en toda la tabla).
CREATE UNIQUE INDEX UX_Residents_Auth0Sub ON dbo.Residents(Auth0Sub) WHERE Auth0Sub IS NOT NULL;
GO

-- VERIFICACIÓN FINAL: un vistazo rápido a cómo quedaron los roles.
SELECT Administrador, SuperAdministrador, Residente, Guardia, COUNT(*) AS Filas
FROM dbo.Residents
GROUP BY Administrador, SuperAdministrador, Residente, Guardia
ORDER BY Filas DESC;
GO
