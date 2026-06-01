
## Diagnóstico

A API GestãoClick está a devolver HTML (página de marketing) em vez de JSON. Duas causas combinadas:

1. **`GESTAOCLICK_BASE_URL` aponta para o site público** (`https://gestaoclick.com.br` ou similar) em vez do host da API: **`https://api.gestaoclick.com.br`**.
2. **O endpoint atual está errado**. O código faz `GET ${baseUrl}/vendas/{numero}`, mas:
   - O prefixo correto é `/api/vendas` (não `/vendas`)
   - `/api/vendas/{id}` aceita o **id interno**, não o **número da venda** (codigo) que o utilizador escreve
   - Para procurar pelo número visível, é preciso `GET /api/vendas?codigo={numero}` (listar com filtro), apanhar o primeiro resultado e depois fazer `GET /api/vendas/{id}` para os detalhes completos

## Mudanças

### 1. Atualizar o secret `GESTAOCLICK_BASE_URL`

Pedir ao utilizador para o atualizar para:
```
https://api.gestaoclick.com.br
```
(via `update_secret` — o utilizador insere o valor numa janela segura)

### 2. Reescrever `fetchOrder` em `src/lib/gestaoclick.functions.ts`

Novo fluxo dentro do `.handler()`:

```text
1. GET {baseUrl}/api/vendas?codigo={orderNumber}
   - headers: access-token, secret-access-token, Accept: application/json
2. Ler body como TEXTO. Tentar JSON.parse.
   - Se falhar → erro claro "API devolveu HTML — verifica BASE_URL"
   - Se ok mas array vazio → "Encomenda {numero} não encontrada"
3. Extrair venda[0].id
4. GET {baseUrl}/api/vendas/{id}
   - mesmas headers, mesmo tratamento de resposta
5. Passar payload completo a normalizeOrder()
```

Manter as verificações de duplicado/reagendamento na BD (já funcionam).

Endurecer também o `normalizeOrder` para o formato real do GestãoClick (`numero`, `cliente.nome`, `cliente.endereco.{logradouro,cep,cidade}`, `valor_total`, `valor_pago`, `produtos[]` com `nome`/`quantidade`/`valor_unitario`).

### 3. Mensagens de erro

- 401/403 → "Credenciais GestãoClick inválidas (access-token/secret-access-token)"
- 404 ou array vazio → "Encomenda {numero} não encontrada no GestãoClick"
- 429 → "Limite de pedidos atingido, tenta novamente em alguns segundos"
- Resposta não-JSON → mensagem explícita a apontar para o BASE_URL

## Detalhes técnicos

Endpoints oficiais (https://gestaoclick.docs.apiary.io):
- Listar vendas com filtro `codigo`: `GET /api/vendas?codigo=13450`
- Visualizar venda por id interno: `GET /api/vendas/{id}`
- Autenticação por headers: `access-token` e `secret-access-token`

Ordem de execução: pedir update do secret PRIMEIRO; só depois editar o ficheiro (assim que o utilizador confirma o novo valor a chamada já passa a funcionar).
