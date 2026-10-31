import { IMPORT_COLUMNS, KIND_LABEL, MAX_IMPORT_ROWS, type ImportKind } from "@insedu/domain";
import { accountsState, type ImportPlanRow, type PendingImport } from "@/lib/accounts";
import { findPerson } from "@/lib/store";
import { analyzeImport, confirmImport, discardImport } from "./actions";

const KINDS: ImportKind[] = ["estudiantes", "funcionarios", "apoderados"];

const STEP_NOTE: Record<ImportKind, string> = {
  estudiantes: "Primero: crea la matrícula y, si lo indica, los cursos que falten.",
  funcionarios: "Segundo: crea las cuentas del personal con su perfil, jefatura y asignaturas.",
  apoderados: "Tercero: crea las cuentas de apoderados vinculadas a sus pupilos (deben estar matriculados).",
};

const ACTION: Record<ImportPlanRow["action"], [label: string, tag: string]> = {
  crear: ["Se crea", "ok"],
  actualizar: ["Se actualiza", "media"],
  direccion: ["Espera a dirección", "media"],
  omitir: ["Sin cambios", ""],
  error: ["Error", "alta"],
};

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }) : "—");

/** Carga masiva inicial: elegir tipo, subir el archivo, revisar el plan y confirmar. */
export function ImportTab({ id, kind: selected }: { id?: string; kind?: string }) {
  const imports = accountsState().imports ?? [];
  const current = id ? imports.find((p) => p.id === id) : undefined;
  const kind = KINDS.find((k) => k === selected) ?? "estudiantes";
  return (
    <section className="section">
      <h2>Carga masiva inicial</h2>
      <p className="muted">Para comenzar a usar INSEDU sin ingresar a cada persona una por una. Acepta CSV o TXT (separados por punto y coma, coma o tabulación) y Excel (.xlsx), hasta {MAX_IMPORT_ROWS.toLocaleString("es-CL")} filas y 4 MB por archivo. Antes de cargar se muestra una revisión fila por fila; nada cambia hasta que confirme.</p>

      {current ? <Review p={current} /> : (
        <>
          <ol className="import-steps">
            {KINDS.map((k) => (
              <li key={k}>
                <strong>{KIND_LABEL[k]}</strong> · {STEP_NOTE[k]}{" "}
                <a href={`/api/plantillas/${k}`}>Plantilla Excel</a> · <a href={`/api/plantillas/${k}?formato=csv`}>Plantilla CSV</a>
              </li>
            ))}
          </ol>
          <form action={analyzeImport} className="card">
            <fieldset className="field">
              <legend>¿Qué va a cargar?</legend>
              <div className="choice-list">
                {KINDS.map((k) => (
                  <label key={k} className="check"><input type="radio" name="kind" value={k} defaultChecked={k === kind} required />{KIND_LABEL[k]}</label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="file">Archivo</label>
              <input id="file" name="file" type="file" accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
              <span className="muted">La primera fila debe tener los nombres de las columnas. Se aceptan nombres parecidos (por ejemplo «RUT» o «Email»).</span>
            </div>
            <label className="check"><input type="checkbox" name="createCourses" value="1" defaultChecked />Estudiantes: crear los cursos que no existan (con sus asignaturas)</label>
            <label className="check"><input type="checkbox" name="sendInvites" value="1" defaultChecked />Funcionarios y apoderados: enviar ahora el correo de activación</label>
            <p className="muted">Si no envía las invitaciones ahora, puede hacerlo después desde Usuarios con «Reenviar enlace».</p>
            <button className="btn primary">Revisar archivo</button>
          </form>
          <details className="section">
            <summary>Columnas de cada archivo</summary>
            {KINDS.map((k) => (
              <div key={k} className="section">
                <h3 style={{ fontSize: "1rem" }}>{KIND_LABEL[k]}</h3>
                <ul className="columns-help">
                  {IMPORT_COLUMNS[k].map((c) => <li key={c.key}><strong>{c.label}</strong>{c.required ? " (obligatoria)" : ""}{c.help ? ` · ${c.help}` : ""}</li>)}
                </ul>
              </div>
            ))}
          </details>
        </>
      )}

      {imports.some((p) => p.status === "aplicada") && (
        <section className="section">
          <h3>Cargas realizadas</h3>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Resultado</th><th>Quién</th></tr></thead>
              <tbody>
                {imports.filter((p) => p.status === "aplicada").reverse().map((p) => (
                  <tr key={p.id}><td>{when(p.appliedAt)}</td><td>{KIND_LABEL[p.kind]}</td><td>{p.fileName}</td><td>{p.result}</td><td>{findPerson(p.createdBy)?.name ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function Review({ p }: { p: PendingImport }) {
  const count = (a: ImportPlanRow["action"]) => p.rows.filter((r) => r.action === a).length;
  const applicable = count("crear") + count("actualizar") + count("direccion");
  const cols = IMPORT_COLUMNS[p.kind].filter((c) => ["run", "nombres", "apellidos", "curso", "correo", "perfil", "run_estudiante"].includes(c.key));
  // Errores primero; se muestran hasta 300 filas para no sobrecargar la página.
  const order: ImportPlanRow["action"][] = ["error", "direccion", "actualizar", "crear", "omitir"];
  const shown = [...p.rows].sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action) || a.line - b.line).slice(0, 300);
  const applied = p.status === "aplicada";

  return (
    <div className="card import-review">
      <div className="req-head" style={{ justifyContent: "space-between" }}>
        <span><strong>{KIND_LABEL[p.kind]}</strong> · {p.fileName} · {p.rows.length} filas</span>
        <span className={`tag ${applied ? "ok" : "media"}`}>{applied ? `Cargado el ${when(p.appliedAt)}` : "En revisión"}</span>
      </div>
      <div className="import-counts">
        {(["crear", "actualizar", "direccion", "omitir", "error"] as const).map((a) => (
          <div key={a}><strong>{count(a)}</strong><span>{ACTION[a][0]}</span></div>
        ))}
      </div>
      {p.newCourses.length > 0 && <p>Cursos nuevos: <strong>{p.newCourses.join(", ")}</strong></p>}
      {applied && p.result && <p className="notice ok">{p.result}</p>}
      {!applied && (
        <>
          {count("error") > 0 && <p className="notice warn">Las {count("error")} filas con error no se cargarán. Puede corregirlas en el archivo y volver a subirlo: lo ya cargado aparecerá como «Sin cambios».</p>}
          <div className="req-actions">
            <form action={confirmImport}>
              <input type="hidden" name="importId" value={p.id} />
              <button className="btn primary" disabled={applicable === 0}>Cargar {applicable} {applicable === 1 ? "fila" : "filas"}</button>
            </form>
            <form action={discardImport}>
              <input type="hidden" name="importId" value={p.id} />
              <button className="btn secondary">Descartar y subir otro archivo</button>
            </form>
          </div>
        </>
      )}
      <div className="table-scroll section">
        <table className="data">
          <thead><tr><th>Línea</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th>Qué pasará</th><th>Detalle</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.line}>
                <td>{r.line}</td>
                {cols.map((c) => <td key={c.key}>{r.values[c.key]}</td>)}
                <td><span className={`tag ${ACTION[r.action][1]}`}>{ACTION[r.action][0]}</span></td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.rows.length > shown.length && <p className="muted">Se muestran {shown.length} de {p.rows.length} filas (primero las que tienen errores).</p>}
      {applied && <p><a href="/configuracion?tab=carga">Cargar otro archivo</a></p>}
    </div>
  );
}
