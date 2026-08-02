# Abrir Ordem de Serviço no GestãoClick a partir das Assistências

## Objetivo

Na página **Assistências**, cada pedido passa a ter um botão **Abrir assistência no GestãoClick**, que cria uma Ordem de Serviço (OS) no GestãoClick com o cliente da venda, o produto avariado e todo o relato do entregador. As notas de resolução escritas pelo ADM são depois enviadas para a mesma OS.

## O que o utilizador vai ver

- Botão **Abrir assistência no GestãoClick** em cada cartão de assistência (apenas admin/logística).
- Antes de enviar, uma janela de confirmação mostra o que vai ser criado: cliente, nº da venda de origem, produto avariado, descrição do entregador, fotos anexadas (quantidade) e rota/data.
- Depois de criada, o cartão mostra um selo **OS #\<número\>** com data de envio e o botão passa a **Atualizar OS** (reenvia estado e notas).
- Se falhar, aparece o motivo devolvido pelo GestãoClick e o botão permite tentar de novo.
- Ao marcar a assistência como **Resolvida**, as notas de resolução são enviadas para a OS (observações internas) e a OS é marcada como concluída, quando a situação existir no GestãoClick.

## Conteúdo enviado para a Ordem de Serviço

- **Cliente**: obtido da venda de origem (`cliente_id` da nota de encomenda); em falta, procura por nome/documento.
- **Produto avariado**: nome do produto reportado, ligado ao item da venda quando existir correspondência.
- **Descrição/defeito**: relato do entregador, quem abriu, data/hora, rota e zona.
- **Referência**: nº da nota de encomenda de origem e ligação à entrega.
- **Fotos**: as URLs assinadas das fotos são incluídas nas observações (a API não aceita upload de ficheiros).
- **Notas de resolução do ADM**: acrescentadas às observações no envio de atualização.

## Passos de implementação

1. **Descoberta da API** (primeiro passo do desenvolvimento): consultar `GET /api/ordens_servicos` e `GET /api/situacoes_ordens_servicos` com as credenciais já existentes para confirmar o caminho, o formato de criação e os IDs de situação. O mapeamento final (`aberta` → situação inicial, `resolvida` → concluída) é fixado com base nessa resposta. Se o endpoint de OS não estiver disponível no plano da conta, o botão fica visível com aviso claro em vez de falhar em silêncio.

2. **Base de dados**: acrescentar à tabela `service_requests` as colunas `gc_os_id`, `gc_os_number`, `gc_client_id`, `gc_sync_status`, `gc_sync_error` e `gc_synced_at` (migração com os GRANT correspondentes).

3. **Módulo server-only `src/lib/gc-service-order.server.ts`**: reutiliza a autenticação e os utilitários já usados no fecho de rota (`gc-closure.server.ts`) para resolver cliente, situação e criar/atualizar a OS, devolvendo sempre o erro do GestãoClick quando não for possível.

4. **Server functions em `src/lib/service-requests.functions.ts`**:
   - `openServiceOrderInGC({ id })` — cria a OS, grava o ID/nº devolvido e marca o estado de sincronização.
   - `syncServiceOrderInGC({ id })` — reenvia estado e notas de resolução para a OS existente.
   - Ambas restritas a admin/logística e idempotentes (não duplicam OS se já existir `gc_os_id`).
   - `updateServiceRequest` passa a acionar o envio das notas quando a assistência já tem OS e é marcada como resolvida.

5. **Interface (`/admin/assistencias`)**: botão + janela de pré-visualização, selo do nº da OS, mensagem de erro e botão de reenvio; carregamento dos dados do cliente e produtos da venda a partir do payload da entrega.

## Detalhes técnicos

- Chamadas à API feitas em servidor (`createServerFn` + módulo `.server.ts`), nunca no browser; as credenciais `GESTAOCLICK_*` já existem.
- As fotos ficam em URLs assinadas do bucket `assistencias` com validade longa, incluídas no texto das observações.
- Erros do GestãoClick são propagados com estado HTTP e corpo, gravados em `gc_sync_error` e mostrados no cartão.
