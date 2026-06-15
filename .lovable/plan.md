
## 1. Admin deletes (hard where safe, soft elsewhere)

**Hard delete** (simple lookups — no historical FK weight):
- Sales sources, break types, shifts, holidays, departments (when no employees), centres (when no employees), roles (non-system), channels.

**Soft delete** (preserve history):
- Employees → set `employment_status='terminated'`, revoke `auth.users` via admin API in a server fn, and keep their sales/attendance/break rows intact.
- Centres/Departments that still have employees → block hard delete with a clear error; admin must reassign first OR mark `is_active=false`.

**Where it shows up:**
- A red Delete button (with confirm dialog) on every admin row in: `admin.employees`, `admin.centres`, `admin.departments`, `admin.sales-sources`, `admin.shifts`, `admin.holidays`, `admin.breaks`, `admin.roles`.
- Backed by a single `deleteAdminEntity` server fn (super_admin only, uses service-role client) that routes by entity and enforces "block if dependents exist".

## 2. Dashboard restructure

- **Remove:** "Top Sources" card, "Centre Comparison" card.
- **Add:** Three "Top 5 / Bottom 5 Agents" panels rendered in a loop over all active centres + one Company-wide panel. New ones appear automatically as centres are added/removed — driven by `SELECT id, code FROM centres WHERE is_active`.
- New SQL fn `agent_rankings(_from, _to, _centre_id uuid /* null = company */, _limit int)` returns top + bottom by net revenue.

## 3. Mobile redesign (properly mobile-optimized)

- Sidebar collapses to off-canvas drawer below `md:` (already partially supported by shadcn Sidebar — wire the trigger properly, hide rail).
- Header sticky, compact on mobile (smaller title, larger tap target on `SidebarTrigger`).
- KPI grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` everywhere.
- Tables that don't fit: wrap in `overflow-x-auto` and on `< sm` swap to card list view for the dashboards/leaderboards (analytics tables stay scrollable).
- `main` padding `p-4 sm:p-6`, remove fixed widths, audit all `flex` rows with the responsive-layout pattern (`min-w-0`, `shrink-0`, `truncate`).
- Apply to: dashboard, attendance, breaks, sales, knowledge, analytics, jdai widget (already mobile-friendly), admin lists.

## 4. Clickable KPIs → navigate to filtered pages

Per your choice, every KPI navigates to the existing detail page with query-param filters. Permission gating: tile is only rendered/clickable if the user has access to the destination.

| Tile | Destination | Filter |
|---|---|---|
| Logged In | `/attendance/team` | `?status=logged_in&date=today` |
| On Break | `/breaks/team` | `?status=active` |
| Present Today | `/attendance/team` | `?status=present&date=today` |
| Absent Today | `/attendance/team` | `?status=absent&date=today` |
| Gross / Net Revenue | `/sales/team` | `?from&to` |
| Refunds | `/sales/team` | `?tab=refunds&from&to` |
| Chargebacks | `/sales/team` | `?tab=chargebacks&from&to` |
| Agent row in Top/Bottom 5 | `/employees/$id` | — |

Destinations get `validateSearch` (zod) and filter their existing queries by the params. Non-admins who hit a page they don't own get redirected back (already enforced by route guards on `/sales/team`, `/attendance/team`, `/breaks/team`).

## Technical notes

- New migration: `agent_rankings` SQL function + grants; no schema changes for deletes (uses existing tables + service role).
- New server fn: `src/lib/admin-delete.functions.ts` with `requireSupabaseAuth` + `is_admin` check; uses `supabaseAdmin` for `auth.admin.deleteUser` on employee deletes.
- New shared component: `<KpiTile>` with optional `to`/`params`/`search` props that renders as a `<Link>` when navigable, plain div otherwise — gated by `useAuth` roles.
- Dashboard: rewrite `dashboard.tsx` to drop two cards, add a `centres` query, and render a `<AgentRankings centreId={...} />` per centre + company-wide.

## Out of scope (ask if you want it)
- Bulk delete / undo of soft deletes.
- Full mobile redesign of the chat/channels surface (will be made responsive but kept as-is structurally).
- Customizable KPI tiles per user.
