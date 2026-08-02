# Envelopes com linhas de encomenda e Relatório de caixa (conta corrente)

Duas entregas: (1) detalhar cada envelope com uma linha por nota de encomenda e secções separadas de recebimentos e saídas; (2) um novo relatório de caixa em conta corrente com entradas, saídas, saldo e formas de recebimento.

## 1. Envelopes — detalhe por nota de encomenda

No cartão de cada envelope (ecrã Envelopes, vista de gestão) passa a existir:

**Secção "Recebimentos"** — uma linha por nota de encomenda com:
- Nº de encomenda e cliente
- Valor total
- Valor produtos
- Serviço de entrega
- Serviço de montagem
- Montante recebido (e diferença face ao previsto quando existir)
- Por baixo, cada recebimento com forma de pagamento, valor, quem recebeu e se está confirmado

Em ecrã pequeno as colunas passam a pares etiqueta/valor; em ecrã largo é uma tabela compacta. Rodapé da secção com os totais das colunas.

**Secção "Saídas de caixa"** — separada visualmente da anterior, com cada saída (categoria, descrição, quem registou, data, estado aprovada/pendente/rejeitada) e total de saídas.

**Rodapé do envelope** — Entradas − Saídas = líquido do envelope, mantendo os blocos já existentes de Previsto/Realizado e Esperado/Declarado.

## 2. Relatório de caixa (conta corrente)

Novo ecrã em Financeiro > "Relatório de caixa" (admin e logística).

- Filtros: intervalo de datas, rota/zona, responsável, forma de pagamento e tipo (entradas / saídas / tudo).
- Cabeçalho: total de entradas, total de saídas, saldo do período, e repartição por forma de recebimento (dinheiro, multibanco, MB Way, transferência…) com percentagem.
- Tabela conta corrente ordenada por data: data, descrição (encomenda/cliente ou categoria da saída), rota, responsável, forma de pagamento, entrada, saída e **saldo acumulado**.
- Linhas de entrada em verde, saídas em vermelho, com o envelope associado quando existe.
- Botão para exportar o extrato filtrado em CSV.

## Detalhes técnicos

- `src/lib/cash.functions.ts`
  - `buildOrderCompare`: expor também `products_total`, `assembly_total`, `delivery_total` (já disponíveis via `computeDeliveryTotals`).
  - `getAllSettlements`: passar a devolver o array `orders` por envelope (hoje só devolve `orders_count`), com os pagamentos já incluídos por encomenda.
  - Nova `getCashLedger({ from, to })` (admin/logística, via `assertManager`) que devolve movimentos normalizados `{ date, kind: "entrada" | "saida", description, order_number, customer_name, route_id, zone, route_date, responsible, envelope_code, method_name, amount }` a partir de `delivery_payments` e `route_cash_expenses` (excluindo saídas rejeitadas), mais totais e repartição por método. Saldo acumulado calculado no cliente após ordenação.
- `src/components/caixa/AdminEnvelopes.tsx`: `EnvelopeCard` ganha as secções "Recebimentos" (tabela por encomenda + pagamentos) e "Saídas de caixa".
- Novo `src/components/caixa/RelatorioCaixa.tsx` com filtros, cartões de totais, repartição por método, tabela de conta corrente e exportação CSV.
- Nova rota `src/routes/_authenticated.admin.relatorios.caixa.tsx` com `head()` próprio, usando `PageHeader`/`StatTile`/`FilterBar`.
- `src/lib/nav-items.ts`: novo item no grupo `financeiro`, restrito a `admin` e `logistico`.
- Sem alterações à base de dados.
