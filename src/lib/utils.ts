import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Title-case a status-like token: "half_day" -> "Half Day", "present" -> "Present". */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a date as "23-Mar-2026". Accepts Date, ISO string, or YYYY-MM-DD. */
export function formatDate(input: Date | string | null | undefined): string {
  if (!input) return "—";
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Treat as local date, avoid UTC shift
    const [y, m, day] = input.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return String(input);
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Format a date+time as "23-Mar-2026 7:34:43 PM". */
export function formatDateTime(input: Date | string | null | undefined): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${formatDate(d)} ${d.toLocaleTimeString()}`;
}

/** Format a date for chat separators: "Today", "Yesterday", or "Monday, 15 Jun 2026" */
export function formatChatDividerDate(dateInput: string | Date): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const dDate = d.toDateString();
  if (dDate === today.toDateString()) {
    return "Today";
  } else if (dDate === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "short", year: "numeric" };
    return d.toLocaleDateString([], options);
  }
}

/** Get current date string (YYYY-MM-DD) in US Eastern Time (America/New_York) */
export function getUSEasternDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns startOfDay and endOfDay UTC ISO strings for a given YYYY-MM-DD date in America/New_York timezone.
 */
export function getUSEasternDayRange(dateStr: string): { startOfDay: string; endOfDay: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const testUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const nyParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(testUtc);

  const p: Record<string, number> = {};
  for (const part of nyParts) {
    if (part.type !== "literal") {
      p[part.type] = parseInt(part.value, 10);
    }
  }

  const nyAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  const offsetMs = nyAsUtc - testUtc.getTime();

  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs;
  const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - offsetMs;

  return {
    startOfDay: new Date(startMs).toISOString(),
    endOfDay: new Date(endMs).toISOString(),
  };
}


