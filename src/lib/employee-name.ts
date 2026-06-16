/**
 * Returns the name to display across the platform for an employee.
 * Prefers the alias_name (the name colleagues actually use day-to-day),
 * and falls back to full_name when no alias is set.
 */
export function displayName(
  e: { alias_name?: string | null; full_name?: string | null } | null | undefined,
  fallback: string = "—",
): string {
  if (!e) return fallback;
  const alias = (e.alias_name ?? "").trim();
  if (alias) return alias;
  const full = (e.full_name ?? "").trim();
  return full || fallback;
}