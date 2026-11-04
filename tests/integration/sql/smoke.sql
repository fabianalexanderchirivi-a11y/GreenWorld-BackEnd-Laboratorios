-- Fixture exclusiva para un SQL Server efímero de CI.
-- Reproduce las columnas y usp_ListarCursos observadas en Green World.
-- No es una migración de producción ni define criterios de progreso.
CREATE DATABASE GreenWorldCI;
GO
USE GreenWorldCI;
GO
CREATE TABLE dbo.cursos (
    id_curso INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    titulo NVARCHAR(150) NOT NULL,
    descripcion NVARCHAR(MAX) NOT NULL,
    imagen NVARCHAR(255) NULL,
    duracion_estimada NVARCHAR(50) NULL,
    nivel NVARCHAR(20) NOT NULL,
    estado NVARCHAR(20) NOT NULL,
    fecha_creacion DATETIME2 NOT NULL,
    categoria VARCHAR(100) NULL
);
GO
CREATE PROCEDURE dbo.usp_ListarCursos
AS
BEGIN
    SET NOCOUNT ON;
    SELECT id_curso, titulo, descripcion, imagen, duracion_estimada,
           nivel, categoria, estado, fecha_creacion
    FROM dbo.cursos ORDER BY id_curso DESC;
END;
GO
INSERT INTO dbo.cursos(titulo,descripcion,nivel,estado,fecha_creacion,categoria)
VALUES(N'Curso de prueba CI',N'Dato sintético para comprobar conexión API/SQL',N'basico',N'publicado',SYSDATETIME(),'CI');
GO
