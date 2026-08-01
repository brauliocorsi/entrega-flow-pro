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
  type LucideIcon,
} from "lucide-react";

export type Role = "admin" | "logistico" | "vendedor" | string | null | undefined;

export type NavItem = {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  roles?: Array<"admin" | "logistico">;
  group: "principal" | "operacao" | "comercial" | "acessos" | "dados";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/rotas", label: "Rotas", icon: Calendar, group: "principal" },
  { to: "/agendar", label: "Agendar", icon: Plus, group: "principal" },
  { to: "/conferencia", label: "Conferência", short: "Conf.", icon: Calculator, group: "principal" },
  { to: "/admin/otimizacao", label: "Otimização", short: "Otim.", icon: Sparkles, group: "principal", roles: ["admin", "logistico"] },

  { to: "/admin/templates", label: "Templates de rota", icon: LayoutTemplate, group: "operacao", roles: ["admin"] },
  { to: "/admin/veiculos", label: "Veículos", icon: Car, group: "operacao", roles: ["admin"] },
  { to: "/admin/equipa", label: "Equipa (motoristas)", icon: Users, group: "operacao", roles: ["admin"] },

  { to: "/admin/taxas", label: "Taxas de entrega", icon: Calculator, group: "comercial", roles: ["admin"] },

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
