# Fecho de rota pelo ADM/Logística com sincronização no Gestão Click

Hoje só o entregador fecha a rota, e o fecho não escreve nada no Gestão Click. Este plano adiciona um fecho de rota conduzido pelo ADM/Logística, com conferência Previsto vs Realizado, resumo final e envio automático para o Gestão Click.

## 1. Botão "Fechar rota" no rodapé (ADM e Logística)

- Barra fixa na base do detalhe da rota (`/rotas/$id`) para admin e logístico, enquanto a rota não estiver concluída.
- Mostra em permanência: Previsto, Realizado e Diferença da rota (verde quando bate certo, âmbar/vermelho quando há discrepância).
- Ao clicar abre o ecrã de fecho.

## 2. Ecrã de fecho — conferência encomenda a encomenda

Por cada nota de encomenda:
- Previsto, Realizado e diferença, com os recebimentos já registados (ex.: "Dinheiro 120 € · Multibanco 10 €").
- Estado da entrega a confirmar: **Entregue**, **Entrega parcial**, **Reagendada** ou **Cancelada**.
- Na **parcial**: lista dos artigos da encomenda com marcação individual de entregue / não entregue.
- **Justificação obrigatória** em parcial, reagendada e cancelada.
- Aviso destacado quando há diferença entre previsto e realizado, para o ADM decidir antes de fechar.

## 3. Resumo do fecho

Depois de confirmar, aparece um resumo com:
- totais previsto / realizado / diferença e recebido por método;
- contagem por estado (entregues, parciais, reagendadas, canceladas);
- resultado do envio ao Gestão Click linha a linha (enviado / falhou, com o motivo), e botão para **reenviar** as que falharem.

## 4. O que é escrito no Gestão Click

Por cada nota, após o fecho:
- **Situação**: `Produto Entregue` (entregues), `Entrega Parcial`, `Reagendada` ou `Cancelada`.
- **Pagamentos**: são criadas as parcelas/pagamentos reais recebidos, por forma de pagamento (Dinheiro, Multibanco, MB Way, Transferência), com a data do recebimento.
- **Observações**: resumo dos recebimentos por método, o total recebido e o valor em falta; nas parciais também a lista de artigos entregues e não entregues; nas reagendadas/canceladas a justificação.

O fecho da rota nunca é bloqueado por falha do Gestão Click: a rota fecha na aplicação e as notas que falharam ficam sinalizadas para reenvio.

## Detalhes técnicos

**Base de dados (migração)**
- `scheduled_deliveries`: `gc_sync_status text` (`pendente|enviado|erro`), `gc_sync_error text`, `gc_synced_at timestamptz`, `partial_items jsonb` (artigos entregues/não entregues na parcial).
- Alargar `delivery_outcome` com `reagendado` e `cancelado` (ou mapear `nao_entregue` → reagendada/cancelada via novo campo `outcome_reason_kind`); a decisão fica pela extensão do enum para manter os estados explícitos.

**Gestão Click (`src/lib/gestaoclick.functions.ts` / `gestaoclick-core.server.ts`)**
- Nova `updateGestaoClickVendaClosure({ vendaId, situacaoLabel, pagamentos, observacoes })`, seguindo o padrão existente de `updateGestaoClickVendaSchedule`: resolve `situacao_id` por nome em `/api/situacoes_vendas`, faz GET da venda, merge dos campos e PUT.
- Resolução de `forma_pagamento_id` por nome, reutilizando `findFormaPagamentoByName`, com fallback para o método por defeito quando o nome não existir.

**Server functions**
- `src/lib/deliveries.functions.ts`: `closeRoute` passa a aceitar `partial_items` e justificação, valida papel admin/logístico (mantendo o caminho do entregador), grava outcomes e devolve o resumo previsto/realizado por encomenda.
- Nova `syncClosureToGestaoClick({ routeId })` em `src/lib/gestaoclick.functions.ts`: percorre as entregas fechadas, envia situação + pagamentos + observações e grava `gc_sync_status`/`gc_sync_error`. Chamada logo após o fecho e reutilizável no botão de reenvio.
- `src/lib/cash.functions.ts`: reutilizar `getRouteCash` para o previsto/realizado e recebimentos por encomenda no ecrã de fecho.

**Frontend**
- `src/routes/_authenticated.rotas.$id.tsx`: barra inferior de fecho (admin/logístico) com previsto/realizado.
- `src/routes/_authenticated.rotas.$id.fechar.tsx`: reescrito para a conferência por encomenda (estados, artigos na parcial, justificação obrigatória) + ecrã de resumo com estado de sincronização e reenvio.
- Invalidação de `route`, `route-cash`, `settlements` e `my-day` após o fecho.
