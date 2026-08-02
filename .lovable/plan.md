# Liberar rota ao entregador para revisão prévia

Novo passo entre "preparar rota" e "iniciar rota": o admin/logística liberta a rota ao entregador, que a revê (ordem das entregas + simulação de trajeto) em modo leitura, pode sinalizar entregas que sugere retirar, e no fim confirma. A rota fica então "Confirmada pelo entregador" e pronta para iniciar.

## Fluxo

```text
Em preparação → [Liberar ao entregador] → Em revisão pelo entregador
   → entregador vê ordem + simulação (sem editar)
   → entregador marca entregas sugeridas para remoção (com motivo)
   → entregador clica "Confirmar rota"
→ Confirmada pelo entregador → [Iniciar rota] (bloqueia tudo)
```

## Na rota (admin / logística)

- Botão **Liberar ao entregador** no painel "Preparação da rota", ao lado de Iniciar rota. Regista quem libertou e quando.
- Estado visível: "Em preparação" → "Em revisão pelo entregador" → "Confirmada pelo entregador · nome · data/hora".
- Enquanto está em revisão, a rota continua totalmente editável pelo admin/logística (nada é bloqueado).
- Lista das entregas que o entregador sugeriu remover, com motivo, e ação para retirar a entrega da rota ou ignorar a sugestão. As sugestões nunca alteram a rota sozinhas.
- Botão **Retirar libertação** caso queiram voltar atrás.

## No entregador

- Nova secção "Rotas para revisão" (em "O meu dia"), que mostra as rotas libertadas em que está escalado, mesmo que sejam de dias futuros — hoje só aparecem rotas do próprio dia.
- Ao abrir a rota: lista das paragens pela ordem definida (só leitura), morada, código postal e valor, mais a simulação de trajeto com mapa, distância e tempo total.
- Em cada entrega, botão **Sugerir remoção** com campo de motivo (e possibilidade de anular a sugestão). Não remove nem reordena nada.
- Botão **Confirmar rota (OK)** no fim, que marca a rota como confirmada pelo entregador; enquanto não confirmar, fica "Em revisão". Pode reabrir a confirmação até a rota ser iniciada.
- O "Marcar ordem como pronta" existente é substituído por esta confirmação, para não haver dois estados a dizer o mesmo.

## Regras

- Libertar não bloqueia a rota; só iniciar bloqueia (comportamento atual mantém-se).
- Se a rota for alterada depois de confirmada (ordem, entregas, data ou equipa), a confirmação é anulada e o entregador tem de rever outra vez.
- Só quem está escalado na rota (motorista ou auxiliar) pode rever e confirmar.
- "Iniciar rota" avisa quando ainda não há confirmação do entregador, mas não impede o arranque (admin/logística decidem).

## Detalhes técnicos

Migração (tabela `routes`): `released_to_courier_at`, `released_to_courier_by`, `released_by_name`, `courier_confirmed_at`, `courier_confirmed_by`, `courier_confirmed_by_name`. Tabela `scheduled_deliveries`: `removal_suggested_at`, `removal_suggested_by_name`, `removal_reason`.

Novas server functions em `src/lib/routes.functions.ts` (`releaseRouteToCourier`, `unreleaseRouteToCourier`, admin-only) e em `src/lib/courier.functions.ts` (`getMyReviewRoutes`, `confirmRouteAsCourier`, `suggestDeliveryRemoval`), todas com validação de perfil/escala já usada no ficheiro. Reset da confirmação dentro de `reorderDeliveries`, `updateRouteDate`, `updateRouteFleet` e nas funções de atribuição de entregas.

UI: novos estados e botões em `src/components/rotas/RouteLockPanel.tsx`; painel de sugestões em `src/routes/_authenticated.rotas.$id.index.tsx`; nova secção e vista de revisão só-leitura em `src/routes/_authenticated.entregas.index.tsx`, reutilizando o componente de simulação de trajeto já existente na página da rota (extraído para componente partilhado).
