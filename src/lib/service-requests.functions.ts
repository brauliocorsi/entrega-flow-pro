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

    // Se já existe OS no GestãoClick, propaga estado e notas de resolução.
    const { data: row } = await context.supabase
      .from("service_requests")
      .select("gc_os_id")
      .eq("id", data.id)
      .maybeSingle();
    let gcSync: { ok: boolean; error?: string } | null = null;
    if (row?.gc_os_id) {
      try {
        await pushToGestaoClick(context.supabase, data.id, "update");
        gcSync = { ok: true };
      } catch (e) {
        gcSync = { ok: false, error: e instanceof Error ? e.message : "Erro" };
      }
    }
    return { ok: true, gcSync };
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "logistico");
  if (!ok) throw new Error("Sem permissões para abrir ordens de serviço");
}

async function loadRequest(supabase: any, id: string) {
  const { data: row, error } = await supabase
    .from("service_requests")
    .select("*, routes:route_id(route_date, zone)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Assistência não encontrada");
  return row;
}

async function signPhotos(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage
      .from("assistencias")
      .createSignedUrls(paths, 60 * 60 * 24 * 365);
    return (data ?? []).map((d: any) => d.signedUrl).filter(Boolean);
  } catch {
    return [];
  }
}

async function pushToGestaoClick(supabase: any, id: string, mode: "create" | "update") {
  const row = await loadRequest(supabase, id);
  const { createServiceOrder, updateServiceOrder } = await import("@/lib/gc-service-order.server");
  const input = {
    order_number: String(row.order_number ?? ""),
    customer_name: row.customer_name ?? null,
    product_name: String(row.product_name ?? "Produto"),
    description: String(row.description ?? ""),
    opened_by_name: row.opened_by_name ?? null,
    created_at: row.created_at as string,
    route_zone: row.routes?.zone ?? null,
    route_date: row.routes?.route_date ?? null,
    photo_urls: await signPhotos(Array.isArray(row.photos) ? row.photos : []),
    resolution_notes: row.resolution_notes ?? null,
    status: row.status as "aberta" | "em_curso" | "resolvida",
    gc_client_id: row.gc_client_id ?? null,
  };

  try {
    const result =
      mode === "update" && row.gc_os_id
        ? await updateServiceOrder(String(row.gc_os_id), input)
        : await createServiceOrder(input);
    await supabase
      .from("service_requests")
      .update({
        gc_os_id: result.gc_os_id,
        gc_os_number: result.gc_os_number ?? row.gc_os_number ?? null,
        gc_client_id: result.gc_client_id,
        gc_sync_status: "sincronizada",
        gc_sync_error: null,
        gc_synced_at: new Date().toISOString(),
      })
      .eq("id", id);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao comunicar com o GestãoClick";
    await supabase
      .from("service_requests")
      .update({ gc_sync_status: "erro", gc_sync_error: message })
      .eq("id", id);
    throw new Error(message);
  }
}

export const openServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    if (row.gc_os_id) {
      // Idempotente: não duplica OS, apenas atualiza a existente.
      const r = await pushToGestaoClick(context.supabase, data.id, "update");
      return { ...r, already: true };
    }
    const r = await pushToGestaoClick(context.supabase, data.id, "create");
    return { ...r, already: false };
  });

export const syncServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    if (!row.gc_os_id) throw new Error("Esta assistência ainda não tem OS no GestãoClick");
    return await pushToGestaoClick(context.supabase, data.id, "update");
  });
