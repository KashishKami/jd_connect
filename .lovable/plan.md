## Problem

The Channels page only renders `myChannels` (channels where the user is in `channel_members`). RLS already returns every channel to admins, but the UI filters them out — so a freshly promoted admin still sees only the channels they belonged to as an employee.

## Fix

Edit `src/routes/_authenticated/channels.tsx`:

1. Keep the existing "My channels" section (unread badges, mark-read behavior unchanged).
2. Add a second section, "All channels", rendered **only when `isAdmin`** (covers both `admin` and `super_admin` via the existing `useAuth` check). Managers and `channels.*` permission holders are NOT included, per the request.
3. "All channels" lists channels the user is not already a member of (so no duplication with "My channels"), with the same row layout — name, type badge, archived styling — and the same admin action buttons (edit, manage members, archive, delete).
4. Clicking a row opens the channel normally. `ChannelThread` already handles the non-member case via its membership check / join-request panel, so no thread-side changes.
5. Call `useAuth().refresh()` once when `ChannelsPage` mounts, so a user promoted to admin mid-session immediately gets admin visibility without re-logging in.

No database, RLS, or server-function changes — RLS already permits admins to read all channels; this is a UI surfacing fix scoped to admin / super_admin only.

## Out of scope

- Manager / permission-based "all channels" visibility
- Join flow changes
- Edits to `_authenticated/channels.$channelId.tsx` or `ChannelThread` internals