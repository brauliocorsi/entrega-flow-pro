import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { exportProductsToCsv } from "@/lib/products-export.functions";

export const Route = createFileRoute("/_authenticated/admin/exportar")({
  head: () => ({ meta: [{ title: "Admin · Exportar — UP Agenda" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { role, loading } = useAuth();
  const exportFn = useServerFn(exportProductsToCsv);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ count: number; cols: number; filename: string } | null>(null);

  if (loading) return <div className="text-muted-foreground">A carregar…</div>;
  if (role !== "admin") return <div className="text-muted-foreground">Acesso restrito a administradores.</div>;

  async function handleExport() {
    setRunning(true);
    setResult(null);
    try {
      const res = await exportFn({});
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResult({ count: res.productCount, cols: res.columnCount, filename: res.filename });
      toast.success(`${res.productCount} produtos exportados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Exportar dados</h1>
        <p className="text-sm text-muted-foreground">Descarrega ficheiros CSV com dados do GestãoClick.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Produtos (CSV)
          </CardTitle>
          <CardDescription>
            Descarrega todos os produtos ativos do GestãoClick com todos os campos disponíveis (categoria, marca, stock, preços, dimensões, datas, etc.). Abre diretamente no Excel, Numbers ou Google Sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleExport} disabled={running}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A preparar… (pode demorar ~30s)
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Descarregar produtos ativos
              </>
            )}
          </Button>

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <div><strong>{result.count}</strong> produtos · <strong>{result.cols}</strong> colunas</div>
              <div className="text-muted-foreground">{result.filename}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
