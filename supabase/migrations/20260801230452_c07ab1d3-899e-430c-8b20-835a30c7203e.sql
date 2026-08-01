ALTER TYPE public.delivery_outcome ADD VALUE IF NOT EXISTS 'reagendado';
ALTER TYPE public.delivery_outcome ADD VALUE IF NOT EXISTS 'cancelado';

ALTER TABLE public.scheduled_deliveries
  ADD COLUMN IF NOT EXISTS gc_sync_status text,
  ADD COLUMN IF NOT EXISTS gc_sync_error text,
  ADD COLUMN IF NOT EXISTS gc_synced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS partial_items jsonb;