
CREATE TABLE public.route_payment_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  generated_by uuid NOT NULL,
  generated_by_name text,
  total_orders integer NOT NULL DEFAULT 0,
  total_gross numeric NOT NULL DEFAULT 0,
  total_services numeric NOT NULL DEFAULT 0,
  total_forecast numeric NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  route_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_payment_forecasts_route ON public.route_payment_forecasts(route_id, created_at DESC);

GRANT SELECT, INSERT ON public.route_payment_forecasts TO authenticated;
GRANT ALL ON public.route_payment_forecasts TO service_role;

ALTER TABLE public.route_payment_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY forecasts_select_auth ON public.route_payment_forecasts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY forecasts_insert_admin_logistico ON public.route_payment_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (
    generated_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'logistico'::app_role))
  );
