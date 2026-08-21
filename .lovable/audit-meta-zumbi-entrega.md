# Auditoria de ENTREGA REAL — WABAs "zumbi"
Data: 21/08/2026 · Destino de teste: 5562991301856 · Graph API v21.0
Método: template aprovado real → `POST /{phone_number_id}/messages` → acompanhamento dos `statuses` recebidos em `whatsapp_webhook_logs` por ~30 min.
Nenhuma integração foi alterada ou desativada.

## Tabela final

| BM | WABA | Phone ID | Remetente | Painel (nº) | POST /messages | sent | delivered | read | failed | Classificação |
|---|---|---|---|---|---|---|---|---|---|---|
| 989864519935257 | 1514392543240352 | 1331238803396492 | +55 11 93623-3297 | BANNED | 200 | — | — | — | **131031 Business Account locked** (14:10:51) | 🧟 ACEITA MAS NÃO ENTREGA |
| 989864519935257 | 1514392543240352 | 1230219666843093 | +55 61 94758-1203 | BANNED | 200 | — | — | — | 131031 (14:10:51) | 🧟 ACEITA MAS NÃO ENTREGA |
| 989864519935257 | 1514392543240352 | 1171382632735579 | +55 11 95502-7229 | BANNED | 200 | — | — | — | 131031 (14:10:55) | 🧟 ACEITA MAS NÃO ENTREGA |
| 989864519935257 | 1514392543240352 | 1158894363984430 | +55 11 95502-7873 | BANNED | 200 | — | — | — | 131031 (14:10:56) | 🧟 ACEITA MAS NÃO ENTREGA |
| 989864519935257 | 1703620267402557 | 1301450143044446 | +55 11 95213-5585 | BANNED | 200 | — | — | — | nenhum status em 30 min | 🧟 ACEITA E SOME (sem entrega) |
| 989864519935257 | 1730293724971621 | 1292927583904161 | +55 62 91020-8896 | BANNED | 200 | — | — | — | nenhum status | 🧟 ACEITA E SOME |
| 875290778530113 | 1567288174802413 | 1294636743726288 | +55 11 95502-8300 | BANNED | 200 | — | — | — | nenhum status | 🧟 ACEITA E SOME |
| 875290778530113 | 1567288174802413 | 1193707613832523 | +1 555-401-6605 | BANNED | 200 | — | — | — | nenhum status | 🧟 ACEITA E SOME |
| 989864519935257 | 1030804996251842 | 1169215559617623 | +1 555-435-5595 | BANNED | 404/400 (132001/132000) | — | — | — | não enviou | 🧟 PARCIAL (só templates de vídeo, envio não concluído) |
| 989864519935257 | 819673147807084 | 1277873665405062 | +55 11 95502-6597 | BANNED | 400 (132000) | — | — | — | não enviou | 🧟 PARCIAL |
| 750492059496393 | 872897082315010 | 1241440839055866 | +55 89 7602-7662 | CONNECTED | 200 | 14:11:41 | 14:11:42 | 14:11:54 | — | 🟢 ATIVA — ENTREGA CONFIRMADA |
| 750492059496393 | 872897082315010 | 1185235531351010 | +55 62 91023-5633 | CONNECTED | 200 | 14:11:44 | 14:11:44 | 14:12:37 | — | 🟢 ATIVA — ENTREGA CONFIRMADA |

**🧟 ZUMBI REAL COM ENTREGA CONFIRMADA: NENHUMA.** Zero WABAs banidas entregaram.

## Comparação técnica (o que diferencia)

| Atributo | Zumbis (todas) | Saudável 872897082315010 |
|---|---|---|
| status do número | BANNED (ou PENDING) | CONNECTED |
| name_status | DECLINED | AVAILABLE_WITHOUT_REVIEW |
| code_verification_status | EXPIRED / VERIFIED | VERIFIED |
| messaging_limit_tier | `null` (sem tier) | TIER_250 |
| quality_rating | GREEN/YELLOW/UNKNOWN (irrelevante) | GREEN |
| platform_type | CLOUD_API (aceita) vs NOT_APPLICABLE (erro 133010) | CLOUD_API |
| criar template | bloqueado (100/3835016) | permitido |
| app assinado no webhook | 927792087031385 (assinado) | 1476031101188329 |
| entrega real | **nunca** | sim |

### Por que WABAs da mesma BM 989864519935257 aceitam e outras não
Não é a WABA — é o **número**:
- Números com `platform_type=CLOUD_API` + `code_verification` concluído já foram **registrados** na Cloud API → o endpoint aceita o POST (HTTP 200) mesmo com a conta banida.
- Números `PENDING` / `platform_type=NOT_APPLICABLE` (1489344539630698, 1243899042141765, 1192966807242433) nunca completaram o registro → erro **133010 "account not registered"**.
- WABAs sem número (1457646959503524, 28528876003376420) não têm sequer endpoint de envio.

Ou seja: HTTP 200 mede apenas "número registrado + rota existe", não permissão de envio. O bloqueio real acontece **depois**, no pipeline de entrega:
- `messaging_limit_tier = null` é o marcador mais confiável de conta sem direito de envio.
- 1514392543240352 é honesta: devolve `failed 131031 Business Account locked`.
- As demais zumbis são piores: aceitam, não entregam e **não emitem nenhum status** — a mensagem some silenciosamente (é exatamente o que produz os "Aceitas sem confirmação" no painel).

## Recomendação
Tratar como inoperantes para disparo todas as WABAs com número `BANNED` / `messaging_limit_tier = null`. Só 872897082315010 (BM 750492059496393) entrega hoje.
