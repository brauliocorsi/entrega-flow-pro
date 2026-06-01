import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaff, upsertStaff, deleteStaff } from "@/lib/fleet.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/equipa")({
  head: () => ({ meta: [{ title: "Admin · Equipa — UP Agenda" }] }),
  component: StaffPage,
});

type Kind = "motorista" | "auxiliar";
type Staff = {
  id: string;
  name: string;
  kind: Kind;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

const empty = { id: undefined as string | undefined, name: "", kind: "motorista" as Kind, phone: "", notes: "", active: true };

const KIND_LABEL: Record<Kind, string> = { motorista: "Motorista", auxiliar: "Auxiliar" };
const KIND_TONE: Record<Kind, string> = {
  motorista: "bg-sky-100 text-sky-800 border-sky-200",
  auxiliar: "bg-amber-100 text-amber-800 border-amber-200",
};

function StaffPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listStaff);
  const saveFn = useServerFn(upsertStaff);
  const delFn = useServerFn(deleteStaff);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  const enabled = !loading && role === "admin";
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "staff"],
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
          kind: form.kind,
          phone: form.phone || null,
          notes: form.notes || null,
          active: form.active,
        },
      });
      toast.success("Guardado");
      setOpen(false);
      setForm({ ...empty });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }
  async function handleDelete(id: string) {
    if (!confirm("Eliminar?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }
  function openEdit(s: Staff) {
    setForm({ id: s.id, name: s.name, kind: s.kind, phone: s.phone ?? "", notes: s.notes ?? "", active: s.active });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Equipa
          </h1>
          <p className="text-sm text-muted-foreground">Motoristas e auxiliares disponíveis para atribuir às rotas</p>
        </div>
        <Button onClick={() => { setForm({ ...empty }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova pessoa
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar…</div>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem registos.</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s: Staff) => (
            <Card key={s.id}>
              <CardContent className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {s.name}
                    {!s.active && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={KIND_TONE[s.kind]} variant="outline">{KIND_LABEL[s.kind]}</Badge>
                    {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                  </div>
                  {s.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.notes}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(s.id)}>
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
            <DialogTitle>{form.id ? "Editar" : "Novo registo"}</DialogTitle>
            <DialogDescription>Aparece na seleção de frota das rotas conforme o tipo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Função</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="motorista">Motorista</SelectItem>
                  <SelectItem value="auxiliar">Auxiliar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
