import { useId, useLayoutEffect, useRef, useState } from 'react';

export function hasAdminFieldErrors(error) {
  const details = error?.response?.data?.error?.details || error?.details;
  return Array.isArray(details) && details.some(item => typeof item.message === 'string');
}

function fieldControl(form, field) {
  if (typeof field !== 'string') return null;
  const boundaries = [...form.querySelectorAll('[data-validation-field]')];
  const exactBoundary = boundaries.find(element => element.dataset.validationField === field);
  if (exactBoundary) return exactBoundary;
  const named = form.elements.namedItem(field);
  if (named instanceof HTMLElement) return named;
  // Shared-name checkbox groups produce RadioNodeList rather than one element.
  const firstNamed = named && [...named].find(control => control instanceof HTMLElement);
  if (firstNamed) return firstNamed;
  // Validation may identify a whole nested object instead of its scalar child.
  const child = [...form.elements].find(control => control instanceof HTMLElement && control.name?.startsWith(`${field}.`));
  if (child) return child;
  // A server may reject an array member that has no independently editable
  // control. Focus its nearest explicitly named group, rather than an arbitrary
  // unrelated field or whichever same-name checkbox happens to come first.
  return boundaries.filter(element => field.startsWith(`${element.dataset.validationField}.`)).sort((a, b) => b.dataset.validationField.length - a.dataset.validationField.length)[0] || null;
}

/** Scoped fallback for large legacy admin editors; native constraints still run. */
export default function AdminForm({ children, error, onInputCapture, onInvalidCapture, ...props }) {
  const form = useRef(null);
  const prefix = useId();
  const sequence = useRef(0);
  const [invalid, setInvalid] = useState([]);
  const details = error?.response?.data?.error?.details || error?.details || [];
  const nativeIds = new Set(invalid.map(item => item.id));
  const fieldErrors = Array.isArray(details) ? details.filter(item => typeof item.message === 'string').map((item, index) => ({ ...item, errorId: `${prefix}-server-${index}` })) : [];
  const headline = error?.response?.data?.error?.message || error?.message || 'Please correct the highlighted fields.';
  useLayoutEffect(() => {
    const element = form.current;
    if (!element) return undefined;
    const assigned = [];
    for (const item of fieldErrors) {
      const control = fieldControl(element, item.field);
      if (!(control instanceof HTMLElement)) continue;
      if (!control.id) control.id = `${prefix}-field-${++sequence.current}`;
      const previousInvalid = control.getAttribute('aria-invalid');
      const previousDescription = control.getAttribute('aria-describedby');
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', [previousDescription, item.errorId].filter(Boolean).join(' '));
      assigned.push({ control, previousInvalid, previousDescription });
    }
    if (assigned.length) assigned[0].control.focus({ preventScroll: false });
    return () => assigned.forEach(({ control, previousInvalid, previousDescription }) => {
      if (previousInvalid == null) control.removeAttribute('aria-invalid'); else control.setAttribute('aria-invalid', previousInvalid);
      if (previousDescription == null) control.removeAttribute('aria-describedby'); else control.setAttribute('aria-describedby', previousDescription);
    });
    // The server error object is stable until another submission or explicit reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, prefix]);
  function clear(control) {
    if (!nativeIds.has(control.id)) return;
    const errorId = `${control.id}-native-error`;
    control.removeAttribute('aria-invalid');
    const remaining = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id !== errorId).join(' ');
    if (remaining) control.setAttribute('aria-describedby', remaining); else control.removeAttribute('aria-describedby');
    setInvalid(current => current.filter(item => item.id !== control.id));
  }
  function captureInvalid(event) {
    onInvalidCapture?.(event);
    event.preventDefault();
    const control = event.target;
    if (!control.id) control.id = `${prefix}-field-${++sequence.current}`;
    const id = control.id;
    const label = control.labels?.[0]?.textContent.trim().replace(/\s+/g, ' ').slice(0, 100) || control.name || 'Field';
    control.setAttribute('aria-invalid', 'true');
    const descriptions = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(`${id}-native-error`); control.setAttribute('aria-describedby', [...descriptions].join(' '));
    setInvalid(current => [...current.filter(item => item.id !== id), { id, label, message: control.validationMessage }]);
    queueMicrotask(() => form.current?.querySelector(':is(input,select,textarea):invalid')?.focus());
  }
  return <form {...props} ref={form} onInvalidCapture={captureInvalid} onInputCapture={event => { clear(event.target); onInputCapture?.(event); }}>
    {(invalid.length > 0 || fieldErrors.length > 0) && <div className="admin-feedback admin-feedback-error" role="alert"><p>{fieldErrors.length ? headline : 'Please correct the highlighted fields.'}</p><ul>
      {invalid.map(item => <li id={`${item.id}-native-error`} key={item.id}><button className="admin-text-button" type="button" onClick={() => document.getElementById(item.id)?.focus()}>{item.label}</button>: {item.message}</li>)}
      {fieldErrors.map(item => <li id={item.errorId} key={item.errorId}>{item.field ? `${item.field}: ` : ''}{item.message}</li>)}
    </ul></div>}
    {children}
  </form>;
}
