/**
 * Time zones and daylight saving. Everything is stored as an exact instant (UTC); "which day" and
 * "what time" are worked out in a named time zone, so 23- and 25-hour days and travel come out right.
 *
 * Entries remember the zone they were logged in (meta.tz), and always count on the day you lived them,
 * wherever you look at them later. Older entries without a zone use the phone's current zone.
 */

export const deviceTz = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function parts(tz: string, t: number) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formatters.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz` (DST-aware). */
export function tzOffsetMs(tz: string, t: number): number {
  const p = parts(tz, t)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
}

/** The local date (YYYY-MM-DD) of an instant in `tz`. */
export function dayIn(tz: string, t: number): string {
  const p = parts(tz, t)
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/**
 * The UTC instant of a wall-clock time on a local date in `tz` (minutes after midnight).
 * On the fall-back overlap it picks the first of the two; a time inside the spring-forward gap (which never
 * happens on a clock) resolves to the nearest real instant.
 */
export function wallTimeToUtc(tz: string, day: string, minutes = 0): number {
  const [y, m, d] = day.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d, 0, minutes)
  // Two passes settle the offset even when the guess lands on the other side of a DST change.
  let t = naive - tzOffsetMs(tz, naive)
  t = naive - tzOffsetMs(tz, t)
  return t
}

/** Start of the local day in `tz` as a UTC instant (local midnight). */
export const midnightIn = (tz: string, day: string) => wallTimeToUtc(tz, day, 0)

/** The next calendar date after `day`. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Length of a local day in hours: 24, or 23/25 on daylight-saving days. */
export const dayHours = (tz: string, day: string) => Math.round((midnightIn(tz, nextDay(day)) - midnightIn(tz, day)) / 3_600_000)

/** The day an entry belongs to: in the zone it was logged in, or the phone's zone for older entries. */
export const entryDay = (iso: string, tz?: string | null) => dayIn(tz || deviceTz(), Date.parse(iso))

/** Short zone name for display, e.g. "EST" or "GMT+1". */
export function zoneLabel(tz: string, t = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(t)).find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

/** "7:30 AM", plus the zone ("7:30 AM EST") when the entry was logged somewhere other than where the phone is now. */
export function entryTime(iso: string, tz?: string | null): string {
  const zone = tz || deviceTz()
  const t = Date.parse(iso)
  const text = new Date(t).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
  return zone !== deviceTz() && tzOffsetMs(zone, t) !== tzOffsetMs(deviceTz(), t) ? `${text} ${zoneLabel(zone, t)}` : text
}
