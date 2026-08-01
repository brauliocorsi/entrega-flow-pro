-- Ligar ficha de equipa a uma conta
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_key ON public.staff(user_id) WHERE user_id IS NOT NULL;

-- Entregador vê a sua própria ficha (para saber o nome escalado)
DROP POLICY IF EXISTS staff_select_self ON public.staff;
CREATE POLICY staff_select_self ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Função: o utilizador está escalado nesta rota?
CREATE OR REPLACE FUNCTION public.is_route_courier(_user_id uuid, _route_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.routes r
    JOIN public.staff s ON s.user_id = _user_id AND s.active
    WHERE r.id = _route_id
      AND (
        lower(btrim(coalesce(r.driver, ''))) = lower(btrim(s.name))
        OR lower(btrim(coalesce(r.assistant, ''))) = lower(btrim(s.name))
      )
  )
$$;
REVOKE ALL ON FUNCTION public.is_route_courier(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_route_courier(uuid, uuid) TO authenticated;

-- Formas de pagamento
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_methods_select_auth ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY payment_methods_admin_manage ON public.payment_methods FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_payment_methods_updated BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('Dinheiro', 1), ('MB Way', 2), ('Multibanco', 3), ('Transferência', 4), ('Cheque', 5)
ON CONFLICT (name) DO NOTHING;

-- Recebimentos por entrega
CREATE TABLE IF NOT EXISTS public.delivery_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.scheduled_deliveries(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  method_id uuid REFERENCES public.payment_methods(id),
  method_name text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  notes text,
  received_by uuid NOT NULL,
  received_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_payments_delivery_idx ON public.delivery_payments(delivery_id);
CREATE INDEX IF NOT EXISTS delivery_payments_route_idx ON public.delivery_payments(route_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_payments TO authenticated;
GRANT ALL ON public.delivery_payments TO service_role;
ALTER TABLE public.delivery_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_payments_select ON public.delivery_payments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico')
    OR public.is_route_courier(auth.uid(), route_id)
  );
CREATE POLICY delivery_payments_insert ON public.delivery_payments FOR INSERT TO authenticated
  WITH CHECK (
    received_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico')
      OR public.is_route_courier(auth.uid(), route_id)
    )
  );
CREATE POLICY delivery_payments_delete ON public.delivery_payments FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico')
    OR (received_by = auth.uid() AND public.is_route_courier(auth.uid(), route_id))
  );
CREATE TRIGGER trg_delivery_payments_updated BEFORE UPDATE ON public.delivery_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recalcular valores pagos na entrega
CREATE OR REPLACE FUNCTION public.recompute_delivery_paid(_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_sum numeric(10,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.delivery_payments WHERE delivery_id = _delivery_id;
  UPDATE public.scheduled_deliveries
     SET paid_value = v_sum,
         remaining_value = GREATEST(total_value - v_sum, 0)
   WHERE id = _delivery_id;
END; $$;
REVOKE ALL ON FUNCTION public.recompute_delivery_paid(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_recompute_delivery_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_delivery_paid(OLD.delivery_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_delivery_paid(NEW.delivery_id);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_recompute_delivery_paid() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_delivery_payments_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_delivery_paid();

-- Assistências
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid REFERENCES public.scheduled_deliveries(id) ON DELETE SET NULL,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  customer_name text,
  product_name text NOT NULL,
  description text NOT NULL,
  photos text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'aberta',
  opened_by uuid NOT NULL,
  opened_by_name text,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_requests_status_idx ON public.service_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_requests_select ON public.service_requests FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico')
    OR opened_by = auth.uid()
  );
CREATE POLICY service_requests_insert ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico')
      OR (route_id IS NOT NULL AND public.is_route_courier(auth.uid(), route_id))
    )
  );
CREATE POLICY service_requests_update_staff ON public.service_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'logistico'));
CREATE POLICY service_requests_delete_admin ON public.service_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_service_requests_updated BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Entregador: ver e atualizar as entregas das suas rotas
DROP POLICY IF EXISTS deliveries_select_courier ON public.scheduled_deliveries;
CREATE POLICY deliveries_select_courier ON public.scheduled_deliveries FOR SELECT TO authenticated
  USING (public.is_route_courier(auth.uid(), route_id));
DROP POLICY IF EXISTS deliveries_update_courier ON public.scheduled_deliveries;
CREATE POLICY deliveries_update_courier ON public.scheduled_deliveries FOR UPDATE TO authenticated
  USING (public.is_route_courier(auth.uid(), route_id))
  WITH CHECK (public.is_route_courier(auth.uid(), route_id));
