export function commerceError(status, code, message) {
  const error = new Error(message); error.status = status; error.code = code; return error;
}
export function checkedMoney(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw commerceError(400, 'INVALID_AMOUNT', 'The calculated amount exceeds supported limits.');
  return value;
}
