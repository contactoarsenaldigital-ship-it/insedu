import { ASSIGNABLE_ROLES, formatRut, isSensitive, ROLE_LABEL, type Role } from "@insedu/domain";
import { repo } from "@/lib/store";

/** Perfil, alcance y segundo factor que asigna administración (aprobación o alta directa). */
export function ProfileFields({ idPrefix, roles = [], studentRut }: { idPrefix: string; roles?: Role[]; studentRut?: string }) {
  const courses = repo.courses();
  const subjects = repo.subjects();
  return (
    <>
      <fieldset className="field">
        <legend>Perfiles</legend>
        <div className="role-grid">
          {ASSIGNABLE_ROLES.map((r) => (
            <label key={r} className="check">
              <input type="checkbox" name="roles" value={r} defaultChecked={roles.includes(r)} />
              {ROLE_LABEL[r]}
              {isSensitive([r]) && <span className="tag alta" title="Requiere aprobación de dirección y app autenticadora">sensible</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${idPrefix}-subjects`}>Asignaturas que dicta (docentes)</label>
        <select id={`${idPrefix}-subjects`} name="subjectIds" multiple size={6}>
          {courses.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {subjects.filter((s) => s.courseId === c.id).map((s) => <option key={s.id} value={s.id}>{c.name} · {s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="muted">Ctrl o ⌘ + clic para elegir varias. Al aprobar, la cuenta reemplaza al docente actual en esas asignaturas.</span>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-head`}>Jefatura de curso (opcional)</label>
        <select id={`${idPrefix}-head`} name="headOfCourseId" defaultValue="">
          <option value="">Sin jefatura</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-student`}>RUN del estudiante (apoderado o estudiante)</label>
        <input id={`${idPrefix}-student`} name="studentRut" defaultValue={studentRut ? formatRut(studentRut) : undefined} placeholder="23.456.789-0" />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-mfa`}>Segundo factor</label>
        <select id={`${idPrefix}-mfa`} name="mfa" defaultValue={isSensitive(roles) ? "app" : "correo"}>
          <option value="correo">Código de 6 dígitos por correo</option>
          <option value="app">App autenticadora (Google o Microsoft Authenticator)</option>
        </select>
        <span className="muted">Los perfiles sensibles usan siempre app autenticadora.</span>
      </div>
    </>
  );
}
