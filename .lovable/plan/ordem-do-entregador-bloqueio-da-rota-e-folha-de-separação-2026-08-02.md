# Ordem do entregador, bloqueio da rota e folha de separação

Três coisas: registar quem alterou a ordem das entregas, um "Iniciar rota" que tranca a rota para todos, e uma exportação Excel dos produtos da rota para dar saída de stock no ERP.

## 1. Aviso de alteração de ordem

- Quando o entregador guarda a ordem das entregas, a rota passa a guardar quem alterou e quando.
- Na página da rota (admin/logística) aparece um aviso: "Ordem ajustada pelo entregador — João Silva, 02/08 09:14", com estado "Pronta pelo entregador".
- O entregador tem um botão "Marcar como pronta" que sinaliza que terminou de organizar a sequência (sem ainda trancar nada).
- O mesmo registo acontece se for o admin a reordenar (fica "Ordem ajustada por …"), para haver sempre rasto do responsável.

## 2. Botão "Iniciar rota" — bloqueio total

- Botão visível na rota (para o entregador na sua rota e para admin/logística), com confirmação: "Depois de iniciada, ninguém pode alterar a rota."
- Depois de iniciada fica bloqueado para todos os perfis:
  - reordenar entregas;
  - adicionar/remover entregas na rota;
  - mudar motorista, auxiliar, viatura, data ou zona;
  - importar marcações para essa rota; mover/mesclar entregas de ou para ela.
- Continua permitido: registar recebimentos, resultados de entrega, despesas de caixa, assistências e o fecho da rota — o trabalho do dia não pode ficar preso.
- Só o admin pode reverter ("Desbloquear rota"), com o motivo registado e aviso de quem desbloqueou.
- A rota mostra um selo "Em curso — bloqueada desde 09:20 (iniciada por …)".

## 3. Exportar Excel de separação

- Botão "Exportar separação (Excel)" na página da rota, para admin/logística.
- Ficheiro `.xlsx` com uma linha por produto agregado na rota:
  - Código do produto, Nome do produto, Quantidade total.
- Segunda folha "Por entrega": nº de encomenda, cliente, código, produto, quantidade — para conferir na carga.
- Cabeçalho com data da rota, zona, motorista e viatura.
- Só produtos (exclui linhas de montagem/entrega/serviço).

### Sobre o código do produto

As entregas já guardadas não têm o código do produto — só a descrição, quantidade e valores. Para o Excel ficar completo:
- Passa a guardar-se o código e o ID do produto no momento em que a encomenda é importada do GestãoClick.
- Para as entregas já existentes, o código é obtido no momento da exportação, procurando o produto no GestãoClick pela descrição; quando não houver correspondência exata, a célula fica vazia e a linha é marcada "código por confirmar" para revisão humana.

## Detalhes técnicos

Migração:
- `routes`: `order_changed_by`, `order_changed_by_name`, `order_changed_at`, `order_ready_at`, `started_by`, `started_by_name`, `unlocked_by_name`, `unlocked_at`, `unlock_reason`.

Backend (`src/lib/routes.functions.ts` e afins):
- `reorderDeliveries` grava o responsável e bloqueia também admin/logística quando `started_at` está definido.
- Novo `markRouteReady`, `unlockRoute` (só admin); `startRoute` passa a gravar quem iniciou e a aceitar admin/logística.
- Guarda de bloqueio partilhada aplicada em `updateRoute*`, atribuição de entregas, mover/mesclar e no `gc-import`.
- Nova `exportRoutePickingXlsx` em `src/lib/route-picking.functions.ts`: lê `order_payload.items` (kind `produto`), agrega por código/descrição, resolve códigos em falta via GestãoClick (`/api/produtos?nome=`), devolve base64 gerado com `xlsx` (já instalado).

Frontend:
- `OrdemEntregasEditor` recebe `locked` real (a partir de `started_at`) também na vista de admin, e mostra o aviso de quem alterou.
- Cartão de estado na rota (`_authenticated.rotas.$id.index.tsx`) com selos "Pronta pelo entregador" / "Em curso — bloqueada" e botões Iniciar/Desbloquear/Exportar.
- Bloco do entregador (`_authenticated.entregas.index.tsx`) com "Marcar como pronta" e "Iniciar rota" com confirmação.
