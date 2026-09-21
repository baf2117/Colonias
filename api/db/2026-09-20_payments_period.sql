-- Agrega Payments.Period (el mes que cubre el pago, ya que dbo.Fees no
-- existe más) y afloja Payments.ReceiptBlobPath a NULL (todavía no hay
-- flujo de subida a Blob Storage).

ALTER TABLE dbo.Payments ADD Period DATE NULL;
GO

-- Backfill de pagos existentes, si los hay: el mes de CreatedAt.
UPDATE dbo.Payments
SET Period = DATEFROMPARTS(YEAR(CreatedAt), MONTH(CreatedAt), 1)
WHERE Period IS NULL;
GO

ALTER TABLE dbo.Payments ALTER COLUMN Period DATE NOT NULL;
GO

ALTER TABLE dbo.Payments ALTER COLUMN ReceiptBlobPath NVARCHAR(500) NULL;
GO

CREATE INDEX IX_Payments_UnitId_Period ON dbo.Payments(UnitId, Period);
GO

-- VERIFICACIÓN: debe devolver 0 filas.
SELECT * FROM dbo.Payments WHERE Period IS NULL;
