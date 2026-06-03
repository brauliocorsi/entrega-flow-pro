## Objetivo

Quando o utilizador procura uma encomenda no fluxo de agendamento (`/agendar`), validar o estado vindo do GestãoClick e a data prevista de entrega antes de criar/atualizar a rota, evitando alterações desnecessárias.

## Regras

1. **Encomenda já "Agendado Entrega" no GestãoClick** e já existe entrega ativa na BD para a mesma data prevista:
   - **Não permitir** novo agendamento.
   - Mostrar aviso: "Esta encomenda já está agendada para {data} na rota {zona}. Nada a fazer."
   - Botão "Ver rota" para abrir a rota existente.

2. **Encomenda "Agendado Entrega"** mas o utilizador quer mudar a data:
   - Mostrar confirmação explícita: "Encomenda já agendada para {data}. Confirmas a mudança de data?"
   - Se confirmar → segue para passo 2 do fluxo normal (escolher nova rota); ao confirmar no passo 4, usa `transferDeliveryToRoute` (se já existe entrega ativa) em vez de criar nova; caso contrário, fluxo normal.

3. **Encomenda "Agendado Entrega" sem entrega ativa na BD** (dessincronizado):
   - Avisar inconsistência: "GestãoClick diz agendada mas não existe entrega registada. Continuar criará novo agendamento."
   - Permitir continuar.

4. **Outra situação qualquer** (Disponível para Entrega, etc.) → fluxo atual sem alterações.

## Alterações técnicas

### `src/lib/gestaoclick.functions.ts`
- Em `fetchOrder`, expor também `prazo_entrega` (data prevista no GestãoClick) e normalizar `status` para comparação (já existe `status`).
- Em `normalizeOrder`, adicionar campo `delivery_date: string | null` lendo `p.prazo_entrega`.
- Em `OrderDTO` adicionar `delivery_date`.

### `src/routes/_authenticated.agendar.tsx`
No passo 1, após receber `orderData`, calcular:
- `isAlreadyScheduled = order.status?.toLowerCase().includes("agendado entrega")`
- `existingActiveDelivery` (já retornado) e `existingDate = existingActiveDelivery?.routes?.route_date`

Renderizar UI condicional:
- Se `isAlreadyScheduled` + `existingActiveDelivery` + datas iguais → bloco informativo "Já agendada" com botão "Ver rota" e botão desativado para continuar.
- Se `isAlreadyScheduled` + (data diferente ou sem entrega ativa) → bloco de confirmação com checkbox/botão "Quero alterar a data agendada"; só aí libera "Continuar".
- Caso contrário → fluxo atual.

No passo 4 (Confirmar):
- Se existe `existingActiveDelivery.id` e o utilizador escolheu rota diferente → chamar `transferDeliveryToRoute({ id, newRouteId })` em vez de `scheduleDelivery`.
- Caso contrário → `scheduleDelivery` como hoje.

### Sem alterações de schema
Não é preciso migration; apenas leitura adicional de `prazo_entrega` do payload do GestãoClick.

## Fora do âmbito
- Não alterar `scheduleDelivery`/`transferDeliveryToRoute` (já fazem o necessário).
- Não mexer no mapa, taxas ou PDF.
