
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_route_counters() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.sync_routes_color_on_template_update() FROM PUBLIC, authenticated, anon;
