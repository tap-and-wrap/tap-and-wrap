import { z } from 'zod';

export const PASSWORD_REQUIREMENTS = 'Password must contain at least 12 characters and no more than 72 UTF-8 bytes.';
export const newPasswordSchema = z.string().min(12).max(128)
 .refine(value => Buffer.byteLength(value, 'utf8') <= 72, { message: PASSWORD_REQUIREMENTS });

// Do not apply this to login: existing bcrypt hashes remain compatible.
export function validNewPassword(value) { return newPasswordSchema.safeParse(value).success; }
