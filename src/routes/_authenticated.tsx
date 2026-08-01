import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/nav/AppShell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

/** Áreas permitidas ao perfil entregador (apenas o seu dia de trabalho). */
const COURIER_ALLOWED = ["/entregas"];

function AuthenticatedLayout() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || !user || role !== "entregador") return;
    const allowed = COURIER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!allowed) navigate({ to: "/entregas", replace: true });
  }, [loading, user, role, pathname, navigate]);


  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">A carregar…</div>
      </div>
    );
  }

  const courierBlocked =
    role === "entregador" &&
    !COURIER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <AppShell role={role} email={user.email ?? ""} onSignOut={() => signOut()}>
      {courierBlocked ? (
        <div className="p-6 text-sm text-muted-foreground">A redirecionar…</div>
      ) : (
        <Outlet />
      )}
    </AppShell>
  );

}
