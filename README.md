# Construtivo Pedal — PDV

Projeto **novo e independente** de ponto de venda (PDV), desenvolvido do zero.

- **Online**: operação com conexão à internet; dados em **Supabase** (PostgreSQL)
- Sem acoplamento a outros produtos da Construtivo
- Repositório: [github.com/appconstrutivo/construtivoPedal](https://github.com/appconstrutivo/construtivoPedal)

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha URL e anon key do projeto Supabase
npm run dev
```

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/public do Supabase |

## Stack

- React 19 + TypeScript
- Vite 8

## Auth + Perfil de usuário

- Usuários criados no Supabase Auth ficam na área **Authentication > Users** (tabela `auth.users`).
- Para espelhar dados no schema público da aplicação, execute:
  - `supabase/sql/001_create_user_profiles.sql`
- Para camada multi-tenant (vínculo usuário x empresa com papel por tenant), execute também:
  - `supabase/sql/002_create_company_memberships.sql`
- Para onboarding automático no cadastro (cria empresa + owner automaticamente), execute também:
  - `supabase/sql/003_onboarding_auto_company_membership.sql`
- Em caso de erro `Database error saving new user`, execute também:
  - `supabase/sql/004_harden_onboarding_trigger.sql`
- Para auto-recuperação de vínculo de tenant no login (usuários sem membership), execute:
  - `supabase/sql/005_ensure_current_user_tenant_rpc.sql`
- Se aparecer erro relacionado a `companies_plan_check`, execute:
  - `supabase/sql/006_fix_companies_plan_check_onboarding.sql`
- Esses scripts criam `public.user_profiles` + `public.company_memberships` e preparam o fluxo de autorização por tenant com onboarding automático.
