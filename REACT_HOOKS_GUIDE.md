# React Hooks & The Rules of Hooks
### A Beginner's Guide — with Real Examples from JD Connect

---

## Table of Contents

1. [What is a React Component?](#1-what-is-a-react-component)
2. [What is a Hook?](#2-what-is-a-hook)
3. [The Most Common Hooks](#3-the-most-common-hooks)
4. [The Rules of Hooks](#4-the-rules-of-hooks)
5. [The Bug We Had — and Why It Happened](#5-the-bug-we-had--and-why-it-happened)
6. [The Fix — and the Pattern to Follow Forever](#6-the-fix--and-the-pattern-to-follow-forever)
7. [Permission Guarding in JD Connect](#7-permission-guarding-in-jd-connect)
8. [The Golden Template for Future Projects](#8-the-golden-template-for-future-projects)
9. [Quick Reference Cheat Sheet](#9-quick-reference-cheat-sheet)

---

## 1. What is a React Component?

Think of a React **component** as a LEGO brick that renders a piece of your UI.
Every page in JD Connect is a component. For example, the Departments admin page is
a function called `Page` inside `admin.departments.tsx`.

```tsx
// This is a React component — it's just a function that returns HTML-like JSX
function Page() {
  return (
    <div>
      <h1>Departments</h1>
    </div>
  );
}
```

React calls this function **every time the UI needs to update** (re-render).
That sentence is the key to understanding everything below.

---

## 2. What is a Hook?

A **Hook** is a special function provided by React (or a library) that lets your
component "remember" things and "do things" across re-renders.

The word "hook" comes from the idea that these functions **hook into** React's
internal machinery. They are always named starting with `use`.

### Why do we need them?

Without hooks, every time React re-renders your component, it would forget
everything — all variables would reset to their initial values. Hooks are how
you tell React: *"Hey, remember this value between renders."*

---

## 3. The Most Common Hooks

Here are the hooks used throughout JD Connect, explained simply:

---

### `useState` — Remember a value

```tsx
const [open, setOpen] = useState(false);
//      ^       ^                  ^
//    value   setter          initial value
```

**What it does:** Stores a piece of state (a value) that React will remember
between re-renders. When you call `setOpen(true)`, React re-renders the component
with `open` now being `true`.

**Real example from `admin.departments.tsx`:**
```tsx
const [open, setOpen] = useState(false);   // is the "Add Department" dialog open?
const [name, setName] = useState("");      // the name typed into the form
const [desc, setDesc] = useState("");      // the description typed into the form
```

---

### `useQuery` — Fetch data from the server

This comes from the **TanStack Query** library. It fetches data (e.g., from
Supabase) and keeps it in a cache.

```tsx
const { data } = useQuery({
  queryKey: ["departments"],         // a unique name for this data
  queryFn: async () => { ... },     // the function that fetches the data
});
```

**What it does:** Runs the fetch function, stores the result in `data`. If the
component re-renders, it does NOT re-fetch unnecessarily — it uses the cached result.

**Real example from `admin.departments.tsx`:**
```tsx
const { data } = useQuery({
  queryKey: ["departments"],
  queryFn: async () =>
    (await supabase.from("departments").select("*").order("name")).data ?? [],
});
// `data` now contains the list of all departments from the database
```

---

### `useMutation` — Send data to the server

Also from TanStack Query. Used for create, update, or delete operations.

```tsx
const create = useMutation({
  mutationFn: async () => { ... },  // the function that does the action
  onSuccess: () => { ... },         // runs when it succeeds
  onError: (e) => { ... },          // runs when it fails
});

// Later in JSX, you trigger it like this:
<Button onClick={() => create.mutate()}>Save</Button>
```

**Real example from `admin.departments.tsx`:**
```tsx
const create = useMutation({
  mutationFn: async () => {
    const { error } = await supabase
      .from("departments")
      .insert({ name, description: desc || null });
    if (error) throw error;
  },
  onSuccess: () => {
    toast.success("Department created");
    setOpen(false);
  },
});
```

---

### `useMemo` — Cache a computed value

```tsx
const filteredList = useMemo(() => {
  return bigList.filter(item => item.active);
}, [bigList]); // recompute ONLY when bigList changes
```

**What it does:** Runs an expensive calculation once and remembers the result.
Only recalculates when its dependencies (the second argument array) change.

---

### `usePermissions` (Custom Hook from JD Connect)

```tsx
const { can, isLoading } = usePermissions();
const canCreate = can("employees.create");
```

**What it does:** Fetches the current user's permissions from Supabase and gives
you a `can()` function to check them.

This is a **custom hook** — not built into React, but written by us in
`src/hooks/usePermissions.ts`. It internally uses `useQuery` to fetch the data.

---

### `useRouteGuard` (Custom Hook from JD Connect)

```tsx
const __guard = useRouteGuard("admin.departments");
// __guard.isLoading  → true while permissions are being fetched
// __guard.allowed    → true if the user has the "admin.departments" permission
```

**What it does:** Checks whether the current user has a specific permission.
Used to protect entire pages from unauthorized users.

---

## 4. The Rules of Hooks

React has **two strict rules** that you MUST follow when using hooks.
Breaking them causes silent bugs or crashes.

---

### Rule 1: Only call hooks at the TOP LEVEL

✅ **Correct — hook called at the top of the function:**
```tsx
function Page() {
  const [count, setCount] = useState(0);  // ← top level, always runs
  return <div>{count}</div>;
}
```

❌ **Wrong — hook called inside an if statement:**
```tsx
function Page() {
  if (someCondition) {
    const [count, setCount] = useState(0);  // ← NEVER do this!
  }
  return <div />;
}
```

❌ **Wrong — hook called inside a loop:**
```tsx
function Page() {
  for (let i = 0; i < 3; i++) {
    const [val, setVal] = useState(0);  // ← NEVER do this!
  }
  return <div />;
}
```

---

### Rule 2: Only call hooks before any `return` statement

This is the one **we violated** in JD Connect.

✅ **Correct — return is AFTER all hooks:**
```tsx
function Page() {
  const hook1 = useState(false);
  const hook2 = useQuery({ ... });
  const hook3 = useMutation({ ... });

  if (notAllowed) {
    return <AccessDenied />;  // ← early return is AFTER all hooks
  }

  return <div>Main content</div>;
}
```

❌ **Wrong — return is BETWEEN hooks:**
```tsx
function Page() {
  const hook1 = useState(false);
  const hook2 = useQuery({ ... });

  if (notAllowed) {
    return <AccessDenied />;  // ← early return here!
  }

  // hook3 will NEVER be called when notAllowed is true!
  const hook3 = useMutation({ ... });  // ← This is AFTER the early return

  return <div>Main content</div>;
}
```

---

### Why does this rule exist?

React internally tracks your hooks **by their ORDER** — it doesn't know their
names. It stores them in a list like this:

```
Render 1:  [useState=false, useQuery=loading, useMutation=idle]
Render 2:  [useState=false, useQuery=data, useMutation=idle]
```

If you have an early return that skips a hook, the list changes length between renders:

```
Render 1 (allowed):     [useState, useQuery, useMutation]  ← 3 hooks
Render 2 (not allowed): [useState, useQuery]               ← only 2 hooks!
```

React gets confused because the order broke. It starts matching hooks to the wrong
stored values. This causes subtle, hard-to-debug bugs.

---

## 5. The Bug We Had — and Why It Happened

When we added permission guards to the admin pages, we inserted an early return
**in the middle** of the hooks:

```tsx
// ❌ THIS IS WHAT WE DID WRONG — from admin.departments.tsx (before fix)
function Page() {
  const __guard = useRouteGuard("admin.departments");  // Hook 1
  const qc = useQueryClient();                         // Hook 2
  const [open, setOpen] = useState(false);             // Hook 3
  const [name, setName] = useState("");                // Hook 4
  const [desc, setDesc] = useState("");                // Hook 5
  const { data } = useQuery({ ... });                  // Hook 6

  // ⚠️ EARLY RETURN HERE — before the mutations below!
  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied />;
  }

  // These hooks are SKIPPED when the guard blocks access!
  const create = useMutation({ ... });  // Hook 7 ← skipped!
  const toggle = useMutation({ ... });  // Hook 8 ← skipped!

  return <div>...</div>;
}
```

**What happens when a user doesn't have permission?**
- React renders Hook 1 through Hook 6 ✅
- Hits the early return — component exits
- Hooks 7 and 8 are never called
- Next time permissions load and the user IS allowed, React suddenly sees 8 hooks
  instead of 6 — the count changed — React breaks

---

## 6. The Fix — and the Pattern to Follow Forever

The fix is simple: **move the early return to AFTER all hook calls.**

```tsx
// ✅ THIS IS THE CORRECT PATTERN — from admin.departments.tsx (after fix)
function Page() {
  // ── Step 1: Call ALL hooks unconditionally ──────────────────────────
  const __guard = useRouteGuard("admin.departments");  // Hook 1
  const qc = useQueryClient();                         // Hook 2
  const [open, setOpen] = useState(false);             // Hook 3
  const [name, setName] = useState("");                // Hook 4
  const [desc, setDesc] = useState("");                // Hook 5
  const { data } = useQuery({ ... });                  // Hook 6
  const create = useMutation({ ... });                 // Hook 7
  const toggle = useMutation({ ... });                 // Hook 8

  // ── Step 2: THEN do your conditional early return ───────────────────
  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied perm="admin.departments" label="departments" />;
  }

  // ── Step 3: Normal render ───────────────────────────────────────────
  return (
    <div>...</div>
  );
}
```

React now sees exactly **8 hooks on every single render**, regardless of whether
the user is allowed or not. The order never changes. ✅

---

## 7. Permission Guarding in JD Connect

Here's how the full permission system works in this project:

### The Flow

```
User visits /admin/departments
        ↓
Page component renders
        ↓
useRouteGuard("admin.departments") calls usePermissions()
        ↓
usePermissions() calls Supabase RPC → my_permissions
        ↓
Returns list of permission strings the user has
e.g. ["attendance.view_all", "admin.departments", "employees.view"]
        ↓
can("admin.departments") → true ✅  or  false ❌
        ↓
__guard.allowed = true or false
        ↓
After ALL hooks run → if not allowed → show <AccessDenied />
```

### The `usePermissions` hook (`src/hooks/usePermissions.ts`)

```ts
export function usePermissions() {
  const { data: perms = [], isLoading } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_permissions");
      return (data ?? []) as string[];
    },
  });

  const can = (key: string) => perms.includes(key);
  const canAny = (...keys: string[]) => keys.some((k) => perms.includes(k));

  return { can, canAny, isLoading };
}
```

### The `useRouteGuard` hook (`src/components/PermissionGate.tsx`)

```ts
export function useRouteGuard(perm: string) {
  const { isAdmin } = useAuth();
  const { can, isLoading } = usePermissions();
  const allowed = isAdmin || can(perm);
  return { isLoading, allowed };
}
```

Admins always get through. Everyone else needs the specific permission key.

### All the pages we guarded and their keys

| Page | Permission Key |
|---|---|
| `/admin/departments` | `admin.departments` |
| `/admin/centres` | `admin.centres` |
| `/admin/shifts` | `admin.shifts` |
| `/admin/holidays` | `admin.holidays` |
| `/admin/roles` | `admin.roles` |
| `/admin/ip-restrictions` | `admin.roles` |
| `/admin/employees` | `employees.view` |
| `/admin/sales-sources` | `admin.sales_sources` |
| `/admin/knowledge` | `admin.knowledge` |
| `/attendance/team` | `attendance.view_all` |
| `/breaks/team` | `breaks.view_all` |
| `/sales/team` | `sales.view_team` |
| `/analytics` | `reports.dashboards` |
| `/knowledge` | `documents.view` |
| `/jdai` | `reports.ai_analytics` |

---

## 8. The Golden Template for Future Projects

Copy this template whenever you build a protected page in any React project:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useRouteGuard, AccessDenied } from "@/components/PermissionGate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/_authenticated/your/route")({
  component: YourPage,
});

function YourPage() {
  // ════════════════════════════════════════════════════════════
  // SECTION 1: ALL HOOKS — call these unconditionally, always
  // ════════════════════════════════════════════════════════════

  // Permission guard
  const __guard = useRouteGuard("your.permission_key");

  // Query client (for invalidating cache)
  const qc = useQueryClient();

  // Local UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValue, setFormValue] = useState("");

  // Data fetching
  const { data = [] } = useQuery({
    queryKey: ["your-data"],
    queryFn: async () => {
      const { data, error } = await supabase.from("your_table").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mutations (create/update/delete)
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("your_table").insert({ name: formValue });
      if (error) throw error;
    },
    onSuccess: () => {
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["your-data"] });
    },
  });

  // Derived / computed values
  const activeItems = useMemo(
    () => data.filter((item) => item.is_active),
    [data]
  );

  // ════════════════════════════════════════════════════════════
  // SECTION 2: GUARD CHECK — ALWAYS after all hooks
  // ════════════════════════════════════════════════════════════
  if (!__guard.isLoading && !__guard.allowed) {
    return <AccessDenied perm="your.permission_key" label="this page" />;
  }

  // ════════════════════════════════════════════════════════════
  // SECTION 3: NORMAL RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <h1>Your Page</h1>
      {activeItems.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

### The Three Sections — Memorize This

```
┌─────────────────────────────────────────────┐
│  SECTION 1: All Hooks                        │
│  ─ useRouteGuard / usePermissions            │
│  ─ useState (all form state)                 │
│  ─ useQuery (all data fetching)              │
│  ─ useMutation (all create/update/delete)    │
│  ─ useMemo / useCallback (computed values)   │
├─────────────────────────────────────────────┤
│  SECTION 2: Guard / Early Returns            │
│  ─ if (!allowed) return <AccessDenied />     │
│  ─ if (loading) return <Spinner />           │
│  ─ if (!data) return <NotFound />            │
├─────────────────────────────────────────────┤
│  SECTION 3: JSX Return                       │
│  ─ return ( <div>...</div> )                 │
└─────────────────────────────────────────────┘
```

---

## 9. Quick Reference Cheat Sheet

### ✅ Always OK

```tsx
// Hooks at the top, guard after all of them
function Page() {
  const guard = useRouteGuard("perm.key");
  const [state, setState] = useState(initialValue);
  const { data } = useQuery({ ... });
  const mutation = useMutation({ ... });

  if (!guard.allowed) return <AccessDenied />;   // ← after all hooks ✅
  return <div>...</div>;
}
```

### ❌ Never Do This

```tsx
// Guard BETWEEN hooks — hooks violation!
function Page() {
  const guard = useRouteGuard("perm.key");
  const [state, setState] = useState(initialValue);

  if (!guard.allowed) return <AccessDenied />;   // ← between hooks ❌

  const { data } = useQuery({ ... });            // ← hook after return ❌
  const mutation = useMutation({ ... });         // ← hook after return ❌
  return <div>...</div>;
}
```

### ❌ Also Never Do This

```tsx
// Hook inside a condition
function Page() {
  if (someCondition) {
    const [x, setX] = useState(0);  // ❌ hook inside if
  }
}

// Hook inside a loop
function Page() {
  items.forEach(item => {
    const [x, setX] = useState(0);  // ❌ hook inside loop
  });
}
```

---

### How to remember: **"ALL hooks first, guard second, render third."**

Think of it as an airport security check:
- You put ALL your items on the belt first (hooks)
- Then you go through the scanner (guard check)
- Then you proceed to the gate (render)

You don't put some items on, walk through, then go back for more items. Same logic.

---

*This guide was written based on fixes made to JD Connect on 29 June 2026.*
*Files fixed: `admin.departments.tsx`, `admin.centres.tsx`, `admin.shifts.tsx`,*
*`admin.holidays.tsx`, `admin.roles.tsx`, `admin.ip-restrictions.tsx`, `admin.employees.tsx`*
