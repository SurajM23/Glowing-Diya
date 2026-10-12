// The business runs on India time regardless of the server's own clock (Render runs in UTC).
// The database connection is also set to this zone (see db.ts), so SQL `now()`/`CURRENT_DATE`
// agree with these helpers without per-query conversion.
const IST = 'Asia/Kolkata';
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

function istParts(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  // Intl gives "24" for midnight with hour12: false; normalise to 0.
  return { year: +p.year, month: +p.month, day: +p.day, hour: p.hour === '24' ? 0 : +p.hour, minute: +p.minute };
}

/** YYYYMMDD for the given instant, in India time. Used for order references. */
export function istDateStamp(d: Date = new Date()): string {
  const p = istParts(d);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

/** Minutes since midnight India time, for comparing against opening/closing hours. */
export function istMinutesSinceMidnight(d: Date = new Date()): number {
  const p = istParts(d);
  return p.hour * 60 + p.minute;
}
