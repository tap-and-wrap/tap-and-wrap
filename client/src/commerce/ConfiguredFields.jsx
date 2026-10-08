import { useEffect, useId, useState } from 'react';

const defaultTypes = ['image/jpeg', 'image/png', 'image/webp'];
export function validateConfiguredFields(fields, values, { skipFiles = false } = {}) {
  const errors = {};
  for (const field of fields || []) {
    const value = values[field.key];
    if (field.type === 'image') {
      if (skipFiles) continue;
      const files = Array.isArray(value) ? value : [];
      const minimum = Math.max(field.minFiles ?? 0, field.required ? 1 : 0);
      const maximum = field.maxFiles ?? 1;
      if (files.length < minimum || files.length > maximum) errors[field.key] = `Choose ${minimum === maximum ? `exactly ${minimum}` : `${minimum}–${maximum}`} file${maximum === 1 ? '' : 's'}.`;
      else if (files.some((file) => !(field.acceptedMimeTypes || defaultTypes).includes(file.type) || file.size > (field.maxBytes || 8 * 1024 * 1024))) errors[field.key] = 'A file has an unsupported format or exceeds the size limit.';
    } else {
      const text = typeof value === 'string' ? value.trim() : '';
      if (field.required && !text) errors[field.key] = 'This field is required.';
      else if (Array.from(text).length > (field.maxLength ?? field.maxChars ?? 2000)) errors[field.key] = 'This text exceeds the character limit.';
      else if (field.type === 'select' && text && !(field.choices || []).includes(text)) errors[field.key] = 'Choose one of the available options.';
    }
  }
  return errors;
}

export function LocalFileField({ field, value = [], onChange, error, disabled = false }) {
  const id = useId();
  const [previews, setPreviews] = useState([]);
  const [selectionError, setSelectionError] = useState('');
  const types = field.acceptedMimeTypes || defaultTypes;
  const maxBytes = field.maxBytes || 8 * 1024 * 1024;
  const maximum = field.maxFiles ?? 1;
  useEffect(() => {
    const entries = value.map((file) => ({ name: file.name, url: URL.createObjectURL(file), image: file.type.startsWith('image/') }));
    setPreviews(entries);
    return () => entries.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, [value]);
  function select(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (files.length > maximum) { setSelectionError(`Select no more than ${maximum} file${maximum === 1 ? '' : 's'}.`); return; }
    if (files.some((file) => !types.includes(file.type))) { setSelectionError('Choose an accepted file format.'); return; }
    if (files.some((file) => file.size > maxBytes)) { setSelectionError(`Each file must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`); return; }
    setSelectionError('');
    onChange(files);
  }
  return <div className="commerce-field">
    <label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label>
    <input id={id} type="file" accept={types.join(',')} multiple={maximum > 1} onChange={select} disabled={disabled} aria-invalid={Boolean(error || selectionError)} aria-describedby={`${id}-help`} />
    <small id={`${id}-help`}>Up to {maximum} file{maximum === 1 ? '' : 's'}, {Math.round(maxBytes / 1024 / 1024)} MB each. Files stay on this device until you submit.</small>
    {previews.length > 0 && <ul className="commerce-file-previews">{previews.map((entry, index) => <li key={`${entry.name}-${index}`}>{entry.image && <img src={entry.url} alt={`Selected ${field.label.toLowerCase()} ${index + 1}`} />}<span>{entry.name}</span><button type="button" className="commerce-link-button" disabled={disabled} onClick={() => onChange(value.filter((_, position) => position !== index))}>Remove</button></li>)}</ul>}
    {(error || selectionError) && <p className="form-error" role="alert">{selectionError || error}</p>}
  </div>;
}

export default function ConfiguredFields({ fields = [], values, onChange, errors = {}, disabled = false }) {
  const prefix = useId();
  return <div className="commerce-fields">{fields.map((field) => {
    const id = `${prefix}-${field.key}`;
    const value = values[field.key] || (field.type === 'image' ? [] : '');
    const change = (next) => onChange({ ...values, [field.key]: next });
    if (field.type === 'image') return <LocalFileField key={field.key} field={field} value={value} onChange={change} error={errors[field.key]} disabled={disabled} />;
    const props = { id, value, disabled, required: field.required, 'aria-invalid': Boolean(errors[field.key]), onChange: (event) => change(event.target.value), maxLength: field.maxLength ?? field.maxChars ?? 2000 };
    return <div key={field.key} className="commerce-field"><label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label>
      {field.type === 'select' ? <select {...props}><option value="">Select an option</option>{(field.choices || []).map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select> : ['textarea', 'long_text'].includes(field.type) ? <textarea {...props} rows={3} /> : <input {...props} type="text" />}
      {(field.maxLength || field.maxChars) && <small>{value.length}/{field.maxLength || field.maxChars} characters</small>}
      {errors[field.key] && <p className="form-error" role="alert">{errors[field.key]}</p>}
    </div>;
  })}</div>;
}
