-- ============================================================
-- 2026-09-22_security_staff_hire_date.sql
-- Agrega dbo.SecurityStaff.HireDate: el día en que se contrató al
-- guardia. El Bono 14 y el aguinaldo se provisionan proporcionales al
-- tiempo trabajado dentro de cada ciclo, así que un guardia con 6 meses
-- acumula la mitad.
--
-- Queda NULL para los guardias que ya existen: la fecha real no está en
-- ningún lado (CreatedAt es cuándo se cargó en el sistema, no cuándo
-- entró a trabajar). Mientras esté vacía, el estado de cuentas le
-- provisiona el ciclo completo y avisa que falta la fecha; se completa
-- desde la edición del guardia.
-- ============================================================

ALTER TABLE dbo.SecurityStaff ADD HireDate DATE NULL;
GO
