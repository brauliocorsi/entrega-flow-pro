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
  PackageCheck,
  ReceiptText,

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
  group: "dia" | "rotas" | "agendamentos" | "financeiro" | "config";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/entregas", label: "O meu dia", short: "Hoje", icon: Truck, group: "dia", roles: ["entregador", "admin", "logistico"] },
  { to: "/entregas/caixa", label: "Caixa", short: "Caixa", icon: Wallet, group: "dia", roles: ["entregador", "admin", "logistico"] },
  { to: "/entregas/envelopes", label: "Envelopes", short: "Envel.", icon: PackageCheck, group: "dia", roles: ["entregador", "admin", "logistico"] },

  { to: "/rotas", label: "Rotas", icon: Calendar, group: "rotas" },
  { to: "/agendar", label: "Agendar", icon: Plus, group: "agendamentos" },
  { to: "/conferencia", label: "Conferência", short: "Conf.", icon: Calculator, group: "financeiro" },
  { to: "/admin/relatorios/caixa", label: "Relatório de caixa", short: "Relat.", icon: ReceiptText, group: "financeiro", roles: ["admin", "logistico"] },
  { to: "/admin/otimizacao", label: "Otimização", short: "Otim.", icon: Sparkles, group: "rotas", roles: ["admin", "logistico"] },

  { to: "/admin/assistencias", label: "Assistências", short: "Assist.", icon: Wrench, group: "agendamentos", roles: ["admin", "logistico"] },
  { to: "/admin/templates", label: "Templates de rota", icon: LayoutTemplate, group: "rotas", roles: ["admin"] },
  { to: "/admin/veiculos", label: "Veículos", icon: Car, group: "config", roles: ["admin"] },
  { to: "/admin/equipa", label: "Equipa (motoristas)", icon: Users, group: "config", roles: ["admin"] },

  { to: "/admin/taxas", label: "Taxas de entrega", icon: Calculator, group: "financeiro", roles: ["admin"] },
  { to: "/admin/pagamentos", label: "Formas de pagamento", short: "Pagam.", icon: Wallet, group: "financeiro", roles: ["admin"] },

  { to: "/admin/utilizadores", label: "Utilizadores", icon: UserCog, group: "config", roles: ["admin"] },

  { to: "/admin/exportar", label: "Exportar dados", icon: FileSpreadsheet, group: "config", roles: ["admin"] },
];

export const GROUP_ORDER: NavItem["group"][] = [
  "dia",
  "rotas",
  "agendamentos",
  "financeiro",
  "config",
];

export const GROUP_LABEL: Record<NavItem["group"], string> = {
  dia: "Dia a dia",
  rotas: "Rotas",
  agendamentos: "Agendamentos",
  financeiro: "Financeiro",
  config: "Configurações",
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

/** Itens principais da barra inferior no mobile (o "+" de agendar é fixo). */
const MOBILE_TAB_ORDER = ["/entregas", "/rotas", "/conferencia", "/entregas/caixa"];

export function mobileTabs(role: Role) {
  const items = visibleItems(role);
  return MOBILE_TAB_ORDER.map((to) => items.find((i) => i.to === to))
    .filter((i): i is NavItem => !!i)
    .slice(0, 3);
}
