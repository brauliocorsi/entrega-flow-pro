import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPaymentMethods,
  upsertPaymentMethod,
  deletePaymentMethod,
} from "@/lib/payment-methods.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pagamentos")({
  head: () => ({
    meta: [
      { title: "Admin · Formas de pagamento — UP Agenda" },
      { name: "description", content: "Gerir formas de recebimento usadas pelos entregadores." },
    ],
  }),
  component: PaymentMethodsPage,
});

const empty = { id: undefined as string | undefined, name: "", active: true, sort_order: 0 };

function PaymentMethodsPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listPaymentMethods);
  const saveFn = useServerFn(upsertPaymentMethod);
  const delFn = useServerFn(deletePaymentMethod);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const enabled = !loading && role === "admin";
  const { data = [], isLoading } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => listFn(),
    enabled,
  });

  if (!loading && role !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem permissões</CardTitle>
          <CardDescription>Apenas administradores podem aceder a esta página.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function save() {
    try {
      await saveFn({ data: form });
      toast.success("Guardado");
      setOpen(false);
      setForm({ ...empty });
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function remove(id: string) {
    if (!confirm("Eliminar forma de pagamento?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Formas de pagamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Opções disponíveis ao entregador para registar recebimentos.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm({ ...empty });
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova forma
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  {!m.active && (
                    <Badge variant="secondary" className="mt-1">
                      Inativa
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setForm({
                        id: m.id,
                        name: m.name,
                        active: m.active,
                        sort_order: m.sort_order ?? 0,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar forma" : "Nova forma"}</DialogTitle>
            <DialogDescription>Ex.: Dinheiro, MB Way, Multibanco, Transferência.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
              <Label>Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!form.name.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
