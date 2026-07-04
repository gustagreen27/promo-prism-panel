
# Disparos FR → Plataforma SaaS Pública

Escopo grande. Proponho entregar em **5 fases incrementais**, cada uma testável e sem quebrar o `/admin` atual. Confirme a fase 1 e sigo; depois validamos cada etapa antes da próxima.

---

## Arquitetura geral

### Rotas
```
/                       → Site público (landing)
/login, /cadastro       → Auth pública do cliente
/recuperar-senha        → Reset
/painel/*               → Área logada do cliente (workspace)
/admin/*                → Área interna (mantida, gate = super_admin)
```

### Multi-tenant
- Nova tabela `workspaces` (empresa do cliente).
- Nova tabela `workspace_members(workspace_id, user_id, role)` com enum `workspace_role` = `owner | admin | operator | viewer`.
- Enum `app_role` existente ganha `super_admin | support | finance | operations` para equipe interna. `/admin` passa a exigir um desses roles internos (hoje exige `admin`).
- Todas as tabelas operacionais ganham `workspace_id uuid not null`:
  - `contacts`, `contact_lists`, `contact_list_items`, `contact_tags`, `whatsapp_wabas`, `whatsapp_connections`, `whatsapp_templates`, `wa_campaigns`, `campaign_recipients`, `campaign_events`, `campaign_timeline`, `message_logs`, `message_stock`, `opt_outs`, `whatsapp_inbox`, `whatsapp_messages`, `reports`, etc.
- RLS reescrita: função `current_workspace_id()` + `is_workspace_member(ws, role[])` (SECURITY DEFINER). Policies:
  - Cliente vê apenas linhas do seu workspace.
  - Roles internos (`has_role(uid, 'super_admin' | 'support' | ...)`) veem tudo.
- Migração de dados existentes: criar um workspace "Legacy" e vincular todas as linhas atuais a ele; usuários admin atuais viram membros desse workspace + mantêm role interno.

### Auth
- Habilitar signup público (hoje o `handle_new_user` promove o primeiro user a admin — vamos ajustar para NÃO conceder role interno em signups públicos; só criar profile + workspace + membership owner).
- Trigger `handle_new_user` reescrito: cria `profiles`, cria `workspaces` (nome = empresa do cadastro, via metadata) e `workspace_members` com role `owner`.
- `/painel/*` protegido por layout que exige sessão + membership.
- `/admin/*` protegido por role interno (`super_admin` etc.).

---

## Fase 1 — Fundação multi-tenant (backend + auth)

1. Migração SQL:
   - Enums `workspace_role`, ampliar `app_role`.
   - Tabela `workspaces` (id, name, slug, plan, status, owner_id, created_at, updated_at).
   - Tabela `workspace_members` (workspace_id, user_id, role, unique).
   - GRANTs + RLS + policies (via `has_workspace_role` SECURITY DEFINER).
   - Adicionar coluna `workspace_id` nas tabelas operacionais (nullable primeiro), backfill para workspace "Legacy", depois `NOT NULL`.
   - Reescrever policies existentes para escopar por workspace + bypass para roles internos.
   - Ajustar `handle_new_user` para o novo fluxo.
2. Middleware server: helper `requireWorkspace` que resolve `workspace_id` do usuário logado e injeta no context de todos os server functions.
3. Ajustar server functions atuais (`contacts.functions.ts`, `wa-campaigns.functions.ts`, etc.) para filtrar/inserir com `workspace_id`.
4. `/admin` continua funcionando: passa a exigir role interno; usuário admin atual recebe `super_admin` na migração.

**Entregável:** `/admin` intacto, backend pronto para múltiplos workspaces. Nenhuma UI nova ainda.

---

## Fase 2 — Auth pública (`/login`, `/cadastro`, `/recuperar-senha`)

1. Rotas públicas com design premium (mesmo sistema visual da futura landing).
2. Cadastro: nome, e-mail, telefone, empresa, senha → `supabase.auth.signUp` com metadata `{ company_name, full_name, phone }` que o trigger usa para criar o workspace.
3. Login redireciona: role interno → `/admin`; membro de workspace → `/painel`.
4. Recuperação de senha (`resetPasswordForEmail` + rota `/reset-password`).

---

## Fase 3 — Landing pública `/`

Landing SaaS moderna, responsiva, com as seções pedidas: Header, Hero, Prova de valor, Como funciona (6 passos), Recursos, Segurança/Conformidade, Planos (Starter/Growth/Scale/Enterprise — valores placeholders editáveis), FAQ, CTA final, Footer. Design de referência: Stripe/Brevo/Zenvia. Tokens em `src/styles.css`, componentes shadcn. SEO: `head()` por seção via route metadata, `og:image` gerada.

---

## Fase 4 — Painel do cliente `/painel/*`

Novo layout com sidebar/topbar próprios (separado do `/admin`).

Rotas:
- `/painel` — dashboard + checklist de onboarding + cards de KPIs (do próprio workspace).
- `/painel/campanhas` + `/painel/campanhas/nova` + `/painel/campanhas/$id` — reaproveitando lógica de `wa-campaigns` já existente, filtrada por workspace.
- `/painel/contatos` (+ listas + tags).
- `/painel/templates` — CRUD com status `rascunho | aguardando_revisao | enviado_meta | aprovado | rejeitado`.
- `/painel/whatsapp` — Embedded Signup quando disponível, senão botão "Solicitar configuração" (cria ticket lido pelo admin).
- `/painel/relatorios` — só dados do workspace, export CSV.
- `/painel/financeiro` — plano, estoque de mensagens, consumo, faturas (estrutura pronta; pagamento online fica para fase futura).
- `/painel/configuracoes` — dados da empresa, membros (convidar por e-mail, atribuir role de workspace), preferências.

Regras de negócio preservadas: campanha só inicia com opt-in, template aprovado, número ativo, estoque suficiente, token válido, cliente não bloqueado.

---

## Fase 5 — Admin interno ampliado

Ampliar `/admin` para visão cross-workspace: listar clientes/workspaces, ver campanhas de todos, aprovar templates internamente (fila "aguardando revisão"), gerenciar planos, gerenciar estoque/créditos por workspace, bloquear/desbloquear cliente, ver logs e faturamento geral, atender solicitações de configuração de WhatsApp.

---

## O que **não** vou fazer sem confirmação
- Não vou implementar pagamentos online (Stripe/Paddle) agora — só a estrutura de planos/faturas. Confirme se quer que eu já habilite Stripe na Fase 4/5.
- Não vou remover nenhuma tela existente do `/admin`.
- Não vou trocar o design system atual do `/admin`; a landing e o `/painel` recebem tratamento premium novo e podem convergir depois.

---

## Perguntas antes de começar

1. **Usuários existentes:** algum e-mail específico deve virar `super_admin` além do dono atual? Ou promovo todos os `admin` atuais para `super_admin` automaticamente?
2. **Auto-confirm de e-mail no cadastro público:** ativo (usuário cai direto no painel) ou exijo confirmação por e-mail?
3. **Planos iniciais:** posso usar valores placeholders (R$ 197 / 497 / 1.497 / sob consulta) que você edita depois?
4. **Posso começar pela Fase 1 (migração multi-tenant)?** Ela é a base de tudo e envolve alterar RLS de várias tabelas — quero seu ok antes de rodar a migration.
