// Number and date copy — DESIGN.md §8.1: `1,240 kcal` · `45 g` · `74.6 kg`. Hand-rolled so output
// doesn't depend on the device's Intl data.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 2050 → "2,050" */
export function formatInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 8000 → "8k", 8500 → "8.5k" (S09 "8k steps"). */
export function formatThousands(n: number): string {
  return `${+(n / 1000).toFixed(1)}k`;
}

/** 72 → "72", 72.5 → "72.5" */
export function formatKg(kg: number): string {
  return String(+kg.toFixed(1));
}

/** Weekly change for copy, to the nearest 0.05 kg: -0.6 → "0.6", 0.227 → "0.25". */
export function formatWeeklyKg(kg: number): string {
  return String(+(Math.round(Math.abs(kg) * 20) / 20).toFixed(2));
}

/** "2027-01-17" → "17 Jan" (S09 "~14 Feb"); adds the year only when it's a year or more away. */
export function formatShortDate(iso: string, today = new Date()): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  const monthsAway = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
  return monthsAway >= 12 ? `${base} ${y}` : base;
}

/** "Wed, 24 Oct" */
export function formatDayLong(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function weekdayInitial(date: Date): string {
  return WEEKDAYS[date.getDay()][0];
}

export function greeting(date: Date): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
