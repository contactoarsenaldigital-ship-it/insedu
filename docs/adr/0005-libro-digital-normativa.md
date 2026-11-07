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
| Versión vigente del estándar de datos (EDE) | Circular 6.1.b | **Pendiente** |
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

## Pendiente del estándar EDE

Mapear el modelo de INSEDU a CEDS con la planilla oficial, generar el `json.zip` que espera la imagen
`edemineduc/etl` (`parse`, `insert`, `check`, repositorio `Admin-EDE/DockerEdeCode`) y validar el resultado.

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
