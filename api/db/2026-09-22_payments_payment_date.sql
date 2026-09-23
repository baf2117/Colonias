-- ============================================================
-- 2026-09-22_payments_payment_date.sql
-- Agrega dbo.Payments.PaymentDate: el día en que se pagó (entró la
-- plata), separado de Period (el mes de la cuota). El estado de cuentas
-- cuadra contra el banco por PaymentDate.
--
-- Los pagos que ya existen toman como fecha de pago el día en que se
-- cargaron en el sistema (CreatedAt), lo más cercano que hay a cuándo
-- entró la plata. Si alguno se pagó otro día, se corrige desde la
-- edición del pago.
-- ============================================================

ALTER TABLE dbo.Payments ADD PaymentDate DATE NULL;
GO

UPDATE dbo.Payments SET PaymentDate = CAST(CreatedAt AS DATE) WHERE PaymentDate IS NULL;
GO

ALTER TABLE dbo.Payments ALTER COLUMN PaymentDate DATE NOT NULL;
GO

CREATE INDEX IX_Payments_PaymentDate ON dbo.Payments(PaymentDate);
GO
