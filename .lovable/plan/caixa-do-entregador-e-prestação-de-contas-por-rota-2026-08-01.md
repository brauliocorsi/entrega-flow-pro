# Caixa do entregador e prestação de contas por rota

Dar ao entregador a visão do dinheiro que tem em mãos durante o dia, permitir registar despesas da rota com comprovativo, fechar a rota num "envelope" com o valor a depositar, e dar ao admin um ecrã de conferência para aprovar tudo.

## O que o entregador passa a ver

**Cartão "Caixa" em O meu dia (por rota)**
- Recebido em Dinheiro
- Despesas registadas (gasóleo, ferramentas, adiantamentos, outros)
- **Em mãos = Dinheiro − Despesas** (destaque grande)
- Lista dos outros métodos (MB Way, Multibanco, Transferência, Cheque) como movimentos separados, cada um com o valor recebido e etiqueta "Aguarda conciliação do admin" — para o entregador confirmar que recebeu naquela forma, sem entrar no valor em mãos.

**Novo ecrã "Caixa da rota"** (`/entregas/$routeId/caixa`)
- Registar saída: categoria (Gasóleo, Ferramentas, Adiantamento, Refeição, Outro), valor, descrição e **foto do recibo obrigatória**.
- Lista das despesas do dia com estado: Pendente / Aprovada / Rejeitada (só o admin altera).
- Só pode apagar despesas ainda pendentes e criadas por si.

**Fechar envelope (prestação de contas)**
- Botão "Fechar envelope" no fim do dia. Mostra resumo: previsto, recebido por método, despesas, **valor a depositar (dinheiro em mãos)**.
- Gera um **código de envelope** legível derivado da rota (ex.: `ENV-2026-08-01-VREAL-4F2A`) para escrever no envelope físico.
- O entregador confirma o valor que colocou no envelope; a partir daí a rota fica "Entregue — pendente de conferência" e o caixa fica bloqueado para novas despesas/recebimentos.

## O que o admin passa a ver (Conferência)

Novo bloco "Prestação de contas" com uma linha por rota do dia:
- Estado: Aberta · Envelope entregue · Conferida
- Código do envelope, dinheiro previsto vs. declarado (diferença destacada a vermelho/verde)
- Cada método não-dinheiro com botão **Confirmar** individual (conciliação bancária)
- Cada despesa com foto do recibo e botões **Aprovar / Rejeitar**
- Botão final **Fechar conferência**, só disponível quando todos os métodos estão confirmados e todas as despesas decididas. Fecho grava quem conferiu e quando.

Apenas administradores podem confirmar métodos, aprovar despesas ou fechar a conferência.

## Detalhes técnicos

**Base de dados (migração)**
- `route_cash_expenses`: `route_id`, `category`, `amount`, `description`, `receipt_path` (obrigatório), `created_by`, `created_by_name`, `status` (`pendente|aprovada|rejeitada`), `reviewed_by`, `reviewed_at`, `review_notes`, timestamps.
- `route_settlements` (um por rota, `route_id` único): `envelope_code`, `cash_expected`, `cash_declared`, `expenses_total`, `methods` jsonb (`[{method_name, amount, confirmed, confirmed_at}]`), `status` (`aberta|entregue|conferida`), `submitted_by/_name/_at`, `reviewed_by/_at`, `notes`, timestamps.
- GRANTs para `authenticated` e `service_role`; RLS: entregador lê/insere apenas em rotas onde está escalado (`is_route_courier`), admin/logístico leem tudo, **update/aprovações só `has_role(admin)`**; despesas de rotas já conferidas ficam imutáveis.
- Bucket privado `recibos-caixa` com políticas de leitura/escrita equivalentes (entregador só as suas fotos, admin tudo).

**Server functions** (`src/lib/cash.functions.ts`, todas com `requireSupabaseAuth`)
- `getRouteCash({ routeId })` — recebimentos por método, despesas, em mãos, envelope.
- `addCashExpense` / `deleteCashExpense` (pendentes, do próprio).
- `submitSettlement({ routeId, cash_declared })` — gera código e passa a `entregue`.
- `reviewExpense`, `confirmSettlementMethod`, `closeSettlement` — só admin.

**Frontend**
- `src/routes/_authenticated.entregas.index.tsx`: cartão Caixa por rota + link para o caixa.
- Nova rota `src/routes/_authenticated.entregas.$routeId.caixa.tsx` (despesas + fechar envelope), acessível ao entregador.
- `src/routes/_authenticated.conferencia.tsx`: novo painel "Prestação de contas" (admin), reutilizando `getCashSummary` para o previsto.
- Realtime já ativo em `delivery_payments` mantém os totais em mãos atualizados; adiciona-se invalidação nas novas queries.
