-- Create allowed_ips table
CREATE TABLE IF NOT EXISTS public.allowed_ips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.allowed_ips ENABLE ROW LEVEL SECURITY;

-- Create policy for Admin/Superadmin access
CREATE POLICY "admin_all_allowed_ips" ON public.allowed_ips
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('super_admin', 'admin')
    )
  );

-- Grant permissions to authenticated role and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_ips TO authenticated;
GRANT ALL ON public.allowed_ips TO service_role;

-- Pre-populate the two specified IP addresses
INSERT INTO public.allowed_ips (ip_address, description) VALUES
  ('103.163.224.78', 'DB PARK IP'),
  ('103.144.119.117', 'IT PARK IP')
ON CONFLICT (ip_address) DO NOTHING;
