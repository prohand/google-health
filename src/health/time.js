// -----------------------------------------------------------------------------
// Civil dates.
//
// Google sums a day in the user's own civil time; "today" is therefore a date
// in the user's time zone, not in the container's (which runs in UTC).
// -----------------------------------------------------------------------------

/** Whether `timeZone` is an IANA name this runtime knows. */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone === '') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The civil date (`YYYY-MM-DD`) of an instant in a time zone; the time zone of
 * the process when `timeZone` is empty or unknown.
 */
export function civilDay(instant, timeZone) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (isValidTimeZone(timeZone)) options.timeZone = timeZone;
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', options).format(instant);
}

/** `YYYY-MM-DD` shifted by a number of days (negative goes back). */
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `{ year, month, day }` of the API -> `YYYY-MM-DD`. */
export function fromCivilDate(date) {
  if (!date || !date.year || !date.month || !date.day) return undefined;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Minutes as `7 h 05` (the same in every language of the interface). */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}
