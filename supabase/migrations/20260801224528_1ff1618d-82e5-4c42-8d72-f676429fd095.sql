ALTER TABLE public.scheduled_deliveries ADD COLUMN IF NOT EXISTS stop_order integer;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_path text,
  kind text NOT NULL DEFAULT 'csv',
  scope text NOT NULL DEFAULT 'periodo',
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'processado',
  error_message text,
  transactions_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_statements_admin_all" ON public.bank_statements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistico'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistico'));

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  tx_date date,
  amount numeric(10,2) NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text,
  method text,
  status text NOT NULL DEFAULT 'por_conciliar',
  matched_payment_id uuid REFERENCES public.delivery_payments(id) ON DELETE SET NULL,
  matched_by uuid,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transactions_admin_all" ON public.bank_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistico'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistico'));

CREATE INDEX IF NOT EXISTS bank_transactions_statement_idx ON public.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON public.bank_transactions(status);

ALTER TABLE public.delivery_payments ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE public.delivery_payments ADD COLUMN IF NOT EXISTS reconciled_by uuid;
ALTER TABLE public.delivery_payments ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

CREATE TRIGGER bank_statements_updated_at BEFORE UPDATE ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bank_transactions_updated_at BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();