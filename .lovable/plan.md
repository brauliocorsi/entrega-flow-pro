# Conferência de Valores — lista única de envelopes e fecho de caixa

Transformar o ecrã `/conferencia` numa lista compacta e expansível de envelopes/fecho de caixa, com Previsto vs Realizado sempre visível e cada valor ligado à nota de encomenda, ao método de recebimento e ao estado da entrega.

## O que muda no ecrã

1. **Remover** o bloco "Consulta de taxa por código postal" (formulário de CP, taxa sugerida e rotas disponíveis). Esse cálculo continua a existir no fluxo de agendamento.
2. **Um só painel** em vez dos dois atuais ("Fecho de caixa" + "Prestação de contas"): uma lista de linhas, uma por rota/envelope.
3. **Linha fechada (sempre visível):** cor e nome da rota, data, responsáveis, código do envelope, estado (Em aberto / Envelope entregue / Conferida), nº de entregas e, em destaque, **Previsto · Realizado · Diferença**, mais um aviso de "X por confirmar" quando há recebimentos por validar.
4. **Ao clicar, expande** com:
   - Resumo de caixa: dinheiro, despesas, a depositar, declarado vs esperado.
   - **Notas de encomenda**: por encomenda mostra nº, cliente, estado da entrega (entregue, entrega parcial, não entregue, reagendada, cancelada — e marca "com assistência" quando existe pedido de assistência aberto nessa encomenda), Previsto/Realizado/Diferença e, por baixo, cada recebimento com método, valor, quem recebeu e botão Confirmar.
   - **Conciliação por método** (multibanco, transferência, etc.) com confirmação.
   - **Saídas de caixa** com recibo, aprovar/rejeitar.
   - Botão **Fechar conferência**.
5. **Cabeçalho com totais do dia**: Previsto, Realizado, Diferença, dinheiro a depositar e nº de envelopes por conferir; filtros rápidos por estado (todos / por conferir / conferidos) e pesquisa por nº de encomenda, envelope, rota ou responsável.

## Estado da entrega — como é mostrado

Etiqueta com cor por resultado: entregue (verde), entrega parcial (âmbar), não entregue (vermelho), reagendada (azul), cancelada (cinza); e um selo extra "assistência" quando a encomenda tem pedido de assistência.

## Detalhes técnicos

- `src/lib/cash.functions.ts` → `getSettlementsByDate`: acrescentar a leitura de `service_requests` por `delivery_id` das rotas do dia e devolver em cada ordem `has_service_request` + estado; incluir `route_date` já vem do select. Manter `buildOrderCompare` (previsto/realizado/pagamentos) como fonte dos valores.
- Novo componente `src/components/caixa/ConferenciaLista.tsx` com a lista expansível (reaproveita a lógica de mutações já existente em `PrestacaoContas.tsx`: `reviewExpense`, `confirmSettlementMethod`, `confirmPayment`, `closeSettlement`).
- `src/routes/_authenticated.conferencia.tsx`: remover `suggestDeliveryFee`, o formulário de CP e os cartões de resultado; renderizar apenas o novo painel. O bloco `CaixaDoDia` (getCashSummary) é absorvido pelos totais do cabeçalho.
- `PrestacaoContas.tsx` deixa de ser usado nesta rota; mantém-se apenas se ainda for referenciado noutro sítio, caso contrário é removido.
- Sem alterações à base de dados.
