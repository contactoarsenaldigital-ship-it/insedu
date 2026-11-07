# ADR 0005 · Cumplimiento normativo del libro de clases digital

Fecha: 2026-11-06. Estado: en curso.

## Norma revisada

- REX 30/2021 de la Superintendencia, con su modificación REX 432/2023 («Circular de registros»).
- ORD 1355/2023 de la Superintendencia.
- Sitio del Estándar de Datos para la Educación (ede.mineduc.cl). Si hay contradicción, prevalece la Circular.

La Superintendencia no certifica proveedores: el sostenedor responde por lo registrado. El libro
digital es optativo, pero **solo puede usarse con registro de matrícula digital**, y no coexiste con papel.

## Estado frente a cada exigencia

| Exigencia | Fuente | Estado |
|---|---|---|
| Firma con verificador de identidad | Circular 6.2.b.2 | Implementado (`lib/verifier.ts`). Sin probar contra el servicio real |
| Registro de cada ingreso, cambio o eliminación, con usuario, fecha, hora y motivo | Circular 6.1.b; ORD 1355 punto 5 | Implementado para el libro (`domain/logbook.ts`) |
| Toda la información exportable | Circular 6.1.b; ORD 1355 punto 4 | Parcial: planilla completa, aún no en el formato EDE |
| Versión vigente del estándar de datos (EDE) | Circular 6.1.b | Primera etapa (`/api/ede`): estructura y tablas centrales; faltan códigos oficiales, horario y los demás registros |
| Disponible por al menos cinco años | Circular 6.2 | Parcial: reinicio bloqueado con datos reales; falta ambiente productivo con respaldos |
| Registro de matrícula digital | Circular 5 y 6 | Implementado (`/matricula`), salvo adjuntar documentos escaneados y el formato EDE |
| Registro de atención de profesionales y PIE | Circular 6.2.f | Implementado (`/pie`), salvo el formato EDE y la atención de profesionales fuera de cursos PIE |
| Control de subvenciones y declaración en SIGE | Circular 6.2.c | Implementado (`/subvenciones`), salvo el envío al SIGE, adjuntar justificativos, formación dual y el formato EDE |
| Registro de salidas o retiros | Circular 7 | Implementado (`/salidas`), salvo adjuntar poderes escaneados y el formato EDE |
| Registro de entrega de documentación | Circular 8 | Implementado (`/entregas`), salvo la entrega electrónica según el protocolo EDE |

El ORD 1355 también menciona un resguardo de al menos tres años (art. 42, DTO 8144). Se adopta el
plazo mayor de cinco años hasta confirmarlo con la Superintendencia.

## Decisiones

- **Firma:** se valida en `GET https://apiede.mineduc.cl/otp/verify-otp`. El servicio exige el código
  en la URL, así que esa URL nunca se escribe en registros. Sin respuesta clara no hay firma.
  La documentación no da el nombre del campo booleano: hay que confirmarlo con una prueba real.
- **Bitácora encadenada con bifurcaciones:** cada evento guarda la huella del anterior. Dos instancias
  pueden escribir a la vez, así que se verifica que cada evento sea íntegro y su anterior exista.
  Detecta alteraciones y borrados intermedios, pero no el borrado del último evento: para eso hace falta
  guardar la huella final fuera de la base en el ambiente productivo.
- **Modo interno:** en la maqueta se firma con el segundo factor de INSEDU y queda rotulado como
  demostración. No tiene validez ante fiscalización.

## Estándar EDE

Fuente: repositorio oficial `Admin-EDE/DockerEdeCode` (planillas `NDS-Reference-v7_1.xlsx` y `listValidationData.xlsx`, y las
reglas en `validation_functions`). El contenedor `edemineduc/etl` lee un `json.zip` cuyo JSON agrupa las tablas CEDS por
la columna JSONGroup de la planilla (76 tablas en 10 grupos), lo pasa a una base SQLCipher y aplica unas 100 reglas.

**Primera etapa (hecha):** Organization, OrganizationIdentifier (RBD), OrganizationRelationship, Person, PersonIdentifier
(RUN o IPE, número de lista y de matrícula), PersonAddress, PersonStatus, OrganizationPersonRole (estudiantes en curso y en
cada asignatura, profesor jefe y docentes), K12StudentEnrollment, RoleAttendanceEvent (diaria y por clase con la firma),
OrganizationCalendar y OrganizationCalendarEvent (suspensiones). Fechas con desfase horario.

**Códigos de referencia:** los números válidos están en la base plantilla cifrada del validador. Las reglas a veces los
fijan (rol 6 = Estudiante; asistencia por clase = 2; estados 1 presente y 4 atrasado) y a veces los buscan por nombre.
`domain/ede/refs.ts` anota cada código con su búsqueda oficial y su origen. Mientras falte el diccionario oficial, el
archivo usa códigos provisionales y el informe lo marca como error: **no debe entregarse**. El diccionario se genera
consultando las tablas Ref de la base del contenedor, una vez instalado Docker.

**Firma:** el validador exige en cada asistencia por clase el código del verificador (`digitalRandomKey`, 6 dígitos). Desde
ahora la firma guarda ese código; las clases firmadas antes no lo tienen.

**Segunda etapa (hecha):** horario por asignatura (CourseSectionSchedule: días como `Lunes`…`Viernes`, horas `HH:MM`,
`ClassPeriod` «Hora 02») y una sesión de calendario por asignatura y día de clase firmada. El libro avisa si se firma fuera
del bloque, porque el validador exige firmar durante la clase. El control de subvenciones usa el término de la segunda hora
de la jornada configurada.

**Tercera etapa (hecha):** jerarquía que recorren las reglas (establecimiento → código de enseñanza «110:Enseñanza Básica» →
grado «110.05:5º Básico» → curso con su letra → asignatura); evaluaciones sumativas (Assessment, AssessmentAdministration,
AssessmentSession, AssessmentRegistration, AssessmentResult con la nota «5.5», LearnerActivity con la ponderación en porcentaje y la
sesión del día); anotaciones (Incident, IncidentPerson y K12StudentDiscipline). Brechas que el informe marca: las notas no se firman
con el verificador, las anotaciones del colegio ficticio no tienen hora, las negativas no registran medida disciplinaria ni el
artículo del reglamento, y no hay registro de entrevistas con apoderados.

**Cuarta etapa (hecha):** el docente firma cada evaluación con el verificador (se exporta en LearnerActivity), y las anotaciones
negativas registran el artículo del reglamento interno y sus medidas disciplinarias (K12StudentDiscipline, con fechas y días).
Cancelación de matrícula y expulsión solo las registra dirección. Las medidas las anotan inspectoría, dirección, administración y
el profesor jefe del curso.

**Quinta etapa (hecha):** quien registra una anotación la firma con su verificador al guardarla; sin firma válida no se guarda
(IncidentPerson del docente con `digitalRandomKey`). Entrevistas y reuniones con apoderados en `/entrevistas`: quien conduce firma
al guardar, y el acta firmada por el apoderado se adjunta escaneada. Se exportan como Incident «Entrevista» o «Reunión con
apoderados», con el apoderado (PersonRelationship «Apoderado(a)/Tutor(a)» y rol «Padre, madre o apoderado») y el acta en base64
(Document, enlazada desde `IncidentPerson.fileScanBase64`), como exige fn8F3. En la reunión asiste el apoderado titular de la
matrícula de cada estudiante marcado. Supuesto por validar: que la Superintendencia acepte el acta escaneada como firma del apoderado.

**Pendiente:** PIE, salidas, entregas, código de grado de `listValidationData`, y correr `check`.

## Registro de matrícula

- La baja no borra: conserva ficha e historia y saca al estudiante de las listas activas. El número nunca se reutiliza.
- Las resoluciones y constancias se anotan como referencia. La Circular pide escanearlas y cargarlas en el sistema: falta
  almacenamiento de archivos, junto con la declaración al SIGE.
- El IPE se valida con la misma regla que el RUN: hay que confirmar el formato con un IPE real.

## Libro PIE

- Sigue los ítems de la Circular 6.2.f: equipo de aula y coordinación, planificación, implementación y evaluación, familia y comunidad.
- No guarda diagnósticos, por resguardo de datos de menores (Ley 21.719): solo si la necesidad es permanente o transitoria.
- Las horas de apoyo se muestran como dato. No se valida un mínimo: la exigencia depende del régimen y del número de
  estudiantes, y los manuales disponibles son antiguos. Hay que confirmarla antes de agregar alertas.
- El formato oficial de 2013 (.doc) no se reprodujo campo a campo: falta compararlo con una educadora diferencial.
- Expediente del estudiante y Formularios Únicos quedan fuera: requieren almacenamiento de archivos.

## Registro de salidas

- Firma manuscrita en pantalla, guardada con el registro; la bitácora conserva su huella. La Circular admite también
  poder simple escaneado o autorización electrónica: por ahora el poder se anota como referencia.
- El apoderado autoriza desde su sesión. Una persona no registrada exige RUN y la comunicación del apoderado.
- Falta confirmar con la Superintendencia si la firma en pantalla basta como «firma de la persona que retira».

## Control de subvenciones

- Se calcula con lo ya registrado. Por estudiante y día vale, en orden: la corrección, la clase que cubre la segunda hora y la asistencia diaria.
- Si la clase de segunda hora y la asistencia diaria difieren, es un error que impide registrar la declaración hasta corregirlo.
- Un día sin clase de segunda hora, pero con asistencia diaria completa, se acepta con aviso (Circular b.2 y c.2). **Hay que confirmarlo con la Superintendencia.**
- Quien llega después de la segunda hora queda ausente hasta registrar un justificativo. El límite es el inicio de jornada más 90 minutos (dos horas de 45): **supuesto a validar con los horarios reales**.
- Quien fue retirado antes de la segunda hora solo se detecta si la clase de segunda hora lo marca ausente: el control no cruza el registro de salidas.
- Solo dirección y administración corrigen: su registro hace de visado. Falta confirmar si basta para el formato digital.
- INSEDU no envía datos al SIGE ni calcula montos. El archivo es una plantilla propia para cotejar, porque no se encontró un formato de carga público.
- Los días hábiles salen del calendario y de los registros existentes. Falta administrar feriados y calendario escolar: un feriado dentro del calendario aparecería como día sin asistencia.
- Sin tratamiento propio: formación dual (c.8), cursos combinados (totales generales y por curso) y administración delegada.

## Documentos escaneados

- PDF, JPG o PNG de hasta 4 MB (límite de Vercel: 4,5 MB por solicitud). El tipo se reconoce por el contenido.
- La ficha del documento vive en el estado; el contenido va cifrado (AES-256-GCM) en `demo.files` y solo se lee al
  descargar. La huella SHA-256 se comprueba en cada descarga y queda en la bitácora y el respaldo.
- No se borran: son respaldo ante fiscalización. Cada descarga queda en la bitácora.
- Se adjuntan a la ficha de matrícula, a cada retiro y a cada corrección del control de subvenciones.
- El respaldo en Excel lista los documentos con su huella, pero no incluye su contenido.
- Pendiente: autorizaciones digitales validadas (por ejemplo, firmadas electrónicamente) y documentos del Libro PIE.

## Entrega de información

- Solicitudes con folio anual, pedidas por el apoderado o el estudiante desde su cuenta, o registradas en persona por
  administración, dirección o inspectoría. Se muestran los días de espera: entregar tarde es infracción.
- No existe la opción de rechazar: la documentación no se retiene por deudas (LGE art. 11). Solo se desiste a pedido de quien pidió.
- En papel: quien recibe firma en pantalla, o se anota dónde consta la recepción firmada.
- Electrónica: se adjuntan los documentos y el apoderado o estudiante confirma la recepción desde su cuenta. **Hay que
  confirmar que esto basta como «expresión de su firma» y adoptar el protocolo de traspaso del EDE.**
- Instrumentos de interés general publicados con versión; una versión nueva reemplaza a la anterior, que se conserva.
