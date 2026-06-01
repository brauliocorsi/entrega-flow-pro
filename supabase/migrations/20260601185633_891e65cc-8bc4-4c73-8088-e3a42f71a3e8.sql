ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS max_minutes integer NOT NULL DEFAULT 480;
ALTER TABLE public.route_templates ADD COLUMN IF NOT EXISTS max_minutes integer NOT NULL DEFAULT 480;