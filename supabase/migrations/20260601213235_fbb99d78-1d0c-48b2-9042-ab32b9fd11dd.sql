
ALTER TABLE public.route_templates
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#3b82f6';

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS vehicle text,
  ADD COLUMN IF NOT EXISTS assistant text;

CREATE POLICY "routes_update_logistico"
ON public.routes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'logistico'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'logistico'::app_role));

CREATE POLICY "deliveries_update_logistico"
ON public.scheduled_deliveries
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'logistico'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'logistico'::app_role));
