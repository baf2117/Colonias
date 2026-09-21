-- Sueldo y bono de los guardias (SecurityStaff.Salary/Bonuses) y
-- registro de nómina (dbo.Payroll, que ya existía en el esquema sin
-- API todavía). Ejecutar manualmente contra Azure SQL, en orden,
-- dentro de una sola conexión. Ejecutar el script completo.

-- 1) SecurityStaff.Salary / Bonuses: montos recurrentes, editables a
--    mano desde el dashboard. Con datos de prueba existentes, quedan
--    en 0 hasta que se les ponga un valor.
ALTER TABLE dbo.SecurityStaff
    ADD Salary DECIMAL(10,2) NOT NULL DEFAULT 0,
        Bonuses DECIMAL(10,2) NOT NULL DEFAULT 0;
GO

-- 2) Payroll.Period: pasa de CHAR(7) ("2026-09") a DATE (día 1 del
--    mes), mismo criterio que Payments.Period. Se agrega una columna
--    nueva, se rellena a partir de la vieja, se verifica que no haya
--    quedado ninguna fila sin convertir, y recién ahí se reemplaza.
ALTER TABLE dbo.Payroll ADD PeriodDate DATE NULL;
GO

UPDATE dbo.Payroll
SET PeriodDate = TRY_CONVERT(DATE, Period + '-01')
WHERE PeriodDate IS NULL;
GO

-- Verificación: no debe haber filas sin convertir. Si esto devuelve
-- filas, revisar a mano el valor de Period en esas filas antes de
-- seguir (probablemente no tenía el formato "YYYY-MM" esperado).
SELECT PayrollId, Period, StaffId FROM dbo.Payroll WHERE PeriodDate IS NULL;
GO

ALTER TABLE dbo.Payroll DROP COLUMN Period;
GO

EXEC sp_rename 'dbo.Payroll.PeriodDate', 'Period', 'COLUMN';
GO

ALTER TABLE dbo.Payroll ALTER COLUMN Period DATE NOT NULL;
GO

CREATE INDEX IX_Payroll_StaffId_Period ON dbo.Payroll(StaffId, Period);
GO

-- Verificación final.
SELECT StaffId, Name, Salary, Bonuses FROM dbo.SecurityStaff;
SELECT PayrollId, StaffId, Period, Amount, Paid FROM dbo.Payroll;
GO
