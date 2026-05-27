/**
 * Minimal cron evaluator. Supports 5-field expressions
 *   minute hour day-of-month month day-of-week
 * with: *, n, n-m, a,b,c, *\/n, n-m/k. No deps.
 */

const FIELD_BOUNDS: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6],  // day of week (Sun=0)
];

export function matchesCron(cronExpr: string, date: Date): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const values = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];

  for (let i = 0; i < 5; i++) {
    if (!matchField(fields[i], values[i], FIELD_BOUNDS[i][0], FIELD_BOUNDS[i][1])) {
      return false;
    }
  }
  return true;
}

function matchField(expr: string, value: number, min: number, max: number): boolean {
  if (expr === '*') return true;
  return expr.split(',').some((part) => matchPart(part, value, min, max));
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  let step = 1;
  let range = part;

  if (part.includes('/')) {
    const [r, s] = part.split('/');
    step = parseInt(s, 10);
    range = r;
    if (!Number.isFinite(step) || step < 1) return false;
  }

  let lo: number;
  let hi: number;
  if (range === '*') {
    lo = min;
    hi = max;
  } else if (range.includes('-')) {
    const [a, b] = range.split('-').map((x) => parseInt(x, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    lo = a;
    hi = b;
  } else {
    const n = parseInt(range, 10);
    if (!Number.isFinite(n)) return false;
    lo = n;
    hi = n;
  }

  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}

/**
 * Walk forward up to 366 days to find the next minute that matches.
 * Returns null only for truly impossible expressions (e.g. Feb 30).
 */
export function computeNextRun(cronExpr: string, from: Date = new Date()): Date | null {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matchesCron(cronExpr, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

/**
 * Walk backward up to 366 days to find the most recent minute that matches.
 * Used by catch-up to figure out if a run was missed during downtime.
 */
export function computePrevRun(cronExpr: string, from: Date = new Date()): Date | null {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matchesCron(cronExpr, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() - 1);
  }
  return null;
}

/**
 * True iff the current minute matches and we haven't already fired this
 * exact minute (per lastSpawnedAt).
 */
export function isCronDue(cronExpr: string, now: Date, lastSpawnedAt: Date | null): boolean {
  if (!matchesCron(cronExpr, now)) return false;
  if (lastSpawnedAt && sameMinute(lastSpawnedAt, now)) return false;
  return true;
}

function sameMinute(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}
