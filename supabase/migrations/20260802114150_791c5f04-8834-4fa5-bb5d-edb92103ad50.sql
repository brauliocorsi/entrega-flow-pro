ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS order_changed_by uuid,
  ADD COLUMN IF NOT EXISTS order_changed_by_name text,
  ADD COLUMN IF NOT EXISTS order_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_ready_by_name text,
  ADD COLUMN IF NOT EXISTS started_by uuid,
  ADD COLUMN IF NOT EXISTS started_by_name text,
  ADD COLUMN IF NOT EXISTS unlocked_by uuid,
  ADD COLUMN IF NOT EXISTS unlocked_by_name text,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlock_reason text;