# Rodada v16 — Remodelagem de Operações e Financeiro

Documento autoritativo sobre o estado do produto **depois** desta rodada. Onde
este documento e `DOCUMENTACAO-COMPLETA.md` discordarem, vale este.

---

## 1. O que saiu do produto

Seis ambientes foram removidos por inteiro — menu, páginas, rotas, APIs,
componentes, permissões e, quando exclusivos deles, modelos de banco.

| Ambiente | Páginas | APIs | Modelos removidos |
|---|---|---|---|
| Relatórios | `/dashboard/relatorios` | `/api/relatorios` | — (era derivado) |
| Documentos | `/dashboard/documentos` | `/api/documentos` | — (ver §2) |
| Alertas | `/dashboard/alertas` | — | — (era derivado) |
| Parâmetros | `/dashboard/parametros` | `/api/parametros`, `/api/float-config` | `Parametro` |
| Formulários | `/dashboard/formularios`, `/f/[token]` | `/api/formularios` | `Formulario`, `FormularioVersao`, `FormularioLink`, `FormularioResposta`, `FormularioAnexo` |
| Automações | `/dashboard/automacoes` | `/api/automacoes` | `Automacao`, `AutomacaoExecucao` |

Enums removidos: `AutomacaoGatilho`, `AutomacaoAcao`, `AutomacaoExecucaoStatus`,
`FormularioRespostaStatus`, `ScoreRisco`.

Chaves de permissão removidas: `view_relatorios`, `view_documents`,
`download_documents`, `manage_documents`, `view_forms`, `manage_forms`,
`view_alertas`, `manage_parametros`, `manage_automations`.

### O que NÃO saiu junto

* **Notificações** permanece — é ambiente diferente de Alertas.
* **`NotificacaoOrigem.AUTOMACAO` e `.FORMULARIO`** continuam no enum: há
  notificações históricas gravadas com essas origens, e remover o valor
  quebraria a leitura do passado. A aplicação não produz mais nenhuma.
* **`DocumentoOrigem.FORMULARIO`** permanece pela mesma razão.
* **`FloatConfig`** permanece. O Float saiu do Cockpit como KPI, mas continua
  sendo linha de receita no Conselho — a configuração segue sendo lida.
* **Analytics** usados por Dashboard, CRM e Conselho não foram tocados.

---

## 2. Documentos e anexos

O ambiente genérico "Documentos" saiu. O **modelo `Documento` ficou**, porque é
o que representa um arquivo no bucket privado, e continua servindo:

* o ZIP de `CertificadoVersao` (estoque global de certificados);
* o **anexo de lançamento financeiro** (novo — nota fiscal, comprovante, print).

Mudança mínima no modelo: `Documento.clienteId` passou a aceitar nulo. Era
obrigatório porque o único caminho de upload era o ambiente removido; um anexo
de lançamento financeiro não pertence a cliente nenhum.

Supabase Storage, bucket privado `cliente-arquivos` e download por URL assinada
de curta duração: tudo preservado.

---

## 3. Clientes — cadastro enxuto

**Campos do cadastro comercial:** Nome, CNPJ, Modelo operacional (API / BaaS /
White Label), E-mail, Telefone, Segmento, Data de fechamento, Mensalidade de API.

**Removidos:** `operacao` (e a caixa de marcação "Operações"), `scoreRisco`,
`sustentacaoWhiteLabel`, `setup`, `tpvEsperado`, `qtdTransacoesEsperada`,
`qtdMedEsperada`, `receitaPrevistaMensal`, `descontoPercent`, `overpricePercent`.

Nenhum campo financeiro alternativo foi criado no lugar. A razão é que nenhum
deles era fonte de verdade de nada:

| O que se perguntava | Onde a resposta mora agora |
|---|---|
| Quanto esse cliente movimenta | `LancamentoDiario` (global — não existe TPV por cliente) |
| Sustentação / overprice do parceiro | `CondicaoComercial` |
| Mínimo contratual de transações | `VolumetriaMinima` |
| Mensalidade de API do cliente | `Cliente.mensalidadeApi` (preservado) |

Saíram junto o LTV e o CAC da tela de detalhe: vinham do ambiente "Parâmetros"
e **já eram props mortas** — a tela recebia os valores e não renderizava nenhum.

Os valores das colunas removidas foram copiados para `ArquivoRemocaoV16` antes
do `DROP COLUMN` (ver §11).

---

## 4. Metas — só o esperado

`Meta` guarda **objetivo, período e tipo**. Nada mais.

* **Meta** → o que se espera.
* **Lançamento Diário** → o realizado.
* **Cockpit / Conselho** → a comparação.

A API já respeitava isso; a **tela** ainda tinha campo "Valor Realizado"
digitável, em criação e em edição. Os dois saíram. O realizado é apurado por
`metasDoPeriodo()`, que cruza `Meta` com `kpisDoPeriodo()`.

---

## 5. Lançamento Diário — clientes ativos

Campo novo: `LancamentoDiario.clientesAtivos` (`Int?`).

**Convenção:** é **fotografia do dia**, igual a `saldoEmConta` — não é fluxo que
se acumula como TPV ou transações.

* O valor mensal é o do **último dia lançado que informou o número**.
* Dias sem informação são pulados.
* Ausência total é `null`, nunca zero — zero significaria "nenhum cliente ativo".

A regra é a função pura `clientesAtivosDoMes()` em `lib/kpi.ts`, testada em
`tests/clientes-ativos.test.ts`.

Alimenta o Cockpit e o Conselho. Não existe contagem manual em nenhuma outra
tela.

---

## 6. BaaS e White Label — `CondicaoComercial`

BaaS e White Labels são cadastrados em **Financeiro → Condições Comerciais
BaaS**. É a fonte única de:

* **BaaS ativos** — `tipo = BAAS`, `ativo = true`
* **White Labels ativos** — `tipo = WHITE_LABEL`, `ativo = true`
* duas das quatro parcelas do MRR

Campos: nome fantasia, identificação (número da conta, único), tipo, PIX, KYC,
sustentação, API mensal, overprice (%).

Antes, esses três números saíam de contagem sobre `Cliente` agrupada por
`modeloOperacional`. Não servia: um BaaS parceiro não é necessariamente um
registro na carteira.

### Histórico de taxas

Toda alteração de `pix`, `kyc`, `sustentacao`, `apiMensal`, `overpricePercent`,
`tipo` ou `ativo` grava uma linha em `CondicaoComercialHistorico` com **valor
anterior, valor novo, data e usuário responsável** — na **mesma transação** da
alteração. Ou os dois acontecem, ou nenhum: nunca existe taxa nova sem o
registro de que ela mudou.

A tela mostra "Condições atuais" e "Histórico de condições" lado a lado.

**Exclusão não existe:** o cadastro é *inativado*. Apagar a linha levaria o
histórico junto (cascade), e esse histórico sustenta MRR já reportado.

---

## 7. MRR e ARR

```
MRR = sustentação de todos os BaaS          → CondicaoComercial.sustentacao  (tipo BAAS)
    + sustentação de todos os White Labels  → CondicaoComercial.sustentacao  (tipo WHITE_LABEL)
    + API mensal dos BaaS/White Labels      → CondicaoComercial.apiMensal    (ativos)
    + API mensal dos clientes da Carteira   → Cliente.mensalidadeApi         (status ATIVO)

ARR = MRR × 12
```

**Sem dupla contagem:** a mensalidade de API de um parceiro mora em
`CondicaoComercial.apiMensal`; a de um cliente da carteira, em
`Cliente.mensalidadeApi`. São campos de tabelas diferentes, preenchidos em telas
diferentes.

**Histórico de taxas × MRR:** o MRR usa sempre a condição **vigente**. O
histórico existe para auditoria e **não participa do cálculo** — alterar uma
taxa hoje muda o MRR de hoje e não reescreve o que já foi reportado.

Implementação: `calcularMrr()` e `arrDoMrr()` em `lib/financeiro.ts`. A mesma
função serve Financeiro, Cockpit e Conselho.

---

## 8. Financeiro — estrutura nova

| Menu | Rota | API |
|---|---|---|
| Visão Geral | `/dashboard/financeiro` (exata) | `/api/financeiro/visao-geral` |
| Lançamentos | `/dashboard/financeiro/lancamentos` | `/api/financeiro/lancamentos` |
| Contas a Receber | `/dashboard/financeiro/contas-receber` | `/api/financeiro/contas-receber` |
| Categorias | `/dashboard/financeiro/categorias` | `/api/financeiro/categorias` |
| Fornecedores | `/dashboard/financeiro/fornecedores` | `/api/financeiro/fornecedores` |
| Condições Comerciais BaaS | `/dashboard/financeiro/condicoes-baas` | `/api/financeiro/condicoes-baas` |

A Visão Geral usa `exact: true` no registro de módulos porque mora na raiz do
ambiente: sem isso, casaria por prefixo com todos os menus abaixo dela.

### 8.1 Visão Geral

MRR (aberto nas quatro parcelas), ARR, BaaS ativos, White Labels ativos,
Resultado, Receita, Despesa, Inadimplência, Gasto por categoria e Receita por
White Label.

* **Inadimplência** — `ContaReceber` com status `INADIMPLENTE` no período.
* **Receita por White Label** — sustentação + API mensal contratadas. **Não** é
  TPV nem receita tarifária por parceiro: essas não existem por parceiro.

### 8.2 Lançamentos

Receita e despesa usam **exatamente os mesmos campos**: descrição, categoria,
valor, data, status, observação e período. A criação começa escolhendo
RECEITA ou DESPESA.

Três KPIs no topo: **Resultado | Receita | Despesa**, com Resultado =
Receita − Despesa. Filtros por descrição, categoria, data e valor.

**Período** aceita Única, Recorrente e Parcelada — e as três são
**MATERIALIZADAS**: um cadastro em 6x grava 6 linhas reais, uma por mês,
amarradas por `grupoId`.

> A alternativa — guardar "é recorrente" e expandir na leitura — obrigaria toda
> tela a repetir a regra de expansão, e é aí que os números começam a divergir
> entre si dependendo do filtro aplicado. Com linhas reais, Receita, Despesa e
> Resultado de qualquer período são uma soma direta sobre `data`.

Regra em `expandirLancamento()` (`lib/financeiro.ts`), testada — inclusive o
caso do dia 31 caindo em fevereiro.

`CANCELADO` fica fora dos totais. `PENDENTE` entra: a tela é de competência
(data do lançamento), não de caixa.

**Anexos:** nota fiscal, comprovante, print. Vão para o mesmo bucket privado,
pertencem ao lançamento e saem com ele. Metadata e auditoria registradas.

### 8.3 Categorias

Nome e tipo (receita ou despesa). O par (nome, tipo) é único — "Impostos" pode
existir dos dois lados, não duas vezes do mesmo.

O **tipo é imutável** depois de criado: mudá-lo reclassificaria de receita para
despesa todo lançamento já feito. Categoria com lançamento não pode ser
excluída, só inativada.

### 8.4 Fornecedores

Razão social, CNPJ, chave PIX, descrição do serviço e categoria. Lista com
criar, editar, inativar e excluir.

---

## 9. Cockpit remodelado

**Nível 1 — resultado do mês:** Receita, TPV geral, Transações (mês vigente),
Saldo médio em conta.

**Nível 2 — qualificadores:** MED, Take Rate, Faturamento.

**Nível 3 — estrutura da carteira:** Clientes ativos, BaaS ativos,
White Labels ativos.

Mais: Composição da receita, Meta × Realizado, gráficos.

### Removido do Cockpit

* **Indicador de Float** — ficou só "Saldo médio em conta".
* **KPI de Volumetria Mínima** — o ambiente Volumetria continua existindo.
* **Painel "Requer atenção"** (o KPI de Alertas).
* **Margem Operacional** — não existia como KPI; nada a remover.
* **Vertical "Serviços"** da composição de receita. Vinha de
  `ContaReceber.tipo = 'OUTROS'`, que é um balde por definição. **Nada entrou no
  lugar** — a composição passou de cinco para quatro linhas (Tarifário, Float,
  Sustentação, Setup). Os títulos com tipo OUTROS continuam em Contas a Receber.

`Sustentação` passou a vir de `CondicaoComercial` — mesma fonte do MRR — e não
mais de campos do cadastro de Cliente, que deixaram de existir.

---

## 10. Comercial

### 10.1 Funil ≠ Pipeline

**O bug:** Funis morava em `/dashboard/pipeline/funis`, subcaminho de
`/dashboard/pipeline`. O casamento por prefixo fazia a rota de Funis responder
também como Pipeline: na sidebar os dois itens acendiam juntos, abrir Funis
marcava Pipeline como ambiente corrente, e o proxy não conseguia aplicar a
restrição de ADMIN só ao segundo.

**A correção:** Funis mudou para `/dashboard/funis` — rota **irmã**, não filha.
Nenhuma das duas é prefixo da outra, e os três sintomas somem de uma vez.

### 10.2 Pipeline não cria Lead

O card nasce de um Lead que já existe:

```
Novo card → selecionar Lead existente → (etapa em que clicou) → salvar
```

O título do card vem do próprio Lead — não há um segundo lugar para escrever o
nome da oportunidade e depois ele divergir do cadastro. A regra é verificada
também no backend (`POST /api/deals` exige `leadId` válido).

O pipeline multi-funil não foi alterado.

### 10.3 Leads

**Removido:** Valor potencial (`Lead.value`) e o somatório "Potencial" do
cabeçalho.

**Campos:** Empresa, Nome do executivo, CNPJ, Celular, E-mail, Cargo,
**Segmento**, Canal, Responsável, Observações, e os comentários já existentes.

Nenhum TPV ou expectativa financeira foi criado no Lead.

### 10.4 CRM

Sem alteração — já estava como a especificação pede: **não existe entidade de
CRM**. Tudo é derivado de `PipelineMovimentacao` e `Deal`.

---

## 11. Compliance e Follow-ups

### Compliance

O campo **Título** saiu de `PendenciaCompliance`. A pendência é identificada por
**cliente + motivo**, que é o que a lista, o detalhe, as notificações e a
auditoria passaram a usar. Nenhum campo entrou no lugar.

Preservados: cliente, criticidade, prazo, motivo, observação, responsável,
status e histórico (`PendenciaEvento`). Os cinco motivos continuam os mesmos.

Os títulos existentes foram para `ArquivoRemocaoV16` antes do `DROP COLUMN`.

### Follow-ups — picos transacionais

"Frequência de follow up" deixou de ser a nomenclatura:

| Antes | Agora |
|---|---|
| `FollowUp.frequenciaDias` | `FollowUp.picoIntervaloDias` |
| `FollowUpTipo.PICO_OPERACIONAL` | `FollowUpTipo.PICO_TRANSACIONAL` |
| Aba "Frequência de Follow-up" | Aba "Picos transacionais" |
| "Regras de Frequência" | "Picos transacionais" |

**É renomeação, não recriação.** A coluna foi renomeada (`RENAME COLUMN`) e o
valor do enum também (`ALTER TYPE ... RENAME VALUE`): o dado de cadência
existente é preservado e **não existe um segundo sistema de recorrência**.

---

## 12. Volumetria Mínima

CRUD completo: criar, editar, **excluir** e visualizar. A exclusão pede
confirmação nomeando o que some — inclusive o efeito nos meses já apurados, que
é o que diferencia excluir de inativar.

`VolumetriaMinima` não tem filhos, então excluir não arrasta histórico de outro
modelo. Contratos gerais legados (`clienteId` nulo) continuam somente leitura.

A volumetria **não** virou TPV: segue sendo o mínimo contratual de transações
associado ao cliente e à vigência.

---

## 13. Usuários e equipes

Os usuários "Equipe Comercial" e "Equipe Operacional" saem do sistema. São
**desativados, não deletados**: os dois possuem registros próprios (leads,
deals, clientes, auditoria) e um DELETE violaria as chaves estrangeiras ou
exigiria apagar histórico de Pipeline e de Compliance.

Desativado significa: não autentica, não aparece em seleção de responsável, e o
rastro do que a pessoa fez continua legível.

Os **papéis** COMERCIAL e OPERACIONAL permanecem — outros usuários os usam. O
seed deixou de recriar as duas contas.

---

## 14. Formatação monetária

**Regra global:** valor monetário é exibido por extenso, sempre.

```
R$ 4.250.000,00        ← sim
R$ 4,25 MM / 4,25 mi   ← não
```

A abreviação por escala (mil/mi/bi/tri) foi removida de `lib/format-financeiro.ts`,
que é o **único** formatador financeiro do sistema. Vale em Cockpit, Financeiro,
Conselho, Carteira, gráficos, tooltips, tabelas e cards.

**Única concessão:** rótulo de eixo de gráfico (`eixoMoeda`) corta os centavos e
mantém os milhares — redução de precisão visível, não troca de escala
silenciosa. Tooltips e cards do mesmo gráfico seguem com o valor cheio. As
larguras dos eixos foram ajustadas de 64/68px para 104px.

Coberto por `tests/formato-financeiro.test.ts`.

---

## 15. Banco de dados

Migration única: **`supabase-migration-v16.sql`**. Idempotente, sem RESET,
TRUNCATE ou DROP indiscriminado.

### Tabela de arquivo morto

`ArquivoRemocaoV16` recebe, **antes** de qualquer remoção, tudo que sai:

| Entidade | Campo |
|---|---|
| `Cliente` | as 10 colunas removidas, por cliente |
| `PendenciaCompliance` | `titulo` |
| `Lead` | `value` |
| `FormularioResposta` | a resposta inteira, como JSON |
| `FormularioVersao` | `definicao` |
| `Automacao` | a regra inteira, como JSON |
| `Parametro` | chave e valor |

Não é modelo de domínio — é o recibo da migration, e por isso fica fora do
`schema.prisma`.

### Resumo

**Tabelas adicionadas (6):** `CategoriaFinanceira`, `Fornecedor`,
`LancamentoFinanceiro`, `LancamentoAnexo`, `CondicaoComercial`,
`CondicaoComercialHistorico` — mais `ArquivoRemocaoV16`.

**Tabelas removidas (8):** `Formulario`, `FormularioVersao`, `FormularioLink`,
`FormularioResposta`, `FormularioAnexo`, `Automacao`, `AutomacaoExecucao`,
`Parametro`.

**Colunas adicionadas:** `LancamentoDiario.clientesAtivos`.

**Colunas renomeadas:** `FollowUp.frequenciaDias` → `picoIntervaloDias`.

**Colunas removidas:** 10 de `Cliente`, `PendenciaCompliance.titulo`,
`Lead.value`.

**Preservados integralmente:** histórico financeiro, histórico de taxas,
histórico de Pipeline (`PipelineMovimentacao`), histórico de Compliance
(`PendenciaEvento`), `Auditoria`, `LancamentoDiario`, `FloatConfig`,
`VolumetriaMinima`, `Certificado*`, `Notificacao`.

---

## 16. Números do sistema depois da rodada

| Dimensão | Antes | Depois |
|---|---|---|
| Modelos Prisma | 35 | **33** |
| Enums Prisma | 30 | **29** |
| Rotas de API | 67 | **62** |
| Páginas | 34 | **31** |
| Componentes React | 29 | **28** |
| Módulos em `lib/` | 26 | **24** |
| Chaves de permissão | 42 | **33** |
| Migrations SQL | 14 (v1…v15) | **15** (v1…v16) |
| Testes automatizados | 104 | **118** |
| Linhas em `app/`+`lib/`+`components/` | ~21.300 | **~19.200** |
