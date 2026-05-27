import cronstrue from 'cronstrue';

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const SHORTCUTS: Record<string, string> = {
  'every minute': '* * * * *',
  'every 5 minutes': '*/5 * * * *',
  'every 10 minutes': '*/10 * * * *',
  'every 15 minutes': '*/15 * * * *',
  'every 30 minutes': '*/30 * * * *',
  'hourly': '0 * * * *',
  'every hour': '0 * * * *',
  'every 2 hours': '0 */2 * * *',
  'every 6 hours': '0 */6 * * *',
  'every 12 hours': '0 */12 * * *',
  'daily': '0 9 * * *',
  'every day': '0 9 * * *',
  'nightly': '0 2 * * *',
  'every night': '0 2 * * *',
  'weekly': '0 9 * * 1',
  'every week': '0 9 * * 1',
  'monthly': '0 9 1 * *',
  'every month': '0 9 1 * *',
};

const CRON_FIELD = /^[\d*]+(?:[-,/][\d*]+)*$/;

export type ParsedSchedule = { cronExpr: string; humanReadable: string };

/**
 * Best-effort natural-language to cron parser. Returns null for inputs
 * we don't understand — callers should surface that to the user so they
 * can fix the phrasing or paste a raw cron expression instead.
 *
 * Supported shapes:
 *   • raw 5-field cron:   "0 9 * * 1-5"
 *   • named shortcuts:    "hourly", "daily", "weekly", "nightly", ...
 *   • interval:           "every 5 minutes", "every 2 hours"
 *   • time-of-day:        "daily at 9am", "every morning at 7:30"
 *   • day-of-week + time: "every monday at 9am", "every weekday at 9",
 *                         "every weekend at 10am"
 */
export function parseNaturalSchedule(input: string): ParsedSchedule | null {
  const raw = input.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  // 1. Raw cron expression
  const parts = raw.split(/\s+/);
  if (parts.length === 5 && parts.every((p) => CRON_FIELD.test(p))) {
    return finalize(raw);
  }

  // 2. Named shortcuts
  if (SHORTCUTS[t]) return finalize(SHORTCUTS[t]);

  // 3. "every N minutes/hours"
  const everyN = t.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours)$/);
  if (everyN) {
    const n = parseInt(everyN[1], 10);
    if (!Number.isFinite(n) || n < 1) return null;
    if (everyN[2].startsWith('minute')) {
      if (n >= 60) return null;
      return finalize(`*/${n} * * * *`);
    }
    if (n >= 24) return null;
    return finalize(`0 */${n} * * *`);
  }

  // 4. "every weekday|weekend at TIME"
  const namedDays = t.match(/^every\s+(weekday|weekdays|weekend|weekends)\s+at\s+(.+)$/);
  if (namedDays) {
    const time = parseTime(namedDays[2]);
    if (!time) return null;
    const dow = namedDays[1].startsWith('weekday') ? '1-5' : '0,6';
    return finalize(`${time.minute} ${time.hour} * * ${dow}`);
  }

  // 5. "every monday at TIME" (any day name)
  const dayAt = t.match(/^every\s+(\w+)\s+at\s+(.+)$/);
  if (dayAt && DAY_MAP[dayAt[1]] !== undefined) {
    const time = parseTime(dayAt[2]);
    if (!time) return null;
    return finalize(`${time.minute} ${time.hour} * * ${DAY_MAP[dayAt[1]]}`);
  }

  // 6. "every morning|evening|day at TIME" / "daily at TIME"
  const dailyAt = t.match(/^(?:every\s+(?:morning|evening|day)|daily)\s+at\s+(.+)$/);
  if (dailyAt) {
    const time = parseTime(dailyAt[1]);
    if (!time) return null;
    return finalize(`${time.minute} ${time.hour} * * *`);
  }

  // 7. "at TIME daily|every day"
  const atDaily = t.match(/^at\s+(.+?)\s+(?:daily|every\s+day)$/);
  if (atDaily) {
    const time = parseTime(atDaily[1]);
    if (!time) return null;
    return finalize(`${time.minute} ${time.hour} * * *`);
  }

  return null;
}

function parseTime(s: string): { hour: number; minute: number } | null {
  const t = s.trim().toLowerCase();

  // "9am", "9:30am", "12pm"
  const ampm = t.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (h < 1 || h > 12 || m > 59) return null;
    if (ampm[3] === 'pm' && h !== 12) h += 12;
    if (ampm[3] === 'am' && h === 12) h = 0;
    return { hour: h, minute: m };
  }

  // "14:00", "9", "9:30"
  const hm = t.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    if (h > 23 || m > 59) return null;
    return { hour: h, minute: m };
  }

  return null;
}

function finalize(cronExpr: string): ParsedSchedule | null {
  try {
    const humanReadable = cronstrue.toString(cronExpr, { use24HourTimeFormat: false });
    return { cronExpr, humanReadable };
  } catch {
    return null;
  }
}
