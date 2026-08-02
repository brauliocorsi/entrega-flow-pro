/** Regras de bloqueio de rota: depois de "Iniciar rota" nada pode ser alterado. */

export async function getUserDisplayName(ctx: any): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.display_name ?? data?.email ?? null;
}

export async function getUserRoles(ctx: any): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: any) => String(r.role));
}

/** Lança erro se a rota já foi iniciada (bloqueada para todos os perfis). */
export async function assertRouteUnlocked(ctx: any, routeId: string | null | undefined) {
  if (!routeId) return;
  const { data: route } = await ctx.supabase
    .from("routes")
    .select("id, started_at")
    .eq("id", routeId)
    .maybeSingle();
  if (route?.started_at) {
    throw new Error(
      "Rota iniciada — está bloqueada a alterações. Um administrador pode desbloqueá-la.",
    );
  }
}
