# Exportar produtos do GestãoClick → Google Sheets

## O que vai acontecer

1. Ligar o conector **Google Sheets** ao projeto (OAuth — tu autorizas com a tua conta Google).
2. Adicionar um botão **"Exportar produtos para Google Sheets"** em **Admin** (área restrita), porque vais querer correr isto mais do que uma vez.
3. Ao clicar, o servidor:
   - Pagina toda a API `/api/produtos` do GestãoClick (só ativos).
   - Cria uma nova folha no teu Google Drive com nome `Produtos GestãoClick — YYYY-MM-DD HH:mm`.
   - Escreve cabeçalho + todas as linhas.
   - Devolve o link da folha (abre em nova aba + toast com URL).

## Colunas exportadas (todos os campos disponíveis na API)

ID, Nome, Código, Código de barras, Descrição, Unidade, NCM, CEST, Categoria, Marca, Tipo,
Estoque atual, Estoque mínimo, Estoque máximo, Localização,
Valor de custo, Valor de venda, Margem de lucro,
Peso líquido, Peso bruto, Altura, Largura, Comprimento,
Situação (ativo/inativo), Origem, Garantia, Observações, Tags,
Data de criação, Data de atualização.

Campos extra que o GestãoClick devolver (variações, impostos, fornecedor associado, etc.) entram em colunas adicionais automaticamente — nada é descartado.

## Detalhes técnicos

- **Conector**: `google_sheets` via connector-gateway (`https://connector-gateway.lovable.dev/google_sheets/v4`). Sem chaves no código.
- **Server function** nova `exportProductsToSheets` em `src/lib/products-export.functions.ts`, protegida por `requireSupabaseAuth` + check de role `admin`.
- Fetch paginado ao GestãoClick reutilizando `gestaoclick-core.server.ts`.
- Sheets API: `POST /spreadsheets` (criar) → `PUT /spreadsheets/{id}/values/Produtos!A1?valueInputOption=RAW` (preencher em lote único).
- UI: card novo em `src/routes/_authenticated.admin.*` (ou botão na página de admin existente) com estado de loading e link final.

## Limitações

- O ficheiro fica na conta Google que autorizar o conector (a tua). Para partilhar, defines permissões manualmente no Sheets.
- Faturas com milhares de produtos podem demorar ~10–30s (paginação sequencial).
