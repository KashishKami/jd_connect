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
