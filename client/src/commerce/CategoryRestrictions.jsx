import { useState } from 'react';
import { CategoryPicker } from './AdminEditors';

export default function CategoryRestrictions({ values = [], onChange }) {
  const [parents, setParents] = useState({});
  function update(index, id) { onChange(values.map((value, position) => position === index ? id : value)); }
  return <section><h3>Eligible Categories (optional)</h3><p>Leave empty for all categories. Select a main category or narrow it to one subcategory.</p>{values.map((id, index) => <div key={index} className="commerce-editor-row"><CategoryPicker value={id} label="Eligible main category" onChange={(value, category) => { update(index, value); setParents((previous) => ({ ...previous, [index]: category?.slug || null })); }} />{parents[index] && <CategoryPicker value={id} parent={parents[index]} label="Narrow to subcategory (optional)" required={false} onChange={(value) => { if (value) update(index, value); }} />}<button className="commerce-link-button" type="button" onClick={() => onChange(values.filter((_, position) => position !== index))}>Remove category restriction</button></div>)}<button className="button button-secondary" type="button" onClick={() => onChange([...values, ''])}>Restrict to category</button></section>;
}
