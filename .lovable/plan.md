# Zonas de entrega de Portugal com mapa

## Objetivo

Pré-popular as 18 zonas CP4 macro de Portugal em `delivery_fee_ranges`, permitir cor por intervalo (manual com fallback automático por valor), e mostrar um mapa interativo com as zonas coloridas no painel de Taxas.

A lógica de prioridade já existe: o sistema já escolhe o intervalo de **menor número de prioridade** e, em empate, o mais estreito. Logo `4500–4600 (prio 0)` já vence `4000–4999 (prio 1)` sem alterações de regras — basta criar os intervalos sobrepostos.

## Mudanças

### 1. Migration: coluna `color` em `delivery_fee_ranges`

```sql
ALTER TABLE public.delivery_fee_ranges
  ADD COLUMN color TEXT;  -- NULL = usar cor automática por valor
```

Atualizar `fees.functions.ts` (`upsertFeeRange` + tipos) para aceitar `color: string | null`.

### 2. Seed das 18 zonas CP4 macro (prioridade 5 = "base nacional")

Inseridas via `supabase--insert` (skip se já existir CP igual):

| CP4 | Zona | Cor sugerida |
|---|---|---|
| 1000–1999 | Lisboa | #ef4444 |
| 2000–2499 | Santarém | #f97316 |
| 2500–2999 | Setúbal / Margem Sul | #f59e0b |
| 3000–3499 | Coimbra | #eab308 |
| 3500–3999 | Viseu / Aveiro Sul | #84cc16 |
| 4000–4499 | Porto | #22c55e |
| 4500–4999 | Braga / Norte | #10b981 |
| 5000–5499 | Vila Real | #14b8a6 |
| 5500–5999 | Bragança | #06b6d4 |
| 6000–6499 | Castelo Branco | #0ea5e9 |
| 6500–6999 | Guarda | #3b82f6 |
| 7000–7499 | Évora | #6366f1 |
| 7500–7999 | Beja | #8b5cf6 |
| 8000–8499 | Faro Oeste | #a855f7 |
| 8500–8999 | Faro Este / Algarve Este | #d946ef |
| 9000–9499 | Madeira | #ec4899 |
| 9500–9799 | Açores (S. Miguel/Sta Maria) | #f43f5e |
| 9800–9999 | Açores (restantes) | #64748b |

Prioridade base = `5` (deixa folga para sub-intervalos com prio 0–4 ganharem facilmente). Valor inicial `0 €` — o utilizador edita depois.

### 3. UI `_authenticated.admin.taxas.tsx` — cor + visual

- Novo campo `color` no Dialog: `<input type="color">` + botão "Auto" que limpa o campo (passa a NULL → gradiente automático).
- Helper `getRangeColor(r)`: devolve `r.color` se definido; senão calcula gradiente verde→vermelho com base no valor (`fee=0 → #94a3b8`, `0–25 → verde→amarelo`, `25+ → laranja→vermelho`).
- Cada linha da lista mostra um "chip" colorido (12×12 rounded) antes do label, e o `Badge` de preço usa borda na cor.

### 4. Mapa interativo de Portugal

Nova aba/seção na página `Taxas` com `<MapaZonas />`:

- Lib: `react-leaflet` + `leaflet` (já não estão no projeto — `bun add leaflet react-leaflet @types/leaflet`).
- GeoJSON dos **distritos de Portugal** (incluindo Madeira e Açores). Fonte: ficheiro estático colocado em `src/assets/portugal-distritos.geojson` (carregado do CartoBase/CAOP simplificado, ~150 KB).
- Mapeamento distrito → CP4 representativo (tabela hard-coded em `src/lib/portugal-zones.ts`, ex: `"Lisboa" → "1500"`, `"Porto" → "4100"`, `"Açores" → "9500"`).
- Para cada distrito, encontra o `delivery_fee_ranges` ativo correspondente (mesma regra de prioridade que `suggestDeliveryFee`) e pinta o polígono com `getRangeColor` + opacidade 0.6.
- Tooltip ao passar: nome do distrito, intervalo, taxa em €.
- Legenda lateral: lista das zonas + cor + valor (clicar foca a zona no mapa).

### 5. Atualizações de tipos/serverFns

- `fees.functions.ts`: `upsertFeeRange.inputValidator` aceita `color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional()`. `listFeeRanges` já devolve `*` — color virá automaticamente.
- Tipo `Range` na página admin: adicionar `color: string | null`.

## Detalhes técnicos

- O carregamento do GeoJSON é feito client-side (`fetch` para `/portugal-distritos.geojson` colocado em `public/`), evitando bundle pesado em SSR.
- Leaflet precisa de CSS: importar `leaflet/dist/leaflet.css` no `__root.tsx` ou na própria página.
- A página `/admin/taxas` vive em `_authenticated/` — Leaflet só renderiza no cliente, compatível com `ssr: false` desse subtree.
- Não toco em `suggestDeliveryFee` — já faz o que o utilizador pede para prioridades.

## Fora de âmbito

- Edição de cor por arrastar no mapa (apenas visualização).
- Polígonos por código postal CP4 individuais (só distritos — granularidade pedida).
- Atribuição automática de rotas com base no mapa.
