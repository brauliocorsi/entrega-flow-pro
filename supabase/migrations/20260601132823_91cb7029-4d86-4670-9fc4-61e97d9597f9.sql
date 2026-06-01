-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');
CREATE TYPE public.route_status AS ENUM ('disponivel', 'quase_cheia', 'cheia', 'fechada', 'concluida');
CREATE TYPE public.delivery_type AS ENUM ('entrega', 'levantamento', 'recolha', 'troca');
CREATE TYPE public.delivery_status AS ENUM ('agendado', 'confirmado', 'entregue', 'cancelado', 'reagendado');
CREATE TYPE public.delivery_outcome AS ENUM ('entregue', 'nao_entregue', 'entregue_parcial');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  IF LOWER(NEW.email) = LOWER('brauliocorsi@upmoveis.pt') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ROUTE TEMPLATES ============
CREATE TABLE public.route_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  zone TEXT NOT NULL,
  zip_prefixes TEXT[] NOT NULL DEFAULT '{}',
  max_capacity_m3 NUMERIC(10,2) NOT NULL DEFAULT 20,
  default_driver TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.route_templates TO authenticated;
GRANT ALL ON public.route_templates TO service_role;
ALTER TABLE public.route_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select_all_auth" ON public.route_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_admin_manage" ON public.route_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.route_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROUTES ============
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.route_templates(id) ON DELETE SET NULL,
  route_date DATE NOT NULL,
  zone TEXT NOT NULL,
  zip_prefixes TEXT[] NOT NULL DEFAULT '{}',
  driver TEXT,
  max_capacity_m3 NUMERIC(10,2) NOT NULL DEFAULT 20,
  current_volume_m3 NUMERIC(10,2) NOT NULL DEFAULT 0,
  deliveries_count INTEGER NOT NULL DEFAULT 0,
  status route_status NOT NULL DEFAULT 'disponivel',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routes_date ON public.routes(route_date);
CREATE INDEX idx_routes_status ON public.routes(status);
GRANT SELECT ON public.routes TO authenticated;
GRANT INSERT, UPDATE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_select_all_auth" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "routes_admin_manage" ON public.routes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "routes_update_counters" ON public.routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SCHEDULED DELIVERIES ============
CREATE TABLE public.scheduled_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  address TEXT NOT NULL,
  zip_code TEXT,
  city TEXT,
  phone TEXT,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  volume_m3 NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_type delivery_type NOT NULL DEFAULT 'entrega',
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  status delivery_status NOT NULL DEFAULT 'agendado',
  seller_id UUID,
  seller_name TEXT,
  notes TEXT,
  outcome delivery_outcome,
  outcome_notes TEXT,
  outcome_at TIMESTAMPTZ,
  rescheduled_from_id UUID REFERENCES public.scheduled_deliveries(id) ON DELETE SET NULL,
  order_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deliveries_route ON public.scheduled_deliveries(route_id);
CREATE INDEX idx_deliveries_order ON public.scheduled_deliveries(order_number);
CREATE UNIQUE INDEX uniq_active_order_number ON public.scheduled_deliveries(order_number)
  WHERE status IN ('agendado', 'confirmado');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_deliveries TO authenticated;
GRANT ALL ON public.scheduled_deliveries TO service_role;
ALTER TABLE public.scheduled_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_select_all_auth" ON public.scheduled_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "deliveries_insert_auth" ON public.scheduled_deliveries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "deliveries_update_own_or_admin" ON public.scheduled_deliveries FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "deliveries_delete_admin" ON public.scheduled_deliveries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.scheduled_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROUTE COUNTERS TRIGGER ============
CREATE OR REPLACE FUNCTION public.recompute_route_counters(_route_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vol NUMERIC(10,2);
  v_count INTEGER;
  v_max NUMERIC(10,2);
  v_current_status route_status;
  v_pct NUMERIC;
BEGIN
  SELECT COALESCE(SUM(volume_m3), 0), COUNT(*)
    INTO v_vol, v_count
    FROM public.scheduled_deliveries
    WHERE route_id = _route_id AND status NOT IN ('cancelado', 'reagendado');

  SELECT max_capacity_m3, status INTO v_max, v_current_status FROM public.routes WHERE id = _route_id;
  IF v_max IS NULL THEN RETURN; END IF;

  v_pct := CASE WHEN v_max > 0 THEN v_vol / v_max ELSE 0 END;

  UPDATE public.routes
  SET current_volume_m3 = v_vol,
      deliveries_count = v_count,
      status = CASE
        WHEN v_current_status IN ('fechada', 'concluida') THEN v_current_status
        WHEN v_pct >= 1 THEN 'cheia'::route_status
        WHEN v_pct >= 0.8 THEN 'quase_cheia'::route_status
        ELSE 'disponivel'::route_status
      END
  WHERE id = _route_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_recompute_route_counters()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_route_counters(OLD.route_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_route_counters(NEW.route_id);
    IF TG_OP = 'UPDATE' AND OLD.route_id <> NEW.route_id THEN
      PERFORM public.recompute_route_counters(OLD.route_id);
    END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER trg_recompute_route_counters
  AFTER INSERT OR UPDATE OR DELETE ON public.scheduled_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_route_counters();

-- ============ REMAINING VALUE ============
CREATE OR REPLACE FUNCTION public.tg_compute_remaining()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.remaining_value := GREATEST(NEW.total_value - NEW.paid_value, 0);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_deliveries_remaining BEFORE INSERT OR UPDATE ON public.scheduled_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_compute_remaining();

-- ============ REALTIME ============
ALTER TABLE public.routes REPLICA IDENTITY FULL;
ALTER TABLE public.scheduled_deliveries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_deliveries;