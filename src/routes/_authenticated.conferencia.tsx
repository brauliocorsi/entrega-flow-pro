import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { ConferenciaLista } from "@/components/caixa/ConferenciaLista";
import { ConciliacaoPanel } from "@/components/caixa/ConciliacaoPanel";
import { HistoricoEnvelopes } from "@/components/caixa/HistoricoEnvelopes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência de Valores — UP Agenda" },
      {
        name: "description",
        content:
          "Lista de envelopes e fecho de caixa por rota, com previsto vs realizado, recebimentos por nota de encomenda e estado das entregas.",
      },
      { property: "og:title", content: "Conferência de Valores — UP Agenda" },
      {
        property: "og:description",
        content: "Confere envelopes, recebimentos e saídas de caixa de cada rota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConferenciaPage,
});

function ConferenciaPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-6 w-6" /> Conferência de Valores
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envelopes e fecho de caixa por rota. Expande para conferir cada nota de encomenda, os
          recebimentos por método e as saídas de caixa.
        </p>
      </div>

      <Tabs defaultValue="envelopes">
        <TabsList>
          <TabsTrigger value="envelopes">Envelopes</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação bancária</TabsTrigger>
        </TabsList>
        <TabsContent value="envelopes" className="mt-3">
          <ConferenciaLista />
        </TabsContent>
        <TabsContent value="historico" className="mt-3">
          <HistoricoEnvelopes />
        </TabsContent>
        <TabsContent value="conciliacao" className="mt-3">
          <ConciliacaoPanel />
        </TabsContent>
      </Tabs>


    </div>
  );
}
