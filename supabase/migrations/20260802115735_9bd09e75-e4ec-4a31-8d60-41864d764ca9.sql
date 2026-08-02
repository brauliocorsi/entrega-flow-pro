ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS released_to_courier_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_to_courier_by uuid,
  ADD COLUMN IF NOT EXISTS released_by_name text,
  ADD COLUMN IF NOT EXISTS courier_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS courier_confirmed_by_name text;

ALTER TABLE public.scheduled_deliveries
  ADD COLUMN IF NOT EXISTS removal_suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS removal_suggested_by_name text,
  ADD COLUMN IF NOT EXISTS removal_reason text;