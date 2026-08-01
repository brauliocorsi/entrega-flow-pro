# Role "Entregador" — app do dia de trabalho

Novo perfil para motoristas/auxiliares: entram com o seu login, veem apenas a rota do dia em que estão escalados, e vão fechando entrega a entrega — recebimentos, resultado da entrega e abertura de assistências. Os totais da rota atualizam-se em tempo real para a conferência.

## O que o entregador vê

- Ecrã inicial "O meu dia": a(s) rota(s) de hoje onde ele está como motorista ou auxiliar.
- Resumo da rota: nº de paragens, entregues/pendentes, valor previsto a receber, já recebido e em falta.
- Lista de paragens pela ordem do corredor, com morada, telefone, cliente, valores e produtos.
- Não vê rotas de outros, nem agendamentos, nem áreas de admin.

## Fluxo por entrega

1. Abre a paragem → vê produtos, serviços, total, pago e em falta.
2. **Registar recebimento**: pode adicionar várias linhas na mesma entrega (ex.: 30 € dinheiro + 100 € MB Way). As formas de pagamento são geridas pelo admin (nova página "Formas de pagamento"), o entregador só escolhe da lista.
3. **Resultado**: Entregue / Entregue parcial / Não entregue / Cancelada / Reagendar.
   - Não entregue, cancelada ou reagendada → entra automaticamente na fila de pendências de reagendamento existente.
4. **Abrir assistência**: escolhe o(s) produto(s) da nota, descreve o defeito e anexa fotos. Fica numa fila de assistências consultável por admin/logística.
5. Cada ação grava logo; a rota e a página de detalhe/conferência refletem em tempo real (subscrição às alterações).

## Gestão (admin)

- **Equipa**: cada motorista/auxiliar passa a poder ser associado a uma conta de utilizador; ao criar utilizador pode escolher-se o perfil "Entregador".
- **Formas de pagamento**: criar/editar/desativar (Dinheiro, MB Way, Multibanco, Transferência, Cheque…).
- **Assistências**: fila com estado (aberta / em curso / resolvida), fotos e ligação à entrega.
- **Conferência**: passa a mostrar previsto vs recebido por forma de pagamento e por entregador, para o fecho de caixa.

## Detalhes técnicos

Migração de base de dados:
- `app_role` ganha o valor `entregador`.
- `staff.user_id` (opcional) para ligar ficha de equipa ↔ conta.
- `payment_methods` (nome, ativo, ordem) — gerida por admin, leitura por autenticados.
- `delivery_payments` (delivery_id, route_id, method_id, valor, recebido_por, notas, created_at) — soma alimenta `paid_value`/`remaining_value` da entrega por trigger.
- `service_requests` (assistências: delivery_id, order_number, produto, descrição, fotos[], estado, aberto_por).
- Bucket privado `assistencias` para as fotos, com políticas de acesso.
- Função `public.is_route_courier(_user_id, _route_id)` (security definer) usada nas políticas: o entregador só lê/escreve nas rotas do próprio dia onde está escalado; RLS em todas as tabelas novas.
- `closeRoute` e a lista de pendências passam a aceitar também `cancelado`/`reagendado` vindos do entregador.

Frontend:
- Novas rotas `/entregas` (o meu dia), `/entregas/$routeId/$deliveryId`, `/admin/pagamentos`, `/admin/assistencias`.
- `nav-items.ts`: menu reduzido para o perfil entregador (apenas "O meu dia").
- Novas funções servidor em `src/lib/courier.functions.ts` (rota do dia, registar recebimento, registar resultado, abrir assistência) e `src/lib/payment-methods.functions.ts`.
- Atualização em tempo real via Realtime nas tabelas de entregas e recebimentos.
