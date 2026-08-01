# Fecho de rota pelo entregador e conferência do ADM

Hoje o botão "Fechar rota" só existe no detalhe da rota (`/rotas/$id`), ecrã a que o entregador não tem acesso. E na Conferência o ADM só confirma métodos agregados por rota — não há confirmação pagamento a pagamento nem visão Previsto vs Realizado dentro da rota. Este plano fecha esse ciclo.

## 1. Entregador fecha a rota

No "O meu dia", cada rota ganha um botão **Fechar rota** (visível quando todas as entregas já têm resultado, com aviso quando ainda há pendentes).

Ao fechar:
- confirma o resultado de cada entrega (entregue / não entregue / parcial);
- a rota passa a **concluída** e esse estado fica visível para todos (admin, logística, entregador);
- a rota fica bloqueada para novos recebimentos e novas saídas de caixa;
- segue imediatamente para o fecho do envelope (caixa da rota), mantendo o fluxo atual de valor declarado e código de envelope.

## 2. Dentro da rota (detalhe da rota)

Novo bloco no topo do detalhe da rota:
- **Previsto vs Realizado** com diferença destacada (verde quando bate certo, vermelho quando há discrepância);
- **Movimento de caixa da rota**: recebido por método, saídas registadas (com quem registou), dinheiro em mãos e estado do envelope;
- Em cada cartão de entrega: as **formas de pagamento recebidas** (ex.: "Dinheiro 120 € · MB Way 30 €"), o previsto da encomenda, o realizado e a diferença, com o estado de confirmação de cada recebimento.

## 3. Conferência do ADM

- Botão **Conferir rota** por rota, sempre visível ao admin (mesmo antes do envelope ser entregue, indicando "à espera do envelope").
- Lista encomenda a encomenda: **previsto, realizado, diferença** e os recebimentos individuais.
- Cada recebimento (linha de pagamento) ganha um botão **Confirmar / Reverter** individual — é assim que o ADM concilia dinheiro, MB Way, transferência, etc.
- O resumo por método passa a refletir o total confirmado vs. por confirmar.
- **Fechar conferência** só fica disponível quando todos os recebimentos estão confirmados e todas as despesas decididas.

## Detalhes técnicos

**Migração**
- `delivery_payments`: colunas `confirmed boolean not null default false`, `confirmed_by uuid`, `confirmed_at timestamptz`.
- Política RLS de UPDATE em `delivery_payments` apenas para `has_role(auth.uid(),'admin')` (atualmente UPDATE está negado).
- Política de UPDATE em `routes` que permita ao entregador escalado (`is_route_courier`) marcar a rota como `concluida`, e em `scheduled_deliveries` para gravar o outcome (validar as políticas existentes antes de duplicar).

**Server functions**
- `src/lib/deliveries.functions.ts`: `closeRoute` passa a validar que o autor é admin/logístico **ou** courier da rota, e devolve o resumo previsto/realizado.
- `src/lib/cash.functions.ts`:
  - `buildCash` devolve também os pagamentos com `confirmed`, o previsto por encomenda e o total previsto vs realizado;
  - nova `confirmPayment({ payment_id, confirmed })` (admin), que ao confirmar/reverter recalcula o estado dos métodos do envelope;
  - `closeSettlement` passa a exigir todos os `delivery_payments` da rota confirmados;
  - `addCashExpense` e o registo de recebimentos bloqueiam quando a rota está `concluida`/envelope entregue.

**Frontend**
- `src/routes/_authenticated.entregas.index.tsx`: botão Fechar rota + diálogo de resultados, encadeando para `/entregas/caixa/$routeId`.
- `src/routes/_authenticated.rotas.$id.tsx`: bloco Previsto vs Realizado + movimento de caixa; cartões de entrega mostram métodos recebidos e estado de confirmação.
- `src/components/PrestacaoContas.tsx`: confirmação por pagamento individual dentro do comparativo por encomenda, e botão Conferir/Fechar conferência por rota.
- Invalidação das queries `route`, `settlements`, `route-cash` e `my-day` após fechar rota ou confirmar pagamentos.
