# Proxy fixo de saída para chamadas à Meta Cloud API

## Diagnóstico (respostas diretas)

**1. O runtime atual suporta proxy HTTP/HTTPS em `fetch` server-side?**
Não. O backend publicado roda em runtime serverless de edge (Cloudflare Workers). Nesse runtime:
- `fetch` não aceita `agent`/`dispatcher` (opções do Node/undici são ignoradas ou dão erro).
- `https-proxy-agent`, `undici.ProxyAgent`, `socks-proxy-agent` dependem de `node:net`/`node:tls` completos e **não funcionam** lá (falham em build ou com `[unenv] ... is not implemented`).
- Só existe `connect()` de `cloudflare:sockets`, que abre TCP mas não permite fazer TLS *dentro* de um túnel CONNECT — ou seja, não dá para falar HTTPS com a Meta através de um proxy HTTP a partir do Worker.

Conclusão: **não é possível usar o proxy `HOST:PORT:USER:PASS` diretamente do Worker**. Isso não é limitação do código, é do runtime.

**2. Qual biblioteca/agent seria necessário?**
Se o backend rodasse em Node puro: `undici` (`ProxyAgent` + `setGlobalDispatcher`) ou `https-proxy-agent`. Nenhum dos dois é utilizável no runtime atual. A saída viável é um **relay HTTPS próprio** (um pequeno serviço Node em VPS/container com IP do proxy), e o Worker fala com esse relay.

**3. Arquivos que precisariam mudar**
- `src/lib/meta/meta-client.server.ts` — ponto central (`metaFetch`, `metaFetchRaw`).
- `src/lib/wa-send.server.ts` — hoje monta a URL e chama `fetch` direto (envio de template, `syncTemplatesFromMeta`, `frgc_01`).
- `src/lib/wa-service-send.server.ts` — `postToMeta` e `markMessageRead`.
- Demais pontos que hoje chamam `graph.facebook.com` fora do client: `src/lib/meta/wa-health.server.ts`, `src/lib/meta/wa-preflight.server.ts`, `src/lib/wa-campaign-runner.functions.ts`, `src/lib/wa-diagnosis.functions.ts`, `src/lib/wa-meta.functions.ts`, `src/lib/wa-profile.functions.ts`, `src/lib/wa-send-generic.functions.ts`, `src/lib/whatsapp-test.functions.ts`, `src/routes/api/public/whatsapp/service-tick.tsx`.
- `src/routes/api/public/diag/egress-ip.tsx` — ganharia um modo "via proxy" para validação.

**4. Dá para centralizar tudo em um único client?**
Sim, e é o passo que recomendo fazer primeiro — ele é útil mesmo sem proxy. Um único `metaFetch` passa a ser o **único** lugar que fala com a Meta; todos os arquivos acima trocam `fetch("https://graph.facebook.com/...")` por `metaFetch(path, init)`. Assim o egress fica configurável num ponto só.

**5. Como validar depois**
`/api/public/diag/egress-ip` ganha um parâmetro `?via=proxy` que faz a mesma consulta de IP **usando o mesmo caminho de rede das chamadas à Meta**. Validação = o IP retornado com `via=proxy` é o IP do proxy contratado e o IP sem parâmetro continua sendo o do edge. Repetir 3–5 vezes para confirmar que não muda.

## Plano de implementação

### Fase 0 — Centralização (sem mudança de rede, risco baixo)
1. Ampliar `meta-client.server.ts`: `metaFetch`/`metaFetchRaw` como única porta de saída, com timeout já existente, classificação de erro atual preservada e um campo novo no erro indicando a origem da falha (`meta` | `egress`).
2. Migrar, um arquivo por vez, todos os call sites listados no item 3 para o client. Sem alterar payloads, retries, filas, workers ou rate limit — só a camada de transporte.
3. Publicar e confirmar que envios, sync de templates, health e diagnóstico seguem idênticos.

### Fase 1 — Egress fixo via relay
1. Subir um relay mínimo (Node + `undici.ProxyAgent`) em VPS/container, que:
   - aceita só requisições assinadas com um segredo compartilhado,
   - repassa exclusivamente para `graph.facebook.com`,
   - sai pelo proxy fixo `HOST:PORT` com autenticação básica,
   - nunca loga corpo, token da Meta nem usuário/senha do proxy.
2. Segredos (nunca no código): `META_EGRESS_RELAY_URL`, `META_EGRESS_RELAY_SECRET` no backend; `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER`, `PROXY_PASS` apenas no relay. Lidos dentro dos handlers, jamais em escopo de módulo.
3. `metaFetch` passa a rotear por esse relay quando `META_EGRESS_MODE=proxy`.

### Regras de erro e ausência de fallback
- Timeout do relay separado do timeout da Meta (ex.: 6s para conectar ao relay, 25s total).
- Erro do relay/proxy → `MetaError` com `source: "egress"` e código próprio (`egress_unavailable`, `egress_timeout`, `egress_auth`), distinto de erro `source: "meta"` (que mantém `code`/`fbtrace_id`).
- **Sem fallback silencioso**: se `META_EGRESS_MODE=proxy` e o relay falhar, a tentativa é abortada e registrada; nunca cai para conexão direta. Na fila isso é tratado como erro transitório de rede (mesmo caminho já existente), sem trocar o IP sem aviso.
- Logs registram apenas host e porta do proxy; usuário e senha nunca aparecem (nem mascarados parcialmente em nível que permita reconstrução).

### Validação final
1. `GET /api/public/diag/egress-ip` → IP do edge (referência).
2. `GET /api/public/diag/egress-ip?via=proxy` → deve retornar o IP do proxy; repetir 5x e confirmar estabilidade.
3. Um envio real de teste pelo `wa-send.server.ts` e conferência de que a chamada saiu pelo mesmo caminho (mesma origem de rede do teste `via=proxy`).

## Observação importante
O proxy aqui serve só para ter um IP de saída previsível/estável — não é usado para contornar limites, bloqueios ou restrições da Meta. Se o objetivo for reputação/allowlist de IP, o relay é obrigatório; se for só "saber o IP", a Fase 0 já entrega rastreabilidade sem infraestrutura extra.

## Decisão necessária
A Fase 1 exige um servidor Node fora do Lovable (o proxy não funciona direto do runtime atual). Confirme se você tem/quer subir essa VPS antes de eu implementar.
