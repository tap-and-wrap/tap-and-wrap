import { env } from '../config/env.js';
import { commerceError } from './errors.js';

export function assertRequestIntakeOpen() {
  if (env.customRequestsEnabled !== true) throw commerceError(503, 'REQUEST_INTAKE_CLOSED', 'New customization requests are temporarily unavailable. Existing requests remain saved; contact the store with your reference for follow-up.');
}
