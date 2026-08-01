import {
  Calendar,
  Plus,
  Calculator,
  Sparkles,
  LayoutTemplate,
  Car,
  Users,
  FileSpreadsheet,
  UserCog,
  Truck,
  Wrench,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "logistico" | "vendedor" | "entregador" | string | null | undefined;

type AllowedRole = "admin" | "logistico" | "entregador";

export type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  roles?: AllowedRole[];
  group: "principal" | "operacao" | "comercial" | "acessos" | "dados";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/entregas", label: "O meu dia", short: "Hoje", icon: Truck, group: "principal", roles: ["entregador", "admin", "logistico"] },
  { to: "/rotas", label: "Rotas", icon: Calendar, group: "principal" },
  { to: "/agendar", label: "Agendar", icon: Plus, group: "principal" },
  { to: "/conferencia", label: "Conferência", short: "Conf.", icon: Calculator, group: "principal" },
  { to: "/admin/otimizacao", label: "Otimização", short: "Otim.", icon: Sparkles, group: "principal", roles: ["admin", "logistico"] },

  { to: "/admin/assistencias", label: "Assistências", short: "Assist.", icon: Wrench, group: "operacao", roles: ["admin", "logistico"] },
  { to: "/admin/templates", label: "Templates de rota", icon: LayoutTemplate, group: "operacao", roles: ["admin"] },
  { to: "/admin/veiculos", label: "Veículos", icon: Car, group: "operacao", roles: ["admin"] },
  { to: "/admin/equipa", label: "Equipa (motoristas)", icon: Users, group: "operacao", roles: ["admin"] },

  { to: "/admin/taxas", label: "Taxas de entrega", icon: Calculator, group: "comercial", roles: ["admin"] },
  { to: "/admin/pagamentos", label: "Formas de pagamento", short: "Pagam.", icon: Wallet, group: "comercial", roles: ["admin"] },

  { to: "/admin/utilizadores", label: "Utilizadores", icon: UserCog, group: "acessos", roles: ["admin"] },

  { to: "/admin/exportar", label: "Exportar dados", icon: FileSpreadsheet, group: "dados", roles: ["admin"] },
];

export const GROUP_LABEL: Record<NavItem["group"], string> = {
  principal: "Principal",
  operacao: "Operação",
  comercial: "Comercial",
  acessos: "Acessos",
  dados: "Dados",
};

export function canSee(item: NavItem, role: Role) {
  // O entregador tem uma app reduzida: apenas o que estiver marcado para ele.
  if (role === "entregador") return !!item.roles && item.roles.includes("entregador");
  if (!item.roles) return true;
  return !!role && (item.roles as string[]).includes(role);
}

export function visibleItems(role: Role) {
  return NAV_ITEMS.filter((i) => canSee(i, role));
}

export function pageTitle(path: string): string {
  const match = NAV_ITEMS.filter((i) => path === i.to || path.startsWith(i.to + "/")).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  if (match) return match.label;
  if (path.startsWith("/compras")) return "Compras";
  return "UP Agenda";
}
