# Rodada v16 — Remodelagem de Operações e Financeiro

Documento autoritativo sobre o estado do produto **depois** desta rodada. Onde
este documento e `DOCUMENTACAO-COMPLETA.md` discordarem, vale este.

---

## 1. O que saiu do produto

Seis ambientes saíram do produto por inteiro — menu, páginas, rotas, APIs,
componentes, permissões e rota pública.

| Ambiente | Páginas | APIs |
|---|---|---|
| Relatórios | `/dashboard/relatorios` | `/api/relatorios` |
| Documentos | `/dashboard/documentos` | `/api/documentos` |
| Alertas | `/dashboard/alertas` | — (era derivado) |
| Parâmetros | `/dashboard/parametros` | `/api/parametros`, `/api/float-config` |
| Formulários | `/dashboard/formularios`, `/f/[token]` | `/api/formularios` |
| Automações | `/dashboard/automacoes` | `/api/automacoes` |

Saíram também do `schema.prisma` — e portanto do alcance da aplicação — os
modelos `Parametro`, `Formulario`, `FormularioVersao`, `FormularioLink`,
`FormularioResposta`, `FormularioAnexo`, `Automacao`, `AutomacaoExecucao`, e os
tipos `AutomacaoGatilho`, `AutomacaoAcao`, `AutomacaoExecucaoStatus`,
`FormularioRespostaStatus`, `ScoreRisco`.

> **As tabelas e tipos continuam existindo no banco**, como legado sem leitor.
> Nada foi apagado. A razão está em §15: a migration é aplicada antes do deploy,
> e derrubar objeto que o código antigo usa quebraria a janela de implantação.
> O que saiu é a **exposição**, não o dado.

O `proxy.ts` também deixou de listar `/f/` e `/api/formularios/publico/` como
rotas públicas: manter os prefixos ali deixaria dois caminhos liberados sem
autenticação apontando para código que não existe mais.

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

**Fora do cadastro:** `operacao` (e a caixa de marcação "Operações"),
`scoreRisco`, `sustentacaoWhiteLabel`, `setup`, `tpvEsperado`,
`qtdTransacoesEsperada`, `qtdMedEsperada`, `receitaPrevistaMensal`,
`descontoPercent`, `overpricePercent`, `volumeMinimo`.

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

As colunas saíram do `schema.prisma` e do código, mas **permanecem no banco**
como legado (todas nuláveis, nenhuma atrapalha um INSERT). Nada de dado de
cliente foi apagado. Ver §15.

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

A coluna `titulo` deixou de ser `NOT NULL` e continua no banco com o conteúdo
já escrito — texto redigido por pessoas não é apagado para ganhar uma coluna a
menos. Ela simplesmente não é mais lida nem escrita.

### Follow-ups — picos transacionais

"Frequência de follow up" deixou de ser a nomenclatura:

| Antes | Agora |
|---|---|
| `FollowUp.frequenciaDias` | `FollowUp.picoIntervaloDias` |
| `FollowUpTipo.PICO_OPERACIONAL` | `FollowUpTipo.PICO_TRANSACIONAL` |
| Aba "Frequência de Follow-up" | Aba "Picos transacionais" |
| "Regras de Frequência" | "Picos transacionais" |

**É o mesmo mecanismo com o nome certo, não um sistema paralelo.** No banco a
coluna é **nova com o dado copiado** e o valor de enum é **adicionado** — não
renomeados, para não quebrar o código antigo na janela entre a migration e o
deploy (§15). A coluna e o valor antigos ficam como legado, e o `schema.prisma`
declara os dois valores para conseguir ler linhas antigas; a interface rotula os
dois como "Pico transacional" e oferece só o novo na criação.

---

## 12. Volumetria Mínima

CRUD completo: criar, editar, **excluir** e visualizar.

**Alçada separada em duas:**

| Operação | Quem pode | Por quê |
|---|---|---|
| Visualizar | conforme permissão `view_volumetria` | leitura |
| Criar | todo perfil menos COMERCIAL | cadastrar o mínimo de um cliente novo é trabalho de turno |
| **Editar** | **somente ADMIN** | muda o mínimo consolidado de meses que já podem ter sido reportados |
| **Excluir** | **somente ADMIN** | muda o consolidado inclusive de meses fechados |

As duas regras moram em `podeCriarVolumetria` e `podeAdministrarVolumetria`
(`lib/volumetria.ts`). A UI esconde as ações e a API nega — as duas pontas leem
a mesma função, e é por isso que ela não vive dentro da rota.

A exclusão pede confirmação nomeando o que some, inclusive o efeito nos meses já
apurados — é o que diferencia excluir de inativar. `VolumetriaMinima` não tem
filhos, então excluir não arrasta histórico de outro modelo. Contratos gerais
legados (`clienteId` nulo) continuam somente leitura. Conflitos de vigência
continuam validados na criação e na reativação.

A volumetria **não** virou TPV: segue sendo o mínimo contratual de transações
associado ao cliente e à vigência.

---

## 12-A. Incidentes — downtime derivado

**O campo de downtime informado à mão saiu.** Downtime é derivado:

```
downtime = fim − início
```

Existiam duas verdades sobre o mesmo fato, lado a lado, e nada impedia que
discordassem: um incidente podia declarar 30 minutos de downtime com uma janela
de 4 horas entre início e fim. Agora há uma fonte só.

* **Em aberto** — duração em andamento, contando até agora. Não se exige
  downtime para registrar um incidente que acabou de abrir.
* **Encerrado** — cálculo automático, e o mesmo número em todas as telas.
* **Não há como sobrescrever.** A API não aceita o campo, em nenhum verbo.

A regra é `calcularDowntime()` em `lib/incidentes.ts`, função pura. As Métricas
Operacionais passaram a usá-la também — e a contar só os incidentes
**encerrados** no downtime acumulado e no MTTR, porque a duração de um incidente
aberto ainda está crescendo e somá-la faria o acumulado mudar a cada refresh.

| Operação | Quem pode |
|---|---|
| Registrar e fechar | todo perfil menos COMERCIAL (é trabalho de turno) |
| **Editar** | **somente ADMIN** |
| **Excluir** | **somente ADMIN** |

`Incidente` não tem filhos no schema, então a exclusão física não arrasta
histórico de nenhum outro modelo — e a trilha permanece em `Auditoria`, que
registra o registro, o fechamento, a edição e a exclusão. A rota ainda checa
dependências e devolve 409 explicativo em vez de estourar violação de FK, para o
caso de algum modelo passar a referenciar Incidente no futuro.

A coluna `Incidente.downtimeMins` continua no banco como legado, sem leitor.

---

## 12-B. Exclusão de etapa de funil

Além de Editar e Ativar/Inativar, a administração de funis ganhou **Excluir**,
com a mesma alçada das outras operações: quem administra **aquele** funil.

Antes do DELETE, a rota conta as dependências e decide:

| Situação | Resultado |
|---|---|
| Etapa criada e nunca usada | **exclui fisicamente** |
| Etapa com cards | **bloqueia** — inative informando etapa de destino |
| Etapa citada em `PipelineMovimentacao` | **bloqueia** — o histórico não é apagado |
| Única etapa ativa do funil | **bloqueia** — o quadro ficaria sem coluna |

O princípio, explícito: **`PipelineMovimentacao` nunca é apagada para viabilizar
uma exclusão de cadastro.** Os dois tipos de vínculo pedem respostas diferentes
— cards são o presente (realocáveis), movimentações são o passado (intocáveis).

A decisão mora em `impedimentoExclusaoEtapa()` (`lib/pipeline.ts`) e devolve a
mensagem que a interface mostra, com a contagem de cada dependência.

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

Migration única: **`supabase-migration-v16.sql`**. Idempotente.

### Estratégia: compatível, não destrutiva

A migration é **aditiva**. As únicas operações que não criam nada são dois
`DROP NOT NULL`, que afrouxam restrição e portanto não quebram nada.

**Não há `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, `DELETE` de dado histórico,
`TRUNCATE` ou `RESET`.**

A razão é a ordem de implantação: a migration é aplicada **antes** do deploy, e
enquanto o código novo não está em Production o código **antigo** continua
rodando. Remover uma coluna que o código antigo lê derrubaria o produto durante
a janela.

As tabelas e colunas dos ambientes removidos ficam no banco como **legado**: não
são lidas nem escritas, e nenhuma atrapalha o funcionamento — todas as colunas
abandonadas são nuláveis, verificado uma por uma antes de escrever a migration.
O que sai é a **exposição**: menu, rota, API, permissão e referência no código.

### O que foi adicionado

**Tabelas (6):** `CategoriaFinanceira`, `Fornecedor`, `LancamentoFinanceiro`,
`LancamentoAnexo`, `CondicaoComercial`, `CondicaoComercialHistorico`.

**Tipos (4):** `TipoLancamento`, `PeriodicidadeLancamento`, `StatusLancamento`,
`TipoParceiro`.

**Colunas:** `LancamentoDiario.clientesAtivos`, `FollowUp.picoIntervaloDias`
(com o dado **copiado** de `frequenciaDias`).

**Valores de enum:** `FollowUpTipo.PICO_TRANSACIONAL`,
`DocumentoOrigem.LANCAMENTO_FINANCEIRO`.

> `picoIntervaloDias` é coluna **nova com cópia**, não `RENAME`: um rename
> quebraria o código antigo, que lê `frequenciaDias`, durante a janela entre a
> migration e o deploy. O valor de enum é **adicionado**, não renomeado, pela
> mesma razão — e o `schema.prisma` declara os dois, para conseguir ler linhas
> antigas.

### As duas restrições afrouxadas

| Coluna | Antes | Depois | Por quê |
|---|---|---|---|
| `Documento.clienteId` | `NOT NULL` | nulável | anexo de lançamento financeiro não pertence a cliente |
| `PendenciaCompliance.titulo` | `NOT NULL` | nulável | o código novo não escreve mais o campo; sem isso, todo INSERT falharia |

### Legado que permanece, sem leitor

**Tabelas (8):** `Formulario`, `FormularioVersao`, `FormularioLink`,
`FormularioResposta`, `FormularioAnexo`, `Automacao`, `AutomacaoExecucao`,
`Parametro`.

**Colunas:** as 11 de `Cliente` (`operacao`, `scoreRisco`,
`sustentacaoWhiteLabel`, `setup`, `tpvEsperado`, `qtdTransacoesEsperada`,
`qtdMedEsperada`, `receitaPrevistaMensal`, `descontoPercent`,
`overpricePercent`, `volumeMinimo`), `Lead.value`, `Incidente.downtimeMins`,
`FollowUp.frequenciaDias`, `PendenciaCompliance.titulo`.

**Tipos:** `ScoreRisco`, `AutomacaoGatilho`, `AutomacaoAcao`,
`AutomacaoExecucaoStatus`, `FormularioRespostaStatus`.

Podem ser retirados numa migration de limpeza futura, depois de o código novo
estar estável. Não se apaga dado histórico para "limpar" o banco.

### Usuários

`Equipe Comercial` e `Equipe Operacional` foram **verificados no banco** antes
de qualquer ação: são **usuários reais** (não grupos, labels ou estrutura
organizacional — não existe tabela de grupo no schema) e tinham **zero
registros em 19 caminhos de chave estrangeira**. Com zero dependência, o DELETE
físico é seguro e foi aplicado.

O bloco da migration conta as dependências em tempo de execução e só deleta se
der zero; em qualquer outro cenário apenas desativa e avisa. Os **papéis**
COMERCIAL e OPERACIONAL permanecem no enum `Role`.

### Preservados integralmente

Histórico financeiro, histórico de taxas, histórico de Pipeline
(`PipelineMovimentacao`), histórico de Compliance (`PendenciaEvento`),
`Auditoria`, `LancamentoDiario`, `FloatConfig`, `VolumetriaMinima`,
`Certificado*`, `Notificacao`.

---

## 16. Números do sistema depois da rodada

| Dimensão | Antes | Depois |
|---|---|---|
| Modelos Prisma | 35 | **33** |
| Enums Prisma | 30 | **29** |
| Rotas de API | 67 | **62** |
| Páginas | 34 | **31** |
| Componentes React | 29 | **26** |
| Módulos em `lib/` | 26 | **24** |
| Tabelas no banco de Production | 41 | **47** |
| Chaves de permissão | 42 | **33** |
| Migrations SQL | 14 (v1…v15) | **15** (v1…v16) |
| Testes automatizados | 104 | **142** |
| Linhas em `app/`+`lib/`+`components/` | ~21.300 | **~19.200** |
