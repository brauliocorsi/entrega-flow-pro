export const WAREHOUSE_ADDRESS = "Rua Industrial, 5, Modelos, Paços de Ferreira";
export const ADMIN_EMAIL = "brauliocorsi@upmoveis.pt";

export const WEEKDAYS_PT = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  entrega: "Entrega",
  levantamento: "Levantamento",
  recolha: "Recolha",
  troca: "Troca",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  reagendado: "Reagendado",
};

export const ROUTE_STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  quase_cheia: "Quase cheia",
  cheia: "Cheia",
  fechada: "Fechada",
  concluida: "Concluída",
};

export const ROUTE_STATUS_TONE: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-800 border-emerald-200",
  quase_cheia: "bg-amber-100 text-amber-800 border-amber-200",
  cheia: "bg-rose-100 text-rose-800 border-rose-200",
  fechada: "bg-slate-200 text-slate-700 border-slate-300",
  concluida: "bg-sky-100 text-sky-800 border-sky-200",
};
