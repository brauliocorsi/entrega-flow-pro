ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_by_name text,
  ADD COLUMN IF NOT EXISTS closed_by_role text,
  ADD COLUMN IF NOT EXISTS conferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS conferred_by_name text;