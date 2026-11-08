"use client";
import { useState } from "react";

type Group = { label: string; people: { id: string; name: string }[] };

/** Elige primero el curso (o «Personal») y luego a la persona. */
export function BorrowerPicker({ groups }: { groups: Group[] }) {
  const [label, setLabel] = useState("");
  const people = groups.find((g) => g.label === label)?.people ?? [];
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="borrower-group">Curso o personal</label>
        <select id="borrower-group" value={label} onChange={(e) => setLabel(e.target.value)} required>
          <option value="" disabled>Seleccione…</option>
          {groups.map((g) => <option key={g.label} value={g.label}>{g.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="borrowerId">Persona</label>
        <select id="borrowerId" name="borrowerId" key={label} defaultValue="" required disabled={!label}>
          <option value="" disabled>Seleccione…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    </div>
  );
}
