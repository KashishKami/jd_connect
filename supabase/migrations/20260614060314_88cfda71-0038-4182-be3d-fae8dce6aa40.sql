CREATE OR REPLACE FUNCTION public.agent_rankings(_from date, _to date, _centre_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 5)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, centre_id uuid, centre_code text, sales_count bigint, gross_revenue numeric, refunds numeric, chargebacks numeric, net_revenue numeric, rank_position text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
  top_rows AS (
    SELECT b.*, 'top'::text AS rank_position
    FROM base b ORDER BY b.net_revenue DESC NULLS LAST, b.employee_id LIMIT GREATEST(1, LEAST(_limit,50))
  ),
  bottom_rows AS (
    SELECT b.*, 'bottom'::text AS rank_position
    FROM base b ORDER BY b.net_revenue ASC NULLS LAST, b.employee_id LIMIT GREATEST(1, LEAST(_limit,50))
  )
  SELECT * FROM top_rows
  UNION ALL
  SELECT * FROM bottom_rows;
$function$;