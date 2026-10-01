# Rodada v21 — Governança, notificações, analítica comercial e velas

> Documento da rodada. Complementa [`RODADA-V20.md`](./RODADA-V20.md)
> (consolidação de telas, MED único) e [`RODADA-V18.md`](./RODADA-V18.md)
> (RLS, Acompanhamento de metas).

---

## Sumário

| Área | O que mudou |
|---|---|
| **Governança** | Conselho e Auditoria passam a exigir chave explícita. Ser ADMIN não basta. |
| **Usuários** | Perfil (Admin/Colaborador), **Departamento** e **Hierarquia**. |
| **Notificações** | Motor de lembretes para tarefas, follow-up, compliance, AP/AR e Lançamento Diário. |
| **Visão geral** | Analítica de leads: segmento, etapa, segmento × etapa, atividade assistida, comparativos. |
| **Metas** | Cinco metas de **pipeline**, aparecendo na Visão geral. |
| **Cockpit** | Velas (OHLC) de TPV, Receita e Transações. BaaS e White Label em séries separadas. |
| **MRR** | **= Mensalidades + Sustentação.** Conta ativa sai do cálculo. |
| **Conselho** | Seis tipos de receita: Transacional, Setup, Mensalidades, Sustentação, Serviços, BaaS. |
| **Leads** | Empresa e executivo obrigatórios. Exclusão corrigida — era um 500 silencioso. |
| **Navegação** | Comercial e Operações reordenados; RECEITA e FINANCEIRO fundidos. |

---

## 1. Governança — Conselho e Auditoria

### O problema

`hasPermission` tinha um atalho: `if (role === 'ADMIN') return true`. E
`DEFAULT_PERMISSIONS.ADMIN` era o catálogo inteiro. Os cinco usuários de
Production são ADMIN — portanto **todos tinham o Conselho e a Auditoria**.
A página do Conselho, além disso, **não tinha barreira nenhuma**: nem sessão.

### A regra

Nasce a classe de **permissões restritas** — `view_conselho`,
`view_auditoria`, `manage_auditoria`:

- **nunca** concedidas por perfil: `hasPermission` trata as restritas antes do
  atalho de ADMIN, e elas ficam fora de todos os defaults, inclusive do ADMIN;
- conferidas **contra o banco a cada requisição** (`lib/autorizacao.ts`). O
  token vive 7 dias: se a autorização viesse dele, revogar o acesso de alguém
  só valeria no próximo login — até uma semana depois;
- a hierarquia **não** concede nada. Ser Diretor não é ser sócio.

Três camadas, e cada uma pega o que a anterior deixa passar:

| Camada | Fonte | O que faz |
|---|---|---|
| Sidebar | banco (server component) | o menu não aparece |
| Proxy | token | barra a URL direta e a API |
| Página / API | banco | palavra final; revogação vale na hora |

### Um bug encontrado no caminho

**O login nunca colocava `permissoes` no token.** `session.permissoes` era
sempre `undefined`, então `hasPermission` caía no default do perfil e a lista
configurada na tela de Usuários **nunca valia para ninguém** que não fosse
ADMIN. Corrigido: o token passa a carregar a lista.

### Quem foi autorizado

Só **João Lima** (`joaolima@basspago.com`), o sócio. Sem essa concessão, o
gate novo tiraria o Conselho e a Auditoria de todos — inclusive de quem precisa
conceder as chaves. Os demais são concedidos na tela de Usuários, onde as
chaves de Governança aparecem marcadas como **restrita**.

## 2. Usuários — perfil, departamento, hierarquia

Três eixos independentes, e nenhum deles abre Conselho ou Auditoria.

**PERFIL É DERIVADO DE `role`, não é coluna nova.** A tela mostra Admin e
Colaborador; o banco preserva as quatro roles técnicas (ADMIN, OPERACIONAL,
COMERCIAL, GESTOR) — há usuários em Production em três delas, e as alçadas de
funil referenciam esses valores.

`roleDoPerfil` **preserva** a role de quem já é colaborador. Só quando se
rebaixa um ADMIN é que o departamento decide, porque é a única pista
disponível. Sem isso, cada salvamento da tela regravaria a role e apagaria as
alçadas da pessoa.

**DEPARTAMENTO** define quem recebe o aviso de cada área — é assim que os
lembretes de Contas a Pagar/Receber e de Lançamento Diário acham o Financeiro,
em vez de uma lista mantida à mão que envelheceria na primeira troca de equipe.

| Departamento | Hierarquia |
|---|---|
| Financeiro · Comercial · Compliance · Operações · Conselho | Diretor · Operador |

Ambos nulos nos usuários anteriores: supor um departamento mandaria a
notificação financeira para a pessoa errada.

## 3. Notificações — o motor de lembretes

`lib/lembretes.ts` é **puro**: recebe os registros e a data de referência,
devolve as notificações a criar. É o que torna "falta 1 dia" testável sem
esperar um dia. `app/api/cron/lembretes` executa, acionado pelo cron da Vercel
às 9h UTC.

| Origem | Marcos |
|---|---|
| Tarefa | 7, 3, 1 dias antes, no dia, 1 dia após |
| Follow Up | no dia |
| Compliance | 3 dias antes, no dia, 1 dia após |
| Contas a Pagar / Receber | 3 dias antes, no dia, após o vencimento |
| Lançamento Diário | 1 dia após a ausência |

### Idempotência pelo banco

Cada lembrete carrega uma `chave` que identifica o **evento**, não a mensagem:
`tarefa:<id>:D-3:<destinatário>`. A coluna é **UNIQUE** e o insert usa
`skipDuplicates`. Reprocessar o dia — por retry, deploy ou execução manual —
não duplica avisos, e é o banco que garante, não a ordem das chamadas.

### Decisões que o código registra

- **O marco é o DIA, não o instante.** Uma tarefa que vence às 23h e outra às
  01h do mesmo dia estão ambas a 3 dias; comparar timestamps faria uma delas
  pular o marco.
- **O atraso avisa uma vez**, no primeiro dia. Um aviso que chega todo dia
  deixa de ser lido — e o atraso continua visível no próprio ambiente.
- **Título avisa o departamento, não uma pessoa.** Título não tem dono
  individual; escolher um faria o aviso sumir quando ele estivesse de férias.
  Cada pessoa recebe o seu, com chave própria, então marcar como lida é
  individual.
- **Lançamento Diário cobra ANTEONTEM.** O lançamento de um dia é feito no dia
  seguinte: cobrar em D+1 reclamaria do prazo normal. A chave carrega a data
  ausente, então cada dia cobra **uma vez** — não há alerta recorrente infinito.
- **Designar avisa na hora.** Os lembretes cobram quem já sabe da tarefa; quem
  acabou de ser designado precisa saber agora, senão descobre no primeiro
  lembrete — que pode ser no dia do vencimento.

**Segurança do endpoint:** exige `Authorization: Bearer $CRON_SECRET` (criado
nesta rodada como variável sensível em Production) ou uma sessão de ADMIN, para
disparo manual. Sem o segredo configurado, nenhuma requisição anônima é aceita.

**Não existe ambiente de "Automações".** É uma rota, sem tela, sem
configuração e sem regras editáveis em banco.

## 4. Visão geral do Comercial

`lib/comercial.ts` — funções **puras** sobre listas já carregadas. Quem busca é
a API, que passa os mesmos registros para todos os cortes: é isso que garante
que "por segmento" e "por etapa" somem o mesmo total. Dois SELECTs diferentes
para a mesma pergunta é como as telas começam a discordar.

**NENHUM VALOR MONETÁRIO**, em nenhum lugar: nem KPI, nem série, nem ranking,
nem tooltip. O valor comercial de um lead não está validado. Contagem,
percentual e tempo são as únicas unidades — e um teste verifica que o próprio
contrato de dados não tem campo monetário.

### KPIs

Leads no Pipeline · Gerados no período · Ganhos · Perdidos · Conversão · **Em
atividade assistida** — os quatro do meio comparados ao mês anterior.

### Atividade assistida

Definida com o que o modelo já grava, sem inventar atividade:

> um lead está em atividade assistida quando tem um card **aberto** no Pipeline
> com **responsável definido**, ou uma tarefa / follow-up **em aberto** com
> responsável.

Card aberto sem responsável **não** conta: é justamente o lead que ninguém está
tocando, e contá-lo transformaria o indicador em mais uma contagem de pipeline.
O denominador é a base inteira de leads — a pergunta é que fração está sendo
trabalhada.

### Distribuições

- **Por segmento** — toda a base. Lead sem segmento entra como "Não informado"
  em vez de ser descartado: um gráfico que soma menos que a base faz o leitor
  procurar o erro na conta.
- **Por etapa** — só os cards **abertos**. Um lead ganho na Negociação não é um
  lead em Negociação. Etapa vazia continua no gráfico, com zero: uma etapa que
  desaparece esconde exatamente o buraco que o gráfico existe para mostrar.
- **Segmento × etapa** — matriz com intensidade por volume. Segmento sem lead
  aberto não vira linha de zeros.

### Comparativos

Variação **null** quando o mês anterior foi zero — não 100%, não infinito. Sair
de zero é um começo, não um crescimento percentual: a tela mostra os dois
números e deixa o leitor concluir.

## 5. Metas de pipeline

Cinco tipos novos, nenhum monetário:

| Meta | Unidade padrão | Direção |
|---|---|---|
| Geração de Leads | Quantidade | maior é melhor |
| Leads Ganhos | Quantidade | maior é melhor |
| Leads Perdidos | Quantidade | **menor é melhor** |
| Conversão de Leads | Percentual | maior é melhor |
| Atividade Assistida | Percentual | maior é melhor |

**Atividade Assistida aceita as duas unidades**, como o MED: pode ser "60% da
base acompanhada" ou "80 leads acompanhados", e a unidade escolhida no cadastro
decide formatação, comparação e projeção. Percentual não projeta pelo tempo —
é uma taxa.

Apuradas sobre `Lead` e `Deal`, os mesmos registros que a Visão geral lê. Não
há tabela de apuração comercial, e criar uma produziria uma segunda verdade
sobre o mesmo card. A consulta só acontece se existir meta desse tipo no
período.

Os rótulos foram unificados: havia **dois mapas** de nome de meta, e eles
divergiram — um dizia "MEDs" e o outro "MED (% das transações)", sugerindo dois
indicadores onde existe um.

## 6. Velas (candlestick)

`lib/candle.ts` agrega observações **diárias** em OHLC por janela:

```
Open  = primeiro valor da janela      High = maior valor
Low   = menor valor                   Close = último valor
```

**Nada é simulado.** O produto não tem cotação intradiária, e um candle diário
teria abertura = fechamento = máxima = mínima — um traço, não uma vela. Então a
vela é construída sobre a janela agregada, e **cada um dos quatro números foi
efetivamente observado em algum dia** daquele período.

- Dia sem lançamento é **descartado**, nunca lido como zero: zero puxaria a
  mínima e inventaria uma queda que não houve.
- O tooltip **declara a janela** (datas e quantidade de observações).
- Vela de uma observação só é marcada como tal — não tem dispersão medida, e
  desenhá-la como vela sugeriria o contrário.
- O corpo mostra o movimento líquido; as sombras, a dispersão que a linha
  média esconde.

Aplicado a **TPV, Receita e Transações** no Cockpit. Não transforma o produto
numa interface de trading — é leitura de crescimento.

## 7. Cockpit

- **Saiu** o gráfico combinado "BaaS e White Labels Ativos". Juntar duas
  contagens de naturezas diferentes num quadro só não respondia nenhuma das
  duas perguntas.
- **Entraram** `Evolução de BaaS Ativos` e `Evolução de White Labels Ativos`,
  como séries reais. A contagem de cada mês é **reconstruída** do histórico de
  `ativo` das condições comerciais (`evolucaoParceiros`): o estado de hoje,
  desfazendo cada transição posterior. O mesmo vale para `tipo` — um parceiro
  que mudou de White Label para BaaS contava na outra coluna antes da mudança.
- **Entraram** as três velas.
- Acompanhamento de Metas segue **abaixo** dos gráficos.
- Monetário sempre por extenso: `R$ 4.250.000,00`. Nenhum K, M, MM ou BI.

## 8. MRR = Mensalidades + Sustentação

```
Mensalidades = API mensal dos parceiros + API mensal da carteira
Sustentação  = BaaS + White Label, já vigentes
```

**Mensalidade de conta ativa saiu do cálculo.** A quantidade de contas de um
parceiro oscila com a operação dele: o recorrente subia e descia sem nenhum
contrato ter mudado, e um MRR que se move sozinho não serve para comparar mês
a mês.

O valor continua sendo calculado e devolvido, **marcado como fora do total**, e
a Visão Geral Financeira o declara em voz alta — somá-lo em silêncio é o que se
quer evitar, mas omitir a linha faria quem soma as parcelas achar que falta
dinheiro. A coluna permanece no cadastro em Condições BaaS.

`receitaPorParceiro.recorrente` seguiu a mesma regra: o recorrente do parceiro
tem de fechar com o recorrente da empresa.

## 9. Conselho — os seis tipos de receita

**Transacional · Setup · Mensalidades · Sustentação · Serviços · BaaS**

**Transacional É a Tarifária** — a mesma receita com o nome que o Conselho usa.
Mostrar as duas duplicaria o mesmo dinheiro na composição.

A partição é **exclusiva**: cada real entra em exatamente uma linha. A regra,
aplicada em ordem sobre os lançamentos de receita do período:

1. natureza `SETUP` → Setup
2. natureza `SUSTENTACAO` → Sustentação
3. natureza `FLOAT` → **fora da composição**
4. vinculado a uma condição BaaS → BaaS
5. o que sobra → Serviços

O vínculo com o parceiro classifica **depois** da natureza: um setup cobrado de
um BaaS é setup, não "receita de BaaS". Sem essa ordem, a mesma linha contaria
nas duas.

Fora dos lançamentos, duas linhas têm fonte própria: **Transacional** vem do
Lançamento Diário (a fonte oficial) e **Mensalidades** do cadastro — a mesma
parcela do MRR, nunca lançada como receita.

Float não é um dos seis tipos, então a receita lançada nele aparece como **fora
da composição**, dita em voz alta: se desaparecesse, quem somasse as linhas
acharia diferença e desconfiaria das duas telas.

## 10. Leads

### Obrigatoriedades

**Nome da empresa** e **nome do executivo** — e só esses dois. Validado no
servidor, no POST **e no PUT**: validar só na criação deixaria o PUT como porta
de trás da regra. Todo o resto é opcional, porque um lead nasce de uma conversa
e exigir CNPJ ou segmento na criação faz o vendedor inventar valor para
conseguir salvar.

### A exclusão, corrigida

**Causa raiz:** `Activity.leadId` e `Deal.leadId` tinham a constraint
`NO ACTION` no banco. O Prisma declara a relação como opcional — cujo default
de client é `SetNull` —, mas a FK foi criada sem ação. Apagar um lead que já
tivesse **qualquer atividade ou card** estourava violação de chave estrangeira,
a rota devolvia 500 e, para quem clicava, o botão "não fazia nada". E falhava
justamente nos leads já trabalhados, que são os que alguém quer remover.

**Segunda metade do bug:** o handler do front **ignorava a resposta** e
navegava para a lista sempre. O usuário via a tela de leads com o lead ainda
lá, sem explicação nenhuma.

**O que mudou:**

| Dependência | Ação | Por quê |
|---|---|---|
| `Activity` | **CASCADE** | é linha de log *sobre* o lead, sem vida própria |
| `LeadComentario` | CASCADE (já era) | idem |
| `Deal` | **bloqueia, com 409** | o card carrega movimentações, comentários e desfecho |

Cards continuam bloqueando **de propósito**: apagá-los junto destruiria
histórico de pipeline sem ninguém ter pedido, e deixá-los órfãos com `leadId`
nulo criaria um card que a própria tela não sabe explicar. A recusa agora é
explícita — diz quantos cards bloqueiam e o que fazer — e a exclusão é
auditada.

## 11. Pipeline

- **Segmento no card**, como badge. Vem do **lead**, não de `Deal.segmento`: a
  cópia no card envelheceria, e corrigir o cadastro deixaria o card mostrando o
  segmento antigo. Lead sem segmento não ganha badge — nada é inventado.
- **Busca de lead** ao criar o card: por empresa, executivo e CNPJ, ignorando
  acento e caixa, com filtro por segmento. Com muitos leads, uma lista de
  centenas de `<option>` não se percorre com o olho — e achar o lead *é* a
  tarefa. O filtro de segmento só oferece os segmentos que existem na base.
- O detalhe do card passou a mostrar o **rótulo** do segmento e do canal, não o
  valor do enum (`CRYPTO_EXCHANGES`).
- Ganho e Perdido continuam **não sendo etapas**. Funis continua **sem menu**.

## 12. Incidentes — MTTR

**MTTR é o downtime.** Não existe segundo cálculo: `calcularDowntime` é a única
fonte, a mesma da lista. Um incidente isolado tem MTTR igual à própria duração.

O MTTR agregado passou a incluir os **abertos**, com a duração que continua
correndo — é o comportamento pedido, e é o honesto: um incidente aberto há seis
horas já custou seis horas, e tirá-lo da média faria o MTTR parecer melhor
exatamente quando a operação está pior. A tela diz que o número está correndo.

O **acumulado** continua contando só os encerrados: somar uma duração que ainda
cresce faria o total do mês mudar a cada refresh.

## 13. Navegação final

```
EXECUTIVO            Cockpit · Conselho (restrito)
CARTEIRA             Clientes · Volumetria · Certificados
OPERAÇÕES            Tarefas · Incidentes · Compliance
COMERCIAL            Visão geral · Leads · Pipeline · Follow Up
RECEITA / FINANCEIRO Metas · Lançamento Diário · Visão Geral · Lançamentos
                     Contas a Receber · Contas a Pagar · Categorias
                     Fornecedores · Condições BaaS
ADMIN                Usuários · Auditoria (restrito)
```

As seções **RECEITA** e **FINANCEIRO** foram fundidas: Metas e Lançamento
Diário abrem o ambiente — o objetivo e o insumo diário que o alimenta. Duas
seções separadas afastavam a meta do financeiro que a realiza. As **chaves e
rotas das funções não mudaram** (`receita.metas`, `/dashboard/metas`): trocá-las
invalidaria permissões gravadas e links salvos.

Não aparecem: **CRM**, **Funis**, **Métricas Operacionais**, **Condições
Comerciais BaaS**, **Relatórios**, **Documentos**, **Alertas**, **Parâmetros**,
**Formulários**, **Automações**.

## 14. Correções de unidade

O `Donut` do financeiro formatava em **moeda por construção**. A Visão geral
usava a mesma peça para contagem de cards, e o total aparecia como
**"R$ 12,00" para 12 cards** — no miolo e no tooltip. O componente passou a
receber o formatador, com moeda como default para os chamadores financeiros.

A distribuição por segmento usa **barras**, não donut: além da unidade, lê
melhor com muitos segmentos.

Nenhuma chave de permissão foi removida nesta rodada — três foram
**adicionadas** (as de Governança).

## 15. Banco — migration v21

`supabase-migration-v21.sql`. **Incremental e idempotente.** Sem reset, sem TRUNCATE, sem DROP de tabela, sem
DELETE em massa.

| # | O que | Observação |
|---|---|---|
| 1 | enums `Departamento` e `Hierarquia` | novos |
| 2 | `User.departamento`, `User.hierarquia` | nulos, sem default |
| 3 | `FollowUp.responsavelId` | FK com `ON DELETE SET NULL` |
| 4 | `Notificacao.chave` + índice **UNIQUE parcial** | idempotência dos lembretes |
| 5 | `NotificacaoOrigem` += 5 valores | TAREFA, FOLLOW_UP, CONTA_PAGAR, CONTA_RECEBER, LANCAMENTO_DIARIO |
| 6 | `MetaTipo` += 5 valores | as metas de pipeline |
| 7 | `Activity.leadId` → **CASCADE** | a causa de a exclusão de lead falhar |

**RLS preservada.** Nada desliga, afrouxa ou cria política. As colunas novas
herdam a RLS da tabela, e as três tabelas tocadas (`User`, `FollowUp`,
`Notificacao`) seguem com RLS ligada e **zero políticas** — deny-all para
`anon` e `authenticated`, com o backend operando como owner via Prisma.

**Dados atualizados** (fora da migration, por `UPDATE` pontual):

- e-mail de João Lima → `joaolima@basspago.com`, **só a coluna email**. Senha,
  permissões, perfil, histórico e id intactos; nenhum usuário duplicado;
- chaves de Governança concedidas a João Lima, com departamento CONSELHO e
  hierarquia DIRETOR;
- departamento preenchido onde a própria conta o declara (comercial@,
  compliance@, financeiro@). `marketing@` ficou nulo — não há departamento
  correspondente.

### O que continua no banco, de propósito

| Objeto | Por quê |
|---|---|
| `MetaTipo.MED_PERCENTUAL` | metas antigas gravadas com ele |
| `CategoriaFinanceira.natureza` | classifica a composição de receita; saiu só da tela |
| `Deal.value` | legado, nunca cadastrado nem exibido |
| `Deal.segmento` | legado; o card lê o segmento do lead |
| `CondicaoComercial.mensalidadeContaAtiva` | dado do contrato; saiu só do MRR |

## 16. Testes

`npm test` — **366 testes**.

| Arquivo | Cobre |
|---|---|
| `tests/governanca.test.ts` | ADMIN não libera chave restrita; menu, URL e API bloqueados sem a chave; perfil preserva role técnica; departamento → destinatário |
| `tests/comercial.test.ts` | ausência de campo monetário no próprio contrato; segmento × etapa fecha com a contagem por etapa; atividade assistida; comparativo com anterior zero |
| `tests/lembretes.test.ts` | o marco é o dia; chave idempotente por marco e destinatário; atraso avisa uma vez; título vai para o departamento; ausência cobra anteontem |
| `tests/candle.test.ts` | OHLC sai da ordem das datas; todo valor foi observado; dia nulo descartado; semana ISO não racha na virada do ano |
| `tests/leads.test.ts` | obrigatoriedades (inclusive espaço em branco e tipo errado); card bloqueia a exclusão e a recusa explica |

Ampliados: `tests/metas.test.ts` (metas de pipeline, nenhuma monetária),
`tests/financeiro.test.ts` (MRR sem conta ativa), `tests/remocoes.test.ts`
(navegação final, ambientes removidos, catálogo de permissões).

**`npx tsc --noEmit`** limpo · **`npm run lint`** limpo · **`npm run build`**
completo, 37 páginas.
