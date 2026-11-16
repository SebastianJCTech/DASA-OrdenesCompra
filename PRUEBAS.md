# Verificación antes de entregar

La comprobación de sintaxis local no demuestra que RLS o las funciones funcionen en la base. Completar esta lista después de conectar Supabase.

Verificado localmente el 16/11/2026: sintaxis JavaScript, carga de pantalla sin configurar, sesión externa simulada, escape de texto HTML, menú externo, consulta de reporte y deshabilitación de PDF al modificar filtros. Se revisó visualmente la pantalla de ingreso. Las pruebas con Supabase real y exportaciones PDF siguen pendientes.

1. Crear dos externos A/B y cuatro internos con límites diferentes. Iniciar sesión con cada uno.
2. A crea un borrador. B no debe verlo en el listado ni mediante `supabase.from('orders').select('*')` con la sesión de B. Un interno sí lo ve. B intenta order_action con el ID de A: acceso denegado.
3. Con una sesión externa, intentar insert/update directo en orders y update en profiles: debe fallar. Leer audit_log: no devuelve filas. Sin sesión, leer orders: debe fallar.
4. Crear/modificar/eliminar un borrador y comprobar actor, hora, old_values/new_values en Auditoría del interno.
5. Enviar una orden de GTQ 100 asignada a un interno con límite GTQ 5.000. Aprobar con ese interno: Aprobada. Cerrar: Cerrada. Modificarla o aprobarla de nuevo: debe fallar incluso por RPC.
6. Enviar una orden de GTQ 6.000 con primer límite GTQ 5.000. Primera aprobación: permanece pendiente; repetir con el mismo aprobador: falla; aprobar con otro interno: Aprobada. Probar también rechazo del segundo aprobador.
7. Un interno crea una orden asignada a otro: intentar aprobar la propia por RPC debe fallar. Un interno no asignado intenta decidir antes del primero: debe fallar.
8. Rechazar sin motivo o cancelar sin motivo: falla. Rechazar con motivo: Rechazada y reporte de rechazos incluye aprobador/fecha/motivo. Cancelar pendiente: Cancelada. Eliminar una orden no borrador: falla.
9. Probar por RPC importe negativo, cero, nulo, más de dos decimales, proveedor vacío, descripción vacía, fecha pasada y aprobador externo: todos deben fallar sin dejar cambios parciales.
10. Abrir la misma orden pendiente en dos sesiones y decidir al mismo tiempo: no debe generarse un estado inválido ni más de una aprobación por usuario.
11. Consultar los siete reportes con periodos y filtros. Externo solo ve estado/historial de sus órdenes; interno ve los otros seis. Verificar sumas manualmente con tres órdenes conocidas.
12. Para vencidas, crear/enviar una orden y en una sesión SQL administrativa cambiar due_date a ayer para preparar el caso. Después consultar; no alterar datos reales para esta prueba.
13. Consultar un reporte, cambiar una orden en otra sesión, volver a consultar y verificar que cambia. Cambiar filtros deshabilita PDF hasta volver a consultar.
14. Exportar cada reporte a PDF, incluyendo uno vacío y uno con textos largos. Comprobar que el documento se lee, contiene filtros, moneda, usuario y fecha, y respeta las filas autorizadas.
15. Entrar por Microsoft con tenant configurado; una cuenta sin perfil no debe acceder. Si no se configuró Microsoft, registrar la limitación.
16. Repetir una creación y una aprobación desde la URL pública, no solo localhost. Revisar que el repositorio no contenga contraseñas ni claves secretas.
