create unique index if not exists agent_sessions_owner_agent_id_key
  on public.agent_sessions (owner_id, agent_id);
