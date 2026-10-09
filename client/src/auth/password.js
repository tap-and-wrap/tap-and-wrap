export const newPasswordError = value => value.length < 12 || new TextEncoder().encode(value).length > 72
  ? 'Password must contain at least 12 characters and no more than 72 UTF-8 bytes.' : '';
