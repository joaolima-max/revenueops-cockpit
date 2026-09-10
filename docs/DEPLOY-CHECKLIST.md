# Deploy — RevenueOps Cockpit

Procedimento para levar a versão atual a Preview e depois a Production.

A ordem importa: **variáveis → migrations → storage → deploy → smoke test**. Subir
o código antes das migrations deixa as telas novas respondendo erro de coluna
inexistente; subir as migrations sem as variáveis deixa Documentos e
Certificados sem funcionar.

Estado de origem: as migrations **v10 a v14 nunca foram aplicadas** em Preview
nem em Production. Foram validadas em Postgres 17 local — aplicadas sobre dados
reais, reexecutadas três vezes e conferidas contra o `schema.prisma` sem drift.

---

## 1. Variáveis de ambiente

Cinco nomes. **Nenhum valor deve ser colado em issue, chat, log ou commit.**

| Variável | Onde | Observação |
|---|---|---|
| `DATABASE_URL` | server | já existe |
| `JWT_SECRET` | server | já existe |
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | **nunca** com prefixo `NEXT_PUBLIC_` |
| `CERTIFICADO_ENCRYPTION_KEY` | **server-only** | 32 bytes em hex |

Gerar a chave de certificados:

```bash
openssl rand -hex 32
```

Outro formato funciona — é derivado por SHA-256 —, mas hex de 32 bytes é o
formato direto do AES-256 e o recomendado.

> **A chave de certificados é irrecuperável.** Trocá-la depois torna ilegível
> toda senha já cifrada. Guarde-a no cofre de segredos antes de usá-la.

Definir em cada ambiente:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL    preview
vercel env add SUPABASE_SERVICE_ROLE_KEY   preview
vercel env add CERTIFICADO_ENCRYPTION_KEY  preview
# repetir com `production` quando for a vez
```

Conferir presença sem revelar valor:

```bash
vercel env ls preview
```

---

## 2. Banco — aplicar v10 a v14

### Ordem obrigatória

| # | Arquivo | O que faz | Depende de |
|---|---|---|---|
| 1 | `supabase-migration-v10.sql` | Volumetria mínima por cliente | — |
| 2 | `supabase-migration-v11.sql` | Pipeline multi-funil + seed dos 3 funis + backfill dos deals | — |
| 3 | `supabase-migration-v12.sql` | Todos os enums novos, role `GESTOR`, `Cliente.gestorId`, Notificações, Documentos, movimento diário | — |
| 4 | `supabase-migration-v13.sql` | Certificados e Compliance | v12 |
| 5 | `supabase-migration-v14.sql` | Automações e Formulários | v11, v12 |

Pular ou inverter a ordem falha: a v13 usa enums criados na v12, e a v14
referencia `PipelineFunil` e `PipelineEtapa`, criados na v11.

### Como aplicar

Pelo **SQL Editor do Supabase**, um arquivo por vez, na ordem acima. Conferir
que cada um terminou sem erro antes de passar ao seguinte.

Ou pela linha de comando, com a connection string do ambiente-alvo:

```bash
for v in 10 11 12 13 14; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase-migration-v$v.sql" || break
done
```

### Propriedades verificadas

- **Nenhuma é destrutiva.** Zero `DROP TABLE`, `DROP COLUMN`, `DELETE FROM` e
  `TRUNCATE`. Todo `ALTER TABLE` é `ADD COLUMN` ou `ADD CONSTRAINT`. A única
  remoção é o índice único de `VolumetriaMinima.periodo` na v10, substituído por
  `(clienteId, periodo)` — restrição, não dado.
- **Idempotentes.** Reexecutar é seguro: `IF NOT EXISTS`, `DO $$ … duplicate_object`
  e `ON CONFLICT DO NOTHING`. Reexecutadas 3× em teste sem erro e sem duplicar.
- **O backfill preserva o `stage` de cada Deal um a um** (`PROSPECCAO` continua
  em Prospecção, e assim por diante) e só toca linhas com `funilId` nulo.

### Validação pós-migration

```bash
# 1. Contagens esperadas: 35 tabelas, 30 enums
psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"
psql "$DATABASE_URL" -tAc \
  "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
   where n.nspname='public' and t.typtype='e'"

# 2. Nenhum Deal ficou órfão do backfill (esperado: 0)
psql "$DATABASE_URL" -tAc 'select count(*) from "Deal" where "funilId" is null'

# 3. Os três funis com suas etapas: Vendas 7, Onboarding 6, Operações 3
psql "$DATABASE_URL" -c \
  'select f.nome, count(e.id) as etapas from "PipelineFunil" f
   join "PipelineEtapa" e on e."funilId"=f.id group by f.nome, f.ordem order by f.ordem'

# 4. A role GESTOR entrou no enum
psql "$DATABASE_URL" -tAc \
  "select string_agg(enumlabel,', ' order by enumsortorder) from pg_enum e
   join pg_type t on t.oid=e.enumtypid where t.typname='Role'"
```

### Conferir o schema

O comando que decide se o banco está alinhado com o código. **Saída vazia é o
resultado esperado** — qualquer SQL impresso é drift:

```bash
DATABASE_URL="<url do ambiente>" npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script
```

> `npx prisma migrate status` vai dizer que o banco "não é gerenciado pelo
> Prisma Migrate". Isso é esperado: o projeto versiona SQL à mão desde a v1.
> O comando de drift acima é o que vale.

---

## 3. Storage

Bucket **`cliente-arquivos`**, privado.

```bash
npm run setup:storage
```

O script é idempotente: cria o bucket se não existir e, se já existir **público**,
fecha. Exige `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente.

Manualmente, se preferir: Supabase → Storage → New bucket → nome
`cliente-arquivos` → **Public bucket desmarcado**.

### Confirmar que está privado

No painel, o bucket não pode exibir o rótulo *Public*. Um bucket público expõe
todo documento de cliente por URL direta, sem passar por autenticação.

### Validar upload e signed URL

1. Dashboard → **Documentos** → *Enviar documento*
2. Escolher um cliente, arrastar um PDF, salvar — a barra de progresso deve
   completar e o documento aparecer na lista.
3. Clicar em **Baixar**: abre uma URL assinada que expira em 60 segundos.
4. Copiar essa URL, esperar mais de um minuto e abrir de novo: **deve falhar**.
   Se continuar funcionando, o bucket está público — pare o deploy.
5. Dashboard → **Auditoria**: devem constar `ENVIOU_DOCUMENTO` e
   `BAIXOU_DOCUMENTO`.

---

## 4. Deploy

Só depois de variáveis, migrations e bucket prontos.

```bash
vercel deploy                # Preview
vercel deploy --prod         # Production, após o smoke test em Preview
```

---

## 5. Smoke test

Rodar na ordem. Cada item depende do anterior ter funcionado.

| # | Passo | O que confirmar |
|---|---|---|
| 1 | **Login** | Entra e cai no Cockpit |
| 2 | **Dashboard** | KPIs carregam; bloco de Volumetria diz "soma de N clientes" ou "contrato geral" |
| 3 | **Carteira** | Lista abre; coluna **Gestor**; faixa dos **últimos 5 dias** com ✅/❌/· — clicar num dia alterna e persiste após recarregar |
| 4 | **CRM** | Seletor de funis; tempo médio por etapa, conversão e gargalos |
| 5 | **Pipeline** | Seletor de funis mostra Vendas, Onboarding e Operações com as etapas certas |
| 6 | **Notificações** | Sino no topo; central em `/dashboard/notificacoes`; "marcar todas como lidas" zera o contador |
| 7 | **Documentos** | Upload, filtro e download por link assinado |
| 8 | **Certificados** | Aba Versões e aba Envios abrem |
| 9 | **Compliance** | Lista de pendências abre |
| 10 | **Automações** | Lista abre (só ADMIN) |
| 11 | **Formulários** | Lista e painel de taxas abrem |
| 12 | **Criação de registro** | Criar um card no Pipeline pelo "+ Adicionar" de uma coluna |
| 13 | **Movimentação de card** | Arrastar entre etapas; abrir **Histórico** e ver o movimento com autor e data |
| 14 | **Transferência entre funis** | *Transferir* → Onboarding → Kickoff → escolher cliente (o funil exige) → confirmar. O responsável do Onboarding recebe notificação |
| 15 | **Upload/download de documento** | Ver seção 3 acima |
| 16 | **Criação de versão de certificado** | Nova versão → confere que nasce com **50** certificados numerados de 1 a 50 |
| 17 | **Envio de certificado** | Registrar envio: **Único** aceita `11`; **Lote** aceita `1 - 10` e recusa 9 ou 11 números. A referência exibida cita a versão |
| 18 | **Revelar senha** | Só ADMIN vê *Copiar senha*. A senha **não aparece na tela** — vai para a área de transferência. Auditoria registra `REVELOU_SENHA_CERTIFICADO` |
| 19 | **Formulário: criar e publicar** | Construtor → adicionar campos → Publicar |
| 20 | **Link público `/f/[token]`** | Gerar link, abrir **numa aba anônima** (sem sessão), preencher e enviar. A resposta aparece no painel |
| 21 | **Anexo em formulário** | Num link **vinculado a cliente**, anexar um PDF. O arquivo passa a constar em Documentos, categoria Outros, origem Formulário |
| 22 | **Link revogado** | Revogar o link e reabrir: deve dizer que foi revogado, não aceitar resposta |

### Permissões por papel

Entrar com um usuário de cada papel e confirmar:

| Papel | Vê | Não vê |
|---|---|---|
| **Administrador** | tudo | — |
| **Gestor** | Carteira, Pipeline, CRM, Documentos (lista), Compliance (lista) | Automações, Funis, Certificados; **não baixa** documento |
| **Operador** | Incidentes, Tarefas, Métricas Op., funis de Onboarding e Operações | Funil de Vendas, Automações, Certificados |
| **Comercial** | Leads, Pipeline (**só os próprios cards**), Follow-up | Onboarding, Operações, Automações, Certificados, Documentos |

Dois pontos que valem verificação explícita, porque dependem de regra e não de menu:

- **Comercial no funil de Vendas enxerga apenas os cards de que é dono**
  (`apenasProprios`, semeado na v11).
- **Digitar `/dashboard/pipeline/funis` na URL como não-ADMIN redireciona.**
  O proxy casa rotas por prefixo e não separa essa rota de `/dashboard/pipeline`;
  quem barra é a verificação na própria página e em cada API.

---

## 6. Rollback

As migrations são aditivas: **não há downgrade destrutivo**, e voltar o deploy
não exige desfazer banco. A versão anterior do código convive com as tabelas
novas, que ficam simplesmente sem uso.

```bash
vercel rollback
```

O que **não** dá para desfazer: a `CERTIFICADO_ENCRYPTION_KEY`. Depois que
senhas forem cifradas com ela, trocá-la torna todas ilegíveis.
