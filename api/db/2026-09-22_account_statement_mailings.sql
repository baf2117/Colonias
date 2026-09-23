-- ============================================================
-- 2026-09-22_account_statement_mailings.sql
-- Agrega dbo.AccountStatementMailings: registro de cada envío del estado
-- de cuentas por correo a los vecinos de una colonia.
-- Requiere que ya exista dbo.BankStatements (2026-09-22_bank_statements.sql).
-- ============================================================

CREATE TABLE dbo.AccountStatementMailings (
    AccountStatementMailingId   INT IDENTITY(1,1) PRIMARY KEY,
    NeighborhoodId              INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId),
    Period                      DATE            NOT NULL,
    BankStatementId             INT             NOT NULL REFERENCES dbo.BankStatements(BankStatementId),
    SentByUserId                INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    RecipientCount              INT             NOT NULL,
    FailedCount                 INT             NOT NULL DEFAULT 0,
    SentAt                      DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_AccountStatementMailings_NeighborhoodId_Period ON dbo.AccountStatementMailings(NeighborhoodId, Period);

-- "Una vez por mes": NO hace falta ningún cambio de base. Se activa con el
-- app setting AccountStatementOncePerMonth = true en el Function App (y en
-- local.settings.json para desarrollo).
