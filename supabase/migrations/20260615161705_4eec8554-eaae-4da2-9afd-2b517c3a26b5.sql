
-- 1) profiles: restrict SELECT to self or admin (was: any authenticated could read all emails)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2) scheduled_deliveries: restrict SELECT to admin/logistico or the seller who owns the row
DROP POLICY IF EXISTS "deliveries_select_all_auth" ON public.scheduled_deliveries;
CREATE POLICY "deliveries_select_role_or_owner" ON public.scheduled_deliveries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'logistico'::app_role)
    OR seller_id = auth.uid()
  );

-- 3) staff: restrict SELECT to admin/logistico (phone numbers exposed)
DROP POLICY IF EXISTS "staff_select_all_auth" ON public.staff;
CREATE POLICY "staff_select_admin_logistico" ON public.staff
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'logistico'::app_role)
  );

-- 4) invoice-scans bucket: add explicit UPDATE policy (was missing)
CREATE POLICY "invoice_scans_update_admin_logistico" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-scans'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
  )
  WITH CHECK (
    bucket_id = 'invoice-scans'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
  );

-- 5) realtime.messages: restrict channel subscriptions by role
-- Without this, any authenticated user can subscribe to any channel topic, bypassing table SELECT policies.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_authenticated_admin_logistico" ON realtime.messages;
CREATE POLICY "realtime_authenticated_admin_logistico" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'logistico'::app_role)
  );

-- 6) Revoke EXECUTE on internal SECURITY DEFINER helper from signed-in users.
-- This function is only used by triggers (which run regardless of grants), not by app code via RPC.
REVOKE EXECUTE ON FUNCTION public.recompute_route_counters(uuid) FROM PUBLIC, authenticated, anon;
