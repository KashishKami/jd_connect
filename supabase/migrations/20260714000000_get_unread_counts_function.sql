-- ─────────────────────────────────────────────────────────────────────────────
-- get_unread_counts(_employee_id)
--
-- Returns DM, channel, and announcement unread counts for a given employee
-- in a single server-side query — replaces the expensive 2000-row client-side
-- message scan that was causing supabase-db to spike to 109% CPU.
--
-- Called via: supabase.rpc('get_unread_counts', { _employee_id: empId })
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_counts(_employee_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    -- Count DMs: messages in user's conversations newer than their last_read_at
    'dm',
    COALESCE((
      SELECT COUNT(*)::int
      FROM messages m
      INNER JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id
       AND cp.employee_id = _employee_id
      WHERE m.sender_id != _employee_id
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    ), 0),

    -- Count channel messages: messages in user's channels newer than their last_read_at
    'channels',
    COALESCE((
      SELECT COUNT(*)::int
      FROM messages m
      INNER JOIN channel_members cm
        ON cm.channel_id = m.channel_id
       AND cm.employee_id = _employee_id
      WHERE m.sender_id != _employee_id
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
    ), 0),

    -- Count unacknowledged announcements that require acknowledgement
    'announcements',
    COALESCE((
      SELECT COUNT(*)::int
      FROM announcements a
      WHERE a.requires_ack = true
        AND NOT EXISTS (
          SELECT 1
          FROM announcement_acknowledgements aa
          WHERE aa.announcement_id = a.id
            AND aa.employee_id = _employee_id
        )
    ), 0)
  );
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION get_unread_counts(uuid) TO authenticated;
