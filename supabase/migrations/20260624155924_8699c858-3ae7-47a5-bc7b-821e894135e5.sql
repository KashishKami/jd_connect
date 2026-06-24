CREATE OR REPLACE FUNCTION public.check_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.allowed_ips)
    OR EXISTS (SELECT 1 FROM public.allowed_ips WHERE ip_address = _ip);
$$;

GRANT EXECUTE ON FUNCTION public.check_ip_allowed(text) TO authenticated;
