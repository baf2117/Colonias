-- Elimina dbo.Residents.RelationType: ya no se distingue entre
-- propietario e inquilino, solo si el residente está o no ligado a
-- una unidad (Residents.UnitId).

DECLARE @constraintName NVARCHAR(200);
SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns col
    ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
WHERE cc.parent_object_id = OBJECT_ID('dbo.Residents') AND col.name = 'RelationType';

IF @constraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE dbo.Residents DROP CONSTRAINT [' + @constraintName + ']');
END
GO

ALTER TABLE dbo.Residents DROP COLUMN RelationType;
GO

-- VERIFICACIÓN: debe devolver 0 filas.
SELECT * FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.Residents') AND name = 'RelationType';
