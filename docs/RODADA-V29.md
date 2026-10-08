# Rodada v29 — O histórico que não existia, a sidebar consolidada e a receita prevista automática

> Documento da rodada. Complementa [`RODADA-V23.md`](./RODADA-V23.md) (Conselho,
> alçadas, sidebar) e a rodada da Previsão/SLA (migration v28).

---

## Sumário

| Área | O que mudou |
|---|---|
| **Histórico diário** | **Normalizado.** 8 consolidados mensais distribuídos dia a dia, soma idêntica ao original. |
| **Piso dos gráficos** | 01/10/2026 → **01/06/2026**. Os gráficos não começam mais artificialmente em outubro. |
| **Sidebar** | 7 seções e 24 itens → **6 seções e 19 itens**. Nenhuma tela perdida. |
| **Cockpit** | Renomeado **Home**. Mesma rota, mesma função. |
| **CP / CR** | Contas a Pagar + Contas a Receber + Lançamentos num módulo com 3 abas. |
| **Condições BaaS** | Absorveu Lançamentos BaaS. A aba se chama **"Lançamentos"**, sem "BaaS". |
| **Clientes** | Absorveu Volumetria e Certificados. Saiu da seção CARTEIRA para COMERCIAL. |
| **Previsão** | **Receita prevista automática**, com a origem de cada parcela e navegação profunda. |
| **Metas** | Três tipos novos: Lançamentos WL/BaaS, Serviços, Setup. |
| **Comparações** | Serviço **central** com 4 granularidades. As duas janelas sempre do mesmo tamanho. |
| **Gráficos** | "Atividade Operacional" **saiu** (duplicava o diário). Os 3 mensais corrigidos. |

Migrations aplicadas em Production: **v29a** (enum) e **v29b** (normalização).
Testes: **918 passando** · typecheck 0 · lint 0 · build 0.

---

## 1. A normalização do histórico

### O defeito

De fevereiro a setembro de 2026, `LancamentoDiario` tinha **um registro por
mês**, gravado no **último dia**, carregando o valor do **mês inteiro**:

```
30/09/2026   TPV R$ 1.484.984.678,90   ← o TPV de setembro todo
```

Isso quebrava tudo o que lê a tabela como série diária:

- a "Evolução Atividade Operacional Diária" desenharia 29 dias vazios e um
  pico de R$ 1,4 bilhão — e era por isso que existia um **piso artificial de
  01/10/2026** cortando o histórico inteiro;
- a comparação "01–07/10 vs 01–07/09" **não tinha com o que comparar**:
  01–07/09 não existia como dado;
- a média e a tendência do forecast liam **1 "dia" por mês**.

### A regra

```
VALOR DIÁRIO = VALOR MENSAL ÷ QUANTIDADE DE DIAS DO MÊS
```

com o **último dia absorvendo o arredondamento**, para que

```
SOMA DISTRIBUÍDA = VALOR ORIGINAL
```

exatamente. "Exatamente" é na **precisão do dado — centavos**, e isso é uma
decisão consciente: as colunas monetárias são `double precision`, e a soma de
30 doubles de ~R$ 49 milhões acumula erro na ordem de 1e-7. Igualdade bit a bit
de float não é critério de correção para dinheiro; igualdade em centavos é.

### Fluxo × estoque

| | Colunas | Tratamento |
|---|---|---|
| **Fluxo** (acumula no mês) | `receitaTarifaria`, `tpv`, `qtdTransacoes`, `qtdMed` | **Dividido** |
| **Estoque** (fotografia de um instante) | `saldoEmConta`, `clientesAtivos` | **Fica no registro original** |

Dividir um saldo por 30 produziria "o saldo do dia" como 1/30 do saldo, que não
é o saldo de nenhum dia. Replicá-lo nos 30 dias seria inventar 29 observações
que ninguém fez. Então o estoque fica onde estava — no registro original, que é
o último dia do mês — e os dias criados recebem `0` em `saldoEmConta` e `NULL`
em `clientesAtivos` ("não informado naquele dia", que é a semântica que a
coluna já documenta).

**Consequência declarada:** `clientesAtivos` do mês continua correto, porque
`clientesAtivosDoMes` lê o último dia que informou — setembro continua **1.663**.
Já `saldoMedio` passa a dividir por 30 em vez de por 1, e o efeito nos dados
reais é **nenhum**: `saldoEmConta` é 0 em todos os oito consolidados.

### O original não foi apagado

A data do consolidado **já era** o último dia do mês, então ele não precisou ser
apagado nem recriado: **virou** o último dia, com o valor da última cota mais o
resto. Os dias 1..n−1 são linhas novas, e todas carregam a nota
`"Distribuido do consolidado mensal de DD/MM/AAAA (migration v29)"`.

Os valores originais ficam na tabela **`NormalizacaoHistorica`** — é o que torna
a conferência possível depois do fato, e é o que torna a migration idempotente.

### Identificação dos consolidados

Critério, na ordem em que é aplicado:

1. o mês está entre **2026-02 e 2026-09** (janela nomeada);
2. o mês tem **exatamente um** lançamento;
3. esse lançamento está no **último dia** do mês;
4. não existe registro em `NormalizacaoHistorica` para ele.

A janela é nomeada de propósito. Um critério genérico ("mês com um lançamento
só, no último dia") pegaria, em 2027, um mês legítimo em que só o dia 31 foi
lançado — e normalizá-lo distribuiria um dia real por 31 dias. Uma migration de
dado conserta o dado que ela conhece.

### Tabela de conferência — ANTES

| Mês | Lançamento original | Data | TPV | Receita | Transações | MED | Saldo | Clientes |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-02 | `cmuphzsqe000g04iif66ss6dh` | 28/02 | 0,00 | 0,00 | 1.660 | 0 | 0,00 | — |
| 2026-03 | `cmupi04v6000i04ii70kp6j8p` | 31/03 | 0,00 | 0,00 | 174.082 | 0 | 0,00 | — |
| 2026-04 | `cmupiqtxk000004l55kxe9vph` | 30/04 | 0,00 | 0,00 | 454.302 | 0 | 0,00 | — |
| 2026-05 | `cmupir8ra000204l5rpuzil2t` | 31/05 | 0,00 | 0,00 | 1.707.973 | 0 | 0,00 | — |
| 2026-06 | `cmuocbiid000j04jpuquyitfv` | 30/06 | 929.129.089,49 | 0,00 | 2.439.787 | 0 | 0,00 | — |
| 2026-07 | `cmun34si6000604lbrf4xs9nw` | 31/07 | 1.027.044.322,00 | 516.871,35 | 2.800.000 | 31.664 | 0,00 | — |
| 2026-08 | `cmun334or000404lbo7zujabt` | 31/08 | 1.117.956.348,00 | 376.029,78 | 3.000.000 | 38.254 | 0,00 | — |
| 2026-09 | `cmuph30i8000104iikqu8ks8p` | 30/09 | 1.484.984.678,90 | 481.555,57 | 4.188.636 | 56.490 | 0,00 | 1.663 |

Outubro tinha 6 lançamentos diários reais (01 a 06) e **não entrou** na
normalização.

### Tabela de conferência — DEPOIS

| Mês | Dias | Linhas criadas | Linhas no mês | TPV original = distribuído | Receita original = distribuída | Transações | MED |
|---|---:|---:|---:|---|---|---|---|
| 2026-02 | 28 | 27 | 28 | 0,00 = 0,00 ✓ | 0,00 = 0,00 ✓ | 1.660 = 1.660 ✓ | 0 = 0 ✓ |
| 2026-03 | 31 | 30 | 31 | 0,00 = 0,00 ✓ | 0,00 = 0,00 ✓ | 174.082 = 174.082 ✓ | 0 = 0 ✓ |
| 2026-04 | 30 | 29 | 30 | 0,00 = 0,00 ✓ | 0,00 = 0,00 ✓ | 454.302 = 454.302 ✓ | 0 = 0 ✓ |
| 2026-05 | 31 | 30 | 31 | 0,00 = 0,00 ✓ | 0,00 = 0,00 ✓ | 1.707.973 = 1.707.973 ✓ | 0 = 0 ✓ |
| 2026-06 | 30 | 29 | 30 | 929.129.089,49 = 929.129.089,49 ✓ | 0,00 = 0,00 ✓ | 2.439.787 = 2.439.787 ✓ | 0 = 0 ✓ |
| 2026-07 | 31 | 30 | 31 | 1.027.044.322,00 = 1.027.044.322,00 ✓ | 516.871,35 = 516.871,35 ✓ | 2.800.000 = 2.800.000 ✓ | 31.664 = 31.664 ✓ |
| 2026-08 | 31 | 30 | 31 | 1.117.956.348,00 = 1.117.956.348,00 ✓ | 376.029,78 = 376.029,78 ✓ | 3.000.000 = 3.000.000 ✓ | 38.254 = 38.254 ✓ |
| 2026-09 | 30 | 29 | 30 | 1.484.984.678,90 = 1.484.984.678,90 ✓ | 481.555,57 = 481.555,57 ✓ | 4.188.636 = 4.188.636 ✓ | 56.490 = 56.490 ✓ |

**Zero divergências** — 8 meses × 4 métricas + contagem de linhas.

Totais em Production: `LancamentoDiario` passou de **14** para **248** linhas
(242 do histórico + 6 de outubro). Outubro permaneceu idêntico:
R$ 138.377,52 de receita, R$ 515.473.932,82 de TPV, 1.355.281 transações.

Setembro, dia a dia (o caso de maior arredondamento):

```
01/09 .. 29/09   TPV 49.499.489,29   receita 16.051,85   tx 139.621   MED 1.883
30/09            TPV 49.499.489,49   receita 16.051,92   tx 139.627   MED 1.883
                     └── o resto (20 centavos, 7 centavos, 6 transações)
```

### A migration aborta em divergência

A seção de conferência da v29b compara, para cada mês, a soma dos dias com o
valor original gravado em `NormalizacaoHistorica`. Qualquer diferença dispara
`RAISE EXCEPTION`, que **desfaz a transação inteira** — a tabela e toda a
distribuição. É assim que "não prosseguir se houver divergência" se cumpre em
SQL: não há estado intermediário possível.

### Idempotência, verificada

A migration foi executada **duas vezes** num banco de teste com os dados exatos
de Production, antes de ir para Production:

```
1ª execução:  8 mês(es) normalizado(s) · conferência OK
2ª execução:  0 mês(es) normalizado(s) · conferência OK
              248 linhas nas duas vezes
```

### O piso desceu para junho, não para fevereiro

`DATA_MINIMA_ATIVIDADE` passou de `2026-10-01` para `2026-06-01`.

Fevereiro a maio **só têm quantidade de transações**: TPV, receita e MED são
zero, e zero ali é ausência de apuração, não resultado. Junho é o primeiro mês
com TPV real. Os lançamentos de fevereiro a maio **continuam no banco** — nada
foi apagado; o que o piso diz é que a série diária não começa neles.

Efeito medido na API de séries:

| Range | Antes (piso 01/10) | Depois (piso 01/06) |
|---|---|---|
| 7 dias | 01/10 → 07/10, 6 pontos | 01/10 → 07/10, 6 pontos |
| 30 dias | 01/10 → 07/10, **limitada** | 08/09 → 07/10, **29 pontos** |
| 90 dias | 01/10 → 07/10, **limitada** | 10/07 → 07/10, **89 pontos** |

---

## 2. A sidebar consolidada

### Antes → depois

```
EXECUTIVO    Cockpit, Conselho              →  EXECUTIVO    Home, Conselho
RECEITA      Metas, Lançamento Diário       →  RECEITA      Metas, Lançamento Diário
CARTEIRA     Clientes, Volumetria,          →  (seção removida)
             Certificados
COMERCIAL    Visão geral, Leads, Pipeline,  →  COMERCIAL    Visão geral, Leads, Pipeline,
             Follow Up                                       Clientes, Follow Up
OPERAÇÕES    Tarefas, Incidentes,           →  OPERAÇÕES    (igual)
             Compliance
FINANCEIRO   Visão Geral, Lançamentos,      →  FINANCEIRO   Visão geral, Previsão,
             Contas a Pagar, Contas a                        CP / CR, Condições BaaS,
             Receber, Previsão, Cadastros                     Cadastros Financeiros
             Financeiros, Condições BaaS,
             Lançamentos BaaS
ADMIN        Usuários, Auditoria            →  ADMIN        (igual)
```

### As três consolidações

| Módulo | Rota | Abas |
|---|---|---|
| **CP / CR** | `/dashboard/financeiro/cp-cr` | Contas a Pagar (raiz) · Contas a Receber · Lançamentos |
| **Condições BaaS** | `/dashboard/financeiro/condicoes-baas` | Condições (raiz) · **Lançamentos** |
| **Clientes** | `/dashboard/carteira` | Clientes (raiz) · Volumetria · Certificados |

**Nenhuma tela foi perdida.** Cada aba continua sendo uma rota própria, com o
seu componente de servidor, a sua consulta e a sua alçada — fundir menus não é
fundir telas.

### "Lançamentos" ficou dentro de CP / CR

O sidebar pedido tem **cinco** itens no Financeiro, e "Lançamentos" não é um
deles. Ele também não podia simplesmente sair: é a base que as duas vistas de
título leem, e é de lá que se anexa comprovante e se classifica a despesa.

CP / CR é o lugar natural — a mesma tabela `LancamentoFinanceiro`, a terceira
pergunta:

```
Contas a Pagar     as despesas pelo VENCIMENTO
Contas a Receber   as receitas pelo VENCIMENTO
Lançamentos        o registro pela COMPETÊNCIA
```

### As rotas antigas continuam funcionando

Oito rotas estiveram em produção. Há favoritos, links em conversas, históricos
de navegador e **notificações já gravadas no banco** apontando para elas.
Todas permanecem, como redirecionamento:

| Rota antiga | Destino |
|---|---|
| `/dashboard/financeiro/contas-pagar` | `/dashboard/financeiro/cp-cr` |
| `/dashboard/financeiro/contas-receber` | `/dashboard/financeiro/cp-cr/receber` |
| `/dashboard/financeiro/lancamentos` | `/dashboard/financeiro/cp-cr/lancamentos` |
| `/dashboard/lancamento-baas` | `/dashboard/financeiro/condicoes-baas/lancamentos` |
| `/dashboard/volumetria` | `/dashboard/carteira/volumetria` |
| `/dashboard/certificados` | `/dashboard/carteira/certificados` |
| `/dashboard/financeiro/categorias` | `/dashboard/financeiro/cadastros?aba=categorias` |
| `/dashboard/financeiro/fornecedores` | `/dashboard/financeiro/cadastros?aba=fornecedores` |

As páginas de redirecionamento **não leem nada** — nem banco, nem sessão — e por
isso não precisam de registro em `MODULES`.

### A segurança que a consolidação poderia ter aberto

Caminho de API **não registrado** é caminho **liberado** para qualquer usuário
autenticado (ver `checkAccess`). Ao fundir três menus em um, a tentação é apagar
as três entradas e criar uma nova com uma API só — e isso abriria os títulos a
pagar, os títulos a receber e os lançamentos financeiros para todo mundo, **sem
nenhum sinal na tela**.

As APIs absorvidas foram **transferidas**, não removidas:

| Função | APIs registradas |
|---|---|
| `financeiro.cpcr` | `/api/financeiro/contas-pagar`, `/api/financeiro/contas-receber`, `/api/financeiro/lancamentos` |
| `financeiro.condicoes` | `/api/financeiro/condicoes-baas`, `/api/lancamento-baas` |
| `comercial.clientes` | `/api/clientes`, `/api/volumetria`, `/api/certificados` |

### As alçadas não mudaram

Consolidar menus não é o momento de afrouxar nem de apertar uma permissão.
Cada aba continua com a chave que a tela já exigia:

| Aba | Alçada | Comportamento sem a chave |
|---|---|---|
| Contas a Pagar / Receber | `view_financeiro` | redirect para `/dashboard` |
| Lançamentos | nenhuma para ler | abre em leitura (`podeGerenciar` falso) |
| Lançamentos (BaaS) | `view_receita` | redirect, **e a aba não é desenhada** |
| Certificados | `view_certificates` | redirect, **e a aba não é desenhada** |
| Volumetria | por perfil | criar/administrar restritos |

Esconder o link não autoriza nada: a página continua conferindo a chave. O que a
navegação profunda acrescenta é que o link **não é desenhado** para quem não tem
a chave — em vez de ser desenhado e levar a um redirect.

### Cockpit → Home

Mudou o **nome** e nada mais: mesma rota (`/dashboard`), mesma API
(`/api/dashboard`), mesmo `exact`, mesma função, mesmos gráficos. A chave do
registro acompanhou o rótulo (`cockpit` → `home`) porque uma entrada
`key: 'cockpit'` rotulada "Home" seria exatamente a divergência que
`lib/modules.ts` existe para evitar.

### A aparência da navegação profunda é de um componente só

`components/ui/SubNav.tsx`. Quatro módulos têm áreas internas (Previsão,
CP / CR, Condições BaaS, Clientes), e quatro cópias do mesmo markup é como
quatro telas passam a ter quatro aparências e quatro regras diferentes de "qual
aba está ativa". `PrevisaoNav` foi migrado para ele.

---

## 3. A receita prevista automática

### A fórmula

```
RECEITA PREVISTA = MRR PROJETADO
                 + META DE RECEITA TARIFÁRIA
                 + META DE RECEITA DE LANÇAMENTOS WL/BAAS
                 + META DE RECEITA DE SERVIÇOS
                 + META DE RECEITA DE SETUP
                 + RECEITAS PREVISTAS LANÇADAS
```

Os cinco primeiros são o pedido, literalmente. O sexto é o cadastro manual que
já existia (`ReceitaPrevista`): ele entra **como componente** em vez de ser
somado à parte, para que a tela não tenha dois totais de "receita prevista".
Com nenhuma linha lançada — que é o estado de Production — o total é
**exatamente a fórmula de cinco termos**.

### MRR projetado

```
MRR PROJETADO = Sustentação BaaS
              + Sustentação White Label
              + Mensalidade de API (parceiros)
              + Mensalidade de API (carteira)
```

Sai de **`calcularMrr(periodo)`** — a mesma função que o Cockpit e a Visão geral
do Financeiro usam. Não há um segundo cálculo de MRR: um segundo cálculo é como
a Previsão e o Cockpit passam a discordar sobre o mesmo número.

E ele **respeita a vigência**: `sustentacaoVigente` só conta a sustentação de
quem já está em vigor no fim daquele mês. Um contrato que começa em dezembro não
entra na receita prevista de outubro — e é por isso que a projeção cresce mês a
mês sem ninguém digitar nada.

### A dupla contagem que isto não faz

**Sustentação e mensalidade de API não têm meta**, e não podem ter. Elas entram
pelo MRR projetado, que vem do cadastro de condições comerciais e da carteira —
é contrato assinado, não alvo. Metá-las contaria o mesmo contrato duas vezes, e
é a dupla contagem mais provável desta conta.

As quatro linhas de receita que **são** meta não se sobrepõem entre si:

| Linha | Fonte do realizado |
|---|---|
| Receita tarifária | `LancamentoDiario` — a tarifa sobre o TPV **próprio** |
| Lançamentos WL/BaaS | `LancamentoBaas` — a apuração dos **parceiros** |
| Serviços | **não há fonte** (ver abaixo) |
| Setup | categorias com `natureza = SETUP` |

### Receita de Serviços não tem realizado, e isso é deliberado

Não existe, no sistema, nada que diga qual receita é "de serviços".
`CategoriaFinanceira.natureza` reconhece três papéis — FLOAT, SETUP e
SUSTENTAÇÃO — e serviços não é nenhum deles. Somar receitas por **nome** de
categoria ("Serviços", "Serviço", "Prestação de serviços") é exatamente o
acoplamento que `natureza` existe para evitar.

Então o realizado é **ausente**, e a meta aparece como `SEM_REALIZADO`. Devolver
zero afirmaria que nada foi faturado — uma afirmação diferente de "o sistema não
sabe".

**O que falta é uma decisão de produto**: qual natureza (ou qual categoria) conta
como serviços. No dia em que ela existir, o número entra em
`realizadoReceitaPrevisao` e a meta passa a ser avaliada sem mais nenhuma
mudança.

### A auditabilidade

Cada parcela mostra o **valor**, a **frase de origem**, a **composição interna**
quando há, e um **link para a tela onde o número é mantido**:

| Parcela | Conferir em |
|---|---|
| MRR projetado | `/dashboard/financeiro/condicoes-baas` (e a carteira, na sublinha) |
| As quatro metas | `/dashboard/metas` |
| Receitas lançadas | `/dashboard/financeiro/previsao/receitas` |

É navegação profunda sem criar tela nova. Seis páginas de detalhe dariam a mesma
informação espalhada por seis carregamentos, e a **conta** — que é a razão do
bloco existir — não apareceria em nenhuma delas.

O bloco aparece na **Visão Geral da Previsão** (logo abaixo do tile que mostra o
total, porque é a resposta à pergunta que o tile levanta) e em **Receitas
Previstas**.

### Ausente não é zero

Uma parcela sem fonte cadastrada aparece como `—`, não como R$ 0,00. "Não há
meta de setup para novembro" e "a meta de setup de novembro é zero" são
afirmações diferentes, e só a segunda é uma decisão. Mostrar as duas como
R$ 0,00 esconderia o que falta cadastrar — que é justamente o que esta tela
deveria apontar.

### Meta em percentual é ignorada e declarada

O cadastro de metas aceita unidade percentual, e um percentual não tem o que
somar em reais. A meta é **ignorada** na composição e a tela **diz** que foi —
somá-la como se fosse valor acrescentaria "3" a um total em milhões.

### Com filtro de dimensão, a composição não se aplica

MRR e meta não têm centro de custo, categoria nem fornecedor: sustentação é da
carteira inteira e meta é da empresa. Com um filtro desses ativo, mostrar o MRR
total dentro de um recorte de um centro de custo seria **falso**.

Nesse caso o previsto volta a ser a soma das linhas lançadas que casam com o
filtro — o comportamento que a função sempre teve — e `composicao` vem `null`
para a tela saber que não há o que auditar ali.

### A integração com o caixa

As quatro portas de dupla contagem da rodada anterior **continuam fechadas**:

1. `ContaReceber` nunca é somada;
2. a receita prevista entra pelo **remanescente** (`previsto − realizado`, nunca
   negativo), não pelo previsto cheio;
3. a despesa já materializada em lançamento é excluída;
4. `saldoEmConta` nunca é tratado como caixa próprio.

Trocar a **fonte** do previsto não podia reabrir nenhuma delas, e os testes
prendem isso explicitamente.

### Medido em Production

```
periodo 2026-10   previsto 634.267,86   realizado 0,00   remanescente 634.267,86

  MRR_PROJETADO               134.267,86
      Sustentação BaaS             48.000,00
      Sustentação White Label      69.000,00
      API — parceiros                   0,00
      API — carteira               17.267,86
  META_TARIFARIA              500.000,00
  META_LANCAMENTOS_WL_BAAS            —      (sem meta cadastrada)
  META_SERVICOS                       —      (sem meta cadastrada)
  META_SETUP                          —      (sem meta cadastrada)
  RECEITAS_LANCADAS                   —      (nenhuma linha lançada)
```

E, num banco de teste com as quatro metas cadastradas, a soma fecha:
16.500 + 400.000 + 80.000 + 25.000 + 40.000 = **561.500**.

---

## 4. As três metas novas

| Tipo | Rótulo | Unidade | Direção |
|---|---|---|---|
| `RECEITA_LANCAMENTOS_WL_BAAS` | Receita de Lançamentos WL/BaaS | VALOR | MAIOR_MELHOR |
| `RECEITA_SERVICOS` | Receita de Serviços | VALOR | MAIOR_MELHOR |
| `RECEITA_SETUP` | Receita de Setup | VALOR | MAIOR_MELHOR |

Entram no **mesmo cadastro de Metas** que a Receita Tarifária já usava, com o
mesmo período, a mesma edição e a mesma auditoria. Uma segunda tabela de
"receita planejada" ao lado de Metas criaria dois lugares para decidir o mesmo
número.

Verificado de ponta a ponta num banco local: POST → gravação com o enum novo →
leitura → soma na Previsão.

---

## 5. O serviço central de comparação temporal

`lib/comparacao-temporal.ts`. Puro: calendário, sem Prisma, sem relógio (a data
de referência é sempre parâmetro).

### A regra, em uma frase

**As duas janelas cobrem sempre o mesmo número de dias de calendário.**

| Granularidade | O par |
|---|---|
| **DIÁRIA** | um dia contra o dia anterior |
| **SEMANAL** | os N dias decorridos da semana contra os N primeiros da anterior |
| **MENSAL** | 01–07/10 contra 01–07/09 |
| **TRIMESTRAL** | os N dias decorridos do trimestre contra os N primeiros do anterior |

Semana ISO: começa na **segunda**. Trimestre: **civil**.

### Quando o período anterior é menor, os dois encurtam

Em 31/03, "os 31 dias decorridos de março" não existem em fevereiro. A janela é
encurtada **nos dois lados** para 28 dias — não só no lado de fevereiro.
Encurtar um lado só devolveria o defeito que o serviço existe para corrigir,
agora invertido.

O preço é visível e é o certo: a comparação ignora 3 dias reais de março. O
indicador do mês continua mostrando o mês inteiro — é só a **base comparável**
que se encurta, e `rotuloDoPar` diz em voz alta qual janela foi usada.

Essa correção foi aplicada também ao `comparacaoMensal` do Cockpit, que já
reapurava o mês comparável mas podia comparar 31 dias contra 28.

### A invariante é testada por força bruta

366 datas × 4 granularidades: as duas janelas sempre do mesmo tamanho, nunca
vazias, nunca sobrepostas. Qualquer caminho futuro que esqueça de igualar um
lado falha — inclusive os que ninguém pensou em testar nominalmente.

### A variação dos gráficos diários

`deltaDiario` descartava os zeros **antes** de pegar os dois últimos valores: se
o dia 05 tivesse saldo zero, "a variação do dia 06" comparava **06 com 04** — e o
rodapé continuava dizendo "no dia".

Agora os dois pontos são os dois últimos da série, sem filtro, **e precisam ser
dias de calendário vizinhos** — a série pode ter buracos (dia sem lançamento
fica fora dela, de propósito). Se não forem, a seta não é desenhada.

Zero é um valor: um dia com zero MED é um dia **sem MED**, não um dia sem
lançamento.

---

## 6. Os gráficos

### "Atividade Operacional" saiu

Havia **dois** gráficos para a mesma pergunta, lendo a mesma `serieDiaria`:

- "Atividade Operacional" — transações, MEDs e clientes ativos;
- "Evolução Atividade Operacional Diária" — TPV, receita, transações e MED.

O segundo é estritamente mais informativo (tem as duas séries monetárias) e já
era o gráfico de largura inteira no topo da tela. Dois gráficos do mesmo dado no
mesmo painel não dão duas leituras: dão a **dúvida de qual dos dois é o certo**.

Nenhuma métrica se perdeu: clientes ativos tem o seu próprio gráfico.

`LS_KEY` subiu para `dashboard_chart_order_v7` — uma ordem salva com o id antigo
deixaria um buraco no grid, porque `charts['atividade']` não existe mais.

### Os três mensais: o piso é a disponibilidade, não a janela

"Evolução de BaaS Ativos", "Evolução de White Labels Ativos" e "Evolução do MRR"
desenhavam **zero** em todo mês anterior ao cadastro das condições comerciais.
Em Production as 20 condições foram criadas em **01–02/10/2026**, então os
gráficos mostravam uma **rampa de 0 para 9** entre setembro e outubro — como se
nove parceiros tivessem entrado num mês.

**Nenhum entrou.** A Bass Pago já tinha parceiros; o **cadastro** deles é que é
novo. Zero não era o número: era a ausência de registro desenhada como número —
exatamente o que a série diária já recusa (dia sem lançamento fica fora, não
vira zero).

A série passa a começar em `primeiroMesComParceiros()` — o mês do `createdAt`
mais antigo — e **nada é desenhado antes**: nem zero, nem estimativa, nem
repetição do primeiro valor conhecido.

`createdAt` e não `sustentacaoInicio`: `createdAt` é quando o **registro** passou
a existir, que é exatamente a pergunta ("desde quando o sistema tem como
responder"). `sustentacaoInicio` é a vigência do contrato, e `evolucaoParceiros`
já a respeita ao montar cada ponto.

E a tela **declara** o piso. Com um mês só de histórico, a mensagem distingue
dois casos cuja conduta é diferente:

| Caso | Mensagem | Conduta |
|---|---|---|
| Janela curta | "a janela escolhida cobre um mês só" | ampliar para 90 dias resolve |
| **Histórico curto** | "o cadastro de condições comerciais começa em out/2026 — não há mês anterior para comparar" | ampliar **não** acrescenta pontos |

Mandar "escolha 90 dias" quando o cadastro começou neste mês é mandar o usuário
a um lugar onde não há nada — e ele concluiria, com razão, que o gráfico está
quebrado.

---

## 7. Validação

| Verificação | Resultado |
|---|---|
| `npm test` | **918 passando**, 0 falhando |
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros, 0 avisos |
| `npm run build` | 0 erros |
| Migration v29 em banco de teste | 1ª execução: 8 meses, conferência OK · 2ª: 0 meses, OK |
| Migration v29 em Production | 8 meses, **zero divergências** |
| 43 rotas com sessão ADMIN, banco Principal | **todas 200**, 0 erros no log |
| 30 rotas com sessão ADMIN, banco de teste | **todas 200**, 0 erros no log |
| Varredura de alçada (OPERACIONAL, sem-certificados) | barra onde devia, abre onde devia |
| 3 metas novas de ponta a ponta | POST 200 → gravadas → somadas na Previsão |

### Suítes novas

| Arquivo | O que prende |
|---|---|
| `tests/comparacao-temporal.test.ts` | as 4 granularidades e a invariante por força bruta |
| `tests/normalizacao-historica.test.ts` | a aritmética contra os 8 consolidados reais e as garantias da migration |
| `tests/previsao-receita.test.ts` | a fórmula, a não-duplicação, a auditabilidade, as portas do caixa |
| `tests/navegacao-profunda.test.ts` | as abas, as alçadas, os redirects, as APIs registradas |

---

## 8. O que NÃO foi feito, e por quê

| Item | Razão |
|---|---|
| Realizado da meta de **Serviços** | não existe classificação no sistema; inventá-la por nome de categoria seria o acoplamento que `natureza` evita |
| Normalizar fevereiro–maio no **piso dos gráficos** | só têm transações; TPV/receita/MED são zero, e zero ali é ausência de apuração. Os lançamentos continuam no banco |
| TPV por cliente, reconciliação | fora do escopo, explicitamente |
| Alterar regras de Float | fora do escopo, explicitamente |
