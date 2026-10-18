// Calendar days in Singapore time.
//
// SharePoint returns a date-only column as midnight Singapore time written in
// UTC, i.e. 16:00Z the day before, so slicing the first ten characters off the
// raw value shows every leave and travel date one day early. Every place that
// needs a day or a month goes through here instead.

const SG = 'Asia/Singapore';

/** "YYYY-MM-DD" for the Singapore calendar day of `value`. A bare date passes through. */
function sgDay(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA formats as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: SG });
}

/** "YYYY-MM" for the Singapore month of `value`. */
const sgMonth = (value = new Date()) => sgDay(value).slice(0, 7);

module.exports = { sgDay, sgMonth };
