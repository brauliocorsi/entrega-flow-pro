# Refatorar UI/UX: Caixa, Rotas, Conferência e menu lateral

Objetivo: mesma funcionalidade, ecrãs mais simples de ler e trabalhar. Nada de lógica de negócio alterada — apenas apresentação, agrupamento e navegação.

## 1. Menu lateral reagrupado

Hoje os grupos são: Principal, Operação, Comercial, Acessos, Dados — com "Rotas", "Agendar", "Conferência", "Caixa", "O meu dia", "Otimização" todos misturados em "Principal".

Novos grupos (mesmos itens, sem remover nada):

```text
DIA A DIA        O meu dia · Caixa · Envelopes
ROTAS            Rotas · Otimização · Templates de rota
AGENDAMENTOS     Agendar · Assistências
FINANCEIRO       Conferência · Taxas de entrega · Formas de pagamento
CONFIGURAÇÕES    Veículos · Equipa (motoristas) · Utilizadores · Exportar dados
```

- Grupo "Configurações" fica recolhível (fechado por defeito) na sidebar, para reduzir ruído.
- Barra inferior mobile e o painel "Mais" passam a usar os mesmos grupos automaticamente.
- Regras de visibilidade por perfil mantêm-se exatamente como estão (o entregador continua a ver apenas O meu dia, Caixa, Envelopes, Rotas, Agendar, Conferência).

## 2. Caixa (`/entregas/caixa`)

- Topo com um único cartão-resumo forte: **Total em mãos**, e por baixo três números pequenos lado a lado — entradas, saídas, rotas por prestar contas.
- Separadores claros em vez de blocos empilhados: **Por fechar** / **Fechadas**, com contador em cada.
- Cartões de rota simplificados: linha 1 zona + data, linha 2 valor em dinheiro em destaque, badge de estado à direita, seta para entrar. Retirar texto repetido.
- Alternância admin ("Todos os funcionários" / "A minha caixa") passa a um seletor segmentado no topo, alinhado com o título.
- Estados vazios e de carregamento com skeletons em vez de "A carregar…".

## 3. Rotas (lista `/rotas` e detalhe `/rotas/$id`)

Lista:
- Cabeçalho compacto com pesquisa e filtros numa só barra sticky.
- Cartão de rota resume o essencial numa grelha legível: zona, data, motorista, nº paragens, estado (badge de cor), valor previsto. Ações secundárias passam para um menu "⋯".

Detalhe:
- Cabeçalho fixo com zona, data, estado e as ações principais (Liberar, Iniciar, Fechar) sempre visíveis.
- Conteúdo reorganizado em separadores em vez de uma página muito longa:
  - **Entregas** (ordem + lista ativas/histórico)
  - **Trajeto** (simulação/mapa)
  - **Caixa** (recebimentos)
  - **Equipa & bloqueio** (frota, sugestões do entregador, lock)
- Barra de resumo com 3-4 métricas no topo (paragens, entregues, a receber, recebido).

## 4. Conferência de valores (`/conferencia`)

- Largura útil maior (hoje limitada a `max-w-3xl`), com barra de resumo no topo: envelopes por conferir, total a receber, diferenças.
- Separadores mantidos (Envelopes / Histórico / Conciliação) mas com contadores e ícones.
- Lista de envelopes com linhas mais legíveis: cliente/rota à esquerda, valores alinhados à direita em coluna fixa, diferenças destacadas a cor só quando existem.
- Filtros e pesquisa existentes passam para uma barra única sticky acima da lista.

## Notas técnicas

- `src/lib/nav-items.ts`: novos valores de `group` + `GROUP_LABEL`; sem alterar `canSee`/`visibleItems`.
- `DesktopSidebar.tsx` ganha grupos recolhíveis; `MobileTabBar.tsx` e `MoreSheet.tsx` atualizam a ordem dos grupos.
- Novos componentes de apresentação partilhados: `PageHeader`, `StatTile`, `FilterBar` em `src/components/ui-kit/` para reutilizar nos três ecrãs.
- `_authenticated.rotas.$id.index.tsx` é dividido em secções/tabs extraídas para `src/components/rotas/` sem mudar as queries nem as mutações.
- Sem migrações, sem alterações a server functions.
