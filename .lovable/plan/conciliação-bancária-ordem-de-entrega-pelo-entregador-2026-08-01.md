# Conciliação bancária + ordem de entrega pelo entregador

## Parte 1 — Conferência linha a linha e conciliação de documentos

### O que passa a existir
- Na Conferência de Valores, cada recebimento não-dinheiro (MB Way, Multibanco, Transferência) aparece numa **linha própria** ligada ao número de nota de encomenda, com método, valor, quem recebeu, data e estado (por confirmar / conciliado / confirmado).
- Novo separador **Conciliação** dentro da Conferência, com dois âmbitos:
  - **Por rota/envelope** — concilia só os recebimentos daquela rota.
  - **Por intervalo de datas** — cruza todos os recebimentos não-dinheiro do período, independentemente da rota.
- Upload de documento do banco:
  - **CSV/Excel** — lido diretamente (colunas data, valor, descrição/referência).
  - **PDF ou foto** — extraído por IA para a mesma estrutura de movimentos.
- Motor de correspondência automática sugere pares movimento ↔ recebimento por valor exato + proximidade de data (+/- 3 dias) e pistas na descrição (MB WAY, COMPRA MB, TRF, nome do cliente, nº de encomenda).
- **Revisão humana obrigatória**: nada é confirmado automaticamente. Cada sugestão mostra um nível de confiança (alta/média/baixa) e só passa a conciliada depois de o administrador aceitar. Também é possível ligar manualmente um movimento a um recebimento, ignorar um movimento ou desfazer uma conciliação.
- Painel de resumo: total do extrato, total conciliado, movimentos sem correspondência, recebimentos sem movimento.

### Fluxo
```text
Upload extrato (CSV/Excel ou PDF/foto)
   -> movimentos extraídos e guardados
   -> sugestões automáticas de correspondência
   -> ADM revisa linha a linha (aceitar / trocar / ignorar)
   -> recebimento marcado como conciliado + confirmado
   -> resumo do que ficou por conciliar
```

## Parte 2 — Ordem das entregas pelo entregador

- Nas rotas atribuídas ao entregador, ele pode **arrastar** as notas de encomenda para definir a sequência (1, 2, 3...).
- A ordem é guardada e passa a ser a mesma vista por admin, logístico e no simulador de trajeto (o simulador usa a ordem manual em vez da ordem otimizada quando existe ordem definida).
- Continua a ser possível pedir a sugestão de ordem otimizada e aplicá-la como ponto de partida.
- **Bloqueio**: assim que a rota é iniciada, o entregador deixa de poder reordenar (fica só leitura). Admin/logístico mantêm a possibilidade de ajustar.
- O número de sequência aparece bem visível no cartão de cada entrega e na lista "O meu dia".

## Detalhes técnicos

Base de dados (migração nova):
- `scheduled_deliveries.stop_order` (integer, nullable) — sequência manual da entrega na rota.
- `routes.started_at` (timestamptz, nullable) — marca o início da rota; usado para bloquear a reordenação.
- `bank_statements` — documento carregado (ficheiro no storage, tipo, período, quem carregou, estado).
- `bank_transactions` — movimentos extraídos (data, valor, descrição, referência, método inferido, estado: por conciliar / conciliado / ignorado, `matched_payment_id`).
- `delivery_payments.reconciled_at` / `reconciled_by` / `bank_transaction_id` — liga o recebimento ao movimento.
- Novo bucket privado `bank-statements` com políticas só para admin/logístico.
- RLS: leitura/escrita de conciliação restrita a admin e logístico; `stop_order` editável pelo entregador da rota via `is_route_courier` apenas enquanto `started_at` for nulo.

Servidor (`src/lib/reconciliation.functions.ts`, novo):
- `uploadStatement` (guarda ficheiro + cria registo), `parseStatement` (CSV/Excel por parser direto; PDF/foto via Lovable AI com saída estruturada), `suggestMatches`, `applyMatch`, `unmatch`, `ignoreTransaction`, `getReconciliation` (por rota ou por datas).
- Em `src/lib/routes.functions.ts`: `reorderDeliveries` (valida permissão e rota não iniciada) e `startRoute`.
- `getRouteSimulation` passa a respeitar `stop_order` quando definido.

Interface:
- `src/components/caixa/ConferenciaLista.tsx` — linhas de recebimento por método com estado de conciliação.
- `src/components/caixa/ConciliacaoPanel.tsx` (novo) — upload, lista de movimentos, sugestões e revisão.
- `src/components/rotas/OrdemEntregasEditor.tsx` (novo) — reordenação por arrasto, usado no detalhe da rota e em "O meu dia"; leitura apenas após início da rota.
