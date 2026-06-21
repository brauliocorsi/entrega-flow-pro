CREATE TABLE public.route_corridor_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.route_templates(id) ON DELETE CASCADE,
  zip_prefix TEXT NOT NULL CHECK (char_length(zip_prefix) BETWEEN 2 AND 4),
  city_label TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, zip_prefix)
);

CREATE INDEX idx_corridor_template ON public.route_corridor_stops(template_id, sequence);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_corridor_stops TO authenticated;
GRANT ALL ON public.route_corridor_stops TO service_role;

ALTER TABLE public.route_corridor_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corridor_select_all_auth" ON public.route_corridor_stops
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "corridor_admin_logistico_manage" ON public.route_corridor_stops
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'logistico'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'logistico'::app_role));

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS corridor JSONB NOT NULL DEFAULT '[]'::jsonb;