ALTER TABLE public.delivery_payments
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

DROP POLICY IF EXISTS delivery_payments_update_admin ON public.delivery_payments;
CREATE POLICY delivery_payments_update_admin ON public.delivery_payments
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS routes_update_courier ON public.routes;
CREATE POLICY routes_update_courier ON public.routes
  FOR UPDATE TO authenticated
  USING (is_route_courier(auth.uid(), id))
  WITH CHECK (is_route_courier(auth.uid(), id));