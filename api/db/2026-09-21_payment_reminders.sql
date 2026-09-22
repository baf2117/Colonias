-- Tabla de control para el Timer Trigger de recordatorios de pago
-- pendiente (PaymentReminders.cs). Registra qué unidad ya fue avisada
-- para qué período, para que el job diario no mande el mismo correo
-- todos los días mientras la unidad siga sin pagar ese mes.
--
-- Correr a mano contra la base real (ver api/db/README.md).

CREATE TABLE dbo.PaymentReminders (
    PaymentReminderId  INT IDENTITY(1,1) PRIMARY KEY,
    UnitId              INT             NOT NULL REFERENCES dbo.Units(UnitId),
    Period              DATE            NOT NULL,
    SentAt              DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE UNIQUE INDEX UX_PaymentReminders_UnitId_Period ON dbo.PaymentReminders(UnitId, Period);
