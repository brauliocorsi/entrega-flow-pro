import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { closeRoute } from "@/lib/deliveries.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatEUR } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

type Outcome = "entregue" | "nao_entregue" | "entregue_parcial";

/** Entregador fecha a rota no fim do dia e segue para o envelope. */
export function FecharRotaDialog({
  routeId,
  deliveries,
}: {
  routeId: string;
  deliveries: any[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(closeRoute);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = deliveries.filter(
    (d) => d.status !== "cancelado" && d.status !== "reagendado",
  );
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(() =>
    Object.fromEntries(active.map((d) => [d.id, (d.outcome as Outcome) ?? "entregue"])),
  );
  const semResultado = active.filter((d) => !d.outcome).length;

  async function submit() {
    setBusy(true);
    try {
      await fn({
        data: {
          routeId,
          outcomes: active.map((d) => ({
            delivery_id: d.id,
            outcome: outcomes[d.id] ?? "entregue",
            outcome_notes: d.outcome_notes ?? null,
          })),
        },
      });
      toast.success("Rota fechada — segue para o envelope");
      qc.invalidateQueries();
      setOpen(false);
      navigate({ to: "/entregas/caixa/$routeId", params: { routeId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a fechar rota");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full">
          <CheckCircle2 className="h-4 w-4 mr-1" /> Fechar rota
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechar rota</DialogTitle>
          <DialogDescription>
            Confirma o resultado de cada entrega. Depois de fechar não podes registar novos
            recebimentos nem saídas.
          </DialogDescription>
        </DialogHeader>

        {semResultado > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            {semResultado} entrega(s) ainda sem resultado confirmado no terreno.
          </div>
        )}

        <div className="space-y-2">
          {active.map((d) => (
            <div key={d.id} className="rounded-md border p-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <span className="text-sm font-medium">
                  #{d.order_number} · {d.customer_name}
                </span>
                <Badge variant="outline" className="text-[11px]">
                  {formatEUR(Number(d.total_value ?? 0))}
                </Badge>
              </div>
              <RadioGroup
                value={outcomes[d.id] ?? "entregue"}
                onValueChange={(v) => setOutcomes((s) => ({ ...s, [d.id]: v as Outcome }))}
                className="grid grid-cols-3 gap-1.5"
              >
                <Opt id={`${d.id}-e`} value="entregue" label="Entregue" />
                <Opt id={`${d.id}-p`} value="entregue_parcial" label="Parcial" />
                <Opt id={`${d.id}-n`} value="nao_entregue" label="Não entregue" />
              </RadioGroup>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || active.length === 0}>
            {busy ? "A fechar…" : "Confirmar fecho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Opt({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <Label
      htmlFor={id}
      className="flex items-center gap-1.5 rounded-md border p-2 cursor-pointer text-xs has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5"
    >
      <RadioGroupItem id={id} value={value} />
      {label}
    </Label>
  );
}
