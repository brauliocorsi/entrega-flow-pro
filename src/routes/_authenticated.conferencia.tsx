import { createFileRoute } from "@tanstack/react-router";
import { Calculator, PackageCheck, History as HistoryIcon, Landmark } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";

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
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        icon={Calculator}
        title="Conferência de Valores"
        description="Envelopes e fecho de caixa por rota. Expande para conferir cada nota, os recebimentos por método e as saídas."
      />

      <Tabs defaultValue="envelopes">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="envelopes" className="gap-1.5">
            <PackageCheck className="h-4 w-4" /> Envelopes
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <HistoryIcon className="h-4 w-4" /> Histórico
          </TabsTrigger>
          <TabsTrigger value="conciliacao" className="gap-1.5">
            <Landmark className="h-4 w-4" /> Conciliação
          </TabsTrigger>
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

