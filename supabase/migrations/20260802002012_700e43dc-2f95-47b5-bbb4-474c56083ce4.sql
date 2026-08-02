ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS scheduled_delivery_id uuid REFERENCES public.scheduled_deliveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charge_value numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_date date;

CREATE INDEX IF NOT EXISTS service_requests_scheduled_delivery_idx ON public.service_requests(scheduled_delivery_id);