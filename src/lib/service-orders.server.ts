/**
 * Helpers server-only para assistências ⇄ Ordens de Serviço do GestãoClick.
 */
import { createServiceOrder, updateServiceOrder } from "./gc-service-order.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "logistico");
  if (!ok) throw new Error("Sem permissões para abrir ordens de serviço");
}

export async function loadRequest(supabase: any, id: string) {
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
    const { data } = await supabaseAdmin.storage
      .from("assistencias")
      .createSignedUrls(paths, 60 * 60 * 24 * 365);
    return (data ?? []).map((d: any) => d.signedUrl).filter(Boolean);
  } catch {
    return [];
  }
}

export async function pushToGestaoClick(
  supabase: any,
  id: string,
  mode: "create" | "update",
) {
  const row = await loadRequest(supabase, id);
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
