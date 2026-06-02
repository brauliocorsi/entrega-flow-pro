## Objetivo

Garantir que a "Previsão de Recebimentos" usa sempre valores atualizados do GestãoClick. Ao clicar no botão, antes de gerar o PDF/registo, refazer uma consulta ao GestãoClick para cada encomenda da rota, atualizar a base de dados, e só depois calcular os totais previstos.

## Comportamento

1. Utilizador (admin/logístico) clica no botão "Previsão de Recebimentos" na rota.
2. O servidor:
   - Lê todas as entregas ativas (não canceladas/reagendadas) da rota.
   - Para cada entrega, refaz `fetchOrder` ao GestãoClick (`/api/vendas?codigo=...` + `/api/vendas/{id}`), obtendo `valor_total`, `pagamentos[]` e itens atualizados.
   - Atualiza `scheduled_deliveries.order_payload`, `total_value` e `remaining_value` (o trigger `tg_compute_remaining` recalcula sozinho, mas escrevemos os valores frescos vindos do GC).
   - Se uma encomenda falhar a sincronizar (erro GC, sem credenciais, 404), continua mas marca esse item com `sync_error` no snapshot — não bloqueia toda a previsão.
3. Com os dados frescos, recalcula `items` via `computeForecastForDelivery` e insere em `route_payment_forecasts` exatamente como hoje.
4. PDF é gerado normalmente (já é client-side dinâmico) e a entrada aparece no histórico.

## UX

- Botão fica em loading durante a sincronização (toast: "A sincronizar valores com o GestãoClick…").
- Ao terminar:
  - Sucesso: toast "Previsão gerada com X encomenda(s) atualizada(s)." + download do PDF.
  - Sucesso parcial: toast warning "Y encomenda(s) não puderam ser sincronizadas — usados últimos valores conhecidos." e prossegue.
- Invalida queries da rota (`scheduled_deliveries`, totais) para refletir os novos valores na tela imediatamente.

## Detalhes técnicos

- `src/lib/forecasts.functions.ts → generateRouteForecast`:
  - Antes do `map(computeForecastForDelivery)`, percorrer `deliveries` e, para cada uma, chamar uma nova função interna `refreshDeliveryFromGestaoClick(supabase, delivery)` que:
    - reusa a lógica de `fetchOrder` (extraída para um helper compartilhado em `src/lib/gestaoclick.server.ts` que retorna o DTO sem tocar em Supabase de scheduling), OU
    - chama diretamente o GestãoClick com os mesmos headers (`access-token`, `secret-access-token`) e `normalizeOrder` — preferível para evitar passar pelo `requireSupabaseAuth` do `fetchOrder`.
  - Após receber o DTO atualizado:
    ```
    UPDATE scheduled_deliveries
    SET order_payload = <novo dto>,
        total_value   = dto.total_value,
        paid_value    = dto.total_value - dto.remaining_value
    WHERE id = delivery.id
    ```
  - Em paralelo limitado (ex.: lotes de 5) para não estourar limites do GC.
  - Adicionar campos `synced_count` e `sync_errors[]` no `route_snapshot` gravado em `route_payment_forecasts` para auditoria no histórico.

- `src/lib/gestaoclick.server.ts` (novo): mover o miolo do `fetchOrder` (chamadas HTTP + `normalizeOrder`) para um helper puro `fetchOrderDtoFromGestaoClick(orderNumber)` reutilizável. `fetchOrder` (server fn) passa a ser um wrapper fino.

- `src/routes/_authenticated.rotas.$id.tsx`:
  - Texto do botão / tooltip: "Atualizar valores e extrair previsão".
  - Após `mutate` bem-sucedido, `queryClient.invalidateQueries` para a query da rota e da lista de entregas.

## Fora do escopo

- Não mexer na lógica de conferência, fechamento, otimização ou agendamento.
- Não alterar tabelas existentes nem políticas RLS.
- Não tocar no PDF (já está OK).
