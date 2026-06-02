# Módulo de Compras com OCR

Novo separador "Compras" onde se tira foto (ou faz upload) de uma fatura de fornecedor, a IA transcreve, o utilizador revê e o sistema cria a compra + lançamento financeiro no GestãoClick.

## Fluxo do utilizador

1. Menu → **Compras** → botão "Nova compra por foto".
2. No mobile abre a câmara; no desktop aceita upload (JPG/PNG/PDF, até 10MB).
3. Loading "A ler fatura…" — IA devolve dados estruturados + score de confiança.
4. Ecrã de revisão:
   - Fornecedor (nome, NIF), nº fatura, data, vencimento
   - Linhas: descrição, qtd, preço unit., total, IVA, + match com produto do GestãoClick
   - Totais (subtotal, IVA, total)
   - Pergunta financeira: **"Já paga"** ou **"Conta a pagar"** (+ data vencimento + método)
   - Se confiança ≥ 90% em todos os campos críticos e todos os produtos mapeados → botão "Confirmar e enviar". Caso contrário → campos marcados a amarelo, edição obrigatória.
5. Confirmar → cria fornecedor (se novo), produtos novos (se não houver match), compra e movimento financeiro no GestãoClick. Mostra nº da compra criada.

## Arquitetura técnica

### Frontend
- `src/routes/_authenticated.compras.tsx` — listagem de compras importadas (histórico)
- `src/routes/_authenticated.compras.nova.tsx` — captura/upload + revisão
- Componente `<InvoiceCapture>` com `<input type="file" accept="image/*,application/pdf" capture="environment">` (câmara nativa no mobile, upload no desktop)
- Item no menu lateral de `_authenticated.tsx`

### Server Functions (`src/lib/purchases.functions.ts`)
- `extractInvoiceFromImage({ fileBase64, mimeType })` — chama Lovable AI (`google/gemini-2.5-pro`, multimodal) com schema Zod estruturado: fornecedor, nº fatura, datas, linhas, totais, IVA, + `confidence` por campo
- `matchProducts({ items })` — para cada linha procura produto no GestãoClick por nome aproximado; devolve `match | null`
- `createPurchaseInGestaoClick({ payload })` — orquestra:
  1. POST `/api/fornecedores` se NIF não existir
  2. POST `/api/produtos` para cada produto sem match (com preço de custo da fatura)
  3. POST `/api/compras` com itens, nº fatura, fornecedor
  4. POST `/api/contas_pagar` (paga ou em aberto conforme escolha)
- `listImportedPurchases()` — devolve histórico da tabela local

### Lovable AI
Usar `google/gemini-2.5-pro` (multimodal forte para OCR de faturas PT). Prompt pede JSON estruturado via `Output.object` com Zod. Não exige chave nova — usa `LOVABLE_API_KEY` já configurada.

### GestãoClick — endpoints novos
Estender `gestaoclick-core.server.ts` com helpers para `fornecedores`, `produtos` (criação), `compras`, `contas_pagar`. Reutiliza credenciais existentes (`GESTAOCLICK_API_KEY`, `GESTAOCLICK_EMAIL`, `GESTAOCLICK_BASE_URL`).

### Base de dados
Tabela `imported_purchases` (histórico/auditoria local):
- `id`, `created_at`, `created_by`
- `image_url` (Supabase Storage bucket `invoice-scans`, privado, só admin/logístico)
- `extracted_payload` jsonb (resposta da IA)
- `final_payload` jsonb (depois da revisão)
- `gestaoclick_purchase_id`, `gestaoclick_invoice_number`
- `status` (pendente | enviada | erro), `error_message`

RLS: admin + logístico podem criar/ver; vendedor não acede.

## Pontos a confirmar contigo durante a implementação

- Confirmar nomes exatos dos endpoints `/api/compras`, `/api/fornecedores`, `/api/contas_pagar` no painel GestãoClick (a documentação varia por conta). Se algum não existir/retornar 404, paro e peço esclarecimento.
- Conta financeira padrão para lançar a despesa (caixa/banco) — necessário ID; podemos guardar como secret `GESTAOCLICK_DEFAULT_ACCOUNT_ID` ou escolher no ecrã de revisão.

## Limites

- Faturas muito borradas/manuscritas podem dar baixa confiança → cai sempre na revisão manual (é o objetivo do modo híbrido).
- PDF multi-página: lê só a 1ª página nesta primeira versão.
- Custo: cada extração consome créditos Lovable AI (faturas com muitas linhas usam mais tokens).
