import { LIBRARY_KIND_LABEL, LIBRARY_MEDIUM_LABEL, type LibraryItem, type LibraryKind, type LibraryMedium } from "@insedu/domain";

/** Datos de un título, para agregarlo o corregirlo. */
export function ItemFields({ item, code, kind }: { item?: LibraryItem; code?: string; kind?: LibraryKind }) {
  return (
    <>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="kind">Tipo de material</label>
          <select id="kind" name="kind" defaultValue={item?.kind ?? kind ?? "libro"}>{(Object.keys(LIBRARY_KIND_LABEL) as LibraryKind[]).map((k) => <option key={k} value={k}>{LIBRARY_KIND_LABEL[k]}</option>)}</select>
        </div>
        <div className="field">
          <label htmlFor="medium">Soporte</label>
          <select id="medium" name="medium" defaultValue={item?.medium ?? "fisico"}>{(Object.keys(LIBRARY_MEDIUM_LABEL) as LibraryMedium[]).map((k) => <option key={k} value={k}>{LIBRARY_MEDIUM_LABEL[k]}</option>)}</select>
        </div>
      </div>
      <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" required minLength={2} maxLength={200} defaultValue={item?.title} autoComplete="off" /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="author">Autor o responsable</label><input id="author" name="author" maxLength={200} defaultValue={item?.author} autoComplete="off" /></div>
        <div className="field"><label htmlFor="code">ISBN, ISSN o código</label><input id="code" name="code" maxLength={40} defaultValue={item?.code ?? code} autoComplete="off" /></div>
        <div className="field"><label htmlFor="publisher">Editorial o productora</label><input id="publisher" name="publisher" maxLength={200} defaultValue={item?.publisher} autoComplete="off" /></div>
        <div className="field"><label htmlFor="year">Año</label><input id="year" name="year" inputMode="numeric" pattern="\d{4}" maxLength={4} defaultValue={item?.year} autoComplete="off" /></div>
        <div className="field"><label htmlFor="category">Categoría</label><input id="category" name="category" maxLength={80} defaultValue={item?.category} autoComplete="off" placeholder="Novela chilena" /></div>
        <div className="field"><label htmlFor="location">Ubicación</label><input id="location" name="location" maxLength={120} defaultValue={item?.location} autoComplete="off" placeholder="Estante 5" /></div>
      </div>
      <div className="field"><label htmlFor="link">Enlace al archivo digital (opcional)</label><input id="link" name="link" type="url" maxLength={400} defaultValue={item?.link} placeholder="https://" autoComplete="off" /></div>
      <div className="field"><label htmlFor="notes">Observaciones (opcional)</label><textarea id="notes" name="notes" maxLength={500} defaultValue={item?.notes} /></div>
    </>
  );
}
