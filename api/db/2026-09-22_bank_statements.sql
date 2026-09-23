-- ============================================================
-- 2026-09-22_bank_statements.sql
-- Agrega dbo.BankStatements: conciliación bancaria por colonia y mes
-- (saldo del banco vs. saldo del sistema), sin desglose línea por línea.
-- ============================================================

CREATE TABLE dbo.BankStatements (
    BankStatementId     INT IDENTITY(1,1) PRIMARY KEY,
    NeighborhoodId      INT             NOT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId),
    Period              DATE            NOT NULL,
    BankBalance         DECIMAL(12,2)   NOT NULL,
    StatementBlobPath   NVARCHAR(500)   NULL,
    Notes               NVARCHAR(500)   NULL,
    UploadedByUserId    INT             NOT NULL REFERENCES dbo.Residents(ResidentId),
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_BankStatements_NeighborhoodId_Period ON dbo.BankStatements(NeighborhoodId, Period);
