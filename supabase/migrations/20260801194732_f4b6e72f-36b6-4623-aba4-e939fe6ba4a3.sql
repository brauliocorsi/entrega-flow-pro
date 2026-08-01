ALTER TABLE public.scheduled_deliveries REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_payments REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_deliveries;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_payments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
