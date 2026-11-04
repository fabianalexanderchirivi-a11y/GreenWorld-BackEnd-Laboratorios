# Validación técnica PPI

El 3 de noviembre de 2026, Cypress 16.1.1 ejecutó los ocho casos PPI contra Vite, Express y SQL Server. Resultado: **8 Pasa, 0 Falla, sin reintentos**.

- TC-GW02-02 y TC-GW09-01 completan módulos desde la interfaz. Comprueban el avance derivado y la persistencia tras recargar y consultar la API.
- TC-GW08-01 comprueba la precondición por módulos y descarga un PDF real. TC-GW08-02 conserva el rechazo del curso incompleto y la protección de rutas heredadas.
- El registro de módulos confirma la realización indicada por el estudiante. Calificaciones, evaluación docente y valoraciones numéricas requieren reglas académicas.

La ejecución original, su matriz y sus archivos multimedia se conservan en la entrega local. [Resumen de la ejecución](ppi-regresion-modulos.json).

## Preparar la base de pruebas

Aplica `migrations/20261103_learning.up.sql` a la base Green World que ya tiene tablas y procedimientos del proyecto. Esta migración agrega progreso por módulo y reseñas. Ejecuta las pruebas unitarias con `npm test`. La reversión incluida rechaza eliminar tablas con datos.
