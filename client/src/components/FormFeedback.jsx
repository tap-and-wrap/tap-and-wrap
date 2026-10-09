export function validationFieldErrors(error) {
  const details = error?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.filter((entry) => typeof entry.field === 'string' && typeof entry.message === 'string').map((entry) => [entry.field, entry.message]));
}

export function fieldErrorProps(id, message, helpIds = '') {
  return { 'aria-invalid': Boolean(message), 'aria-describedby': [helpIds, message ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined };
}

export function FieldError({ id, children }) {
  return children ? <p id={`${id}-error`} className="form-error" role="alert">{children}</p> : null;
}

export function nativeFieldErrors(form) {
  const errors = {};
  for (const control of form.elements) {
    if (!control.willValidate || control.validity.valid) continue;
    const key = control.name || control.id;
    if (key) errors[key] = control.validationMessage;
  }
  return errors;
}

export function focusInvalidField(form) {
  requestAnimationFrame(() => form?.querySelector(':is(input,select,textarea)[aria-invalid="true"], :is(input,select,textarea):invalid')?.focus());
}
