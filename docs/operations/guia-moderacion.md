# Guía operativa de moderación y Trust & Safety

Procedimiento para el personal autorizado en la versión actual. Toda decisión debe basarse en evidencia disponible y dejar una nota clara. Las alertas automáticas son señales para revisión humana, no determinaciones de fraude.

## Acceso por rol

Todos los roles administrativos deben seguir el enrolamiento MFA documentado en [admin-mfa.md](admin-mfa.md). El método aprobado para el primer enrolamiento sigue pendiente; no incorporar personal real hasta aprobarlo.

| Rol | Alcance configurado |
| --- | --- |
| Operador de apoyo | Asistencia a productores (`producers.assist`) |
| Moderador | Revisar publicaciones; consultar perfiles y suspenderlos con motivo (`producers.suspend`); gestionar reportes/apelaciones y revisar alertas de riesgo |
| Analista | Ver analítica |
| Administrador | Moderación, asistencia, catálogos, analítica, auditoría y alertas; sin gestión de usuarios |
| Superadministrador | Todos los permisos, incluida gestión de usuarios |

Los permisos reales se aplican en servidor. No compartas cuentas. La asignación de roles y el acceso a datos personales deben limitarse al personal aprobado por Super Carnes.

## Revisar publicaciones

1. Abre la cola de publicaciones pendientes y revisa el perfil, la categoría, el texto, el precio y las fotografías.
2. Para inspeccionar una imagen pendiente, usa el acceso protegido del portal; la consulta queda auditada.
3. Registra una decisión con motivo de al menos cinco caracteres: aprobar, rechazar o solicitar cambios.
4. Si solicitas cambios, concreta qué debe corregirse. El productor podrá editar y volver a enviar una oferta devuelta.
5. Ante un conflicto de estado, actualiza la cola antes de volver a decidir. Solo se revisan ofertas pendientes; el perfil debe estar activo y la categoría vigente para aprobar.

No apruebes contenido si las fotografías no están disponibles o si falta información necesaria para que el público entienda la oferta.

## Atender reportes

1. Revisa primero los casos urgentes y vencidos según el SLA configurado. El panel calcula vencimiento por prioridad; los valores predeterminados son configurables y no constituyen un compromiso institucional aprobado.
2. Abre el recurso reportado y evalúa descripción y evidencia. La evidencia se entrega como archivo privado; cada acceso queda en auditoría. No la copies a canales personales ni la compartas fuera del caso.
3. Cambia `new` a `reviewing` o `dismissed`; luego `reviewing` a `resolved` o `dismissed`. Ajusta la prioridad si hace falta y registra una nota de al menos cinco caracteres.
4. El primer moderador que actualiza el caso queda asignado. Otro moderador no puede editarlo mientras siga asignado; acuerda la transferencia por el procedimiento interno que Operaciones apruebe.

## Alertas y apelaciones

- **Alertas:** revisa contexto y evidencia. El sistema puede señalar tres o más reportes sobre un mismo recurso en una ventana móvil de 24 horas, pero la señal no confirma infracción ni sanciona automáticamente. La ventana se identifica por su primer reporte; reportes adicionales actualizan conteo y última actividad sin quitar el estado `reviewing` ni la asignación existente. Si entra un nuevo reporte mientras la alerta estaba `resolved` o `dismissed` y la ventana sigue vigente, se reabre como `open` sin asignación ni nota de resolución. Cambia `open` a `reviewing` o `dismissed`, y después a `resolved` o `dismissed`, con nota de al menos diez caracteres. La primera actualización asigna el caso al moderador.
- **Apelaciones:** revisa la explicación del productor suspendido. Decide `reinstated` o `upheld` e incluye una nota de al menos diez caracteres. La reinstalación reactiva el perfil y elimina el motivo de suspensión, pero devuelve a revisión humana todas las ofertas que aún están en `published`; la cola muestra el actor y el motivo. Su aprobación conserva la vigencia original, por lo que las ofertas vencidas siguen ocultas hasta que el productor las renueve. La pantalla informa el conteo antes de aceptar. Si el estado ya cambió, detente y coordina la actualización con el responsable antes de decidir.

## Registro, privacidad y escalamiento

Los cambios y accesos sensibles generan registros de auditoría. Documenta hechos y razones, no opiniones personales. Usa solo los datos necesarios para resolver el caso y evita exportar evidencia.

Operaciones debe aprobar antes del piloto: matriz de responsables y suplencias, SLA definitivo y horario de cobertura, escalamiento de emergencias, criterios editoriales y de sanción, conservación y eliminación de evidencia, tratamiento de solicitudes de titulares y canal de contacto del denunciante. La aplicación no define por sí sola esos compromisos institucionales.
