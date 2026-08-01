DROP POLICY IF EXISTS routes_select_all_auth ON public.routes;
CREATE POLICY routes_select_all_auth ON public.routes
FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'entregador')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'logistico')
  OR public.is_route_courier(auth.uid(), id)
);