import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { startRoute, unlockRoute, releaseRouteToCourier } from "@/lib/routes.functions";
import { exportRoutePicking } from "@/lib/route-picking.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTimePT } from "@/lib/format";
import { CheckCircle2, FileSpreadsheet, Loader2, Lock, Play, Send, Unlock, UserCheck } from "lucide-react";

/** Estado de preparação/bloqueio da rota + exportação da lista de separação. */
export function RouteLockPanel({ route }: { route: any }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const canStart = role === "admin" || role === "logistico";

  const startFn = useServerFn(startRoute);
  const unlockFn = useServerFn(unlockRoute);
  const releaseFn = useServerFn(releaseRouteToCourier);
  const exportFn = useServerFn(exportRoutePicking);

  const [confirmStart, setConfirmStart] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [exporting, setExporting] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["route", route.id] });
    qc.invalidateQueries({ queryKey: ["route-deliveries", route.id] });
    qc.invalidateQueries({ queryKey: ["routes"] });
  }

  const startMut = useMutation({
    mutationFn: () => startFn({ data: { id: route.id } }),
    onSuccess: () => {
      toast.success("Rota iniciada — bloqueada a alterações");
      setConfirmStart(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar a rota"),
  });

  const releaseMut = useMutation({
    mutationFn: (released: boolean) => releaseFn({ data: { id: route.id, released } }),
    onSuccess: (_d, released) => {
      toast.success(released ? "Rota libertada ao entregador" : "Libertação retirada");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao libertar a rota"),
  });

  const unlockMut = useMutation({
    mutationFn: () => unlockFn({ data: { id: route.id, reason } }),
    onSuccess: () => {
      toast.success("Rota desbloqueada");
      setUnlockOpen(false);
      setReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao desbloquear"),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportFn({ data: { route_id: route.id } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `${res.productCount} produtos · ${res.totalQty} unidades${
          res.unresolved ? ` · ${res.unresolved} sem código (confirmar)` : ""
        }`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <div className="text-sm font-medium">Preparação da rota</div>
          {route.started_at ? (
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
              <Lock className="h-3 w-3 mr-1" /> Em curso desde {formatDateTimePT(route.started_at)}
              {route.started_by_name ? ` · ${route.started_by_name}` : ""}
            </Badge>
          ) : route.courier_confirmed_at ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
              <UserCheck className="h-3 w-3 mr-1" /> Confirmada pelo entregador
              {route.courier_confirmed_by_name ? ` · ${route.courier_confirmed_by_name}` : ""} ·{" "}
              {formatDateTimePT(route.courier_confirmed_at)}
            </Badge>
          ) : route.released_to_courier_at ? (
            <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30">
              <Send className="h-3 w-3 mr-1" /> Em revisão pelo entregador
              {route.released_by_name ? ` · libertada por ${route.released_by_name}` : ""}
            </Badge>
          ) : route.order_ready_at ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Pronta pelo entregador
              {route.order_ready_by_name ? ` · ${route.order_ready_by_name}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Em preparação</Badge>
          )}
          {route.order_changed_by_name && (
            <div className="text-xs text-muted-foreground">
              Ordem alterada por <strong>{route.order_changed_by_name}</strong>
              {route.order_changed_at ? ` · ${formatDateTimePT(route.order_changed_at)}` : ""}
            </div>
          )}
          {route.unlocked_at && (
            <div className="text-xs text-muted-foreground">
              Desbloqueada por {route.unlocked_by_name ?? "—"} · {formatDateTimePT(route.unlocked_at)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8" disabled={exporting} onClick={handleExport}>
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            )}
            Exportar separação (Excel)
          </Button>

          {!route.started_at && canStart && !route.released_to_courier_at && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={releaseMut.isPending}
              onClick={() => releaseMut.mutate(true)}
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Liberar ao entregador
            </Button>
          )}

          {!route.started_at && canStart && route.released_to_courier_at && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={releaseMut.isPending}
              onClick={() => releaseMut.mutate(false)}
            >
              Retirar libertação
            </Button>
          )}

          {!route.started_at && canStart && (
            <Button size="sm" className="h-8" onClick={() => setConfirmStart(true)}>
              <Play className="h-3.5 w-3.5 mr-1" /> Iniciar rota
            </Button>
          )}

          {route.started_at && isAdmin && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setUnlockOpen((v) => !v)}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Desbloquear
            </Button>
          )}
        </div>
      </div>

      {confirmStart && !route.started_at && (
        <div className="rounded-md border p-3 space-y-2 text-xs">
          {!route.courier_confirmed_at && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
              O entregador ainda não confirmou a revisão desta rota.
            </div>
          )}
          <div className="font-medium">
            Ao iniciar, a rota fica bloqueada: ninguém pode alterar a ordem, adicionar ou remover
            entregas, mudar data, motorista ou veículo. Só um administrador pode desbloquear.
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={startMut.isPending} onClick={() => startMut.mutate()}>
              Confirmar e iniciar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmStart(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {unlockOpen && route.started_at && (
        <div className="rounded-md border p-3 space-y-2">
          <Input
            placeholder="Motivo do desbloqueio (obrigatório)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={reason.trim().length < 3 || unlockMut.isPending}
              onClick={() => unlockMut.mutate()}
            >
              Confirmar desbloqueio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUnlockOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
