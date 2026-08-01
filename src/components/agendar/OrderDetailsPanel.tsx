import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDatePT } from "@/lib/format";
import type { FetchOrderResult } from "@/lib/gestaoclick.functions";
import { situationTone } from "@/lib/situation-tone";
import {
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Package,
  Wrench,
  Truck,
  CalendarClock,
  AlertCircle,
} from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  produto: "Produto",
  montagem: "Montagem",
  entrega: "Entrega",
  servico: "Serviço",
};

const KIND_TONE: Record<string, string> = {
  produto: "bg-slate-100 text-slate-700 border-slate-200",
  montagem: "bg-violet-100 text-violet-800 border-violet-200",
  entrega: "bg-sky-100 text-sky-800 border-sky-200",
  servico: "bg-teal-100 text-teal-800 border-teal-200",
};

export function OrderDetailsPanel({
  result,
  loading,
}: {
  result?: FetchOrderResult | null;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">A carregar detalhes da encomenda…</div>;
  }
  if (!result) return null;
  if (result.error || !result.order) {
    return (
      <div className="p-4 text-sm text-destructive flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {result.error ?? "Sem dados"}
      </div>
    );
  }
  const o = result.order;
  const tone = situationTone(o.status);
  const produtos = o.items.filter((i) => i.kind === "produto");
  const servicos = o.items.filter((i) => i.kind !== "produto");
  const scheduledDate = result.existingActiveDelivery?.routes?.route_date ?? null;

  return (
    <div className="p-4 space-y-4 bg-muted/30 border-t">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`${tone.badge} font-medium`}>
          <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${tone.dot}`} />
          {o.status ?? "Sem situação"}
        </Badge>
        {o.has_assembly && (
          <Badge className="bg-violet-100 text-violet-800 border-violet-200">
            <Wrench className="h-3 w-3 mr-1" /> Montagem
          </Badge>
        )}
        {o.has_delivery_service && (
          <Badge className="bg-sky-100 text-sky-800 border-sky-200">
            <Truck className="h-3 w-3 mr-1" /> Entrega faturada
          </Badge>
        )}
        {scheduledDate && (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
            <CalendarClock className="h-3 w-3 mr-1" /> Entrega agendada: {formatDatePT(scheduledDate)}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cliente */}
        <div className="rounded-md border bg-background p-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <User className="h-4 w-4 text-muted-foreground" /> {o.customer_name}
          </div>
          {o.customer_document && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3 w-3" /> {o.customer_document}
            </div>
          )}
          {o.customer_email && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3 w-3" /> {o.customer_email}
            </div>
          )}
          {(o.mobile || o.phone) && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3" /> {[o.mobile, o.phone].filter(Boolean).join(" · ")}
            </div>
          )}
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              {o.address}
              {o.address_complement ? `, ${o.address_complement}` : ""}
              {o.neighborhood ? ` · ${o.neighborhood}` : ""}
              {o.zip_code ? ` · ${o.zip_code}` : ""}
              {o.city ? ` ${o.city}` : ""}
              {o.state ? ` (${o.state})` : ""}
            </span>
          </div>
        </div>

        {/* Valores e datas */}
        <div className="rounded-md border bg-background p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data da venda</span>
            <span>{o.date ? formatDatePT(o.date) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Data de entrega</span>
            <span>{scheduledDate ? formatDatePT(scheduledDate) : "Por agendar"}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5">
            <span className="text-muted-foreground">Total</span>
            <strong className="tabular-nums">{formatEUR(o.total_value)}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pago</span>
            <span className="tabular-nums text-emerald-700">{formatEUR(o.paid_value)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Por receber</span>
            <span className={`tabular-nums ${o.remaining_value > 0 ? "text-rose-600 font-semibold" : ""}`}>
              {formatEUR(o.remaining_value)}
            </span>
          </div>
          {o.shipping > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frete</span>
              <span className="tabular-nums">{formatEUR(o.shipping)}</span>
            </div>
          )}
          {o.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums">{formatEUR(o.discount)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Produtos */}
      <div className="rounded-md border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" /> Produtos ({produtos.length})
        </div>
        {produtos.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">Sem produtos.</div>
        ) : (
          <ul className="divide-y">
            {produtos.map((i, idx) => (
              <li key={idx} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="flex-1">{i.description}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  {i.quantity} × {formatEUR(i.price)}
                </span>
                <strong className="tabular-nums whitespace-nowrap">{formatEUR(i.total)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Serviços */}
      {servicos.length > 0 && (
        <div className="rounded-md border bg-background overflow-hidden">
          <div className="px-3 py-2 border-b text-sm font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" /> Serviços de entrega e montagem
          </div>
          <ul className="divide-y">
            {servicos.map((i, idx) => (
              <li key={idx} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="flex-1 flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${KIND_TONE[i.kind] ?? ""}`}>
                    {KIND_LABEL[i.kind] ?? i.kind}
                  </Badge>
                  {i.description}
                </span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  {i.quantity} × {formatEUR(i.price)}
                </span>
                <strong className="tabular-nums whitespace-nowrap">{formatEUR(i.total)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {o.observations && (
        <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap">
          <div className="font-medium mb-1">Observações</div>
          <span className="text-muted-foreground">{o.observations}</span>
        </div>
      )}
    </div>
  );
}
