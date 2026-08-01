# Refatoração UI/UX — app mobile-first

Modernizar toda a interface com uma navegação tipo aplicação nativa, adaptando-se automaticamente a telemóvel, tablet e desktop, mantendo a paleta Azul Profundo refinada e adicionando modo escuro.

## Navegação adaptativa

Um único componente de layout deteta a largura do ecrã e escolhe a navegação:

```text
MOBILE (<768px)          TABLET (768–1279px)      DESKTOP (>=1280px)
┌──────────────┐         ┌──┬───────────────┐     ┌──────┬────────────┐
│ topbar fina  │         │ic│  topbar       │     │ side │  topbar    │
│              │         │on│               │     │ bar  │            │
│   conteúdo   │         │  │  conteúdo     │     │ full │  conteúdo  │
│              │         │ra│               │     │      │            │
├──────────────┤         │il│               │     │      │            │
│ ▢ ▢ (+) ▢ ▢ │         └──┴───────────────┘     └──────┴────────────┘
└──────────────┘
```

- **Telemóvel**: barra inferior fixa com 4 separadores (Rotas, Agendar-lista, Conferência, Mais) e um **botão central destacado** para a ação principal (Agendar entrega). Topbar fina com título da página, avatar/menu do utilizador e ações contextuais. O separador "Mais" abre uma gaveta (sheet) com Otimização, Configurações, Exportar e Sair.
- **Tablet**: rail lateral estreito só com ícones (expande ao passar o rato) + topbar.
- **Desktop**: sidebar completa com secções agrupadas (Operação, Comercial, Acessos, Dados), colapsável.

Tudo o que hoje está no dropdown "Configurações" passa a viver nestes menus, com os mesmos controlos de permissão por role (admin / logístico / vendedor).

## Modo escuro

Deteta a preferência do sistema no arranque, com toggle manual (claro / escuro / sistema) guardado no dispositivo. Sem "flash" branco ao carregar.

## Refresco visual

- Paleta Azul Profundo refinada (#0f1b3d → #3b6fa0) aplicada como tokens semânticos, com variantes claras e escuras.
- Cartões mais suaves (cantos arredondados, sombras leves), tipografia com hierarquia mais clara, espaçamento consistente.
- Estados vazios, de carregamento (skeletons) e de erro uniformizados.
- Alvos de toque com ≥44px, safe-area do iPhone respeitada na barra inferior.

## Adaptação das páginas ao telemóvel

- **Rotas**: as tabelas passam a cartões empilhados em telemóvel (rota de hoje em destaque mantém-se), tabela normal em desktop.
- **Agendar**: passos do wizard em ecrã inteiro no telemóvel, com barra de progresso no topo e botões de ação fixos em baixo; a seleção múltipla e a barra "Agendar em massa" ficam acima da tab bar.
- **Detalhe/Fecho de rota, Conferência**: formulários numa coluna, ações principais fixas em baixo.
- **Admin (templates, taxas, veículos, equipa, utilizadores, exportar)**: tabelas com scroll horizontal controlado ou cartões em telemóvel; o mapa de zonas ocupa a largura total.

Nenhuma lógica de negócio, cálculo de rotas ou integração com o GestãoClick é alterada — apenas apresentação e navegação.

## Detalhes técnicos

- Novo `src/hooks/use-breakpoint.ts` (mobile / tablet / desktop) baseado em `matchMedia`, seguro para SSR (rende primeiro o layout desktop-neutro e ajusta após hidratação, sem mismatch).
- `src/routes/_authenticated.tsx` reescrito como shell: `<AppShell>` que escolhe `MobileTabBar`, `TabletRail` ou `DesktopSidebar`.
- Novos componentes em `src/components/nav/`: `AppShell.tsx`, `MobileTabBar.tsx`, `MoreSheet.tsx`, `DesktopSidebar.tsx`, `TopBar.tsx`, `ThemeToggle.tsx`.
- Config de navegação centralizada (`src/lib/nav-items.ts`) com rótulo, ícone, rota e roles permitidas — uma única fonte de verdade para os três layouts.
- Tema: `src/components/theme-provider.tsx` + tokens `--background/--primary/...` atualizados em `:root` e `.dark` no `src/styles.css` (oklch). Sem cores hardcoded nos componentes.
- Uso dos componentes shadcn já existentes (`sheet`, `dialog`, `card`, `dropdown-menu`); nenhum pacote novo.
- `head()` de cada rota revisto com título e descrição próprios.

## Ordem de execução

1. Tokens de tema + provider de modo escuro.
2. Config de navegação + `AppShell` com os três layouts.
3. Topbar, tab bar mobile com botão central, sheet "Mais".
4. Adaptação página a página (Rotas → Agendar → Conferência → Admin).
5. Verificação em telemóvel, tablet e desktop com capturas.
