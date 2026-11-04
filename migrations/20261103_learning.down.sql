-- Reversión conservadora: nunca elimina progreso o reseñas registrados.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS(SELECT 1 FROM dbo.progreso_modulos) OR EXISTS(SELECT 1 FROM dbo.resenas_cursos)
 THROW 50100,N'Hay datos de aprendizaje. Respalde y planifique la reversión sin perderlos.',1;
IF EXISTS(SELECT 1 FROM sys.extended_properties WHERE major_id=OBJECT_ID(N'dbo.resenas_cursos') AND name=N'PPI_20261103') DROP TABLE dbo.resenas_cursos;
IF EXISTS(SELECT 1 FROM sys.extended_properties WHERE major_id=OBJECT_ID(N'dbo.progreso_modulos') AND name=N'PPI_20261103') DROP TABLE dbo.progreso_modulos;
COMMIT;
