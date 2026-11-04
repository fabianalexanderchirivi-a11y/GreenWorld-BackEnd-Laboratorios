SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.progreso_modulos',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.progreso_modulos (
  id_progreso INT IDENTITY PRIMARY KEY,
  id_inscripcion INT NOT NULL REFERENCES dbo.inscripciones(id_inscripcion),
  id_modulo INT NOT NULL REFERENCES dbo.modulos(id_modulo),
  porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK(porcentaje BETWEEN 0 AND 100),
  completado BIT NOT NULL DEFAULT 0,
  fecha_inicio DATETIME2 NULL, fecha_completado DATETIME2 NULL, ultima_visita DATETIME2 NULL,
  CONSTRAINT UQ_ppi_progreso UNIQUE(id_inscripcion,id_modulo)
 );
 EXEC sys.sp_addextendedproperty @name=N'PPI_20261103',@value=N'created',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'progreso_modulos';
END;
IF OBJECT_ID(N'dbo.resenas_cursos',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.resenas_cursos (
  id_resena INT IDENTITY PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES dbo.usuarios(id_usuario),
  id_curso INT NOT NULL REFERENCES dbo.cursos(id_curso),
  contenido NVARCHAR(2000) NOT NULL CHECK(LEN(LTRIM(RTRIM(contenido)))>0),
  fecha_creacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  fecha_actualizacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT UQ_ppi_resena UNIQUE(id_usuario,id_curso)
 );
 EXEC sys.sp_addextendedproperty @name=N'PPI_20261103',@value=N'created',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'resenas_cursos';
END;
COMMIT;
