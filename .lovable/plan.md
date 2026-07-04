# Revisão de auth, cadastro, onboarding e proteção de rotas

## Diagnóstico do que já existe

- `/` — landing pública, OK
- `/cadastro` — funciona, mas faltam: telefone/empresa validados, CNPJ, aceite dos termos, mostrar/ocultar senha, força da senha, tratamento de "email não confirmado"
- `/login` — funciona, mas faltam: mostrar/ocultar senha, checar bloqueio (`workspaces.blocked_at`), respeitar `?redirect=`, aviso para email não confirmado
- `/recuperar-senha` + `/reset-password` — OK, mas `/reset-password` deveria confirmar sessão de recovery antes de aceitar nova senha
- `/painel` (client) — gate próprio via `beforeLoad`; se sem workspace, hoje redireciona para `/cadastro` (errado — usuário já cadastrado). Sidebar/header OK.
- `/painel/` (home) — só placeholders, KPIs "—", checklist estático
- `/_authenticated` (admin) — gate correto: manda cliente para `/painel`, mantém staff
- Trigger `handle_new_user` já cria `profiles` + `workspaces` + `workspace_members(owner)` + `workspace_wallets` quando `company_name` vem no metadata. Falta: fallback quando não veio, `activity_logs` de auth, checagem de bloqueio.

## Fase 1 — Backend (1 migration)

- Adicionar coluna `phone`, `cnpj` em `profiles`; propagar do metadata no trigger `handle_new_user`
- Novo enum `activity_type` para eventos de auth (`signup`, `login_success`, `login_failed`, `logout`, `password_reset_requested`, `password_reset_completed`, `blocked_access_attempt`) — reaproveita a tabela `activity_logs` existente
- Função `public.get_my_context()` (SECURITY DEFINER) que retorna, em uma chamada, `{ user, profile, workspaces[], primary_workspace, roles[], is_staff, is_blocked, onboarding_status }` — evita 4 queries no `beforeLoad`
- Função `public.log_auth_event(_type, _meta)` para registrar em `activity_logs`
- Nova tabela `onboarding_checklist(workspace_id, key, done, done_at)` com steps padrão: `company_profile`, `import_contacts`, `request_template`, `add_balance`, `first_campaign`, seed automático no trigger que cria workspace
- Fix do trigger: quando cadastro NÃO trouxer `company_name`, ainda criar workspace com nome derivado do email (evita usuário órfão que cai em loop `/cadastro`)

## Fase 2 — Server functions (`src/lib/auth.functions.ts`, novo)

- `getMyContext()` — wrapper de `get_my_context()` para o painel/admin ler o essencial
- `getOnboardingChecklist({workspace_id})` / `markOnboardingStep({workspace_id, key, done})`
- `logAuthEvent({type, meta})` — chamada do lado client após signIn/signOut/signUp
- `checkWorkspaceBlocked({workspace_id})` — retorna motivo + bloqueia navegação

## Fase 3 — UI de autenticação (5 telas polidas)

### `/cadastro`
- Split layout premium: painel esquerdo com bullets de valor + logo, formulário à direita
- Campos: nome, email, telefone (máscara BR), empresa, CNPJ (opcional), senha, confirmar senha
- Barra de força de senha (fraca/média/forte) + regras visíveis
- Checkbox obrigatório: "Li e aceito os [Termos] e a [Política de Privacidade]"
- Botão olho para mostrar/ocultar senha
- Tratamento explícito de: email já existe, email confirmação obrigatória (mostra tela "Confirme seu email"), erro de rede
- Ao sucesso: `logAuthEvent('signup')` + `navigate('/painel')` (ou tela de "confirme email" se auth exigir)

### `/login`
- Mesmo layout premium, olho na senha, "Lembrar de mim"
- Após entrar: chama `getMyContext`, decide rota (`is_staff → /admin`, `blocked → /login?reason=blocked`, `no_workspace → /painel` que faz onboarding, senão → `/painel` ou `search.redirect`)
- Rate-limit local: desabilita botão 30s após 5 falhas seguidas
- `logAuthEvent('login_success' | 'login_failed')`

### `/recuperar-senha`
- Já OK, apenas polir visual e mostrar estado "enviado" com ilustração

### `/reset-password`
- Validar que a sessão é de recovery (`supabase.auth.onAuthStateChange` `PASSWORD_RECOVERY`) antes de mostrar form; senão avisa "link expirado"
- Após salvar: `logAuthEvent('password_reset_completed')` + navegar para `/painel`

### Nova `/auth/callback`
- Rota pública que consome hash do Supabase (`?type=signup|recovery|magiclink`) e redireciona certo (fix do redirect atual que vai direto para `/painel` sem tratar recovery)

## Fase 4 — Painel do cliente

### `/painel` (layout)
- Trocar 4 queries do `beforeLoad` por `getMyContext()`
- Se `is_blocked`: mostra tela cheia de "Conta suspensa — fale com suporte" ao invés do painel
- Se não tem workspace: mostra tela de "Complete seu cadastro" com form de nome da empresa e cria workspace via server fn (não redireciona para `/cadastro`)
- Header: saudação, badge de saldo, avatar com menu (Configurações, Sair)

### `/painel/` (home)
- KPIs reais: mensagens enviadas/entregues/lidas/falhas/respostas/opt-outs no mês, campanhas ativas — via server fn `getPanelHomeStats`
- Checklist de onboarding dinâmica lida de `onboarding_checklist`, com CTA em cada item
- Botões: "Criar campanha", "Importar contatos", "Solicitar template", "Solicitar liberação de número"
- Empty state elegante para conta nova (sem contatos/campanhas)

## Fase 5 — Segurança e testes

- RLS auditada nas tabelas sensíveis (confirmar filtro por `workspace_id` em `contacts`, `contact_lists`, `campaign_recipients`, `whatsapp_templates`, `message_logs`, `wallet_transactions`, `deposits`, `wallet_reservations`, `onboarding_checklist`)
- Página 404 personalizada (`__root notFoundComponent`) e error boundary global
- Testes manuais via Playwright: signup → workspace criado → painel carrega → logout → login → cliente bloqueado no /admin → admin não vai para /painel indevidamente

## Fora do escopo (não vou mexer)
- Rotas do admin já existentes (só verifico que ainda funcionam)
- Módulos de campanhas, templates, contatos, financeiro (mantidos como estão)
- Ativação do Stripe (fica pendente)

## Detalhes técnicos

- Toda navegação com `<Link>` / `useNavigate` do TanStack Router
- `beforeLoad` do `/painel` continua `ssr:false` (Supabase em localStorage)
- Server fns novas em `src/lib/auth.functions.ts` (client-safe, `.functions.ts`)
- Migration única com CREATE/ALTER + GRANTs + RLS + trigger update
- Trigger `handle_new_user` é reescrito, não deletado (mantém compatibilidade com contas já criadas)
- `activity_logs` já existe — só adiciono novos valores no enum se houver, senão uso `event_type text`

## Perguntas antes de começar

1. **Confirmação de email obrigatória?** Hoje o Supabase pode estar com "auto-confirm" ativo ou não. Se estiver desativado, o cadastro NÃO redireciona para `/painel` — mostra "Confirme seu email primeiro". Você quer:
   - (a) Manter auto-confirm ativo (mais simples, entra direto — recomendo pra SaaS)
   - (b) Exigir confirmação de email (mais seguro, mas atrito no cadastro)

2. **CNPJ agora ou depois?** Torná-lo obrigatório no cadastro ou opcional (só coleta depois em `/painel/configuracoes`)?

3. **Login social (Google)?** Adicionar botão "Entrar com Google" no login/cadastro nesta rodada, ou fica para depois?
