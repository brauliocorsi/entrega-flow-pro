import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listServiceRequests,
  updateServiceRequest,
  openServiceOrderInGC,
  getServiceRequestScheduleDraft,
  scheduleServiceRequest,
  unscheduleServiceRequest,
} from "@/lib/service-requests.functions";
import { listRoutes } from "@/lib/routes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTimePT, formatDatePT } from "@/lib/format";
import { Wrench, ExternalLink, AlertTriangle, Loader2, CalendarPlus, Euro } from "lucide-react";



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
  const openOsFn = useServerFn(openServiceOrderInGC);
  const [tab, setTab] = useState<"aberta" | "em_curso" | "resolvida" | "todas">("aberta");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [sending, setSending] = useState(false);

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
      const res: any = await updateFn({ data: { id, status, resolution_notes: notes[id] ?? null } });
      if (res?.gcSync?.ok) toast.success("Assistência atualizada e OS sincronizada no GestãoClick");
      else if (res?.gcSync && !res.gcSync.ok)
        toast.warning(`Assistência atualizada, mas a OS falhou: ${res.gcSync.error}`);
      else toast.success("Assistência atualizada");
      qc.invalidateQueries({ queryKey: ["service-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function sendToGC() {
    if (!preview) return;
    setSending(true);
    try {
      const res: any = await openOsFn({ data: { id: preview.id } });
      toast.success(
        res?.already
          ? `OS ${res.gc_os_number ?? res.gc_os_id} atualizada no GestãoClick`
          : `Ordem de serviço ${res.gc_os_number ?? res.gc_os_id} criada no GestãoClick`,
      );
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["service-requests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir a OS");
      qc.invalidateQueries({ queryKey: ["service-requests"] });
    } finally {
      setSending(false);
    }
  }

  async function handleUnschedule(id: string) {
    try {
      await unscheduleFn({ data: { id } });
      toast.success("Agendamento removido da rota");
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
                  <div className="flex items-center gap-1 flex-wrap">
                    {s.gc_os_id && (
                      <Badge variant="outline" className="border-sky-300 text-sky-700">
                        OS {s.gc_os_number ? `#${s.gc_os_number}` : s.gc_os_id}
                      </Badge>
                    )}
                    <Badge className={STATUS_TONE[s.status]}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm bg-muted rounded-md p-2">{s.description}</p>
                {Array.isArray(s.photos) && s.photos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {s.photos.length} foto(s) anexada(s)
                  </p>
                )}
                {s.gc_sync_status === "erro" && s.gc_sync_error && (
                  <p className="text-xs text-destructive flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {s.gc_sync_error}
                  </p>
                )}
                {s.gc_synced_at && (
                  <p className="text-xs text-muted-foreground">
                    Última sincronização: {formatDateTimePT(s.gc_synced_at)}
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
                  </div>
                )}
                {s.status === "resolvida" && s.resolution_notes && (
                  <p className="text-xs text-muted-foreground">Resolução: {s.resolution_notes}</p>
                )}
                <div className="flex gap-2 flex-wrap">
                  {s.status === "aberta" && (
                    <Button size="sm" variant="secondary" onClick={() => setStatus(s.id, "em_curso")}>
                      Em curso
                    </Button>
                  )}
                  {s.status !== "resolvida" && (
                    <Button size="sm" onClick={() => setStatus(s.id, "resolvida")}>
                      Marcar resolvida
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={s.gc_os_id ? "outline" : "default"}
                    onClick={() => setPreview(s)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {s.gc_os_id ? "Atualizar OS" : "Abrir assistência no GestãoClick"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {preview?.gc_os_id
                ? "Atualizar ordem de serviço"
                : "Abrir ordem de serviço no GestãoClick"}
            </DialogTitle>
            <DialogDescription>
              Confirme as informações que serão enviadas para o GestãoClick.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-2 text-sm">
              <Row label="Cliente" value={preview.customer_name ?? "—"} />
              <Row label="Encomenda" value={`#${preview.order_number}`} />
              <Row label="Produto avariado" value={preview.product_name} />
              <Row
                label="Rota"
                value={
                  preview.routes?.route_date
                    ? `${preview.routes.zone} (${formatDatePT(preview.routes.route_date)})`
                    : "—"
                }
              />
              <Row label="Aberta por" value={preview.opened_by_name ?? "—"} />
              <Row
                label="Fotos"
                value={`${Array.isArray(preview.photos) ? preview.photos.length : 0} anexada(s)`}
              />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Relato do entregador</p>
                <p className="bg-muted rounded-md p-2 whitespace-pre-wrap">{preview.description}</p>
              </div>
              {(notes[preview.id] ?? preview.resolution_notes) && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas de resolução (ADM)</p>
                  <p className="bg-muted rounded-md p-2 whitespace-pre-wrap">
                    {preview.resolution_notes ?? notes[preview.id]}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={sendToGC} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {preview?.gc_os_id ? "Atualizar OS" : "Criar OS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
