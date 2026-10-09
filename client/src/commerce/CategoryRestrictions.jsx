import { useId, useState } from 'react';
import { CategoryPicker } from './AdminEditors';

export default function CategoryRestrictions({ values = [], onChange }) {
  const headingId = useId();
  const [parents, setParents] = useState({});
  function update(index, id) { onChange(values.map((value, position) => position === index ? id : value)); }
  function removeRestriction(index) {
    onChange(values.filter((_, position) => position !== index));
    setParents(previous => Object.fromEntries(Object.entries(previous)
      .filter(([position]) => Number(position) !== index)
      .map(([position, parent]) => [Number(position) > index ? Number(position) - 1 : Number(position), parent])));
  }
  // Main and optional child selectors edit one categoryIds entry. Their unique
  // DOM names are local identities; validation targets the shared indexed group.
  return <section data-validation-field="categoryIds" tabIndex={-1} role="group" aria-labelledby={headingId}><h3 id={headingId}>Eligible Categories (optional)</h3><p>Leave empty for all categories. Select a main category or narrow it to one subcategory.</p>{values.map((id, index) => <div key={index} className="commerce-editor-row" data-validation-field={`categoryIds.${index}`} tabIndex={-1} role="group" aria-label={`Category restriction ${index + 1}`}><CategoryPicker name={`category-restriction-${index}-main`} value={id} label="Eligible main category" onChange={(value, category) => { update(index, value); setParents((previous) => ({ ...previous, [index]: category?.slug || null })); }} />{parents[index] && <CategoryPicker key={parents[index]} name={`category-restriction-${index}-subcategory`} value={id} parent={parents[index]} label="Narrow to subcategory (optional)" required={false} onChange={(value) => { if (value) update(index, value); }} />}<button className="commerce-link-button" type="button" onClick={() => removeRestriction(index)}>Remove category restriction</button></div>)}<button className="button button-secondary" type="button" onClick={() => onChange([...values, ''])}>Restrict to category</button></section>;
}
