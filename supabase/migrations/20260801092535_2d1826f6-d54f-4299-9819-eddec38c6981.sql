DROP POLICY IF EXISTS forecasts_select_auth ON public.route_payment_forecasts;
CREATE POLICY forecasts_select_admin_logistico
ON public.route_payment_forecasts
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistico'::app_role));

DROP POLICY IF EXISTS deliveries_insert_auth ON public.scheduled_deliveries;
CREATE POLICY deliveries_insert_own_or_staff
ON public.scheduled_deliveries
FOR INSERT TO authenticated
WITH CHECK (
  seller_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'logistico'::app_role)
);

DROP POLICY IF EXISTS realtime_authenticated_admin_logistico ON realtime.messages;
CREATE POLICY realtime_authenticated_admin_logistico
ON realtime.messages
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistico'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logistico'::app_role));