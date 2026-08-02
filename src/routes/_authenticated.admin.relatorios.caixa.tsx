import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { RelatorioCaixa } from "@/components/caixa/RelatorioCaixa";

export const Route = createFileRoute("/_authenticated/admin/relatorios/caixa")({
  head: () => ({
    meta: [
      { title: "Relatório de caixa — UP Agenda" },
      {
        name: "description",
        content:
          "Conta corrente de caixa com entradas por forma de recebimento, saídas por rota e saldo acumulado.",
      },
      { property: "og:title", content: "Relatório de caixa — UP Agenda" },
      {
        property: "og:description",
        content: "Entradas, saídas e saldo do caixa por rota e por forma de recebimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatorioCaixaPage,
});

function RelatorioCaixaPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        icon={Wallet}
        title="Relatório de caixa"
        description="Conta corrente: entradas por forma de recebimento, saídas de caixa e saldo acumulado no período."
      />
      <RelatorioCaixa />
    </div>
  );
}
