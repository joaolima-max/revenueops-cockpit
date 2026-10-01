# Rodada v23 — O Conselho que não abria, alçadas de Usuários e a Sidebar final

> Documento da rodada. Complementa [`RODADA-V22.md`](./RODADA-V22.md)
> (Lançamento BaaS, Lixeira, Segmentos, Sócio) e
> [`RODADA-V21.md`](./RODADA-V21.md) (governança, notificações).

---

## Sumário

| Área | O que mudou |
|---|---|
| **Conselho** | **Corrigido.** O proxy barrava o sócio por causa de um token antigo. |
| **Usuários** | Alçadas próprias: `view_usuarios` e `manage_usuarios`, separadas. |
| **Sidebar** | RECEITA com dois itens; **Lançamentos BaaS passou para FINANCEIRO**. |
| **Metas** | Pipeline reduzido a dois indicadores; **"Conversão de Fechamento"**. |
| **Condições BaaS** | Tarifas viraram **produtos**, com unidade. PIX/KYC saíram do formulário. |
| **Sócio** | Controle na tela de Usuários — antes só por banco. |

---

## 1. O Conselho — o bug e a correção

### O sintoma

João Lima estava marcado como sócio (`isPartner = true`, verificado no banco),
**via o menu Conselho** e, ao clicar, era redirecionado para fora.

### A causa

Três fatos que, juntos, produziam o bloqueio:

1. `isPartner` entra no JWT **só no login**;
2. o JWT vive **7 dias**;
3. o proxy decidia o acesso lendo `session.isPartner` do token.

Quando o campo passou a existir no payload, o cookie de quem já estava logado
**não o tinha**. O proxy encontrava `undefined`, tratava como "não é sócio" e
barrava. A sidebar, que é montada num *server component* e lê do banco,
mostrava o menu — daí o sintoma de ver e não entrar.

O raciocínio errado da rodada anterior está registrado no código: eu escrevi
que um token velho só poderia errar no sentido **permissivo**. Para uma marca
que nasce **ausente**, ele erra no sentido **restritivo** — e tranca justamente
quem tem o direito.

### A correção

`socio` passou a ser **tri-estado** no contexto de autorização:

| Valor | Significado |
|---|---|
| `true` | libera |
| `false` | barra — resposta de quem **consultou o banco** |
| `undefined` | **não decide** — quem não consultou não opina |

O proxy **não informa** `socio`, portanto não decide. A autoridade é a página
(e qualquer API futura), que lê `User.isPartner` do banco a cada requisição.

**É mais seguro, não menos:** antes, revogar um sócio só valia quando o token
expirasse; agora vale na requisição seguinte.

`exigeSocio(pathname)` foi acrescentada para que a obrigação fique visível do
lado de quem pode cumpri-la — uma função marcada `socio: true` sem `socio()` no
handler seria uma rota aberta.

### As camadas, depois da correção

| Camada | Fonte | Decide sócio? |
|---|---|---|
| Sidebar | banco (server component) | **sim** — o menu já estava certo |
| Proxy | token (edge) | **não** — não tem como saber |
| Página / API | banco | **sim** — é a autoridade |

### A regra de acesso

Ser **ADMIN**, ser **Diretor** ou estar no **departamento Conselho** não
implica em ser sócio. São três eixos independentes, e inferir de qualquer um
deles daria falso positivo. `view_conselho` não existe como chave — ter uma
flag e uma chave era a duplicidade que quebrou o acesso na rodada anterior.

### Validação

`tests/conselho.test.ts`, 12 testes:

- **João Lima** — sócio no banco, token sem `isPartner`: a rota abre;
- **não sócio** — menu oculto, rota e API barradas, mesmo sendo ADMIN e mesmo
  com todas as chaves;
- `undefined` **não decide** — se voltasse a barrar, o bug voltaria inteiro;
- o Conselho declara `socio`, nunca uma chave de permissão.

## 2. Usuários — ver e editar são alçadas separadas

Antes bastava ser ADMIN, e **todos os usuários de Production são ADMIN**: o
ambiente estava aberto para todos eles.

| Chave | O que permite |
|---|---|
| `view_usuarios` | consultar a lista, os perfis, os departamentos |
| `manage_usuarios` | tudo acima **mais** criar, editar, ativar e conceder permissões |

**Por que duas e não uma:** consultar quem tem acesso a quê é trabalho de
auditoria e de suporte; alterar é de quem responde pelas alçadas. Com uma chave
só, quem precisasse conferir uma permissão ganharia o poder de conceder
qualquer outra — inclusive a si mesmo.

`manage_usuarios` **implica** consulta (quem edita também lê). O contrário não
vale, e é conferido no handler, não na tela.

### A chave é o gate, não o perfil

A função lista os quatro perfis técnicos de propósito. A seção ADMIN restringe
a ADMIN, e herdar essa restrição tornaria `view_usuarios` inútil — ninguém
além de ADMIN poderia recebê-la, que é o contrário de ter uma chave própria.
O mesmo vale para a Auditoria.

### Um bug corrigido no caminho

`permissaoConcedida` comparava a lista com `includes` **cru**. Como
`null.includes` nunca encontra nada, um **ADMIN sem lista explícita** — o caso
da maioria em Production — perderia o menu de Usuários no instante em que a
chave fosse exigida. A função passou a delegar a `hasPermission`, que é a
única regra de permissão do produto e distingue os dois casos:

- **chave restrita** (`view_auditoria`) → exige a chave; ser ADMIN não
  substitui;
- **chave normal** (`view_usuarios`) → vale o atalho de ADMIN e o default do
  perfil.

Regra de permissão não pode ter duas implementações.

### Proteção

| Ponto | Exige |
|---|---|
| Menu | `view_usuarios` ou `manage_usuarios` |
| Página | idem, com `redirect` |
| `GET /api/users` | idem |
| `POST /api/users` | `manage_usuarios` |
| `PUT /api/users/[id]` | `manage_usuarios` |
| `PUT /api/users/[id]/permissions` | `manage_usuarios` |

Quem só consulta vê a lista com **"somente consulta"** no lugar das ações — e a
API recusa a mutação de qualquer forma, porque esconder o botão não impede um
POST.

A rota de permissões passou a **filtrar pelo catálogo**: o corpo é JSON
arbitrário, e sem o filtro qualquer texto viraria uma "permissão" gravada —
inútil para autorizar, suficiente para esconder o que o usuário de fato tem. A
auditoria registra quantas entraram e **quais restritas** foram concedidas.

## 3. Sócio na tela de Usuários

A pendência da rodada anterior: `isPartner` só podia ser marcado por banco.
Agora há coluna **Sócio** na tabela, com confirmação explícita — é a decisão
que abre o Conselho, e uma caixa clicada por engano daria acesso a dado de
sócio. Marcar e desmarcar vão para a auditoria como
`MARCOU_COMO_SOCIO` / `REMOVEU_SOCIO`.

Um usuário novo nasce com `isPartner = false`: o Conselho não se concede por
descuido.

## 4. Sidebar final

```
EXECUTIVO    Cockpit · Conselho
RECEITA      Metas · Lançamento Diário
COMERCIAL    Visão geral · Leads · Pipeline · Follow Up
CARTEIRA     Clientes · Volumetria · Certificados
OPERAÇÕES    Tarefas · Incidentes · Compliance
FINANCEIRO   Visão Geral · Lançamentos · Contas a Pagar · Contas a Receber
             Categorias · Fornecedores · Condições BaaS · Lançamentos BaaS
ADMIN        Usuários · Auditoria
```

**RECEITA tem dois itens.** O Lançamento BaaS saiu para o FINANCEIRO: ele gera
lançamento financeiro, título a receber e título a pagar, e é ao lado desses
três que ele se confere. Receita ficou sendo o **objetivo** e o **insumo
diário** que o alimenta.

**Contas a Pagar antes de Contas a Receber**, e **Lançamentos BaaS fechando** o
ambiente financeiro.

> **Sobre CARTEIRA e OPERAÇÕES:** a lista obrigatória do prompt nomeia cinco
> seções e não as inclui — mas o mesmo prompt descreve Clientes, Segmentos,
> Certificados, Tarefas, Incidentes e Compliance como requisitos ativos, e a
> lista de menus proibidos não as menciona. Removê-las apagaria da navegação
> telas que o próprio prompt especifica. Ficaram, na ordem que o §21 define
> para Operações, e a ordem relativa das cinco seções nomeadas é exatamente a
> pedida.

Não aparecem: **CRM**, **Funis**, **Métricas Operacionais**, **Condições
Comerciais BaaS**, **Relatórios**, **Documentos**, **Alertas**, **Parâmetros**,
**Formulários**, **Automações**, e a **Lixeira** (registrada e oculta).

## 5. Metas — dois indicadores de pipeline

| Indicador | Unidade padrão | Direção |
|---|---|---|
| Geração de Leads | Quantidade | maior é melhor |
| **Conversão de Fechamento** | Percentual | maior é melhor |

**Saíram da criação:** Leads Ganhos, Leads Perdidos e Atividade Assistida.
Ganho e perda são o **desfecho** da geração e da conversão — metar os quatro
produziria alvos que se contradizem, porque bater geração e conversão já
determina os ganhos. Atividade assistida é indicador de **acompanhamento**, não
objetivo.

Os três **continuam no enum e continuam sendo apurados**: uma meta já gravada
com eles segue valendo, e apagá-la da leitura esconderia um alvo ativo. Os
rótulos ganharam "(legado)", e `PADRAO_LEGADO` guarda a unidade e a direção de
cada um para que a avaliação continue possível.

O rótulo é **"Conversão de Fechamento"**, não "Conversão de Lead": o que se
mede é quanto do que foi **decidido** fechou.

**MED** segue sendo um indicador só, com a unidade governando cálculo,
formatação e comparação.

## 6. Condições BaaS — tarifas são produtos

### O problema que isto resolve

As tarifas viviam em **dois lugares**: as colunas `pix` e `kyc` da condição, e
a tabela `CondicaoProduto` criada na v22. O Lançamento BaaS lia os **produtos**;
o formulário editava as **colunas**. Reajustar o PIX na tela não mudava a
tarifa aplicada no lançamento.

### A decisão

**O produto é a única fonte de tarifa.** PIX e KYC saíram do formulário da
condição, e no lugar entrou o painel **Produtos tarifados**, com a contagem
clicável na listagem. As colunas antigas ficam no banco com o valor histórico —
a migration da v22 já as semeou como produtos.

### Monetário, com uma exceção

| Dado | Tipo |
|---|---|
| Preço do produto | **R$** — `Float`, `step="0.01"` |
| Sustentação, API mensal, mensalidade de conta | **R$** |
| **Overprice** | **%** — a única exceção percentual |

Nenhum campo de dinheiro é texto livre, no banco ou na API.

### Unidade

`CondicaoProduto.unidade` diz **o que o volume conta**: transação, consulta,
conta, mês, boleto, documento. Entra no rótulo da coluna de volume do
lançamento — sem isso, "100" é ambíguo. Texto livre com default `transação`:
o contrato pode cobrar por qualquer coisa, e uma lista fechada obrigaria
migration a cada produto novo.

### Produtos ilimitados

Cada produto tem nome, preço monetário, unidade, status e condição. Manutenção
de conta, boleto, API — o que o contrato tiver. O cálculo **não conhece nenhum
produto por nome**, e um teste verifica: é por isso que produto novo entra sem
alteração de código.

Reajustar o preço **não altera lançamentos já feitos** — cada item guarda nome
e preço próprios (snapshot). Produto inativo sai do formulário e o histórico
fica.

## 7. Banco — migration v23

`supabase-migration-v23.sql`. **Incremental e idempotente.**

| # | O que |
|---|---|
| 1 | `CondicaoProduto.unidade` (default `transação`) + backfill dos nulos |

**Nada mais precisou de banco.** A correção do Conselho, as alçadas de
Usuários e a Sidebar são de código: `view_usuarios` e `manage_usuarios` vivem
em `User.permissoes` (coluna JSON que já existia), e `isPartner` entrou na v22.

**RLS**: nada desligado, nenhuma política criada. A coluna nova herda a RLS de
`CondicaoProduto`, ligada desde a v22.

## 8. Testes

`npm test` — **466 testes**.

| Arquivo | Cobre |
|---|---|
| `tests/conselho.test.ts` | **novo** — João Lima entra com token antigo; não sócio barrado; `undefined` não decide; a declaração do eixo |
| `tests/governanca.test.ts` | `view_usuarios` × `manage_usuarios`; ADMIN sem lista continua vendo Usuários; a chave é o gate da Auditoria |
| `tests/remocoes.test.ts` | a Sidebar item por item: RECEITA com dois, FINANCEIRO com oito, Pagar antes de Receber, BaaS fechando, sete seções e nada mais |
| `tests/metas.test.ts` | dois indicadores de pipeline; os três legados legíveis; "Conversão de Fechamento" |
| `tests/lancamento-baas.test.ts` | o exemplo exato do §56 com os seis números; produtos dinâmicos sem nome fixo; fechamento em todos os cenários |
| `tests/financeiro.test.ts` | anexos: foto e PDF aceitos e visualizáveis, planilha só baixa, quinto bloqueado, MIME tem de bater |

**`npx tsc --noEmit`** limpo · **`npm run lint`** limpo · **`npm run build`**
completo, 37 páginas.
