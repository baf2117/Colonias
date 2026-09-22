-- Agrega la colonia que un Administrador administra, independiente de
-- UnitId (un "administrador puro" sin unidad propia también necesita
-- alcance por colonia para Unidades). Solo un SuperAdministrador puede
-- asignarla (ver RequireCanAssignNeighborhood en api/Residents.cs).
--
-- Correr a mano contra la base real (ver api/db/README.md).

ALTER TABLE dbo.Residents
    ADD NeighborhoodId INT NULL REFERENCES dbo.Neighborhoods(NeighborhoodId);
