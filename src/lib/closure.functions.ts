import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeDeliveryTotals } from "@/lib/delivery-totals";

const Input = z.object({
  routeId: z.string().uuid(),
  deliveryIds: z.array(z.string().uuid()).optional(),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Envia o fecho das entregas de uma rota para o GestãoClick (situação, pagamentos e observações). */
export const syncClosureToGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("logistico")) {
      throw new Error("Apenas administradores ou logística podem sincronizar o fecho");
    }

    const { CLOSURE_SITUACAO_LABEL, buildClosureObservations, updateGestaoClickVendaClosure } =
      await import("@/lib/gc-closure.server");

    let query = context.supabase
      .from("scheduled_deliveries")
      .select(
        "id, order_number, customer_name, outcome, outcome_notes, partial_items, total_value, paid_value, order_payload",
      )
      .eq("route_id", data.routeId);
    if (data.deliveryIds?.length) query = query.in("id", data.deliveryIds);
    const { data: deliveries, error } = await query;
    if (error) throw new Error(error.message);

    const { data: payments } = await context.supabase
      .from("delivery_payments")
      .select("delivery_id, method_name, amount, created_at")
      .eq("route_id", data.routeId);

    const results: Array<{
      delivery_id: string;
      order_number: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const d of deliveries ?? []) {
      const outcome = (d.outcome ?? "entregue") as keyof typeof CLOSURE_SITUACAO_LABEL;
      const label = CLOSURE_SITUACAO_LABEL[outcome] ?? CLOSURE_SITUACAO_LABEL.entregue;
      const ps = (payments ?? [])
        .filter((p: any) => p.delivery_id === d.id)
        .map((p: any) => ({
          method_name: p.method_name,
          amount: Number(p.amount),
          created_at: p.created_at,
        }));
      const realized = round2(ps.reduce((a, p) => a + p.amount, 0));
      const totals = computeDeliveryTotals(d);
      const forecast = round2(Math.max(totals.totalValue - (totals.paidValue - realized), 0));

      const vendaId =
        (d.order_payload as any)?.internal_id ?? (d.order_payload as any)?.id ?? null;

      if (!vendaId) {
        results.push({
          delivery_id: d.id,
          order_number: d.order_number,
          ok: false,
          error: "Sem ID da venda no GestãoClick",
        });
        await context.supabase
          .from("scheduled_deliveries")
          .update({ gc_sync_status: "erro", gc_sync_error: "Sem ID da venda no GestãoClick" })
          .eq("id", d.id);
        continue;
      }

      const observacoes = buildClosureObservations({
        outcome: outcome as any,
        payments: ps,
        forecast,
        realized,
        justification: d.outcome_notes,
        partialItems: (d.partial_items as any) ?? null,
      });

      const res = await updateGestaoClickVendaClosure({
        vendaId: String(vendaId),
        situacaoLabel: label,
        payments: ps,
        observacoes,
      });

      await context.supabase
        .from("scheduled_deliveries")
        .update({
          gc_sync_status: res.ok ? "enviado" : "erro",
          gc_sync_error: res.ok ? null : (res.error ?? "Erro desconhecido"),
          gc_synced_at: res.ok ? new Date().toISOString() : null,
        })
        .eq("id", d.id);

      results.push({
        delivery_id: d.id,
        order_number: d.order_number,
        ok: res.ok,
        ...(res.error ? { error: res.error } : {}),
      });
    }

    return {
      results,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  });
