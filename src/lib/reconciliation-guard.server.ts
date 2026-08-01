/** Guardas e heurísticas de conciliação (apenas servidor). */

export function isCashMethod(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase().includes("dinheiro");
}

export async function requireManager(ctx: any) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("logistico")) {
    throw new Error("Sem permissão para gerir a conciliação bancária");
  }
  return roles;
}

export async function displayName(ctx: any): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.display_name ?? data?.email ?? null;
}

function daysBetween(a: string | null, b: string | null) {
  if (!a || !b) return 99;
  const d = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(d / 86400000);
}

export type Suggestion = {
  payment_id: string;
  confidence: "alta" | "media" | "baixa";
  score: number;
  reason: string;
};

/** Sugere recebimentos compatíveis com um movimento bancário. Nunca concilia sozinho. */
export function suggest(tx: any, payments: any[]): Suggestion[] {
  const txAmount = Math.round(Number(tx.amount) * 100) / 100;
  const desc = String(tx.description ?? "").toLowerCase();
  const out: Suggestion[] = [];

  for (const p of payments) {
    if (p.reconciled_at || p.bank_transaction_id) continue;
    const amount = Math.round(Number(p.amount) * 100) / 100;
    if (Math.abs(amount - txAmount) > 0.01) continue;

    const dayDiff = daysBetween(tx.tx_date, String(p.created_at ?? "").slice(0, 10));
    const reasons: string[] = ["valor exato"];
    let score = 50;

    if (dayDiff <= 1) {
      score += 25;
      reasons.push("mesma data");
    } else if (dayDiff <= 3) {
      score += 15;
      reasons.push(`${dayDiff} dia(s) de diferença`);
    } else if (dayDiff <= 7) {
      score += 5;
    }

    if (tx.method && String(p.method_name ?? "").toLowerCase().includes(String(tx.method).toLowerCase().split(" ")[0]!)) {
      score += 10;
      reasons.push("mesmo método");
    }
    if (p.order_number && desc.includes(String(p.order_number).toLowerCase())) {
      score += 20;
      reasons.push("nº de encomenda na descrição");
    }
    const firstName = String(p.customer_name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
    if (firstName && firstName.length > 3 && desc.includes(firstName)) {
      score += 10;
      reasons.push("nome do cliente");
    }

    out.push({
      payment_id: p.id,
      score,
      confidence: score >= 80 ? "alta" : score >= 60 ? "media" : "baixa",
      reason: reasons.join(" · "),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}
