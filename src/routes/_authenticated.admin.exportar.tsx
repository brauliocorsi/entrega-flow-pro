import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { exportProductsToGoogleSheets } from "@/lib/products-export.functions";

export const Route = createFileRoute("/_authenticated/admin/exportar")({
  head: () => ({ meta: [{ title: "Admin · Exportar — UP Agenda" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { role, loading } = useAuth();
  const exportFn = useServerFn(exportProductsToGoogleSheets);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ url: string; count: number; cols: number } | null>(null);

  if (loading) return <div className="text-muted-foreground">A carregar…</div>;
  if (role !== "admin") return <div className="text-muted-foreground">Acesso restrito a administradores.</div>;

  async function handleExport() {
    setRunning(true);
    setResult(null);
    try {
      const res = await exportFn({});
      setResult({ url: res.spreadsheetUrl, count: res.productCount, cols: res.columnCount });
      toast.success(`${res.productCount} produtos exportados`);
      window.open(res.spreadsheetUrl, "_blank", "noopener");
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
        <p className="text-sm text-muted-foreground">Cria folhas de cálculo no Google Sheets a partir do GestãoClick.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Produtos → Google Sheets
          </CardTitle>
          <CardDescription>
            Exporta todos os produtos ativos do GestãoClick com todos os campos disponíveis (categoria, marca, stock, preços, dimensões, datas, etc.). Cria uma nova folha na conta Google ligada ao projeto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleExport} disabled={running}>
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A exportar… (pode demorar ~30s)
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Exportar produtos ativos
              </>
            )}
          </Button>

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-2 bg-muted/30">
              <div>
                <strong>{result.count}</strong> produtos · <strong>{result.cols}</strong> colunas
              </div>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Abrir folha no Google Sheets <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
