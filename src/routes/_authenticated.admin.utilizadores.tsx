import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, createUser, updateUserRole, deleteUser } from "@/lib/users.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/utilizadores")({
  head: () => ({ meta: [{ title: "Admin · Utilizadores — UP Agenda" }] }),
  component: AdminUsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  logistico: "Logística",
  vendedor: "Vendedor",
};
const ROLE_TONE: Record<string, string> = {
  admin: "bg-rose-100 text-rose-800 border-rose-200",
  logistico: "bg-amber-100 text-amber-800 border-amber-200",
  vendedor: "bg-sky-100 text-sky-800 border-sky-200",
};

function AdminUsersPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const updateRoleFn = useServerFn(updateUserRole);
  const deleteFn = useServerFn(deleteUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "vendedor" as "admin" | "vendedor" | "logistico" });

  const enabled = !loading && role === "admin";
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
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

  async function handleCreate() {
    try {
      await createFn({ data: form });
      toast.success("Utilizador criado");
      setOpen(false);
      setForm({ email: "", password: "", display_name: "", role: "vendedor" });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleRoleChange(user_id: string, newRole: string) {
    try {
      await updateRoleFn({ data: { user_id, role: newRole as any } });
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDelete(user_id: string, email: string) {
    if (!confirm(`Eliminar utilizador ${email}? Esta ação é permanente.`)) return;
    try {
      await deleteFn({ data: { user_id } });
      toast.success("Utilizador eliminado");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> Utilizadores</h1>
          <p className="text-sm text-muted-foreground">Cria contas e atribui papéis. Os utilizadores não podem auto-registar-se.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo utilizador</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <div className="grid gap-2">
          {users.map((u: any) => {
            const primaryRole = u.roles[0] ?? "vendedor";
            return (
              <Card key={u.user_id}>
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{u.display_name || u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Badge className={ROLE_TONE[primaryRole]}>{ROLE_LABEL[primaryRole] ?? primaryRole}</Badge>
                  <Select value={primaryRole} onValueChange={(v) => handleRoleChange(u.user_id, v)}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="logistico">Logística</SelectItem>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(u.user_id, u.email)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo utilizador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Palavra-passe inicial (mín. 6 caracteres)</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Partilha esta com o utilizador" />
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="logistico">Logística</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.email || form.password.length < 6 || !form.display_name}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
