# Granular Permissions & Custom Roles

Turn the placeholder permission matrix into a real, enforced permission system grouped by module, with the ability to create custom roles.

## What changes for you

**Roles & Permissions page (`/admin/roles`)**
- Two-pane layout: roles list on the left, permission editor on the right.
- Create / rename / delete custom roles (system roles like `super_admin`, `admin`, `employee` stay protected).
- Permissions grouped by **module** with collapsible sections. Each module has fine-grained actions (View / Create / Edit / Delete / Approve / Assign / View contact, etc.).
- "Select all in module" + search box across all permissions.
- Live preview: "Users with this role can …" summary.

**What's actually enforced**

Every permission below is wired into RLS so unchecking a box really removes the ability:

```text
Employees      view directory, view contact info, create, edit profile,
               edit employment (dept/centre/role), delete, approve signups,
               assign roles, view notes, manage notes
Attendance     view own, view team, view all, edit, request correction,
               approve correction
Breaks         start own, view team, view all, manage policies, manage types
Sales          enter own, enter for team, view own, view team, view all,
               manage sources, refunds.manage, chargebacks.manage
Documents      view, upload, edit, archive, delete, manage permissions,
               manage categories
Channels       view, create, post, moderate, manage members
Announcements  view, post, post critical
Reports        view dashboards, view leaderboard, view AI analytics, export
Admin          manage departments, centres, shifts, holidays, sales-sources,
               break policies, knowledge base, system settings
```

System roles get sensible defaults (admins everything, HR all attendance/breaks/employee-view, managers their team scope, etc.) and you can tweak from there.

## Technical details

**Database migration**

1. Expand `permissions` table: add `module text`, `action text`, `label text`, `is_dangerous bool`. Insert ~55 permissions covering the modules above.
2. Add `is_system bool` to `roles` to lock built-in roles from rename/delete.
3. Reseed `role_permissions` with sensible defaults for each system role (admins = all, HR = attendance/breaks/employees view+contact+notes, manager/TL = team-scoped, employee = own-only).
4. New SQL helper:
   ```sql
   public.has_permission(_user_id uuid, _perm text) RETURNS boolean
     SECURITY DEFINER, STABLE
   -- returns true if any of the user's roles grants _perm
   ```
5. Update existing RLS-helper functions (`can_manage_employee`, `can_view_sales_for`, `can_enter_sales_for`, `is_channel_moderator`, `can_post_announcement`, `can_create_channel`, `can_manage_document`, `can_view_employee_notes`) so they OR-in the corresponding `has_permission` check. Result: a custom role with the right permission gains the same access an admin/manager would have, without anyone losing existing access.
6. Drop and recreate the attendance/breaks/sales/employees RLS policies to call `has_permission(...)` alongside the role checks, scoped by employee relationship.
7. Custom-role management RPCs: `create_role(key, name, description)`, `rename_role`, `delete_role`, all gated by `is_admin(auth.uid())` and rejecting `is_system` rows.

**Frontend**

- Rewrite `src/routes/_authenticated/admin.roles.tsx` with the two-pane UI, grouped accordions (shadcn `Accordion`), search input, and role CRUD dialogs.
- New `src/hooks/usePermissions.ts` — loads the current user's effective permissions once and exposes `can("employees.delete")`. Uses TanStack Query, cached per session.
- Wire `usePermissions` into the sidebar/menu and the obvious action buttons (Delete employee, Approve signup, Assign role, Post announcement, etc.) so the UI hides what's not allowed. RLS is still the authority — UI gating is cosmetic.
- Update `AppRole` typing if any new system roles are introduced (none planned).

**Out of scope for this pass**
- Per-employee permission overrides (only role-level).
- Department/centre scoping per permission (still inherited from existing helpers).
- Audit log of permission changes (can add later if needed).

## Rollout

One migration + one new server helper + one rewritten page + one hook + small edits to ~6 action sites. No data loss; existing role behavior is preserved because the new checks are additive.
