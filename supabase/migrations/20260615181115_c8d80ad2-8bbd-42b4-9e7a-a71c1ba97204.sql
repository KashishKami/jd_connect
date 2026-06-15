do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_participants'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_participants';
  end if;
end$$;

alter table public.conversation_participants replica identity full;
alter table public.messages replica identity full;