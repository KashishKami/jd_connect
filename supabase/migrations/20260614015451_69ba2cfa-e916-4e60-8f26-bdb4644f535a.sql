
CREATE EXTENSION IF NOT EXISTS vector;

-- =============== Knowledge embeddings ===============
CREATE TABLE public.knowledge_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.document_versions(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  token_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_embeddings_doc_idx ON public.knowledge_embeddings(document_id);
CREATE INDEX knowledge_embeddings_vec_idx ON public.knowledge_embeddings USING hnsw (embedding vector_cosine_ops);

GRANT SELECT ON public.knowledge_embeddings TO authenticated;
GRANT ALL ON public.knowledge_embeddings TO service_role;
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read embeddings if can access document"
  ON public.knowledge_embeddings FOR SELECT TO authenticated
  USING (public.can_access_document(document_id));

-- =============== Conversations ===============
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_idx ON public.ai_conversations(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own conversations" ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER ai_conversations_updated BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============== Messages ===============
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text NOT NULL,
  sources jsonb,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON public.ai_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages in own conversations" ON public.ai_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- =============== Feedback ===============
CREATE TABLE public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helpful boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_feedback TO authenticated;
GRANT ALL ON public.ai_feedback TO service_role;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own feedback insert" ON public.ai_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own or admin feedback read" ON public.ai_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Own feedback update" ON public.ai_feedback FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- =============== Analytics ===============
CREATE TABLE public.ai_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  question text NOT NULL,
  intent text,
  source_type text,
  document_ids uuid[],
  answered boolean NOT NULL DEFAULT true,
  latency_ms int,
  tokens_used int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_analytics_created_idx ON public.ai_analytics(created_at DESC);
GRANT SELECT, INSERT ON public.ai_analytics TO authenticated;
GRANT ALL ON public.ai_analytics TO service_role;
ALTER TABLE public.ai_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert own analytics" ON public.ai_analytics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Read analytics" ON public.ai_analytics FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- =============== Document access helper for AI ===============
CREATE OR REPLACE FUNCTION public.ai_accessible_document_ids()
RETURNS TABLE(document_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.documents WHERE public.can_access_document(id);
$$;

-- =============== Semantic match ===============
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector(1536),
  match_count int DEFAULT 6,
  min_similarity float DEFAULT 0.3
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  version_id uuid,
  chunk_index int,
  content text,
  similarity float,
  document_title text,
  document_version text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.id, e.document_id, e.version_id, e.chunk_index, e.content,
    1 - (e.embedding <=> query_embedding) AS similarity,
    d.title,
    v.version_label
  FROM public.knowledge_embeddings e
  JOIN public.documents d ON d.id = e.document_id
  LEFT JOIN public.document_versions v ON v.id = e.version_id
  WHERE public.can_access_document(e.document_id)
    AND (1 - (e.embedding <=> query_embedding)) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

-- =============== Caller scope helper ===============
-- Returns 'company' | 'department' | 'team' | 'own'
CREATE OR REPLACE FUNCTION public.ai_caller_scope()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin(auth.uid()) THEN 'company'
    WHEN public.has_role(auth.uid(),'manager') THEN 'department'
    WHEN public.has_role(auth.uid(),'team_leader') THEN 'team'
    ELSE 'own'
  END;
$$;

-- =============== Scoped employee set for AI tools ===============
CREATE OR REPLACE FUNCTION public.ai_scope_employees()
RETURNS TABLE(employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT id, department_id, centre_id FROM public.employees WHERE auth_user_id = auth.uid()),
       scope AS (SELECT public.ai_caller_scope() AS s)
  SELECT e.id FROM public.employees e, me, scope
  WHERE
    (scope.s = 'company')
    OR (scope.s = 'department' AND (e.department_id = me.department_id OR e.id = me.id))
    OR (scope.s = 'team' AND (e.team_leader_id = me.id OR e.manager_id = me.id OR e.id = me.id))
    OR (scope.s = 'own' AND e.id = me.id);
$$;

-- =============== Sales summary ===============
CREATE OR REPLACE FUNCTION public.ai_sales_summary(_from date, _to date)
RETURNS TABLE(
  scope text,
  sales_count bigint,
  gross_revenue numeric,
  refunds numeric,
  chargebacks numeric,
  net_revenue numeric,
  top_agents jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH s AS (
    SELECT COALESCE(SUM(se.sales_count),0)::bigint AS cnt,
           COALESCE(SUM(se.sales_amount_usd),0)::numeric AS gross
    FROM public.sales_entries se
    WHERE se.sale_date BETWEEN _from AND _to
      AND se.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
  ),
  r AS (SELECT COALESCE(SUM(amount_usd),0)::numeric AS amt
        FROM public.refund_entries
        WHERE refund_date BETWEEN _from AND _to
          AND employee_id IN (SELECT employee_id FROM public.ai_scope_employees())),
  c AS (SELECT COALESCE(SUM(amount_usd),0)::numeric AS amt
        FROM public.chargeback_entries
        WHERE chargeback_date BETWEEN _from AND _to
          AND employee_id IN (SELECT employee_id FROM public.ai_scope_employees())),
  agents AS (
    SELECT se.employee_id, e.full_name, e.employee_code, SUM(se.sales_amount_usd) gross
    FROM public.sales_entries se
    JOIN public.employees e ON e.id = se.employee_id
    WHERE se.sale_date BETWEEN _from AND _to
      AND se.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
    GROUP BY se.employee_id, e.full_name, e.employee_code
    ORDER BY SUM(se.sales_amount_usd) DESC NULLS LAST
    LIMIT 5
  )
  SELECT public.ai_caller_scope(),
         s.cnt, s.gross, r.amt, c.amt, (s.gross - r.amt - c.amt),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'employee_id', employee_id, 'name', full_name, 'code', employee_code, 'gross_revenue', gross
         )) FROM agents), '[]'::jsonb)
  FROM s, r, c;
$$;

-- =============== Attendance summary ===============
CREATE OR REPLACE FUNCTION public.ai_attendance_summary(_from date, _to date)
RETURNS TABLE(
  scope text,
  total_records bigint,
  present bigint,
  absent bigint,
  half_day bigint,
  on_leave bigint,
  attendance_rate numeric,
  absent_today jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH a AS (
    SELECT ar.* FROM public.attendance_records ar
    WHERE ar.work_date BETWEEN _from AND _to
      AND ar.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
  ),
  today_absent AS (
    SELECT ar.employee_id, e.full_name, e.employee_code
    FROM public.attendance_records ar
    JOIN public.employees e ON e.id = ar.employee_id
    WHERE ar.work_date = CURRENT_DATE
      AND ar.status IN ('absent','leave')
      AND ar.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
    LIMIT 50
  )
  SELECT public.ai_caller_scope(),
    (SELECT COUNT(*) FROM a)::bigint,
    (SELECT COUNT(*) FROM a WHERE status='present')::bigint,
    (SELECT COUNT(*) FROM a WHERE status='absent')::bigint,
    (SELECT COUNT(*) FROM a WHERE status='half_day')::bigint,
    (SELECT COUNT(*) FROM a WHERE status='leave')::bigint,
    CASE WHEN (SELECT COUNT(*) FROM a) > 0
      THEN ROUND(100.0 * (SELECT COUNT(*) FROM a WHERE status='present') / (SELECT COUNT(*) FROM a), 2)
      ELSE 0 END,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('employee_id',employee_id,'name',full_name,'code',employee_code)) FROM today_absent), '[]'::jsonb);
$$;

-- =============== Break summary ===============
CREATE OR REPLACE FUNCTION public.ai_break_summary(_from date, _to date)
RETURNS TABLE(
  scope text,
  total_breaks bigint,
  exceeded bigint,
  currently_on_break bigint,
  on_break_now jsonb,
  exceeded_today jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH b AS (
    SELECT br.* FROM public.break_records br
    WHERE br.start_at::date BETWEEN _from AND _to
      AND br.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
  ),
  active AS (
    SELECT br.employee_id, e.full_name, e.employee_code, br.start_at
    FROM public.break_records br
    JOIN public.employees e ON e.id = br.employee_id
    WHERE br.status = 'active'
      AND br.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
    LIMIT 50
  ),
  ex AS (
    SELECT br.employee_id, e.full_name, e.employee_code, br.duration_minutes, br.limit_minutes
    FROM public.break_records br
    JOIN public.employees e ON e.id = br.employee_id
    WHERE br.start_at::date = CURRENT_DATE AND br.status = 'exceeded'
      AND br.employee_id IN (SELECT employee_id FROM public.ai_scope_employees())
    LIMIT 50
  )
  SELECT public.ai_caller_scope(),
    (SELECT COUNT(*) FROM b)::bigint,
    (SELECT COUNT(*) FROM b WHERE status='exceeded')::bigint,
    (SELECT COUNT(*) FROM active)::bigint,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('employee_id',employee_id,'name',full_name,'code',employee_code,'start_at',start_at)) FROM active), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('employee_id',employee_id,'name',full_name,'code',employee_code,'duration_minutes',duration_minutes,'limit_minutes',limit_minutes)) FROM ex), '[]'::jsonb);
$$;

-- =============== Workforce summary ===============
CREATE OR REPLACE FUNCTION public.ai_workforce_summary()
RETURNS TABLE(
  scope text,
  total_employees bigint,
  active_employees bigint,
  by_department jsonb,
  by_centre jsonb,
  by_role jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH e AS (
    SELECT emp.* FROM public.employees emp
    WHERE emp.id IN (SELECT employee_id FROM public.ai_scope_employees())
  )
  SELECT public.ai_caller_scope(),
    (SELECT COUNT(*) FROM e)::bigint,
    (SELECT COUNT(*) FROM e WHERE employment_status='active')::bigint,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('department', d.name, 'count', cnt))
              FROM (SELECT department_id, COUNT(*) cnt FROM e GROUP BY department_id) x
              LEFT JOIN public.departments d ON d.id = x.department_id), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('centre', c.code, 'count', cnt))
              FROM (SELECT centre_id, COUNT(*) cnt FROM e GROUP BY centre_id) x
              LEFT JOIN public.centres c ON c.id = x.centre_id), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('role', r.name, 'count', cnt))
              FROM (SELECT role_id, COUNT(*) cnt FROM e GROUP BY role_id) x
              LEFT JOIN public.roles r ON r.id = x.role_id), '[]'::jsonb);
$$;
