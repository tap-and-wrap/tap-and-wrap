export const BUSINESS_TIME_ZONE = 'Africa/Cairo';
const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function localParts(instant) {
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
export function cairoDateTimeInput(iso) {
  if (!iso) return '';
  const instant = Date.parse(iso);
  return Number.isFinite(instant) ? localParts(instant) : '';
}
/** Resolve a wall-clock minute explicitly; never let the device timezone decide. */
export function cairoDateTimeCandidates(value) {
  if (!value) return [];
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a complete date and time in Cairo time.');
  const [, year, month, day, hour, minute] = match.map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const stamp = new Date(naive);
  if (year < 1000 || stamp.getUTCFullYear() !== year || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day || hour > 23 || minute > 59) throw new Error('Enter a valid date and time.');
  const offsets = new Set();
  // Samples on both sides of Cairo's DST transition discover both offsets.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = naive + hours * 3600000;
    const parts = localParts(sample);
    offsets.add(Date.parse(`${parts}:00Z`) - sample);
  }
  const candidates = [...offsets].map(offset => naive - offset).filter(instant => localParts(instant) === value).sort((a, b) => a - b);
  if (!candidates.length) throw new Error('This Cairo time does not exist because the clock moves forward. Choose another time.');
  return candidates.map(instant => new Date(instant).toISOString());
}

export function resolveCairoDateTime(value, occurrence) {
  if (!value) return null;
  const candidates = cairoDateTimeCandidates(value);
  if (candidates.length > 1 && !['first', 'second'].includes(occurrence)) throw new Error('This Cairo time occurs twice when the clock moves back. Choose the first or second occurrence.');
  return candidates[occurrence === 'second' ? 1 : 0];
}

export function validatePromotionSchedule(value) {
  for (const key of ['startsAt', 'endsAt']) {
    if (value[key] != null && !Number.isFinite(Date.parse(value[key]))) throw new Error('Enter a valid promotion date and time.');
  }
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) throw new Error('The end time must be later than the start time. Dates use Cairo time.');
}
