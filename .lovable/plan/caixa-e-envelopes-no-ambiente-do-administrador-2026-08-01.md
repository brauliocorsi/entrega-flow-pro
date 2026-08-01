# Caixa e envelopes no ambiente do administrador

Hoje o Caixa e os Envelopes só mostram as rotas do próprio utilizador (função `getMyCashRoutes`, filtrada pelo nome do funcionário). O administrador vê apenas a Prestação de Contas por data, sem detalhe de saídas por responsável nem comparação previsto vs realizado por nota de encomenda.

## O que vai mudar

### 1. Caixa do ADM — visão global dos funcionários
Quando quem entra é admin/logístico, o menu **Caixa** passa a mostrar uma visão global em vez de "as minhas rotas":

- Cartão de topo com o **total em mãos** de toda a operação (dinheiro recebido − saídas aprovadas, em rotas sem envelope fechado).
- Lista **por funcionário de entrega** (motorista e auxiliar): total em mãos, nº de rotas em aberto, saídas pendentes de aprovação.
- Ao abrir um funcionário: movimentação detalhada — entradas (recebimentos por rota e método) e saídas (categoria, valor, descrição, data), com ligação para o caixa da rota.
- Alternador "A minha caixa / Todos" para o admin que também faz entregas.

### 2. Envelopes do ADM — lista completa
O menu **Envelopes**, para admin/logístico, lista todos os envelopes (não só os próprios), com filtros por estado (aguarda conferência / conferido) e intervalo de datas. Cada cartão mostra:

- Código do envelope, **data da rota** e **rota/zona associada**.
- **Responsáveis**: motorista e auxiliar, e quem submeteu o envelope.
- Resumo **previsto vs realizado**: valor previsto a receber na rota, valor efetivamente recebido, dinheiro esperado, declarado e diferença.
- **Saídas efetuadas na rota**: categoria, valor, estado e **quem registou** cada saída.

### 3. Conferência — previsto vs realizado por nota de encomenda
Na Prestação de Contas, cada rota ganha uma secção expansível com a lista de notas de encomenda:

- Nº da encomenda, cliente, estado da entrega.
- **Previsto**: valor em falta no momento do agendamento (a receber).
- **Realizado**: soma dos recebimentos registados, com detalhe por método.
- Diferença destacada quando previsto ≠ realizado, e totais da rota no cabeçalho.

## Detalhes técnicos

- `src/lib/cash.functions.ts`: novas server functions com verificação de papel admin/logístico —
  - `getAllCashByStaff({ days })`: agrega `routes` + `delivery_payments` + `route_cash_expenses` + `route_settlements` por responsável (driver/assistant normalizados contra `staff`), devolvendo em mãos, entradas e saídas com `created_by_name`.
  - `getAllSettlements({ from, to, status })`: envelopes de todas as rotas com rota, data, responsáveis, despesas e totais previsto/realizado.
  - Extensão de `getSettlementsByDate` para incluir, por rota, as entregas (`scheduled_deliveries`) com `total_value`/`remaining_value` e os pagamentos agrupados por entrega (previsto vs realizado), reutilizando `computeDeliveryTotals` de `src/lib/delivery-totals.ts` como fallback.
- UI: `src/routes/_authenticated.entregas.caixa.index.tsx` e `_authenticated.entregas.envelopes.tsx` passam a ramificar por papel (via `use-auth`), mantendo intacta a vista atual do entregador; secção de notas de encomenda adicionada em `src/components/PrestacaoContas.tsx`.
- Sem alterações de base de dados: as políticas atuais já permitem ao admin ler rotas, pagamentos, despesas e envelopes.
