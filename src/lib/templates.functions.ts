import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  weekday: z.number().int().min(0).max(6),
  zone: z.string().min(1).max(100),
  // Aceita prefixos ("4000"), CPs exactos ("4150-123") e intervalos ("1000-1999").
  zip_prefixes: z
    .array(
      z
        .string()
        .min(1)
        .max(16)
        .regex(/^[0-9]{1,4}(-[0-9]{1,4})?$/, "Use prefixo (4000), CP4 ou intervalo (1000-1999)"),
    )
    .max(50),
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

/** Generate concrete routes from active templates. Idempotent. */
export const generateRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        weeks: z.number().int().min(1).max(52).default(4),
        templateIds: z.array(z.string().uuid()).optional(),
        frequency: z.enum(["weekly", "biweekly", "monthly"]).default("weekly"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem gerar rotas");

    return await generateRoutesShared(context.supabase, data.weeks, {
      templateIds: data.templateIds,
      frequency: data.frequency,
      endDate: data.endDate,
    });
  });

type GenerateOpts = {
  templateIds?: string[];
  frequency?: "weekly" | "biweekly" | "monthly";
  endDate?: string;
};

export async function generateRoutesShared(supabase: any, weeks: number, opts: GenerateOpts = {}) {
  let tq = supabase.from("route_templates").select("*").eq("active", true);
  if (opts.templateIds && opts.templateIds.length > 0) tq = tq.in("id", opts.templateIds);
  const { data: templates, error: tErr } = await tq;
  if (tErr) throw new Error(tErr.message);
  if (!templates || templates.length === 0) return { created: 0, skipped: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let end: Date;
  if (opts.endDate) {
    const [y, m, d] = opts.endDate.split("-").map(Number);
    end = new Date(y, m - 1, d);
  } else {
    end = new Date(today);
    end.setDate(end.getDate() + weeks * 7);
  }

  const freq = opts.frequency ?? "weekly";
  // Track per-template occurrence count for biweekly/monthly spacing
  const lastByTemplate = new Map<string, Date>();

  let created = 0;
  let skipped = 0;

  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const t of templates) {
      if (t.weekday !== wd) continue;

      if (freq !== "weekly") {
        const last = lastByTemplate.get(t.id);
        if (last) {
          const diffDays = Math.round((d.getTime() - last.getTime()) / 86400000);
          if (freq === "biweekly" && diffDays < 14) continue;
          if (freq === "monthly" && diffDays < 28) continue;
        }
      }

      const { data: existing } = await supabase
        .from("routes")
        .select("id")
        .eq("template_id", t.id)
        .eq("route_date", dateStr)
        .maybeSingle();
      if (existing) {
        skipped++;
        lastByTemplate.set(t.id, new Date(d));
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
      if (!insErr) {
        created++;
        lastByTemplate.set(t.id, new Date(d));
      }
    }
  }
  return { created, skipped };
}

/** Create a single route for a specific template on a specific date. */
export const createRouteForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem criar rotas");

    const { data: t, error: tErr } = await context.supabase
      .from("route_templates")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!t) throw new Error("Template não encontrado");

    const { data: existing } = await context.supabase
      .from("routes")
      .select("id")
      .eq("template_id", t.id)
      .eq("route_date", data.date)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma rota deste template nesta data");

    const { data: ins, error } = await context.supabase
      .from("routes")
      .insert({
        template_id: t.id,
        route_date: data.date,
        zone: t.zone,
        zip_prefixes: t.zip_prefixes,
        driver: t.default_driver,
        max_capacity_m3: t.max_capacity_m3,
        max_minutes: t.max_minutes ?? 480,
        color: t.color ?? "#3b82f6",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

/** Bulk delete future routes filtered by weekday, template, and/or date range. Only routes with zero active deliveries are deleted. */
export const bulkDeleteRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
        templateIds: z.array(z.string().uuid()).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dryRun: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem eliminar rotas");

    const fromDate = data.from ?? new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("routes")
      .select("id, route_date, template_id")
      .gte("route_date", fromDate);
    if (data.to) q = q.lte("route_date", data.to);
    if (data.templateIds && data.templateIds.length > 0)
      q = q.in("template_id", data.templateIds);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const wdSet =
      data.weekdays && data.weekdays.length > 0 ? new Set(data.weekdays) : null;
    const candidates = (rows ?? []).filter((r: any) => {
      if (!wdSet) return true;
      const [y, m, dd] = r.route_date.split("-").map(Number);
      const wd = new Date(y, m - 1, dd).getDay();
      return wdSet.has(wd);
    });

    if (candidates.length === 0)
      return { deleted: 0, blocked: 0, candidates: 0, willDelete: 0 };

    const ids = candidates.map((c: any) => c.id);
    const { data: deliveries } = await context.supabase
      .from("scheduled_deliveries")
      .select("route_id, status")
      .in("route_id", ids);
    const busy = new Set(
      (deliveries ?? [])
        .filter((d: any) => !["cancelado", "reagendado"].includes(d.status))
        .map((d: any) => d.route_id),
    );
    const deletable = candidates.filter((c: any) => !busy.has(c.id));

    if (data.dryRun) {
      return {
        deleted: 0,
        blocked: busy.size,
        candidates: candidates.length,
        willDelete: deletable.length,
      };
    }
    if (deletable.length === 0)
      return { deleted: 0, blocked: busy.size, candidates: candidates.length, willDelete: 0 };

    const { error: dErr } = await context.supabase
      .from("routes")
      .delete()
      .in(
        "id",
        deletable.map((d: any) => d.id),
      );
    if (dErr) throw new Error(dErr.message);
    return {
      deleted: deletable.length,
      blocked: busy.size,
      candidates: candidates.length,
      willDelete: deletable.length,
    };
  });
