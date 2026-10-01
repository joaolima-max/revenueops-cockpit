# Rodada v18/v19 — Segurança do banco, Acompanhamento de Metas, Condições BaaS e certificado para cliente antigo

> Documento da rodada. Complementa [`RODADA-V17.md`](./RODADA-V17.md), que
> descreve o pipeline por resultado, o financeiro remodelado e as metas com
> direção.

---

## Sumário

| Área | O que mudou |
|---|---|
| **Segurança do banco** | RLS fechada nas 48 tabelas. Leitura pública de dados privados eliminada. |
| **Cockpit** | Seção **Acompanhamento de metas**: projetado × realizado, progresso, pacing e atingimento por KPI. |
| **Metas** | `avaliarCompleto` passa a ser a porta única — comparação, gap, cumprimento, direção e ritmo. |
| **Financeiro** | O menu passa a se chamar **Condições BaaS**. |
| **Categorias** | Float, Setup e Sustentação recriadas — categorias **normais** de receita, sem subcategoria. |
| **Certificados** | Envio para **cliente que saiu da base**, sem recriar o cliente. |
| **Contas a Receber** | Reescrita no padrão de Contas a Pagar. |
| **Tarefas e Follow-ups** | Padronizadas no design system atual. |
| **Volumetria** | Editar e excluir destravados, inclusive no contrato geral legado. |

---

## 1. RLS — a leitura pública estava aberta

### O que foi encontrado

30 das 48 tabelas do schema `public` estavam **sem row level security**. O
Supabase concede `SELECT/INSERT/UPDATE/DELETE` aos papéis `anon` e
`authenticated` por padrão, e o PostgREST expõe o schema `public` na internet.
Como a chave anon é `NEXT_PUBLIC_`, ela viaja no bundle do navegador — qualquer
pessoa que abrisse o aplicativo e copiasse a chave lia essas tabelas direto.

Confirmado por sondagem antes da correção:

```
GET /rest/v1/LancamentoDiario   →  HTTP 200, linha real (TPV, receita, transações)
```

Entre as expostas: `Certificado` (senha cifrada), `CondicaoComercial`,
`LancamentoFinanceiro`, `PendenciaCompliance`, `PipelineMovimentacao`,
`Documento`.

As outras 18 já tinham RLS ligada e nenhuma política — por isso `User`
respondia vazio na mesma sondagem.

### A correção

`ENABLE ROW LEVEL SECURITY` nas 30, **sem criar política nenhuma**. Sem
política, a tabela nega tudo para quem está sujeito a RLS.

Não foi preciso escrever regra de negócio no banco porque **ninguém deveria
chegar por esse caminho**: a autorização do produto vive em
`lib/permissions.ts` e `lib/pipeline.ts`, aplicada nas rotas. Uma política aqui
seria uma segunda descrição da mesma regra, livre para divergir.

### Por que não quebra o aplicativo

O produto **não usa PostgREST para dado nenhum**. Há exatamente dois caminhos,
e os dois passam por cima de RLS:

| Caminho | Papel | `rolbypassrls` |
|---|---|---|
| Prisma (`DATABASE_URL`, conexão Postgres direta) | `postgres` — **dono** das 48 tabelas | ✓ |
| Supabase Storage (server-side, service role key) | `service_role` | ✓ |
| PostgREST com a chave pública | `anon` / `authenticated` | ✗ |

Verificado no banco, não assumido.

### O que deliberadamente não foi feito

- **`FORCE ROW LEVEL SECURITY`** — sujeitaria o dono (`postgres`) à RLS e
  derrubaria o Prisma.
- **`REVOKE` dos grants** — a RLS já nega; revogar mexeria em mais superfície
  do que o necessário.
- **Qualquer política** — ver acima.

### Efeito observável

| | Antes | Depois |
|---|---|---|
| Leitura anon | 200, linha real | 200, **lista vazia** |
| Escrita anon | — | **401** · `new row violates row-level security policy` |
| Backend | — | inalterado |

O advisor de segurança do Supabase saiu de `rls_disabled_in_public` (**ERROR**,
30 achados) para apenas `rls_enabled_no_policy` (**INFO**, 48) — o estado
pretendido.

> **Atenção para o futuro:** tabela nova nasce **sem** RLS. Ao criar uma,
> acrescente o `ENABLE` em `supabase-migration-v18.sql`, ou o advisor volta a
> acusar. `tests/rls.test.ts` guarda essa regressão.

---

## 2. Cockpit — Acompanhamento de metas

Seção nova, respondendo quatro perguntas numa composição só, em vez de quatro
cards grandes repetindo o mesmo número:

1. **Projetado × Realizado** — uma régua: a barra é o realizado contra a meta,
   e o tique vertical marca onde o realizado **deveria estar hoje**, dado o
   tempo decorrido. É o tique que transforma "35% da meta" em leitura: 35% no
   dia 10 está adiantado; 35% no dia 28 está atrasado.
2. **Progresso da meta** — o percentual de cumprimento.
3. **Pacing / ritmo** — a projeção de fechamento, como selo (`Acima do ritmo`,
   `No ritmo`, `Abaixo do ritmo`).
4. **Atingimento por KPI** — uma célula por indicador, lado a lado.

### A regra da projeção

Indicadores de **fluxo** acumulam (TPV, receita, transações, MEDs): a projeção
é `realizado ÷ decorrido`. Indicadores de **estoque ou proporção** não acumulam
(saldo médio, MED %, take rate): a projeção é o próprio realizado, porque a
média parcial já é a melhor estimativa do fechamento.

Projetar um percentual pelo tempo decorrido daria **6% de MED no dia 10 a
partir de 2%** — um número que não significa nada. A tabela `ACUMULA_NO_MES`
registra qual indicador é qual.

### Menor é melhor

Vem resolvido de `lib/metas.ts`: `positivo`, `cumprimento` e `ritmo` já saem
invertidos quando a direção pede. O componente **não tem nenhuma exceção por
tipo de indicador**.

---

## 3. Metas — a função única

`avaliarCompleto` passou a ser a única porta de entrada. Reúne comparação,
gap, atingimento, direção, status e ritmo — para que nenhum componente refaça a
matemática. Cockpit, tela de Metas e API leem daqui.

**Gap** é sempre *"quanto falta para ficar no alvo"*, nunca a diferença crua:

| Direção | Meta | Realizado | Gap |
|---|---|---|---|
| maior é melhor | 100 | 80 | **20** (faltam 20) |
| menor é melhor | 2% | 3% | **1** (sobra 1 a cortar) |
| qualquer | — | já no alvo | **0** |

---

## 4. Financeiro — "Condições BaaS"

O menu passou de "Condições Comerciais BaaS" para **"Condições BaaS"**. Aplicado
em sidebar, título da tela, notas de origem dos KPIs, links e documentação.

Rota, modelo e API **não** mudaram: continuam `condicoes-baas` e
`CondicaoComercial`. Renomear a rota quebraria links salvos, e renomear o
modelo exigiria migration sem ganho nenhum.

Os menus finais do Financeiro, nesta ordem:

1. Visão Geral · 2. Lançamentos · 3. Contas a Receber · 4. Contas a Pagar
· 5. Categorias · 6. Fornecedores · 7. Condições BaaS

---

## 5. Categorias — sem subcategoria

**Float, Setup e Sustentação são categorias NORMAIS de tipo Receita.** Não
existe hierarquia em `CategoriaFinanceira`, e nada nesta rodada cria uma.

O que as distingue é o campo `natureza` — um atributo, não um nível. É ele que
faz os gráficos financeiros reconhecerem a categoria, e é por isso que renomear
"Float" para "Float / rendimento" não quebra nada.

As três foram excluídas pela tela de Categorias em 01/10 (registrado em
Auditoria) e foram **recriadas** pela migration v19, de forma idempotente: só
insere se faltar, e primeiro tenta adotar uma categoria existente de mesmo nome
que esteja sem natureza.

---

## 6. Certificados — cliente que saiu da base

Há envios históricos para empresas que não estão mais na base. Até aqui,
`CertificadoEnvio.clienteId` era `NOT NULL`: registrar um desses obrigaria a
**recriar a empresa como Cliente**, sujando a Carteira com uma linha que não é
cliente e contaminando contagens, MRR e filtros.

No formulário de envio:

```
[ ] Cliente não está mais ativo na base
```

| Marcação | Campo exigido | Grava |
|---|---|---|
| desmarcado | Cliente (seleção) | `clienteId` |
| marcado | Nome do cliente (texto) | `clienteNomeHistorico`, `clienteId = null` |

Exatamente um dos dois fica preenchido. A regra é aplicada em
`validarDestinatario` (`lib/certificados.ts`), não por `CHECK` — um CHECK
impediria corrigir uma linha histórica importada errada.

**Nenhum cliente é criado. A carteira não é tocada.** O envio preserva versão,
intervalo, quantidade, responsável, data, status e histórico. Cliente fora da
base não tem gestor nem dono, então não há quem notificar — e a rota não tenta.

A criptografia dos certificados segue intacta: AES-256-GCM com IV e
authentication tag, chave server-only, senha ausente das listagens, revelação
protegida por permissão e auditada.

---

## 7. Volumetria — o bloqueio que não era de permissão

Editar e excluir não funcionavam para **nenhum** registro. Não era alçada —
`podeAdministrarVolumetria('ADMIN')` sempre devolveu `true`.

Era a regra de **"contrato geral legado é somente leitura"**: `PUT`, `PATCH` e
`DELETE` recusavam com 409 qualquer linha com `clienteId` nulo, e a tela
trocava os botões por "somente leitura". Como a **única** volumetria existente
em Production é uma linha legada criada pelo seed, 100% dos registros caíam na
exceção.

Agora o legado é editável e excluível como qualquer outro contrato. O que
protege passou a ser a alçada de ADMIN, a confirmação explícita e a Auditoria —
não um campo nulo. Informar um cliente ao editar **adota** a linha no modelo
atual; deixar em branco a mantém como contrato geral.

Trocar o cliente de um contrato **já vinculado** continua recusado: isso
moveria a exigência contratual de uma empresa para outra.

---

## 8. Contas a Receber, Tarefas e Follow-ups

As três passaram a usar a mesma gramática das telas de Financeiro:
`PageHeader`, `HairlineGrid` com quatro `StatTile`, chips de recorte com
`aria-pressed`, painel de filtros, `TableShell`, `Badge`, `EmptyState`,
skeleton e `bp-field`.

**Contas a Receber** espelha Contas a Pagar: período no cabeçalho, quatro KPIs
(total, vencidas, a vencer, recebidas), filtro por situação e tabela. A base é
outra — `ContaReceber`, o faturamento do cliente, não lançamento de despesa — e
**nenhum valor é contado nas duas**. A diferença funcional é que esta tela
cadastra: o título de faturamento nasce aqui.

`situacaoDoRecebivel` espelha `situacaoDoTitulo`, com uma regra própria:
`INADIMPLENTE` é vencido **por declaração** e continua vencido mesmo que a data
não tenha passado — a única situação em que o estado informado vale mais que o
calendário.

---

## 9. Banco — migrations desta rodada

| Arquivo | O que faz |
|---|---|
| [`supabase-migration-v18.sql`](../supabase-migration-v18.sql) | RLS nas 30 tabelas que estavam abertas |
| [`supabase-migration-v19.sql`](../supabase-migration-v19.sql) | `CertificadoEnvio.clienteId` nulável + `clienteNomeHistorico`; recria Float/Setup/Sustentação |

As duas são **aditivas e idempotentes**. O único `ALTER` em coluna existente é
um `DROP NOT NULL`, que afrouxa restrição — nenhuma linha atual deixa de ser
válida. Sem `DROP TABLE/COLUMN/TYPE`, sem `TRUNCATE`, sem `DELETE`.

Histórico financeiro, de taxas, de pipeline, de compliance, de incidentes e a
auditoria ficam intactos.

---

## 10. Testes

`npm test` — 234 testes.

Arquivos novos nesta rodada:

| Arquivo | Cobre |
|---|---|
| `tests/rls.test.ts` | a v18 não desliga RLS, não usa FORCE, não cria política, não é destrutiva; tabelas sensíveis na lista |
| `tests/horarios.test.ts` | as quatro praças, fusos aceitos pelo `Intl`, horário de verão resolvido pelo runtime |

Ampliados: `tests/metas.test.ts` (pacing, projeção, gap, `avaliarCompleto`),
`tests/certificados.test.ts` (destinatário atual × histórico),
`tests/remocoes.test.ts` (menu "Condições BaaS").
