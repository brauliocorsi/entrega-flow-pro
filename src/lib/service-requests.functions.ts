import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = ["aberta", "em_curso", "resolvida"] as const;

export const listServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: z.enum([...STATUSES, "todas"]).default("todas") })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("service_requests")
      .select("*, routes:route_id(route_date, zone)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "todas") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUSES),
        resolution_notes: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: data.status,
        resolution_notes: data.resolution_notes?.trim() || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: row } = await context.supabase
      .from("service_requests")
      .select("gc_os_id")
      .eq("id", data.id)
      .maybeSingle();

    let gcSync: { ok: boolean; error?: string } | null = null;
    if (row?.gc_os_id) {
      const { pushToGestaoClick } = await import("@/lib/service-orders.server");
      try {
        await pushToGestaoClick(context.supabase, data.id, "update");
        gcSync = { ok: true };
      } catch (e) {
        gcSync = { ok: false, error: e instanceof Error ? e.message : "Erro" };
      }
    }
    return { ok: true, gcSync };
  });

export const openServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, loadRequest, pushToGestaoClick } = await import(
      "@/lib/service-orders.server"
    );
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    const already = Boolean(row.gc_os_id);
    const result = await pushToGestaoClick(
      context.supabase,
      data.id,
      already ? "update" : "create",
    );
    return { ...result, already };
  });

export const syncServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, loadRequest, pushToGestaoClick } = await import(
      "@/lib/service-orders.server"
    );
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    if (!row.gc_os_id) throw new Error("Esta assistência ainda não tem OS no GestãoClick");
    return await pushToGestaoClick(context.supabase, data.id, "update");
  });
