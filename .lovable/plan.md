## Objetivo

Na página **/agendar**, adicionar uma aba que lista vendas do GestãoClick cuja situação é **"Disponível para entrega"** ou **"Disponível para levantamento"**, com botão **Agendar** em cada linha que salta directamente para o passo 3 (escolher rota) com a venda já carregada.

## UI

Topo da página passa a ter duas abas (`Tabs` shadcn):

1. **Por número** — fluxo actual (pesquisar por código de encomenda).
2. **Disponíveis no GestãoClick** — nova tabela.

A tabela mostra: Código · Cliente · Cidade / CP · Valor · Situação · Data · **Acções**. Cada linha tem:
- **Agendar** → carrega a venda via `fetchOrder` e salta para o passo 3 (manter defaults de tipo=entrega, volume=2 m³, minutos=30; o utilizador pode voltar para trás se quiser ajustar).
- Link "ver no GestãoClick" (opcional).

Filtros simples acima da tabela: pesquisa por código/cliente + selector de situação (multi). Botão **Recarregar**. Estado vazio + erro tratados.

## Backend

Novo server fn `listAvailableOrders` em `src/lib/gestaoclick.functions.ts`:

- Input: `{ situations?: string[]; query?: string; limit?: number }` (default situações = `["Disponível para entrega", "Disponível para levantamento"]`, limit 50).
- Para cada situação:
  1. `GET /api/situacoes_vendas` → resolver `situacao_id` pelo nome (case-insensitive).
  2. `GET /api/vendas?situacao_id={id}&order_by=data_venda&order_type=desc&limit={n}`.
- Normalizar para DTO leve: `{ id, order_number, customer_name, city, zip_code, total_value, situation, date }`.
- Cruzar com `scheduled_deliveries` (já agendados activos) para marcar/excluir os que já têm entrega activa — bandeira `alreadyScheduled: boolean` na linha (mostrar desactivado com badge "Já agendado").
- Erros do GestãoClick devolvem `{ orders: [], error }` (não quebra a UI).

As labels das situações ficam como constante exportada em `src/lib/constants.ts` (`AVAILABLE_SITUATIONS`) — fácil acrescentar mais no futuro.

## Frontend wiring

`src/routes/_authenticated.agendar.tsx`:

- Importar `Tabs/TabsList/TabsTrigger/TabsContent`, novo server fn `listAvailableOrders`.
- `useQuery` para a lista (key inclui filtros), `enabled` apenas quando a aba "Disponíveis" está activa.
- Acção **Agendar(orderNumber)**:
  1. `setOrderNumber(n)` + `await fetchOrderFn`.
  2. Se sucesso → `setStep(3)` (mantém volume/minutos/tipo default; pré-carrega `routes`).
  3. Se erro → toast.

## Ficheiros a tocar

- `src/lib/gestaoclick.functions.ts` — novo `listAvailableOrders`.
- `src/lib/constants.ts` — `AVAILABLE_SITUATIONS`.
- `src/routes/_authenticated.agendar.tsx` — abas + tabela + acção.

## Notas técnicas

- API do GestãoClick: o filtro real por situação varia (`situacao_id` vs `situacao`); a server fn tenta `situacao_id` e cai para filtragem em memória se o backend ignorar o parâmetro.
- Paginação: v1 mostra primeiras 50 por situação ordenadas por data desc; se precisares de mais, adicionamos "carregar mais" depois.
- Permissões: server fn usa `requireSupabaseAuth` (qualquer utilizador autenticado pode listar, igual ao `fetchOrder` actual).
- Sem alterações a BD nem migrações.