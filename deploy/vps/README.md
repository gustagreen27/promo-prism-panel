# Migração completa para a VPS (Ubuntu, 8 GB+)

Plano: montar tudo na VPS **em paralelo**, testar com uma cópia dos dados e só
depois apontar os domínios (virada). O painel atual continua funcionando até a virada.

```text
Internet ──► Caddy (HTTPS, portas 80/443)
               ├─ aagencianext.com, nextdisparos.com, ... ──► Painel (Node, 127.0.0.1:3000)
               └─ api.aagencianext.com ──────────────────────► Supabase (Kong, 127.0.0.1:8000)
                                                                 ├─ Postgres + pg_cron + pg_net
                                                                 ├─ Login (GoTrue)
                                                                 └─ Arquivos (Storage)
```

## O que vai ser migrado

| Item | Tamanho hoje | Como vai |
| --- | --- | --- |
| Banco de dados (tudo, inclusive contas de login com senhas) | ~8,8 GB, 66 contas | Exportação oficial da Lovable |
| Arquivos (fotos, áudios, vídeos) | 485 arquivos, ~1,25 GB (pastas `campaign-images` e `template-media`) | Download em **Mais → Armazenamento** + script |
| Rotinas automáticas (fila de disparos, automações, sincronizações) | 12 rotinas | Script `sql/01` |
| Chaves secretas (Meta, Google, IP-API, IA) | — | Você copia de cada serviço para `app.env` |

Os usuários **mantêm a senha**, mas precisam **entrar de novo** uma vez depois da virada.

---

## Etapa 1 — Preparar a VPS

Recomendado: 8 GB RAM, 4 núcleos, **80 GB+ SSD** (o banco tem ~9 GB e precisa de espaço para cópia e backups).

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
```

Não abra as portas 3000, 5432, 8000 nem 8443 no firewall: elas ficam só dentro da VPS.

## Etapa 2 — Instalar o servidor de dados (Supabase próprio)

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/supabase-prod && cp -r supabase/docker/* ~/supabase-prod/ && cp supabase/docker/.env.example ~/supabase-prod/.env
cd ~/supabase-prod
```

Edite `~/supabase-prod/.env` e troque **todos** os valores de exemplo:

- `POSTGRES_PASSWORD`, `JWT_SECRET` (40+ caracteres), `ANON_KEY`, `SERVICE_ROLE_KEY`:
  gere as chaves seguindo a seção *"Generate API keys"* do guia oficial
  https://supabase.com/docs/guides/self-hosting/docker (as duas chaves são assinadas com o seu `JWT_SECRET`).
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`: senha forte (painel de administração do banco).
- `SITE_URL=https://aagencianext.com`
- `ADDITIONAL_REDIRECT_URLS=https://www.aagencianext.com,https://painel.nextdisparos.com,https://nextdisparos.com,https://agencianext.app`
- `API_EXTERNAL_URL=https://api.aagencianext.com` e `SUPABASE_PUBLIC_URL=https://api.aagencianext.com`
- `ENABLE_EMAIL_SIGNUP=true`, `ENABLE_EMAIL_AUTOCONFIRM=false`, `ENABLE_ANONYMOUS_USERS=false`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`:
  um provedor de e-mail (ex.: Brevo, Resend, Amazon SES). Sem isso, "esqueci a senha" e convites não chegam.

Feche as portas do banco para fora: no `docker-compose.yml` do Supabase, troque as portas
publicadas `5432:5432`, `6543:6543`, `8000:8000` e `8443:8443` por `127.0.0.1:5432:5432` etc.

```bash
docker compose pull && docker compose up -d
docker compose ps        # tudo "healthy" após 1–2 min
```

## Etapa 3 — Baixar o painel e configurar

O painel vem do GitHub: no editor da Lovable, **Configurações do projeto → Git → Conectar**.

```bash
cd ~ && git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO painel && cd painel
cp deploy/vps/app.env.example deploy/vps/app.env
nano deploy/vps/app.env
```

Preencha o `app.env`:

- `ANON_KEY` do Supabase vai em `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PUBLISHABLE_KEY`.
- `SERVICE_ROLE_KEY` vai em `SUPABASE_SERVICE_ROLE_KEY`.
- `WA_CRON_SECRET`: gere com `openssl rand -hex 32` e **guarde**, porque vai usar de novo na etapa 8.
- Chaves de serviços externos. Os valores atuais não podem ser lidos daqui, então copie de cada serviço:
  - **Meta** (developers.facebook.com → seu App): `META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID`.
    `WHATSAPP_ACCESS_TOKEN` e `BM_..._SYSTEM_USER_TOKEN` saem do *Usuário do sistema* no Gerenciador de Negócios.
    `WHATSAPP_VERIFY_TOKEN`: você escolhe (frase secreta). Use a mesma frase no webhook da Meta na etapa 9.
  - **IP-API**: `IP_API_KEY` (área do cliente ip-api.com).
  - **Google**: `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` (console.cloud.google.com → Credenciais).
    Confirme que `https://aagencianext.com/api/public/google/oauth-callback` está nas URIs de redirecionamento.
  - **IA**: `AI_API_KEY` + `AI_MODEL` de um provedor compatível com OpenAI (ex.: OpenAI).
    O modelo precisa aceitar respostas em formato JSON. Sem chave, só a Auditoria de rastreamento
    e a análise de campanha por IA ficam desligadas; o resto funciona.

## Etapa 4 — Cópia de TESTE dos dados

1. Na Lovable: **Mais → Banco de dados → Gerenciar → Configurações → Exportar dados → Banco de dados → Exportar**.
   O link chega por e-mail. Limite: 1 exportação a cada 24 h.
2. Envie o arquivo para a VPS: `scp exportacao.* usuario@IP_DA_VPS:~/`
3. Restaure no banco novo. Se vier compactado (`.gz`), rode antes `gunzip arquivo.gz`.

```bash
# Arquivo .sql
docker exec -i supabase-db psql -U supabase_admin -d postgres < ~/exportacao.sql 2> ~/restore-erros.log
# Arquivo .dump / .backup (formato do pg_dump)
docker cp ~/exportacao.dump supabase-db:/tmp/x.dump
docker exec supabase-db pg_restore -U supabase_admin -d postgres --no-owner /tmp/x.dump 2> ~/restore-erros.log
```

Mensagens *"already exists"* são esperadas, porque o Supabase novo já cria a estrutura básica.
Erros de outro tipo: mande o arquivo `restore-erros.log` aqui no chat.

4. **Logo em seguida**, desligue as rotinas da cópia de teste. Assim ela não envia mensagens:

```bash
docker exec -i supabase-db psql -U supabase_admin -d postgres < deploy/vps/sql/00-modo-teste.sql
docker exec -i supabase-db psql -U supabase_admin -d postgres < deploy/vps/sql/02-conferir.sql
```

Os números da conferência devem bater com os que eu informar aqui no chat.

## Etapa 5 — Arquivos

Na Lovable, **Mais → Armazenamento**: baixe as pastas `campaign-images` e `template-media`.
Coloque-as na VPS mantendo os caminhos:

```text
~/painel/deploy/vps/arquivos/campaign-images/...
~/painel/deploy/vps/arquivos/template-media/samples/...
```

```bash
cd ~/painel
SUPABASE_URL=http://127.0.0.1:8000 SUPABASE_SERVICE_ROLE_KEY='SUA_SERVICE_ROLE_KEY' \
  docker run --rm --network host -v "$PWD":/w -w /w node:22-slim node deploy/vps/scripts/subir-arquivos.mjs
```

## Etapa 6 — Subir o painel para TESTE (sem mexer nos domínios)

Crie no DNS **dois subdomínios de teste** apontando para o IP da VPS:
`teste.aagencianext.com` e `api.aagencianext.com`.
O `api` já é o endereço definitivo do servidor de dados, então pode ficar.

Para o teste, deixe o `Caddyfile` assim:

```text
api.aagencianext.com {
	reverse_proxy 127.0.0.1:8000
}
teste.aagencianext.com {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
```

E no `app.env`, use `APP_BASE_URL=https://teste.aagencianext.com` e `SITE_URL=https://teste.aagencianext.com`.

```bash
cd ~/painel/deploy/vps
set -a; . ./app.env; set +a
docker compose up -d --build
docker compose logs -f painel      # deve mostrar "Listening on: http://127.0.0.1:3000"
```

## Etapa 7 — Testar

Em https://teste.aagencianext.com:

- [ ] Entrar com sua conta (mesma senha).
- [ ] Admin: clientes, disparos, campanhas, automações e carteira com os dados certos.
- [ ] Abrir uma imagem/áudio de automação (confirma os arquivos).
- [ ] Painel do cliente: entrar com uma conta de cliente.
- [ ] Link público: `https://teste.aagencianext.com/<slug>` abre e grava o clique.
- [ ] **Não** dispare campanhas no teste: as rotinas estão desligadas de propósito.

## Etapa 8 — Virada (dia combinado, de preferência à noite)

1. Me avise aqui no chat. Eu **pauso os disparos e desligo as rotinas** no painel atual,
   para nada rodar em dobro.
2. Faça a **exportação final** (etapa 4, passo 1). A de teste fica velha.
3. Na VPS, apague a cópia de teste e restaure a final:

```bash
cd ~/supabase-prod && docker compose down
sudo rm -rf volumes/db/data     # apaga só a cópia de TESTE
docker compose up -d && sleep 60
docker exec -i supabase-db psql -U supabase_admin -d postgres < ~/exportacao-final.sql 2> ~/restore-erros.log
```

4. Suba os arquivos de novo (etapa 5) se algum foi criado depois do teste.
5. Ligue as rotinas apontando para o domínio definitivo:

```bash
cd ~/painel
docker exec -i supabase-db psql -U supabase_admin -d postgres \
  -v base_url='https://aagencianext.com' \
  -v anon_key='SUA_ANON_KEY' \
  -v cron_secret='MESMO_VALOR_DE_WA_CRON_SECRET' \
  < deploy/vps/sql/01-virada-apontar-rotinas.sql
```

6. No `app.env`, volte `APP_BASE_URL` e `SITE_URL` para `https://aagencianext.com`.
   Restaure o `Caddyfile` original do repositório (com todos os domínios) e rode
   `docker compose up -d --build`.
7. No DNS, aponte **todos** os domínios (registros A de `@` e `www`) para o IP da VPS:
   aagencianext.com, agencianext.app, nextdisparos.com (+ `painel`), nextdisparo.com,
   disparosfr.com, acompanhamentofacil.app, metodovidacursos.com.br, backend.aagencianext.com.
   Antes, remova esses domínios do projeto na Lovable para não dar conflito.
   O Caddy emite o HTTPS sozinho em alguns minutos.

## Etapa 9 — Depois da virada

- **Meta → Webhooks**: o endereço continua `https://aagencianext.com/api/public/whatsapp/webhook`.
  Atualize só o *Token de verificação* para o seu `WHATSAPP_VERIFY_TOKEN` e clique em Verificar.
- Faça um Direct Send de teste só para o seu número e toque num botão: confirma envio, aviso de volta e automação.
- **Backup diário** (obrigatório, a responsabilidade agora é sua):

```bash
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 4 * * * docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > ~/backups/db-$(date +\%F).dump && find ~/backups -mtime +7 -delete' ) | crontab -
```

  Copie esses backups para fora da VPS (outro servidor, Google Drive, S3, etc.).
- Atualizações: `cd ~/painel && git pull && cd deploy/vps && set -a && . ./app.env && set +a && docker compose up -d --build`.

## O que muda / limitações

- A **IA** (Auditoria de rastreamento, análise de campanha) passa a usar a sua própria chave (`AI_API_KEY`) e é cobrada pelo provedor.
- O Google Agenda pelo *conector* da Lovable deixa de funcionar. O Google Agenda pelo login Google próprio
  (`GOOGLE_OAUTH_*`) continua funcionando.
- Sem os backups diários automáticos da Lovable: use o backup da etapa 9.
- Os usuários entram de novo uma vez, com a mesma senha.
