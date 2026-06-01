CREATE TABLE public.delivery_fee_ranges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT,
  zip_start TEXT NOT NULL,
  zip_end TEXT NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(zip_start) = 4 AND char_length(zip_end) = 4),
  CHECK (zip_start <= zip_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_fee_ranges TO authenticated;
GRANT ALL ON public.delivery_fee_ranges TO service_role;

ALTER TABLE public.delivery_fee_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fee_ranges_select_all_auth"
ON public.delivery_fee_ranges FOR SELECT TO authenticated USING (true);

CREATE POLICY "fee_ranges_admin_manage"
ON public.delivery_fee_ranges FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_delivery_fee_ranges_updated_at
BEFORE UPDATE ON public.delivery_fee_ranges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fee_ranges_active ON public.delivery_fee_ranges(active, priority DESC);