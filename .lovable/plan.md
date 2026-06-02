# Previsão de Recebimentos da Rota

Adicionar uma funcionalidade isolada (sem mexer em nada existente) para extrair, num PDF, a previsão de recebimentos de uma rota — somando os valores marcados como "Pagar na entrega" no GestãoClick — e manter um histórico de quem gerou cada previsão.

## O que o utilizador vai ver

Na página de detalhe da rota (`/rotas/$id`):
- Um novo botão só com ícone (cofre/€) ao lado dos restantes botões de ação da rota.
- Visível apenas para `admin` e `logistico` (ocultado para `vendedor`).
- Tooltip: "Extrair previsão de recebimentos".
- Ao clicar: gera o PDF, faz download automático e regista no histórico.

Logo abaixo, um novo cartão **"Histórico de previsões"** com a lista das previsões já geradas para aquela rota:
- Data/hora, utilizador que gerou, total previsto, nº de encomendas, botão para voltar a descarregar o PDF dessa geração.

Nada do fluxo atual de rotas, entregas, conferência ou agendamento é alterado.

## Conteúdo do PDF

Cabeçalho:
- ID da rota, data da rota, zona, motorista/veículo, data/hora da geração, utilizador.

Tabela (uma linha por entrega da rota com `outcome` ≠ cancelado/reagendado):
- Nº encomenda
- Cliente
- Valor total da encomenda
- Valor de serviços (montagem/entrega/serviço — soma dos `items` de `order_payload` com `kind` ≠ `produto`)
- Valor previsto a receber (soma das parcelas em `order_payload.pagamentos` cuja `observacao` indica "pagar na entrega" / "à entrega" / "na entrega" / "cod"; fallback para `remaining_value` quando não houver pagamentos marcados)

Rodapé:
- Total de encomendas
- Total bruto da rota
- Total de serviços
- **Total previsto a receber na rota** (destaque)

## Detalhes técnicos

**Base de dados** (uma migração nova, sem alterar tabelas existentes):

Tabela `route_payment_forecasts`:
- `route_id uuid` (referência lógica a `routes.id`)
- `generated_by uuid` (auth user)
- `generated_by_name text` (snapshot do `profiles.display_name`)
- `total_orders int`, `total_gross numeric`, `total_services numeric`, `total_forecast numeric`
- `items jsonb` (snapshot do que foi para o PDF, para poder reimprimir)
- timestamps

GRANTs + RLS:
- `SELECT` para `authenticated`
- `INSERT/SELECT` permitido para `admin` e `logistico` via `has_role()`
- Sem update/delete (histórico imutável); `service_role` com `ALL`

**Server functions** (`src/lib/forecasts.functions.ts`, ficheiro novo):
- `generateRouteForecast({ routeId })` — `requireSupabaseAuth`, valida que o role é `admin` ou `logistico`, lê `routes` + `scheduled_deliveries` (com `order_payload`), calcula serviços e previsto, grava em `route_payment_forecasts`, devolve `{ forecast, items }`.
- `listRouteForecasts({ routeId })` — lista o histórico para mostrar no cartão.
- `getRouteForecast({ id })` — devolve uma geração específica para reimprimir.

A heurística de "Pagar na entrega" vive numa função partilhada em `src/lib/forecasts.shared.ts` para reutilizar entre o cálculo do PDF e a reimpressão (regex em `pagamento.observacao` e/ou `forma_pagamento`).

**PDF no cliente** (não precisamos de dependência nova se usarmos `jspdf` + `jspdf-autotable`; instalar via `bun add` se ainda não existir). O PDF é montado a partir dos `items` devolvidos pela server fn — assim a reimpressão a partir do histórico produz exatamente o mesmo conteúdo.

**UI** (apenas adições em `src/routes/_authenticated.rotas.$id.tsx`):
- Importar o novo botão e cartão de histórico.
- `useAuth()` para esconder se `role !== 'admin' && role !== 'logistico'`.
- `useMutation` para gerar; `useQuery` para o histórico (invalidado após gerar).
- Toast de sucesso/erro.

## Fora do âmbito

- Não altera tabelas existentes, RLS existentes, edge functions, agendamento, conferência, otimização, fleet, templates ou login.
- Não envia o PDF por email nem cria storage bucket — o PDF é gerado/baixado no browser; o histórico guarda apenas os dados (jsonb), não o ficheiro binário.
