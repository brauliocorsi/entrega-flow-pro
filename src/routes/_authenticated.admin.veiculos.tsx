import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listVehicles, upsertVehicle, deleteVehicle } from "@/lib/fleet.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/veiculos")({
  head: () => ({ meta: [{ title: "Admin · Veículos — UP Agenda" }] }),
  component: VehiclesPage,
});

type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  notes: string | null;
  active: boolean;
};

const empty = { id: undefined as string | undefined, name: "", plate: "", notes: "", active: true };

function VehiclesPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listVehicles);
  const saveFn = useServerFn(upsertVehicle);
  const delFn = useServerFn(deleteVehicle);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const enabled = !loading && role === "admin";
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "vehicles"],
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

  async function handleSave() {
    try {
      await saveFn({
        data: {
          id: form.id,
          name: form.name,
          plate: form.plate || null,
          notes: form.notes || null,
          active: form.active,
        },
      });
      toast.success("Guardado");
      setOpen(false);
      setForm({ ...empty });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }
  async function handleDelete(id: string) {
    if (!confirm("Eliminar veículo?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }
  function openEdit(v: Vehicle) {
    setForm({ id: v.id, name: v.name, plate: v.plate ?? "", notes: v.notes ?? "", active: v.active });
    setOpen(true);
  }
  function openNew() {
    setForm({ ...empty });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6" /> Veículos
          </h1>
          <p className="text-sm text-muted-foreground">Carros disponíveis para atribuir às rotas</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo veículo
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar…</div>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Sem veículos registados.
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((v: Vehicle) => (
            <Card key={v.id}>
              <CardContent className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {v.name}
                    {!v.active && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  {v.plate && <div className="text-xs text-muted-foreground font-mono">{v.plate}</div>}
                  {v.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.notes}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(v.id)}>
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
            <DialogTitle>{form.id ? "Editar veículo" : "Novo veículo"}</DialogTitle>
            <DialogDescription>Os veículos ativos surgem na seleção da frota das rotas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome / descrição</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Mercedes Sprinter Branca" />
            </div>
            <div>
              <Label>Matrícula</Label>
              <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="00-AA-00" />
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
