
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE public.document_status AS ENUM ('draft','active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_visibility AS ENUM ('all','department','centre','role','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_audit_action AS ENUM ('upload','update','version','archive','restore','download','delete','view');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_categories TO authenticated;
GRANT ALL ON public.document_categories TO service_role;
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view categories" ON public.document_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage categories" ON public.document_categories FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_doc_categories_updated BEFORE UPDATE ON public.document_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category_id uuid REFERENCES public.document_categories(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  status public.document_status NOT NULL DEFAULT 'draft',
  visibility public.document_visibility NOT NULL DEFAULT 'all',
  download_allowed boolean NOT NULL DEFAULT true,
  keywords text[] NOT NULL DEFAULT '{}',
  current_version_id uuid,
  uploaded_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  views_count int NOT NULL DEFAULT 0,
  downloads_count int NOT NULL DEFAULT 0,
  search_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_category ON public.documents(category_id);
CREATE INDEX idx_documents_department ON public.documents(department_id);
CREATE INDEX idx_documents_keywords ON public.documents USING gin(keywords);
CREATE INDEX idx_documents_title_trgm ON public.documents USING gin (title public.gin_trgm_ops);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text,
  change_notes text,
  uploaded_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_versions_doc ON public.document_versions(document_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

CREATE TABLE public.document_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  centre_id uuid REFERENCES public.centres(id) ON DELETE CASCADE,
  role public.app_role,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_perms_doc ON public.document_permissions(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_permissions TO authenticated;
GRANT ALL ON public.document_permissions TO service_role;
ALTER TABLE public.document_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_views_doc ON public.document_views(document_id, viewed_at DESC);
CREATE INDEX idx_doc_views_emp ON public.document_views(employee_id, viewed_at DESC);
GRANT SELECT, INSERT ON public.document_views TO authenticated;
GRANT ALL ON public.document_views TO service_role;
ALTER TABLE public.document_views ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_downloads_doc ON public.document_downloads(document_id, downloaded_at DESC);
GRANT SELECT, INSERT ON public.document_downloads TO authenticated;
GRANT ALL ON public.document_downloads TO service_role;
ALTER TABLE public.document_downloads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, employee_id)
);
GRANT SELECT, INSERT, DELETE ON public.document_favorites TO authenticated;
GRANT ALL ON public.document_favorites TO service_role;
ALTER TABLE public.document_favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_user_id uuid,
  action public.document_audit_action NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_audit_doc ON public.document_audit_logs(document_id, created_at DESC);
GRANT SELECT, INSERT ON public.document_audit_logs TO authenticated;
GRANT ALL ON public.document_audit_logs TO service_role;
ALTER TABLE public.document_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH d AS (SELECT * FROM public.documents WHERE id = _document_id),
       me AS (SELECT id, department_id, centre_id, role_id FROM public.employees WHERE auth_user_id = auth.uid())
  SELECT EXISTS (SELECT 1 FROM d)
    AND (
      public.is_admin(auth.uid())
      OR (SELECT uploaded_by FROM d) = (SELECT id FROM me)
      OR (
        (SELECT status FROM d) = 'active'
        AND (
          (SELECT visibility FROM d) = 'all'
          OR EXISTS (
            SELECT 1 FROM public.document_permissions p, me
            WHERE p.document_id = _document_id
              AND (
                (p.department_id IS NOT NULL AND p.department_id = me.department_id)
                OR (p.centre_id IS NOT NULL AND p.centre_id = me.centre_id)
                OR (p.role IS NOT NULL AND public.has_role(auth.uid(), p.role))
                OR (p.employee_id IS NOT NULL AND p.employee_id = me.id)
              )
          )
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = _document_id AND d.uploaded_by = public.current_employee_id()
    )
$$;

CREATE POLICY "View accessible documents" ON public.documents FOR SELECT TO authenticated
  USING (public.can_access_document(id));
CREATE POLICY "Authenticated can create documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = public.current_employee_id() OR public.is_admin(auth.uid()));
CREATE POLICY "Owner or admin can update" ON public.documents FOR UPDATE TO authenticated
  USING (public.can_manage_document(id)) WITH CHECK (public.can_manage_document(id));
CREATE POLICY "Admin can delete" ON public.documents FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "View versions if access" ON public.document_versions FOR SELECT TO authenticated
  USING (public.can_access_document(document_id));
CREATE POLICY "Manage versions" ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_document(document_id));
CREATE POLICY "Update versions" ON public.document_versions FOR UPDATE TO authenticated
  USING (public.can_manage_document(document_id)) WITH CHECK (public.can_manage_document(document_id));
CREATE POLICY "Delete versions" ON public.document_versions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "View permissions if access" ON public.document_permissions FOR SELECT TO authenticated
  USING (public.can_access_document(document_id));
CREATE POLICY "Manage permissions" ON public.document_permissions FOR ALL TO authenticated
  USING (public.can_manage_document(document_id)) WITH CHECK (public.can_manage_document(document_id));

CREATE POLICY "Employees record own views" ON public.document_views FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());
CREATE POLICY "View own or manage doc views" ON public.document_views FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.can_manage_document(document_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Employees record own downloads" ON public.document_downloads FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());
CREATE POLICY "View own or manage doc downloads" ON public.document_downloads FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.can_manage_document(document_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Own favorites" ON public.document_favorites FOR ALL TO authenticated
  USING (employee_id = public.current_employee_id()) WITH CHECK (employee_id = public.current_employee_id());

CREATE POLICY "Insert audit" ON public.document_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "View audit if manager/admin" ON public.document_audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR (document_id IS NOT NULL AND public.can_manage_document(document_id)));

CREATE POLICY "Read document files if access"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_access_document(((string_to_array(name,'/'))[1])::uuid)
  );
CREATE POLICY "Upload document files if can manage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.can_manage_document(((string_to_array(name,'/'))[1])::uuid)
  );
CREATE POLICY "Delete document files if admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.knowledge_dashboard()
RETURNS TABLE(total_documents bigint, active_documents bigint, draft_documents bigint, archived_documents bigint, total_storage_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.documents)::bigint,
    (SELECT count(*) FROM public.documents WHERE status='active')::bigint,
    (SELECT count(*) FROM public.documents WHERE status='draft')::bigint,
    (SELECT count(*) FROM public.documents WHERE status='archived')::bigint,
    (SELECT COALESCE(SUM(file_size),0) FROM public.document_versions)::bigint;
$$;

CREATE OR REPLACE FUNCTION public.storage_by_department()
RETURNS TABLE(department_id uuid, department_name text, document_count bigint, bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.name,
    COUNT(DISTINCT doc.id)::bigint,
    COALESCE(SUM(v.file_size),0)::bigint
  FROM public.departments d
  LEFT JOIN public.documents doc ON doc.department_id = d.id
  LEFT JOIN public.document_versions v ON v.document_id = doc.id
  GROUP BY d.id, d.name
  ORDER BY d.name;
$$;

CREATE OR REPLACE FUNCTION public.most_accessed_documents(_limit int DEFAULT 10)
RETURNS TABLE(document_id uuid, title text, views bigint, downloads bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.views_count::bigint, d.downloads_count::bigint
  FROM public.documents d
  ORDER BY d.views_count DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

CREATE OR REPLACE FUNCTION public.least_accessed_documents(_limit int DEFAULT 10)
RETURNS TABLE(document_id uuid, title text, views bigint, downloads bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.views_count::bigint, d.downloads_count::bigint
  FROM public.documents d
  WHERE d.status='active'
  ORDER BY d.views_count ASC NULLS FIRST, d.created_at ASC
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

INSERT INTO public.document_categories (name, slug, sort_order) VALUES
  ('SOPs','sops',1),
  ('Sales Scripts','sales-scripts',2),
  ('Training Material','training',3),
  ('Policies','policies',4),
  ('HR Documents','hr',5),
  ('Operations Documents','operations',6),
  ('Marketing Documents','marketing',7),
  ('General Documents','general',8)
ON CONFLICT (name) DO NOTHING;
