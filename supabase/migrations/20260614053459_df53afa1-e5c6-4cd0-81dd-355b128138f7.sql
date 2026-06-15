
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS alias_name text;

CREATE OR REPLACE FUNCTION public.agent_rankings(_from date, _to date, _centre_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 5)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, centre_id uuid, centre_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric, rank_position text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT employee_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross
    FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY employee_id
  ),
  r AS (SELECT employee_id, SUM(amount_usd) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to GROUP BY employee_id),
  c AS (SELECT employee_id, SUM(amount_usd) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to GROUP BY employee_id),
  base AS (
    SELECT e.id AS employee_id,
      COALESCE(NULLIF(e.alias_name,''), e.full_name) AS full_name,
      e.employee_code, e.centre_id, ce.code AS centre_code,
      COALESCE(s.cnt,0)::bigint AS sales_count,
      COALESCE(s.gross,0)::numeric AS gross_revenue,
      COALESCE(r.amt,0)::numeric AS refunds,
      COALESCE(c.amt,0)::numeric AS chargebacks,
      (COALESCE(s.gross,0) - COALESCE(r.amt,0) - COALESCE(c.amt,0))::numeric AS net_revenue
    FROM public.employees e
    LEFT JOIN public.centres ce ON ce.id = e.centre_id
    LEFT JOIN s ON s.employee_id=e.id
    LEFT JOIN r ON r.employee_id=e.id
    LEFT JOIN c ON c.employee_id=e.id
    WHERE e.employment_status='active'
      AND (_centre_id IS NULL OR e.centre_id = _centre_id)
      AND (COALESCE(s.cnt,0) > 0 OR COALESCE(r.amt,0) > 0 OR COALESCE(c.amt,0) > 0)
  ),
  top_rows AS (SELECT b.*, 'top'::text AS rank_position FROM base b ORDER BY b.net_revenue DESC NULLS LAST LIMIT GREATEST(1, LEAST(_limit,50))),
  bottom_rows AS (SELECT b.*, 'bottom'::text AS rank_position FROM base b WHERE b.employee_id NOT IN (SELECT employee_id FROM top_rows) ORDER BY b.net_revenue ASC NULLS LAST LIMIT GREATEST(1, LEAST(_limit,50)))
  SELECT * FROM top_rows UNION ALL SELECT * FROM bottom_rows;
$function$;

CREATE OR REPLACE FUNCTION public.leaderboard(_from date, _to date, _limit integer DEFAULT 20)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (SELECT employee_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY employee_id),
  r AS (SELECT employee_id, SUM(amount_usd) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to GROUP BY employee_id),
  c AS (SELECT employee_id, SUM(amount_usd) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to GROUP BY employee_id)
  SELECT e.id, COALESCE(NULLIF(e.alias_name,''), e.full_name), e.employee_code,
         COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         COALESCE(r.amt,0)::numeric, COALESCE(c.amt,0)::numeric,
         (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0))::numeric AS net
  FROM public.employees e
  LEFT JOIN s ON s.employee_id=e.id LEFT JOIN r ON r.employee_id=e.id LEFT JOIN c ON c.employee_id=e.id
  WHERE COALESCE(s.cnt,0) > 0 OR COALESCE(r.amt,0) > 0 OR COALESCE(c.amt,0) > 0
  ORDER BY net DESC NULLS LAST LIMIT _limit;
$function$;

CREATE OR REPLACE FUNCTION public.team_performance(_team_leader_id uuid, _from date, _to date)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH team AS (SELECT id, COALESCE(NULLIF(alias_name,''), full_name) AS full_name, employee_code FROM public.employees WHERE team_leader_id=_team_leader_id OR manager_id=_team_leader_id),
  s AS (SELECT employee_id, SUM(sales_count) cnt, SUM(sales_amount_usd) gross FROM public.sales_entries WHERE sale_date BETWEEN _from AND _to GROUP BY employee_id),
  r AS (SELECT employee_id, SUM(amount_usd) amt FROM public.refund_entries WHERE refund_date BETWEEN _from AND _to GROUP BY employee_id),
  c AS (SELECT employee_id, SUM(amount_usd) amt FROM public.chargeback_entries WHERE chargeback_date BETWEEN _from AND _to GROUP BY employee_id)
  SELECT t.id, t.full_name, t.employee_code,
         COALESCE(s.cnt,0)::bigint, COALESCE(s.gross,0)::numeric,
         COALESCE(r.amt,0)::numeric, COALESCE(c.amt,0)::numeric,
         (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0))::numeric
  FROM team t LEFT JOIN s ON s.employee_id=t.id LEFT JOIN r ON r.employee_id=t.id LEFT JOIN c ON c.employee_id=t.id
  ORDER BY (COALESCE(s.gross,0)-COALESCE(r.amt,0)-COALESCE(c.amt,0)) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_employee_directory(_q text DEFAULT NULL::text, _department_id uuid DEFAULT NULL::uuid, _centre_id uuid DEFAULT NULL::uuid, _role_id uuid DEFAULT NULL::uuid, _status employment_status DEFAULT NULL::employment_status, _limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, employee_code text, full_name text, designation text, employment_status employment_status, profile_photo_url text, department_id uuid, department_name text, centre_id uuid, centre_code text, role_id uuid, role_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
  SELECT e.id, e.employee_code, COALESCE(NULLIF(e.alias_name,''), e.full_name), e.designation, e.employment_status,
    e.profile_photo_url, e.department_id, d.name, e.centre_id, c.code, e.role_id, r.name
  FROM public.employees e
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.centres c ON c.id = e.centre_id
  LEFT JOIN public.roles r ON r.id = e.role_id
  WHERE (_department_id IS NULL OR e.department_id = _department_id)
    AND (_centre_id IS NULL OR e.centre_id = _centre_id)
    AND (_role_id IS NULL OR e.role_id = _role_id)
    AND (_status IS NULL OR e.employment_status = _status)
    AND (_q IS NULL OR _q = '' OR e.full_name ILIKE '%'||_q||'%' OR COALESCE(e.alias_name,'') ILIKE '%'||_q||'%' OR e.employee_code ILIKE '%'||_q||'%' OR COALESCE(e.designation,'') ILIKE '%'||_q||'%')
  ORDER BY e.employee_code LIMIT GREATEST(1, LEAST(_limit, 1000));
$function$;
