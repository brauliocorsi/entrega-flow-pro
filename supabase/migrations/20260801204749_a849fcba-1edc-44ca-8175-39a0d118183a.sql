CREATE TABLE public.route_cash_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  receipt_path text NOT NULL,
  created_by uuid NOT NULL,
  created_by_name text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_cash_expenses TO authenticated;
GRANT ALL ON public.route_cash_expenses TO service_role;
ALTER TABLE public.route_cash_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_expenses_select" ON public.route_cash_expenses
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'logistico')
  OR public.is_route_courier(auth.uid(), route_id)
);

CREATE POLICY "cash_expenses_insert" ON public.route_cash_expenses
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND status = 'pendente'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.is_route_courier(auth.uid(), route_id)
  )
);

CREATE POLICY "cash_expenses_admin_update" ON public.route_cash_expenses
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cash_expenses_delete_own_pending" ON public.route_cash_expenses
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (created_by = auth.uid() AND status = 'pendente')
);

CREATE TRIGGER route_cash_expenses_updated_at
BEFORE UPDATE ON public.route_cash_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.route_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL UNIQUE REFERENCES public.routes(id) ON DELETE CASCADE,
  envelope_code text NOT NULL,
  cash_expected numeric(10,2) NOT NULL DEFAULT 0,
  cash_declared numeric(10,2) NOT NULL DEFAULT 0,
  expenses_total numeric(10,2) NOT NULL DEFAULT 0,
  methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','entregue','conferida')),
  submitted_by uuid,
  submitted_by_name text,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.route_settlements TO authenticated;
GRANT ALL ON public.route_settlements TO service_role;
ALTER TABLE public.route_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_select" ON public.route_settlements
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'logistico')
  OR public.is_route_courier(auth.uid(), route_id)
);

CREATE POLICY "settlements_insert" ON public.route_settlements
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.is_route_courier(auth.uid(), route_id)
);

CREATE POLICY "settlements_update" ON public.route_settlements
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_route_courier(auth.uid(), route_id) AND status = 'aberta')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_route_courier(auth.uid(), route_id) AND status IN ('aberta','entregue'))
);

CREATE TRIGGER route_settlements_updated_at
BEFORE UPDATE ON public.route_settlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cash_expenses_route ON public.route_cash_expenses(route_id);