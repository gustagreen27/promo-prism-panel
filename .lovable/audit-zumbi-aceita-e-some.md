# Investigação "ACEITA E SOME" — 21/08/2026 14:27 UTC
Destino de teste: 5562991301856 · Nenhuma integração foi alterada ou desativada.

## Causa raiz encontrada
Os callbacks **chegam** ao nosso endpoint, mas são **rejeitados com HTTP 401 (`invalid_signature`) e descartados sem gravar o corpo**.

- Todas as WABAs "aceita e some" pertencem ao App Meta **927792087031385 – "Ice Ice Laser"**.
- A WABA saudável pertence ao App **1476031101188329 – "app wpp"**.
- `META_APP_SECRET` global do projeto = segredo do App **1476**. Logo, toda entrega assinada pelo App 927 falha na verificação HMAC.
- Exceção: as conexões `1331238803396492` e `1230219666843093` (WABA 1514392543240352) têm `app_secret` próprio salvo no banco — por isso **só elas** conseguiram registrar `failed 131031`.
- As demais conexões estão com `use_global_token = true` e `app_secret` vazio → não há fallback → 401.

Ambos os Apps apontam para a MESMA URL: `https://metodovidacursos.com.br/api/public/whatsapp/webhook`, ambos com o campo `messages` assinado e `active=true`. O problema não é roteamento, é **assinatura**.

## Evidência temporal (teste 14:27 UTC)
| Envio | wamid | Webhook |
|---|---|---|
| 14:27:09 · 1703620267402557 / 1301450143044446 (95213-5585) | wamid...M0M0NEUwOEJDNEEwQUEyMTNGAA== | 14:27:14 `invalid_signature` 665 bytes |
| 14:27:12 · 1730293724971621 / 1292927583904161 (91020-8896) | wamid...N0QxQjBENjE1OUFDQ0U5NTU3AA== | 14:27:15 `invalid_signature` 665 bytes |
| 14:27:14 · 1567288174802413 / 1294636743726288 (95502-8300) | wamid...NDE5MDRGMzg4RDg4ODk2QTI0AA== | 14:27:17 `invalid_signature` 665 bytes |
| 14:27:16 · 1567288174802413 / 1193707613832523 (+1 555-401-6605) | wamid...NTA4QTYzOUMwNUUxNkU5NUI4AA== | 14:27:18 `invalid_signature` 665 bytes |
| 14:27:18 · 872897082315010 / 1241440839055866 (7602-7662) — CONTROLE | wamid...QzFBMDRCMkNCNkQzOTY3MUNCAA== | 14:27:21 `sent` → 14:27:23 `delivered` ✅ |

Foram 22 `invalid_signature` em 2 minutos (payloads de 663 e 665 bytes, tamanho compatível com eventos de status), com retentativas da Meta — **141 rejeições nas últimas 24 h**.

## Rastreamento dos wamid
`campaign_recipients`, `wa_campaign_attempts`, `wa_conversation_messages`, `message_logs`, `message_dead_letters`, `whatsapp_webhook_logs` → **nenhuma ocorrência**. Não há segundo endpoint, Worker ou Edge Function recebendo esses eventos: o corpo é descartado antes de qualquer gravação (por design, o log de assinatura inválida guarda só tamanho e flag).

## Comparativo
| Item | "Aceita e some" | Saudável 872897082315010 |
|---|---|---|
| App | 927792087031385 (Ice Ice Laser) | 1476031101188329 (app wpp) |
| System User do token | 122093497461429136 / 122105959491427349 | 122097013077433657 |
| callback_url | mesma | mesma |
| campo `messages` | assinado, ativo | assinado, ativo |
| `app_secret` na conexão | ausente (`use_global_token=true`) | ausente, mas o global é o dele |
| Verificação HMAC | **falha → 401** | ok |
| status do número | BANNED / name_status DECLINED / tier null | CONNECTED / TIER_250 |

## Tabela final
| BM | WABA | Phone ID | App | POST | wamid | Webhook encontrado | Status final | Classificação |
|---|---|---|---|---|---|---|---|---|
| 989864519935257 | 1703620267402557 | 1301450143044446 | 927 | 200 accepted | sim | sim, mas rejeitado 401 | desconhecido | 🧟 ACEITA E SOME — EM INVESTIGAÇÃO (webhook bloqueado por assinatura) |
| 989864519935257 | 1730293724971621 | 1292927583904161 | 927 | 200 accepted | sim | sim, rejeitado 401 | desconhecido | 🧟 ACEITA E SOME — EM INVESTIGAÇÃO |
| 875290778530113 | 1567288174802413 | 1294636743726288 | 927 | 200 accepted | sim | sim, rejeitado 401 | desconhecido | 🧟 ACEITA E SOME — EM INVESTIGAÇÃO |
| 875290778530113 | 1567288174802413 | 1193707613832523 | 927 | 200 accepted | sim | sim, rejeitado 401 | desconhecido | 🧟 ACEITA E SOME — EM INVESTIGAÇÃO |
| 989864519935257 | 1514392543240352 | 4 números | 927 (com app_secret na conexão) | 200 | sim | sim, validado | `failed 131031 Business Account locked` | 🧟 API ACEITA / ENVIO BLOQUEADO |
| 750492059496393 | 872897082315010 | 1241440839055866 | 1476 | 200 | sim | sim | sent → delivered → read | 🟢 ATIVA |

## Correção possível (não aplicada)
Aceitar múltiplos App Secrets na verificação: gravar o `app_secret` do App 927 nas conexões dessas WABAs (o valor já existe no banco, na conexão 1331238803396492) ou tentar uma lista de segredos no fallback global. Só depois disso os status reais dessas WABAs poderão ser lidos.
