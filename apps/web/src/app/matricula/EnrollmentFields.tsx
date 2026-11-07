import { CONDITION_LABEL, formatRut, parseRut, type EnrollmentCondition, type EnrollmentRecord, type Student } from "@insedu/domain";
import { school } from "@/lib/demo";

/** Campos de la ficha de matrícula (contenido mínimo, numeral 5.2 de la Circular). */
export function EnrollmentFields({ student, record, today }: { student?: Student; record?: EnrollmentRecord; today?: string }) {
  const rut = student ? (parseRut(student.rut) ? formatRut(student.rut) : student.rut) : undefined;
  return (
    <>
      <h3 className="form-group">Estudiante</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="document">Documento</label>
          <select id="document" name="document" defaultValue={record?.document ?? "RUN"}>
            <option value="RUN">RUN</option>
            <option value="IPE">Identificador Provisorio Escolar (IPE)</option>
          </select>
        </div>
        <div className="field"><label htmlFor="rut">RUN o IPE</label><input id="rut" name="rut" required defaultValue={rut} placeholder="12.345.678-5" /></div>
        <div className="field"><label htmlFor="firstName">Nombres</label><input id="firstName" name="firstName" required defaultValue={student?.firstName} /></div>
        <div className="field"><label htmlFor="lastName">Apellidos paterno y materno</label><input id="lastName" name="lastName" required defaultValue={student?.lastName} /></div>
        <div className="field">
          <label htmlFor="sex">Sexo</label>
          <select id="sex" name="sex" defaultValue={record?.sex ?? ""}>
            <option value="">Sin indicar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
          </select>
          <span className="muted">Según la identidad reconocida, conforme a la Ley 21.120.</span>
        </div>
        <div className="field"><label htmlFor="birthDate">Fecha de nacimiento</label><input id="birthDate" name="birthDate" type="date" defaultValue={record?.birthDate} /></div>
        <div className="field wide"><label htmlFor="address">Domicilio</label><input id="address" name="address" autoComplete="off" defaultValue={record?.address} /></div>
      </div>

      <h3 className="form-group">Matrícula</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="courseId">Curso</label>
          <select id="courseId" name="courseId" required defaultValue={student?.courseId ?? ""}>
            <option value="" disabled>Seleccione…</option>
            {school().courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="enrolledOn">Fecha de matrícula</label><input id="enrolledOn" name="enrolledOn" type="date" defaultValue={record?.enrolledOn ?? today} /></div>
        <div className="field"><label htmlFor="campus">Local escolar (si hay más de uno)</label><input id="campus" name="campus" defaultValue={record?.campus} placeholder="Principal o anexo" /></div>
        <div className="field">
          <label htmlFor="condition">Condición</label>
          <select id="condition" name="condition" defaultValue={record?.condition ?? "regular"}>
            {(Object.keys(CONDITION_LABEL) as EnrollmentCondition[]).map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="resolution">Resolución que autoriza (excedentes e intercambio)</label>
          <input id="resolution" name="resolution" defaultValue={record?.resolution} placeholder="Número y fecha" />
          <span className="muted">Por ahora se anota la referencia; aún no se pueden adjuntar documentos escaneados.</span>
        </div>
      </div>

      {[0, 1].map((i) => {
        const g = record?.guardians[i];
        return (
          <div key={i}>
            <h3 className="form-group">{i === 0 ? "Apoderado/a" : "Otro apoderado/a o tutor (opcional)"}</h3>
            <div className="form-grid">
              <div className="field"><label htmlFor={`g${i}_name`}>Nombre y apellidos</label><input id={`g${i}_name`} name={`g${i}_name`} autoComplete="off" defaultValue={g?.name} /></div>
              <div className="field"><label htmlFor={`g${i}_phone`}>Teléfono</label><input id={`g${i}_phone`} name={`g${i}_phone`} type="tel" autoComplete="off" defaultValue={g?.phone} /></div>
              <div className="field"><label htmlFor={`g${i}_email`}>Correo</label><input id={`g${i}_email`} name={`g${i}_email`} type="email" autoComplete="off" defaultValue={g?.email} /></div>
              <div className="field wide"><label htmlFor={`g${i}_address`}>Domicilio</label><input id={`g${i}_address`} name={`g${i}_address`} autoComplete="off" defaultValue={g?.address} /></div>
            </div>
          </div>
        );
      })}
    </>
  );
}
