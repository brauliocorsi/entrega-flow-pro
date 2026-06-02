import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { listImportedPurchases } from "@/lib/purchases.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDatePT } from "@/lib/format";
import { Camera, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/compras/")({
  component: ComprasListPage,
});

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  enviada_parcial: "Enviada (com aviso)",
  erro: "Erro",
};

function ComprasListPage() {
  const listFn = useServerFn(listImportedPurchases);
  const { data = [], isLoading } = useQuery(
    queryOptions({
      queryKey: ["imported-purchases"],
      queryFn: () => listFn(),
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Tira uma foto da fatura e a IA cria a compra no GestãoClick.
          </p>
        </div>
        <Button asChild>
          <Link to="/compras/nova">
            <Camera className="h-4 w-4 mr-2" />
            Nova compra por foto
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm">A carregar…</div>
        ) : data.length === 0 ? (
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Ainda não importaste nenhuma fatura.
          </div>
        ) : (
          <div className="divide-y">
            {data.map((p: any) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {p.supplier_name ?? "—"}{" "}
                    {p.gestaoclick_invoice_number && (
                      <span className="text-muted-foreground font-normal">
                        · Fatura {p.gestaoclick_invoice_number}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDatePT(p.created_at)} · {formatEUR(Number(p.total_value ?? 0))}
                    {p.error_message ? ` · ${p.error_message}` : ""}
                  </div>
                </div>
                <Badge
                  variant={
                    p.status === "enviada"
                      ? "default"
                      : p.status === "erro"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
