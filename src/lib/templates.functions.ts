import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  weekday: z.number().int().min(0).max(6),
  zone: z.string().min(1).max(100),
  zip_prefixes: z.array(z.string().min(1).max(8)).max(50),
  max_capacity_m3: z.number().min(1).max(200),
  max_minutes: z.number().int().min(1).max(1440).default(480),
  default_driver: z.string().max(100).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("route_templates")
      .select("*")
      .order("weekday", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem alterar templates");

    if (data.id) {
      const { error } = await context.supabase
        .from("route_templates")
        .update({
          name: data.name,
          weekday: data.weekday,
          zone: data.zone,
          zip_prefixes: data.zip_prefixes,
          max_capacity_m3: data.max_capacity_m3,
          max_minutes: data.max_minutes,
          default_driver: data.default_driver ?? null,
          active: data.active,
          notes: data.notes ?? null,
          color: data.color,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("route_templates")
      .insert({
        name: data.name,
        weekday: data.weekday,
        zone: data.zone,
        zip_prefixes: data.zip_prefixes,
        max_capacity_m3: data.max_capacity_m3,
        max_minutes: data.max_minutes,
        default_driver: data.default_driver ?? null,
        active: data.active,
        notes: data.notes ?? null,
        color: data.color,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("route_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Generate concrete routes for the next N weeks from active templates. Idempotent. */
export const generateRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ weeks: z.number().int().min(1).max(12).default(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem gerar rotas");

    return await generateRoutesShared(context.supabase, data.weeks);
  });

export async function generateRoutesShared(supabase: any, weeks: number) {
  const { data: templates, error: tErr } = await supabase
    .from("route_templates")
    .select("*")
    .eq("active", true);
  if (tErr) throw new Error(tErr.message);
  if (!templates || templates.length === 0) return { created: 0, skipped: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + weeks * 7);

  let created = 0;
  let skipped = 0;

  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    for (const t of templates) {
      if (t.weekday !== wd) continue;
      const { data: existing } = await supabase
        .from("routes")
        .select("id")
        .eq("template_id", t.id)
        .eq("route_date", dateStr)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      const { error: insErr } = await supabase.from("routes").insert({
        template_id: t.id,
        route_date: dateStr,
        zone: t.zone,
        zip_prefixes: t.zip_prefixes,
        driver: t.default_driver,
        max_capacity_m3: t.max_capacity_m3,
        max_minutes: t.max_minutes ?? 480,
        color: t.color ?? "#3b82f6",
      });
      if (!insErr) created++;
    }
  }
  return { created, skipped };
}
