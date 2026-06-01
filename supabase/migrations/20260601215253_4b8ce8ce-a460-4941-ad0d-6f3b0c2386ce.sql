
UPDATE public.routes r
SET color = t.color
FROM public.route_templates t
WHERE r.template_id = t.id AND r.color IS DISTINCT FROM t.color;

CREATE OR REPLACE FUNCTION public.sync_routes_color_on_template_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.color IS DISTINCT FROM OLD.color THEN
    UPDATE public.routes SET color = NEW.color WHERE template_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_routes_color ON public.route_templates;
CREATE TRIGGER trg_sync_routes_color
AFTER UPDATE OF color ON public.route_templates
FOR EACH ROW EXECUTE FUNCTION public.sync_routes_color_on_template_update();
