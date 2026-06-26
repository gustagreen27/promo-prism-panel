# Expansão do painel de campanhas

## 1. Schema (migração)

Acrescentar à tabela `campaigns`:
- `category` — texto (ex: "vendas", "evento", "captação", "comunicado", "promoção", "outro"); livre.
- `link_title`, `link_description` — texto, usados como `<title>` e `meta description` da página wrapper e nas tags OG.
- `preview_image_url`, `favicon_url` — URLs (opcionais).
- `og_title`, `og_description`, `og_image_url`, `og_type` — opcionais; default para os campos de link.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` — strings opcionais.
- `status` — enum `campaign_status` (`draft`, `active`, `paused`, `archived`), default `draft`.
- `intent_score` (int 0–100), `intent_report` (jsonb), `intent_checked_at` (timestamp) — resultado da última análise de intenção.

Manter `campaign_clicks` como está (já cobre IP, geo, ASN, dispositivo, navegador, OS, referer, horário; `campaign_id` referencia a campanha, e `destination_url` é resolvido via join). Adicionar `final_url` (texto, opcional) para gravar a URL final efetivamente carregada após resolução de redirects.

## 2. Server functions

- `createCampaign` / `updateCampaign` — aceitar todos os novos campos. Slug continua respeitado exatamente como digitado.
- `analyzeCampaignIntent(campaignId)` — nova server fn protegida (admin). Faz:
  - GET na `destination_url` seguindo redirects, conta saltos e grava `final_url`;
  - extrai `<title>`, `meta description`, `og:*` do destino;
  - verifica HTTP status, presença de HTTPS, idade aparente do domínio (via heurística de TLD/host), correspondência de host vs título;
  - lista de termos sensíveis configurável (phishing, golpe, "clique aqui urgente", etc.) e flags;
  - chama Lovable AI Gateway (`google/gemini-2.5-flash`) com prompt estruturado retornando JSON: `{ score, checks: [{name, status: 'ok'|'warn'|'fail', detail}], summary }` cobrindo cada item pedido (título×campanha, descrição×destino, imagem adequada, redirects excessivos, termos sensíveis, domínio confiável, página carrega, coerência com categoria);
  - grava `intent_score`, `intent_report`, `intent_checked_at`.
- `trackClick` — passar a montar a URL final com UTMs anexados (se preenchidos) antes de carregar no iframe / redirect, e gravar `final_url` no clique. Continuar checando X-Frame-Options/CSP no servidor (com fallback no cliente).

## 3. Página wrapper pública (`/$slug`)

- `head()` da rota usa `link_title`, `link_description`, `og_*`, `favicon_url` da campanha (carregados via loader). `og:url` = URL pública da campanha. Sem `og:image` quando não houver imagem definida.
- Se `status !== 'active'`, mostrar página "Campanha indisponível" (404-like) e não gravar clique.
- Caso ativa: registrar clique (trackClick) e renderizar iframe fullscreen com a URL final (destino + UTMs); fallback de redirect quando o frame for recusado (já existente).

## 4. Painel administrativo

- Formulário de campanha em uma rota dedicada de edição (`/_authenticated/campaigns/$id/edit`) com seções: Identificação, URLs e UTMs, Preview / OG, Status, Análise de intenção.
- Card de cada campanha na lista ganha badge de `status` e `intent_score` (verde/amarelo/vermelho).
- Página de métricas (já existe) ganha aba "Análise de intenção" mostrando o último relatório, com botão "Reexecutar análise".

## 5. UI components reutilizáveis

- `StatusBadge` (draft/active/paused/archived).
- `IntentScoreBadge` + `IntentReport` (lista de checks com ícone ok/warn/fail e detalhe).

## 6. Considerações técnicas

- A IA usa o LOVABLE_API_KEY já configurado — sem novas chaves.
- Validações com Zod no server (URLs, tamanhos, enum de status).
- Slugs continuam estritos (erro em conflito ao usar slug personalizado).
- `intent_report` é jsonb tipado no front via `IntentReport` interface.
- Nenhuma mudança no fluxo de auth: rotas de edição ficam sob `_authenticated/`.

## Ordem de execução

1. Migração (campos novos + enum status + final_url no click).
2. Atualizar `campaigns.functions.ts` (create/update + analyzeCampaignIntent) e `track.functions.ts` (UTM + final_url + status check).
3. Atualizar `/$slug` loader/head para usar metadados.
4. Criar rota de edição completa e atualizar lista/métricas com status + intent.
5. Testes manuais: criar campanha rascunho, ativar, acessar `/slug`, rodar análise.
