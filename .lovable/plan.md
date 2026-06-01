# UP Agenda — plano de construção

App web responsiva para a equipa de vendas da UP Móveis agendar entregas em rotas pré-definidas.

## Fase 1 — Base de dados e autenticação ✅ (já aplicada)
- Enums, tabelas (`profiles`, `user_roles`, `route_templates`, `routes`, `scheduled_deliveries`), RLS, triggers, índice único parcial em `order_number` para evitar duplicados, realtime
- Trigger `handle_new_user` promove automaticamente `brauliocorsi@upmoveis.pt` a admin

## Fase 2 — Bootstrap + login
- `src/start.ts`: registar `attachSupabaseAuth` no `functionMiddleware`
- `src/hooks/use-auth.tsx`: contexto de sessão (`useAuth`) com `onAuthStateChange`
- `/login` — email/password + Google (broker Lovable)
- `/_authenticated.tsx` — layout protegido com header (logo UP, rotas, agendar, admin se aplicável, logout)
- `/` redirecciona para `/rotas` ou `/login`

## Fase 3 — Gestão de rotas (admin)
- `/admin/templates` — CRUD de templates (nome, dia da semana, zona, prefixos CP, capacidade m³, motorista default)
- Server fn `generateRoutesForWeeks(4)` cria/idempotente rotas a partir dos templates ativos
- Server route `/api/public/cron/generate-routes` chamada por pg_cron diário (apikey)
- Botão manual "Gerar próximas 4 semanas" no admin

## Fase 4 — Visualização (todos)
- `/rotas` com toggle Calendário/Lista
- Cores por estado+ocupação (verde / âmbar / vermelho / cinza-fechada)
- Formato PT (`€ 1.450,00`, `dd/MM/yyyy`)
- Subscrição realtime na rota `/rotas` invalida queries

## Fase 5 — Integração GestãoClick
- Secrets `GESTAOCLICK_API_KEY`, `GESTAOCLICK_EMAIL`, `GESTAOCLICK_BASE_URL` ✅
- Server fn `fetchOrderFromGestaoClick(numero)` → DTO normalizado (cliente, morada, CP, telefone, valor total, pago, falta, itens)
- Devolve também `existingActiveDelivery` se já agendado

## Fase 6 — Wizard de agendamento (4 passos)
- `/agendar` ou `/rotas/$id/agendar`
- **Passo 1** Nº encomenda → busca em GestãoClick → mostra dados + aviso se duplicado
  - bloqueante se `agendado`/`confirmado` (ver rota / voltar)
  - informativo se entrega anterior `nao_entregue`/`entregue_parcial` (continuar liga via `rescheduled_from_id`)
- **Passo 2** Tipo (entrega/levantamento/recolha/troca), tempo estimado, m³
- **Passo 3** Escolher rota compatível (CP + capacidade restante)
- **Passo 4** Confirmar → cria `scheduled_deliveries` (validação server-side anti-race)

## Fase 7 — Detalhe + mapa + fecho
- `/rotas/$id` lista entregas, exibe Google Maps embebido (browser key + connector)
- Botão "Otimizar Trajeto" → Routes API `computeRoutes` com `optimizeWaypointOrder: true`, ponto de partida **Rua Industrial, 5, Modelos, Paços de Ferreira**
- `/rotas/$id/fechar` (admin ou vendedor atribuído) — radio por entrega: entregue / não entregue / parcial + notas + checkbox "Reagendar"
- Dashboard mostra contador de "Reagendamentos pendentes"

## Decisões confirmadas
- Reagendamento manual via wizard (não automático)
- Geração de rotas: ambas (cron + botão admin)
- Email admin fixo: `brauliocorsi@upmoveis.pt`
- Morada armazém: `Rua Industrial, 5, Modelos, Paços de Ferreira`

## Próximo passo após implementação
Conectar Google Maps no painel de connectors (necessário para o mapa e otimização).
