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

**Sexta etapa (hecha):**
- Apoderado titular de la matrícula y autorizados a retirar en PersonRelationship, con `RetirarEstudianteIndicador` (fn0FA).
- Cada retiro lo firma con verificador quien lo registra, y se exporta con los tres eventos «EarlyDeparture» que pide fn0FB: el
  estudiante en la asignatura que el horario indica a esa hora, en el establecimiento, y quien retira, ratificado por el
  funcionario y con su firma en pantalla o el poder escaneado. Quien no estaba en el registro de autorizados queda autorizado solo
  ese día, y el informe advierte que el validador lo rechaza.
- Cada entrega de documentos la firma con verificador quien entrega. Se exporta como Incident «Entrega de documentos retiro de un
  estudiante» (estudiante retirado, con PersonStatus «retirado definitivamente») o «continuidad de estudios», con quien recibe y la
  firma de recepción o el comprobante en Document (fn1FA, fn1FC).
- PIE: el validador no lo revisa. Se exporta solo la nómina (PersonProgramParticipation), sin diagnósticos.
- Inconsistencia del validador: fn6E0 espera `ClassPeriod` como «Hora 02», y fn9F1 lo filtra con una expresión de
  «Bloque». Se mantiene «Hora 02» hasta correr `check`.

**Séptima etapa (hecha):**
- `/informatica/datos-ede` (dirección y administración): capacidad autorizada de cada curso y títulos de docentes y
  profesionales.
- Se exporta CourseSection: curso, capacidad, presencial y español (fn9F1), y PersonDegreeOrCertificate con la idoneidad
  docente (fn9F0).
- El apoderado confirma desde su cuenta que recibió cada instrumento de interés general. Se exporta un Incident «Entrega de
  documentos de interés general» por instrumento, con cada apoderado que confirmó y el archivo del instrumento en Document
  (fn1FB). Supuesto por validar: que esa confirmación en la plataforma valga como entrega.

**Octava etapa (validación con el contenedor oficial):**
- `check` corre en local con la imagen `edemineduc/etl`, sin red y con datos ficticios. La frase secreta la genera `insert`.
- El parser exige un solo objeto por grupo con todas sus tablas: el exportador escribía uno por tabla y se perdía casi todo.
- Diccionario: `OFFICIAL_REFS` en `ede/refs.ts`, tomado de los catálogos `Ref*` y `Role` de la plantilla en blanco, con la clave del
  código público del validador. Fue decisión expresa del responsable del proyecto. La base que genera `insert` no se abre: es para la Superintendencia.
- Por confirmar con la Superintendencia (no hay código exacto, ver «interpretación» en el diccionario): rol del estudiante anotado,
  quien entrega y recibe documentos, funcionario que ratifica un retiro, persona autorizada a retirar, suspensión de clases, conducta
  negativa y las diez medidas disciplinarias.
- El PIE se informa como estado «Estudiante PIE» (`RefPersonStatusType`): `RefParticipationType` no tiene ese programa.
- Los identificadores parten en 100.001 porque la plantilla ya ocupa los bajos. Se agregó la tabla `Course`, a la que apunta `CourseSection`.

- Se agregó la jerarquía modalidad → jornada → nivel → rama → sector → especialidad →
  tipo de curso, el RBD como `RBD` + cinco dígitos con tipo de identificador `MINEDUC` (la vista `jerarquiasList` lo busca así), el período como
  `BloqueNN`, la firma docente como evento propio de cada clase, un calendario por curso y la hora del bloque en cada sesión de clases.
- La jornada aún no se registra: se informa «Mañana y Tarde» y el informe lo advierte.
- `IncidentPerson.Date` va como fecha corta (fn3F9). La hora del hecho queda en `Incident.IncidentTime`; la hora exacta de la firma de anotaciones,
  entrevistas y entregas se conserva en la plataforma, pero esa tabla no tiene dónde llevarla en el archivo.
- El segundo nombre o apellido que no existe va como un espacio: el validador convierte el texto vacío en nulo y fn4FA, al concatenar, pierde el
  nombre completo. Conviene confirmarlo con la Superintendencia.

- En el registro diario, el atraso se informa como presente: fn5E5 y fn6F0 lo cuentan así, y el atraso consta en la asistencia por asignatura.

**Demostración:** el archivo real del colegio ficticio, generado tras reiniciar la demostración, aprueba las 99 reglas del validador oficial. La siembra
(`lib/demo-ede.ts`, `lib/matricula.ts`) inventa domicilios, contactos, títulos, RUN, horario, clases firmadas, firma de la asistencia diaria y documento de
matrícula, además de entrevistas, reuniones, entregas e instrumentos con sus actas y comprobantes en PDF de ejemplo. Los RUN ficticios pasan a 44.000.000-46.999.999, porque el validador rechaza los mayores a 47.000.000. Al ser parte de la siembra, el reinicio los restaura.

**Pendiente para operar con datos reales:**
- Formularios para capturar lo que hoy solo llena la siembra: domicilio estructurado y RUN del apoderado, dirección, correo, teléfono y jornada del establecimiento,
  fechas del año escolar, documento de matrícula definitiva y firma de la asistencia diaria.
- Las suspensiones se informan como `EmergencyDay`, uno de los tipos que fn6F0 descuenta. Falta marcar feriados, y capturar el número, fecha y escaneo de la resolución (fn6E3).
- fn5E0 suma el retiro dentro de los totales de la clase si ocurre en plena hora, mientras fn0FB exige ese evento: los retiros a mitad de un bloque quedarían rechazados.
  Hay que consultarlo con la Superintendencia.
- Confirmar las interpretaciones del diccionario.

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
