ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS gc_os_id text,
  ADD COLUMN IF NOT EXISTS gc_os_number text,
  ADD COLUMN IF NOT EXISTS gc_client_id text,
  ADD COLUMN IF NOT EXISTS gc_sync_status text,
  ADD COLUMN IF NOT EXISTS gc_sync_error text,
  ADD COLUMN IF NOT EXISTS gc_synced_at timestamptz;