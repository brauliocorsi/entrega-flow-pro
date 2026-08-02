# Caixa por rota (um caixa por rota, ligado ao envelope)

Deixa de existir a ideia de "caixa do entregador". Cada rota passa a ter o seu próprio caixa: entradas, saídas, previsto e realizado daquela rota, fechado pelo envelope dessa rota. Enquanto o envelope não for entregue, o caixa dessa rota fica pendente — mesmo que o entregador já ande noutra rota, que tem o seu próprio caixa a começar do zero.

## O que muda no ecrã Caixa

**Vista do entregador ("A minha")**
- Lista de caixas, um cartão por rota, ordenada por data (mais recente primeiro).
- Cada cartão mostra: zona e data, estado do caixa (**Aberto** · **Envelope entregue, por conferir** · **Conferido**), código do envelope quando existe, Previsto vs Realizado da rota, Entradas em dinheiro, Saídas e **Em mãos**.
- Separadores: "Caixas abertos" (envelope por entregar) e "Fechados".
- O total no topo passa a chamar-se "Em mãos (caixas por entregar)" e soma apenas caixas abertos — reforçando que dinheiro pendente pertence à rota, não à pessoa.

**Vista de gestão ("Equipa")**
- Deixa de agrupar por funcionário. Passa a ser uma lista de caixas por rota, com filtros por estado (Abertos / Entregues por conferir / Conferidos) e pesquisa por zona, responsável ou código de envelope.
- Cada linha expande para os movimentos daquele caixa: entradas por método, saídas com recibo e estado, previsto vs realizado.
- Cabeçalho com totais: caixas abertos, em mãos total (só abertos), entradas, saídas e saídas por aprovar.
- O responsável (motorista/auxiliar) aparece apenas como etiqueta informativa dentro do cartão da rota.

**Detalhe do caixa da rota**
- Cabeçalho reforçado: "Caixa da rota — {zona} · {data}" com o estado e o código do envelope.
- Bloco Previsto vs Realizado da rota no topo, antes dos movimentos.
- Quando o envelope está entregue ou conferido, o caixa aparece explicitamente como **finalizado**: as saídas e o botão de fechar envelope ficam bloqueados, com a nota de que o caixa desta rota terminou e que o próximo caixa é o da próxima rota.

## Regras (já garantidas no backend, mantidas)

- Saídas ficam sempre ligadas ao caixa da rota onde foram registadas.
- Não é possível registar saídas nem novo envelope depois de o envelope ser entregue.
- Ao entregar o envelope, o em-mãos daquela rota fica a zero e o caixa é dado como finalizado; a rota seguinte começa um caixa novo.
- Envelopes por entregar mantêm o caixa em aberto por tempo indefinido, contabilizado como pendente.

## Detalhes técnicos

Não é preciso migração: `route_cash_expenses` e `route_settlements` já são por `route_id` (envelope único por rota) e `delivery_payments` já guarda `route_id`.

- `src/lib/cash.functions.ts`
  - Nova `getAllCashByRoute({ days })` (admin/logística) devolvendo uma linha por rota com estado do envelope, responsáveis, `cash_in`, `expenses_total`, `in_hand`, `forecast_total`, `realized_total`, entradas e saídas — reaproveitando `loadOperation` e `routeCash`.
  - `getMyCashRoutes` passa a incluir `forecast_total` / `realized_total` por rota (cálculo com `buildOrderCompare` a partir das entregas das rotas carregadas) e `envelope_code`.
  - `getAllCashByStaff` deixa de ser usada pela UI; removida depois de trocar o componente.
- `src/components/caixa/AdminCaixaGlobal.tsx`: reescrito como lista de caixas por rota com filtros de estado e pesquisa (usa `FilterBar`/`StatTile` do ui-kit).
- `src/routes/_authenticated.entregas.caixa.index.tsx`: cartões por rota com previsto/realizado e estado do caixa; texto e totais alinhados com "caixa por rota".
- `src/routes/_authenticated.entregas.caixa.$routeId.tsx`: cabeçalho com estado/envelope, bloco previsto vs realizado e aviso de caixa finalizado quando o envelope está entregue.
- `src/components/rotas/RouteCashPanel.tsx`: alinhar o rótulo do estado do caixa com a nova terminologia.
