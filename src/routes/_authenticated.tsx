import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Truck,
  Calendar,
  Plus,
  Settings,
  LogOut,
  Calculator,
  Users,
  Sparkles,
  ChevronDown,
  LayoutTemplate,
  Car,
  ShoppingCart,
  FileSpreadsheet,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const SETTINGS_PATHS = [
  "/admin/templates",
  "/admin/taxas",
  "/admin/utilizadores",
  "/admin/veiculos",
  "/admin/equipa",
];

function AuthenticatedLayout() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">A carregar…</div>
      </div>
    );
  }

  const isActive = (p: string) => path === p || path.startsWith(p + "/");
  const settingsActive = SETTINGS_PATHS.some((p) => isActive(p));

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2 sm:gap-4">
          <Link to="/rotas" className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Truck className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">UP Agenda</span>
          </Link>
          <nav className="flex items-center gap-1 ml-2 flex-1 overflow-x-auto">
            <NavLink to="/rotas" active={isActive("/rotas")} icon={<Calendar className="h-4 w-4" />} label="Rotas" />
            <NavLink to="/agendar" active={isActive("/agendar")} icon={<Plus className="h-4 w-4" />} label="Agendar" />
            <NavLink to="/conferencia" active={isActive("/conferencia")} icon={<Calculator className="h-4 w-4" />} label="Conferência" />
            {(role === "admin" || role === "logistico") && (
              <NavLink to="/compras" active={isActive("/compras")} icon={<ShoppingCart className="h-4 w-4" />} label="Compras" />
            )}

            {(role === "admin" || role === "logistico") && (
              <NavLink to="/admin/otimizacao" active={isActive("/admin/otimizacao")} icon={<Sparkles className="h-4 w-4" />} label="Otimização" />
            )}
            {role === "admin" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      settingsActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Configurações</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Operação</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/templates"><LayoutTemplate className="h-4 w-4 mr-2" /> Templates de rota</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/veiculos"><Car className="h-4 w-4 mr-2" /> Veículos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/equipa"><Users className="h-4 w-4 mr-2" /> Equipa (motoristas)</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Comercial</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/taxas"><Calculator className="h-4 w-4 mr-2" /> Taxas de entrega</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Acessos</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/utilizadores"><Users className="h-4 w-4 mr-2" /> Utilizadores</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Dados</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/exportar"><FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar para Sheets</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
          <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={() => signOut()} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, active, icon, label }: { to: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
