# Auditoria Meta / WhatsApp — Caça a BMs "zumbi"
Data: 21/08/2026 · Método: teste real na Graph API v21.0 (token de cada WABA no banco, fallback token global)

## Testes aplicados por integração
1. `GET /debug_token` (validade/app do token)
2. `GET /{waba_id}` (status, review, verificação, BM dona)
3. `GET /{waba_id}/message_templates` (consultar templates)
4. `POST /{waba_id}/message_templates` (criar template — criado e removido em seguida)
5. `GET /{waba_id}/phone_numbers` (números, quality, name_status, status)
6. `POST /{phone_number_id}/messages` (probe de envio para número inválido — mede se a API autoriza o envio)

Nada foi desativado, excluído ou alterado.

## Tabela

| # | Integração (WABA) | BM | WABA API | Token | Templates ler | Criar template | Envio | Classificação |
|---|---|---|---|---|---|---|---|---|
| 1 | 1514392543240352 — Correspondente Daycoval | 989864519935257 | ACTIVE / review REJECTED | válido | SIM | NÃO (bloqueada) | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 2 | 1030804996251842 — Espaço Ice Laser | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 3 | 819673147807084 — Pimenta Estética | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 4 | 1730293724971621 — Lindbergh / Magistrar | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 5 | 1703620267402557 — PDM Atendimento | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 6 | 1567288174802413 — Amanda Sales | 875290778530113 | ACTIVE / REJECTED | válido | SIM | NÃO | **ACEITO** | 🧟 ZUMBI OPERACIONAL |
| 7 | 1489344539630698 — Atendimento laser | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | não (133010) | 🧟 ZUMBI PARCIAL |
| 8 | 1457646959503524 — Ice Laser Estética | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | sem número | 🧟 ZUMBI PARCIAL |
| 9 | 28528876003376420 — Ice Laser (2852) | 989864519935257 | ACTIVE / REJECTED | válido | SIM | NÃO | sem número | 🧟 ZUMBI PARCIAL |
| 10 | **3115285082004041 — GLR Representações (ÓRFÃ, fora do painel)** | 1728859461573759 (oculta) | ACTIVE / REJECTED | válido | SIM | NÃO | não (133010) | 🧟 ZUMBI PARCIAL — BM escondida |
| 11 | 872897082315010 — Atendimento laser (Rafaela/João) | 750492059496393 | ACTIVE / APPROVED | válido | SIM | **SIM** | **ACEITO** | 🟢 ATIVA NORMAL |
| 12 | 1010741405216160 — Genesis C. F. Silva | 1362049072734543 | ACTIVE / APPROVED | válido | SIM | **SIM** | não (número não registrado) | 🟡 RESTRITA (config) |
| 13 | 1007888915415085 — Camylle | 27388997630771807 | erro 33 (sem acesso) | válido (app 2329405994205817) | NÃO | NÃO | — | ⚠️ INCONSISTÊNCIA |
| 14 | 1040252755080013 — BM Ice Laser (1040) | 750492059496393 | erro 33 | válido | NÃO | NÃO | — | ⚠️ INCONSISTÊNCIA |
| 15 | 1718045739518689 | 1388175752905586 | erro 33 | sem token próprio | NÃO | NÃO | — | 🔴 INOPERANTE |
| 16 | 1510075697254181 — legado em `settings.whatsapp_credentials` | — | — | **inválido (190)** | NÃO | NÃO | — | 🔑 TOKEN INVÁLIDO |

## Números por integração zumbi (amostra)
- 1514392543240352: 1331238803396492 (+55 11 93623-3297), 1230219666843093, 1171382632735579, 1158894363984430 — todos `status=BANNED`, `name_status=DECLINED`, mas API aceitou o POST /messages.
- 1567288174802413: 1294636743726288 (+55 11 95502-8300 — usado no Atendimento) e 1193707613832523 — `BANNED`, envio aceito.
- 1730293724971621: 1292927583904161 (+55 62 91020-8896, Magistrar) — `BANNED`, envio aceito.
- 1703620267402557: 1301450143044446 (+55 11 95213-5585) — `BANNED`, envio aceito.
- 1030804996251842: 1169215559617623 — `BANNED`, envio aceito.
- 819673147807084: 1277873665405062 (+55 11 95502-6597) — `BANNED`, envio aceito.

## Observações
- Erro de criação de template nas zumbis: `code 100 / subcode 3835016` — "A conta do WhatsApp Business está impedida de criar um novo modelo". Ou seja, a restrição da Meta bloqueia **criação**, mas não bloqueia **leitura de templates** nem o **endpoint de envio**.
- Todas as WABAs da BM `989864519935257` têm `ban_state=BANNED` e `account_review_status=REJECTED` no banco/Meta, e mesmo assim respondem à API.
- O envio "ACEITO" significa HTTP 200 da Meta (mensagem aceita na fila). Entrega real depende de webhook — não confirmada nesta auditoria.
- App IDs em uso: 927792087031385 (principal), 1476031101188329 (BM 750492059496393), 2329405994205817 (BM Camylle).
