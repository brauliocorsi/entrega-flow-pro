import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listServiceRequests, updateServiceRequest } from "@/lib/service-requests.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTimePT, formatDatePT } from "@/lib/format";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/assistencias")({
  head: () => ({
    meta: [
      { title: "Assistências — UP Agenda" },
      { name: "description", content: "Fila de assistências abertas pelos entregadores." },
    ],
  }),
  component: ServiceRequestsPage,
});

const STATUS_TONE: Record<string, string> = {
  aberta: "bg-rose-100 text-rose-800 border-rose-200",
  em_curso: "bg-amber-100 text-amber-800 border-amber-200",
  resolvida: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_curso: "Em curso",
  resolvida: "Resolvida",
};

function ServiceRequestsPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listServiceRequests);
  const updateFn = useServerFn(updateServiceRequest);
  const [tab, setTab] = useState<"aberta" | "em_curso" | "resolvida" | "todas">("aberta");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const allowed = role === "admin" || role === "logistico";
  const { data = [], isLoading } = useQuery({
    queryKey: ["service-requests", tab],
    queryFn: () => listFn({ data: { status: tab } }),
    enabled: !loading && allowed,
  });

  if (!loading && !allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem permissões</CardTitle>
          <CardDescription>Apenas administração e logística acedem às assistências.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function setStatus(id: string, status: "aberta" | "em_curso" | "resolvida") {
    try {
      await updateFn({ data: { id, status, resolution_notes: notes[id] ?? null } });
      toast.success("Assistência atualizada");
      qc.invalidateQueries({ queryKey: ["service-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-6 w-6" /> Assistências
        </h1>
        <p className="text-sm text-muted-foreground">
          Produtos com defeito reportados durante as entregas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="aberta">Abertas</TabsTrigger>
          <TabsTrigger value="em_curso">Em curso</TabsTrigger>
          <TabsTrigger value="resolvida">Resolvidas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem assistências.</Card>
      ) : (
        <div className="grid gap-2">
          {data.map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      #{s.order_number} · {s.customer_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.product_name} · aberta por {s.opened_by_name ?? "—"} em{" "}
                      {formatDateTimePT(s.created_at)}
                      {s.routes?.route_date
                        ? ` · rota ${s.routes.zone} (${formatDatePT(s.routes.route_date)})`
                        : ""}
                    </div>
                  </div>
                  <Badge className={STATUS_TONE[s.status]}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </div>
                <p className="text-sm bg-muted rounded-md p-2">{s.description}</p>
                {Array.isArray(s.photos) && s.photos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {s.photos.length} foto(s) anexada(s)
                  </p>
                )}
                {s.status !== "resolvida" && (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Notas de resolução"
                      value={notes[s.id] ?? s.resolution_notes ?? ""}
                      onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                    />
                    <div className="flex gap-2">
                      {s.status === "aberta" && (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(s.id, "em_curso")}>
                          Em curso
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setStatus(s.id, "resolvida")}>
                        Marcar resolvida
                      </Button>
                    </div>
                  </div>
                )}
                {s.status === "resolvida" && s.resolution_notes && (
                  <p className="text-xs text-muted-foreground">Resolução: {s.resolution_notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
