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
| Control de subvenciones y declaración en SIGE | Circular 6.2.c | **Pendiente** |
| Registro de salidas o retiros | Circular 7 | **Pendiente** |
| Registro de entrega de documentación | Circular 8 | **Pendiente** |

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
