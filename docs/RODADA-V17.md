# Rodada v17 — Resultado do Pipeline, Metas percentuais, Contas a Pagar e Receita por parceiro

> Documento da rodada. O que mudou, **por quê**, e o que continua valendo.
> Substitui os trechos correspondentes de [`DOCUMENTACAO-COMPLETA.md`](./DOCUMENTACAO-COMPLETA.md)
> e complementa [`RODADA-V16.md`](./RODADA-V16.md).

---

## Sumário da rodada

| Área | O que mudou |
|---|---|
| **Pipeline** | Ganho e Perdido deixam de ser **etapas** e viram **resultado** do card. Card perde o valor financeiro. Detalhes, histórico e anotações por card. |
| **Metas** | Ganham **direção** (maior/menor é melhor) e **unidade** (valor / quantidade / percentual). Meta de MED em 2% passa a ser avaliável. |
| **Lançamento Diário** | Os KPIs do topo saíram. A tela começa no calendário. |
| **Financeiro** | Visão Geral visual (donuts + evolução), Receita por BaaS e por White Label rastreáveis, Float/Setup/Sustentação pela categoria. |
| **Lançamentos** | Data de vencimento, fornecedor, vínculo com BaaS/White Label, recorrência indefinida ou com prazo, teto de 4 anexos. |
| **Contas a Pagar** | Ambiente novo, sobre a **mesma** base de despesas. |
| **Condições Comerciais** | Mensalidade de conta ativa e data de início da sustentação, com histórico. |
| **MRR** | Passa a considerar conta ativa e a respeitar a data de início da sustentação. |
| **Cockpit** | Float, Margem Operacional e os gráficos de "previsto × realizado" saíram. |
| **CRM** | Dashboard analítico com KPIs, distribuição, evolução e gargalos. |
| **Marca** | Logo oficial da Bass Pago no topo e no favicon. Branding anterior removido. |
| **Topbar** | Horários de São Paulo, Nova York, Hong Kong e Madri, em tempo real. |

---

## 1. Pipeline — etapa e resultado são eixos diferentes

### O problema

Ganho e Perdido eram **colunas do quadro**. Isso destruía informação duas vezes:

1. Um card ganho saía da etapa em que fechou e ia para a coluna "Ganho".
   A pergunta *"onde nossos negócios fecham?"* deixava de ter resposta.
2. Para marcar um negócio como perdido na Negociação, era preciso **tirá-lo da
   Negociação**. A etapa passava a mentir sobre onde o processo parou.

### O que passa a valer

O card tem **dois eixos independentes**:

```
ETAPA      Prospecção → Qualificação → Proposta → Negociação → Fechamento
RESULTADO  Em andamento | Ganho | Perdido
```

O card mostra os dois, rotulados:

```
Etapa: Negociação
Resultado: Em andamento
```

- `Deal.etapaId` — onde o card está no processo
- `Deal.resultado` (`ResultadoCard`) — o desfecho
- `Deal.resultadoEm` — quando o desfecho foi definido

**Mover de etapa não encerra card.** Quem encerra é a mudança de resultado, que
tem rota própria (`PATCH /api/pipeline/cards/[id]/resultado`) e grava histórico
na mesma transação.

**Reabrir é permitido.** Negócio volta atrás; a alternativa seria o operador
criar um card duplicado para corrigir o desfecho — que é como uma base de
pipeline vira duas. Reabrir limpa `resultadoEm` e `closedAt`.

### As etapas antigas

As colunas "Ganho" e "Perdido" do funil de Vendas **continuam existindo no
banco, inativas**. Não foram apagadas porque `PipelineMovimentacao` as
referencia como origem e destino: excluí-las reescreveria o histórico do
pipeline. O quadro só mostra etapas ativas, então elas somem das colunas sem
que nada do passado seja perdido.

Criar etapa nova com comportamento Ganho/Perdido não é mais possível — a API
recusa (`POST`/`PUT` de etapa só aceita `NORMAL`), e o formulário não oferece.

### Card sem valor

`Deal.value` **não é mais cadastrado nem exibido**. A coluna permanece no banco
(com `DEFAULT 0`) porque há histórico gravado nela; nenhuma tela lê e nenhuma
rota escreve. O formulário de criação ficou:

```
Novo card → selecionar Lead existente → etapa (a coluna clicada) → salvar
```

O título do card vem do Lead, decidido no **servidor**. O Pipeline não cadastra
Lead.

### Detalhes, histórico e anotações

`GET /api/pipeline/cards/[id]` devolve, numa chamada: lead vinculado (com
empresa e CNPJ), cliente, responsável, funil, etapa, resultado, datas,
histórico completo e anotações.

O histórico é uma linha do tempo única (`PipelineMovimentacao`), com quatro
tipos de evento: criação, movimento de etapa, transferência de funil e
**mudança de resultado**.

As anotações vivem em `DealComentario` — texto, autor, data e hora. Mesma
mecânica de `LeadComentario`, separada de `Deal.notes`, que é o campo de
observação do cadastro.

### Transferência entre funis

Continua como estava (`Card → Transferir → funil → etapa → confirmar`),
preservando lead, cliente, responsável e histórico. O que mudou: a
transferência **preserva o resultado** do card — o desfecho é do negócio, não
da coluna.

---

## 2. Metas — a direção faz parte da meta

Uma meta de MED em 2% é atingida quando o realizado fica **abaixo** dela. Com a
divisão direta, um realizado de 1,5% daria 75% — e 75% parece ruim.

`Meta` ganhou dois campos:

| Campo | Valores | Para quê |
|---|---|---|
| `direcao` | `MAIOR_MELHOR` / `MENOR_MELHOR` | como comparar meta e realizado |
| `unidade` | `VALOR` / `QUANTIDADE` / `PERCENTUAL` | como ler e formatar o número |

O **cumprimento** inverte conforme a direção, para que 100% signifique "no
alvo" nos dois casos:

```
MAIOR_MELHOR → realizado / meta
MENOR_MELHOR → meta / realizado
```

| Meta | Realizado | Direção | Resultado |
|---|---|---|---|
| 2% | 1,5% | menor é melhor | **positivo** — 133% de cumprimento |
| 2% | 3,0% | menor é melhor | **negativo** — 67% de cumprimento |
| R$ 1.000.000,00 | R$ 1.200.000,00 | maior é melhor | **positivo** — 120% |

Tipos novos: `MED_PERCENTUAL` (MEDs como % das transações) e `TAKE_RATE`. Cada
tipo tem um padrão de unidade e direção, oferecido ao abrir o formulário; quem
decide é o usuário, e a escolha fica gravada na meta.

**O realizado continua vindo só do Lançamento Diário.** Não há campo para
digitá-lo — nem na criação, nem na edição, nem na API.

Regras puras em `lib/metas.ts`, cobertas por `tests/metas.test.ts`.

---

## 3. Lançamento Diário — a tela começa no calendário

Os cards de indicadores do topo saíram. Esta é uma tela de **entrada de dado**,
e os indicadores derivados dela já têm casa no Cockpit e no Conselho —
repeti-los aqui criava uma terceira leitura dos mesmos números no meio do fluxo
de digitação.

**Nenhum dado do Lançamento Diário foi tocado.** Ele segue sendo a fonte de
verdade dos realizados gerais: TPV, receita tarifária, saldo em conta,
transações, MEDs e clientes ativos.

---

## 4. Financeiro

### 4.1 Visão Geral — visual, com fonte real

Saíram os KPIs de contagem **BaaS ativos** e **White Labels ativos**: eles
continuam no Cockpit e no Conselho, onde respondem "quantos parceiros temos".
Aqui a pergunta é "quanto entra, quanto sai e de onde".

A tela passou a ter:

| Bloco | Fonte |
|---|---|
| MRR / ARR | `CondicaoComercial` + `Cliente.mensalidadeApi` |
| Receita \| Despesa \| Resultado \| Inadimplência | `LancamentoFinanceiro` + `ContaReceber` |
| Evolução (12 meses) | `LancamentoFinanceiro` |
| Gasto por categoria (donut) | `LancamentoFinanceiro` tipo DESPESA |
| Float, Setup e Sustentação (donut) | natureza da `CategoriaFinanceira` |
| Receita por BaaS (donut) | lançamentos vinculados + cadastro |
| Receita por White Label (donut) | lançamentos vinculados + cadastro |
| Composição do MRR | as cinco parcelas, abertas |
| Contas a pagar do período | `LancamentoFinanceiro` tipo DESPESA, por vencimento |

**Nenhum gráfico sem fonte real.** Os donuts usam uma rampa monocromática
derivada do accent (`rampaCategorias` em `lib/chart-theme.ts`): a leitura
acontece por intensidade, porque "Infraestrutura" e "Pessoal" são duas linhas
de despesa, não duas naturezas diferentes.

### 4.2 Receita por BaaS / White Label

Duas origens, **sem dupla contagem**:

1. **Lançamentos vinculados** ao parceiro (`LancamentoFinanceiro.condicaoId`).
   É a parcela rastreável: cada real tem um lançamento com data, categoria,
   status e anexos por trás.
2. **Mensalidades do cadastro** — sustentação vigente, API mensal, mensalidade
   de conta ativa.

A regra que evita contar duas vezes: **se existir lançamento de natureza
`SUSTENTACAO` vinculado ao parceiro no período, a sustentação do cadastro sai
da parcela recorrente.** O valor lançado é a verdade; o cadastro vira o
contrato de referência.

O vínculo é **fotografado** no lançamento: alterar a condição comercial do
parceiro amanhã não reescreve a receita já atribuída a ele ontem.

### 4.3 Float, Setup e Sustentação

A **categoria** do lançamento é a fonte de verdade. `CategoriaFinanceira`
ganhou `natureza` (`FLOAT` / `SETUP` / `SUSTENTACAO`) — um campo, não um nome
digitado: renomear a categoria não quebra o gráfico, e duas categorias podem
compartilhar a mesma natureza.

Em `linhasReceita` (Cockpit e Conselho), quando existe lançamento real de uma
dessas naturezas no período, é o **valor lançado** que entra. Quando não existe,
entra o **valor derivado** — sustentação vigente das condições comerciais, Float
calculado do saldo em conta. Nunca os dois.

Setup não tem derivação: ou foi lançado, ou é zero.

### 4.4 Lançamentos

Campos por tipo:

| Campo | Receita | Despesa |
|---|---|---|
| descrição, categoria, valor, data de lançamento, status, observação, período | ✓ | ✓ |
| **data de vencimento** | — | ✓ (alimenta Contas a Pagar) |
| **fornecedor** (opcional) | — | ✓ |
| **BaaS / White Label** (opcional) | ✓ | — |

**Lançar não é vencer.** `data` é competência — é sobre ela que Receita, Despesa
e Resultado somam. `dataVencimento` é quando a despesa vence, e é o que ordena
Contas a Pagar. Em lançamento parcelado, o vencimento acompanha cada parcela
com o mesmo deslocamento da data de lançamento.

**Ordem dos KPIs: Receita | Despesa | Resultado.** O resultado é consequência
dos dois primeiros e vem depois deles.

#### Recorrência

```
Recorrente?
  Duração:  ( ) Indefinida
            ( ) Até uma data → Data final
```

A data final **nunca é obrigatória** — aluguel, salário e mensalidade não têm
data de fim, e exigir uma faria o usuário inventar. As linhas continuam
materializadas (uma linha real por mês), porque é isso que faz Receita, Despesa
e Resultado de qualquer período serem uma soma direta sobre `data`. A
recorrência indefinida materializa o horizonte de
`MESES_RECORRENCIA_INDEFINIDA` (60 meses) e é marcada com
`recorrenteIndefinido`; a com prazo materializa até o mês da data informada,
inclusive.

Parcelamento continua como estava.

#### Anexos

Teto de **4 arquivos por lançamento** (`MAX_ANEXOS_LANCAMENTO`, em
`lib/arquivos.ts`). O limite é validado **no servidor**: esconder o botão na
tela não impede um POST — o quinto envio recebe `409`. A tela mostra "n de 4",
desabilita o campo quando cheio e explica o motivo.

O limite mora em `lib/arquivos.ts`, e não em `lib/financeiro.ts`, porque a tela
precisa da regra no navegador e `lib/financeiro.ts` importa Prisma.

**O ambiente "Documentos" continua fora do produto.** O anexo usa o mesmo
bucket privado e continua sendo representado por um `Documento` — o modelo
ficou, o ambiente não voltou.

### 4.5 Contas a Pagar

Ambiente novo em `Financeiro → Contas a Pagar`, no padrão de Contas a Receber.

**Lê a MESMA base de Lançamentos** (`LancamentoFinanceiro`, tipo `DESPESA`).
Não existe uma segunda base de despesas: o que muda é a data de referência
(vencimento, não lançamento) e o recorte por situação. Uma despesa corrigida em
Lançamentos aparece corrigida aqui no mesmo instante, porque é a mesma linha.

Situação de um título (`situacaoDoTitulo`, função pura):

| Status | Vencimento | Situação |
|---|---|---|
| PAGO | qualquer | **Paga** — pago depois do prazo não é "vencido", é pago |
| CANCELADO | qualquer | **Cancelada** — despesa que não aconteceu |
| PENDENTE | passado | **Vencida** |
| PENDENTE | hoje ou futuro | **A vencer** |

Filtros: situação, descrição, categoria, fornecedor, período (ou todos). A
baixa muda o status do próprio lançamento — não existe título separado para
pagar.

### 4.6 Contas a Receber e Fornecedores

Contas a Receber foi revisada para consistência: continua sendo o faturamento
do cliente (`ContaReceber`), que é coisa diferente de lançamento de caixa.
**Nenhum lançamento é duplicado entre as duas telas.**

Fornecedores preserva razão social, CNPJ, chave PIX, descrição do serviço e
categoria, e agora pode ser vinculado a uma despesa.

---

## 5. Condições BaaS e MRR

O cadastro ganhou dois campos:

- **Mensalidade de conta ativa** (`mensalidadeContaAtiva`) — terceira parcela
  de MRR que sai deste cadastro.
- **Data de início da sustentação** (`sustentacaoInicio`) — antes dela a
  sustentação **não entra no MRR**. Um parceiro em implantação já está
  cadastrado e ativo, mas ainda não paga; sem isso o recorrente contaria
  dinheiro que ainda não é cobrado.

Os dois entram no **histórico versionado**: alterar grava valor anterior, valor
novo, data e usuário, na mesma transação da alteração.

### MRR

```
MRR = sustentação dos BaaS já vigentes
    + sustentação dos White Labels já vigentes
    + API mensal dos BaaS/White Labels
    + mensalidade de conta ativa dos BaaS/White Labels
    + mensalidade de API dos clientes da Carteira

ARR = MRR × 12
```

A sustentação contratada que ainda não começou é devolvida à parte
(`sustentacaoAguardandoInicio`) e mostrada como aviso — o número não some, ele
é explicado.

Sem dupla contagem: `CondicaoComercial.apiMensal` e `Cliente.mensalidadeApi`
são campos de tabelas diferentes, preenchidos em telas diferentes.

O histórico não recalcula o passado: alterar uma taxa hoje muda o MRR de hoje.

---

## 6. Cockpit e Conselho

### Cockpit

**Removidos:** gráfico de Margem Operacional, Float (KPI e composição da
receita), gráficos de "Faturamento previsto × realizado" e "TPV previsto ×
liquidado" — o "previsto" não existe em lugar nenhum do sistema, então o
gráfico era um par de barras zeradas ao lado da série real.

**Mantidos:** Receita, TPV geral, Transações do mês vigente, Saldo médio em
conta, MED, Take Rate, Meta × Realizado, Clientes ativos, BaaS ativos, White
Labels ativos.

A faixa Meta × Realizado agora respeita a direção da meta.

### Conselho

Preservado. Usa **as mesmas funções** do Cockpit e do Financeiro para BaaS
ativos, White Labels ativos, Clientes ativos, MRR e Receita —
`indicadoresEstrutura`, `calcularMrr` e `linhasReceita`. Nenhuma consulta
equivalente é repetida.

O Float continua sendo calculado e segue como linha de receita no Conselho.

### Clientes ativos

Inalterado e reafirmado: vem do **Lançamento Diário**, é **fotografia do dia**,
e o valor mensal é o do último dia lançado que informou o número — nunca a soma
dos dias. Mesma fonte no Cockpit e no Conselho.

---

## 7. CRM

Analítica do Pipeline, sem entidade própria — tudo derivado de `Deal` e
`PipelineMovimentacao`.

Ganho e perda passam a vir do **resultado**, não da etapa. Um card perdido na
Negociação conta como volume da Negociação **e** como perda.

A tela ganhou:

- KPIs: cards, em andamento, ganhos, perdas, **taxa de conversão**, ciclo médio
- **Distribuição do pipeline** por resultado (donut)
- **Volume por etapa** (barras)
- **Evolução** mensal: criados, ganhos e perdidos — criação conta pelo mês de
  criação, desfecho pelo mês do desfecho
- Gargalos, conversão por etapa, desempenho por responsável, transferências
  entre funis

Mudança de resultado **não** conta como passagem de etapa no cálculo de tempo
de permanência — sem esse recorte, marcar "Ganho" zeraria o tempo da etapa.

---

## 8. Marca e Topbar

### Logo

A logo oficial da Bass Pago entrou no produto a partir do arquivo entregue,
preservado em `public/logo-bass-pago-original.png`. Os arquivos servidos são
**derivados dele por recorte e transparência** — nada foi redesenhado, e não há
reconstrução em CSS nem SVG inventado.

| Arquivo | O que é |
|---|---|
| `logo-bass-pago-original.png` | o arquivo entregue, intacto |
| `logo-bass-pago.png` | wordmark recortado, cores originais — tema claro |
| `logo-bass-pago-dark.png` | mesma forma em tom claro — tema escuro |
| `icon.png` / `icon-dark.png` | favicon: o "b" com o arco azul, recortado do próprio arquivo |

Dois arquivos e não um filtro CSS porque a marca tem duas cores, e o **azul do
arco não pode mudar** entre temas — um `invert()` inverteria os dois. A troca
acontece por visibilidade (`.bp-logo-claro` / `.bp-logo-escuro`), resolvida a
partir do `data-theme` do `<html>`.

**Removidos:** o `BrandMark` desenhado em SVG, `brandmark.svg`,
`brandmark-dark.svg`, `icon.svg`, a palavra "RevOps" ao lado da marca e os
arquivos de exemplo do Next (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`,
`window.svg`).

### Horários globais

| Região | Cidade | Fuso |
|---|---|---|
| LATAM | São Paulo | `America/Sao_Paulo` |
| AMÉRICA | New York | `America/New_York` |
| ÁSIA | Hong Kong | `Asia/Hong_Kong` |
| EUROPA | Madrid | `Europe/Madrid` |

Os offsets **não são fixados em código**: cada horário é formatado com o
`timeZone` real da IANA, então horário de verão e mudanças de fuso são
resolvidos pelo runtime. Um offset numérico gravado estaria errado duas vezes
por ano em Madri e Nova York.

No desktop as quatro praças aparecem em linha (região, cidade, HH:MM). Abaixo
de `xl`, a mesma informação em forma compacta (sigla + hora), sem poluir a
barra.

---

## 9. Formatação monetária

Regra global inalterada e reafirmada: **valor monetário é exibido por extenso,
sempre**. `R$ 4.250.000,00`, nunca `R$ 4,25 MM`. Único formatador do sistema:
`lib/format-financeiro.ts`. A única concessão é o eixo de gráfico, que corta os
centavos e mantém os milhares — redução de precisão visível, não troca de
escala silenciosa. Tooltips, cards e legendas seguem com o valor cheio.

---

## 10. Banco — migration v17

Arquivo: [`supabase-migration-v17.sql`](../supabase-migration-v17.sql).
Idempotente. **Aplicar ANTES do deploy.**

### Tipos novos

`ResultadoCard`, `MetaDirecao`, `MetaUnidade`, `CategoriaNatureza`, e os valores
`MUDANCA_RESULTADO` (em `MovimentacaoTipo`), `MED_PERCENTUAL` e `TAKE_RATE` (em
`MetaTipo`).

### Colunas novas

| Tabela | Colunas |
|---|---|
| `Deal` | `resultado`, `resultadoEm` (+ `value` ganha `DEFAULT 0`) |
| `PipelineMovimentacao` | `resultadoAnterior`, `resultadoNovo` |
| `Meta` | `direcao`, `unidade` |
| `CategoriaFinanceira` | `natureza` |
| `LancamentoFinanceiro` | `dataVencimento`, `recorrenteIndefinido`, `recorrenciaFim`, `fornecedorId`, `condicaoId` |
| `CondicaoComercial` | `mensalidadeContaAtiva`, `sustentacaoInicio` |

### Tabela nova

`DealComentario` — anotações do card.

### Backfill

- Cards que estavam nas etapas Ganho/Perdido recebem o `resultado`
  correspondente e **voltam para a última etapa NORMAL do funil** — onde o
  processo comercial de fato terminou. Nenhum card é perdido.
- Cards com `stage` GANHO/PERDIDO recebem o resultado correspondente.
- Uma linha de `PipelineMovimentacao` por card reconstruído, para que a mudança
  apareça na linha do tempo em vez de surgir do nada.
- As etapas Ganho e Perdido são **inativadas**, não excluídas.
- Metas existentes recebem unidade e direção coerentes (MEDS → quantidade,
  menor é melhor).
- Despesas existentes recebem `dataVencimento = data` — a única informação
  verdadeira disponível sobre elas.
- Categorias de receita chamadas Float / Setup / Sustentação recebem a natureza
  correspondente; as três são criadas se faltarem.

### O que a migration NÃO faz

Não há `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, `TRUNCATE`, `DELETE` de dado
histórico nem `RESET`. Histórico financeiro, pipeline, compliance, incidentes e
o histórico de condições comerciais ficam intactos.

---

## 11. Testes

`npm test` — 192 testes, todos passando.

Arquivos novos/alterados nesta rodada:

| Arquivo | Cobre |
|---|---|
| `tests/metas.test.ts` *(novo)* | direção, unidade, cumprimento invertido, MED 2%, validação |
| `tests/pipeline.test.ts` | resultado como eixo próprio, reabertura, recusa de valor fora do enum, alçada |
| `tests/crm.test.ts` | ganho/perda por resultado, evolução mensal, distribuição, ciclo, mudança de resultado ≠ passagem de etapa |
| `tests/financeiro.test.ts` | MRR de cinco parcelas, vigência da sustentação, recorrência indefinida e com prazo, Contas a Pagar, limite de 4 anexos |
| `tests/remocoes.test.ts` | sete menus do Financeiro, Contas a Pagar ≠ Contas a Receber |

---

## 12. Ambientes removidos — continuam removidos

Relatórios, Documentos, Alertas, Parâmetros, Formulários e Automações **não
voltaram**. `tests/remocoes.test.ts` verifica menu, rota, API e chave de
permissão de cada um, em cada perfil.

Notificações e Incidentes continuam.

---

## 13. Pendências conhecidas

- A recorrência indefinida materializa 60 meses à frente. Passado esse
  horizonte, o cadastro precisa ser renovado. Não há motor de expansão na
  leitura, de propósito — é o que mantém Receita, Despesa e Resultado como uma
  soma direta sobre `data`.
- `Deal.value`, `Deal.probability` e `Deal.stage` permanecem no banco como
  legado, sem leitor na aplicação.
- As etapas "Ganho" e "Perdido" do funil de Vendas permanecem inativas, pelo
  vínculo com o histórico de movimentação.
