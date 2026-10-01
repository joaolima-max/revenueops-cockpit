# Rodada v22 — Lançamento BaaS, Receita separada, Lixeira, Segmentos e Sócio

> Documento da rodada. Complementa [`RODADA-V21.md`](./RODADA-V21.md)
> (governança, notificações, analítica comercial) e
> [`RODADA-V20.md`](./RODADA-V20.md) (consolidação de telas, MED único).

---

## Sumário

| Área | O que mudou |
|---|---|
| **Navegação** | **RECEITA** volta a ser seção própria, separada de **FINANCEIRO**. |
| **Lançamento BaaS** | Ambiente novo: tarifa o volume do parceiro e gera os títulos. |
| **Conselho** | Governado por **`isPartner`** — sócio. O acesso de João Lima foi corrigido. |
| **Leads** | Excluir virou **mover para a Lixeira**. Hard delete não existe mais. |
| **Lixeira de Leads** | Nova área, restrita por **hierarquia Diretor**. |
| **Segmentos** | Viraram **entidade** com CRUD, sem deixar de ler o enum antigo. |
| **Clientes** | Edição completa, **número da conta**, gestor, status e ordenação. |
| **Receita** | Mensalidades deixam de somar no total — já estão na tarifa transacional. |
| **Anexos** | Visualização inline corrigida: antes todo arquivo vinha como download forçado. |
| **Certificados** | Ordem **numérica** real e busca por razão social e número. |
| **Carteira** | O bloco "Últimos 5 dias" saiu. |

---

## 1. Navegação — RECEITA separada de FINANCEIRO

```
EXECUTIVO    Cockpit · Conselho (sócio)
CARTEIRA     Clientes · Volumetria · Certificados
OPERAÇÕES    Tarefas · Incidentes · Compliance
COMERCIAL    Visão geral · Leads · Pipeline · Follow Up
RECEITA      Metas · Lançamento Diário · Lançamento BaaS
FINANCEIRO   Visão Geral · Lançamentos · Contas a Receber · Contas a Pagar
             Categorias · Fornecedores · Condições BaaS
ADMIN        Usuários · Auditoria (chave restrita)
```

**Receita é o que a operação PRODUZ** — o objetivo, o insumo diário e o
faturamento dos parceiros. **Financeiro é o que se faz com isso** — caixa,
títulos, categorias, fornecedores. A v21 havia fundido as duas, e o efeito era
a meta aparecendo no meio das contas a pagar.

As **chaves e rotas das funções não mudaram** (`receita.metas`,
`/dashboard/metas`): trocá-las invalidaria permissões gravadas e links salvos.

Não aparecem: **CRM**, **Funis**, **Métricas Operacionais**, **Condições
Comerciais BaaS**, **Relatórios**, **Documentos**, **Alertas**, **Parâmetros**,
**Formulários**, **Automações**, e a **Lixeira** (registrada e oculta, como os
Funis).

## 2. Lançamento BaaS

Ambiente **operacional de lançamento**, não dashboard. Registra o volume
mensal de um BaaS ou White Label e o tarifa pelas condições vigentes.

### As tarifas não são redigitadas

Nasce `CondicaoProduto`: produtos tarifados por parceiro, com nome e preço.
Antes as tarifas eram **colunas fixas** (`pix`, `kyc`) — não dava para
cadastrar produto novo sem migration, e a tela precisa listar **todos**. As
colunas antigas ficaram no lugar e a migration as semeou como produtos; elas
deixaram de ser a fonte.

Ao escolher o parceiro, o sistema carrega nome, conta, produtos, preços e
overprice. O colaborador informa **o período, o saldo e os volumes** — nada
mais.

### A cascata

```
saldo informado
  − total de tarifas      (Σ preço × volume)
= saldo remanescente
  − overprice             (percentual sobre o SALDO REMANESCENTE)
= valor residual devido ao cliente
```

O exemplo da especificação, conferido por teste:

| Etapa | Valor |
|---|---|
| Saldo informado | R$ 100.000,00 |
| PIX — R$ 0,10 × 100.000 | R$ 10.000,00 |
| KYC — R$ 6,50 × 10 | R$ 65,00 |
| **Total de tarifas** | R$ 10.065,00 |
| **Saldo após tarifas** | R$ 89.935,00 |
| **Overprice 25%** | R$ 22.483,75 |
| **Devido ao cliente** | R$ 67.451,25 |

**O overprice incide sobre o saldo remanescente**, não sobre o saldo inicial —
e isso muda o resultado: 25% de R$ 50.000 é R$ 12.500, enquanto 25% de
R$ 100.000 seriam R$ 25.000.

**A CONTA FECHA**: o que a Bass Pago cobrou (tarifas + overprice) mais o que é
devido ao cliente é exatamente o saldo informado. Um teste verifica isso em
quatro cenários — se quebrar, a cascata passou a criar ou sumir com dinheiro.

O último número **não é "lucro da Bass Pago"**: é o valor residual devido ao
cliente.

### Decisões que o código registra

- **Centavos por etapa.** Cem linhas de R$ 0,10 produziriam
  `10.000000000000002`, e o erro viajaria até o overprice. Dinheiro não tem
  meio centavo.
- **Overprice só sobre saldo positivo.** Se as tarifas consumiram mais que o
  saldo, aplicar o percentual produziria overprice *negativo* — a Bass Pago
  devolvendo dinheiro por ter cobrado demais. O negativo é a informação: o
  saldo não cobre as tarifas, e a tela diz isso.
- **Volume zero é válido.** O produto existe no contrato e não foi usado;
  omiti-lo faria parecer que não está mais contratado.
- **O overprice vem do CADASTRO**, não do corpo da requisição: é condição
  comercial do parceiro, e aceitá-lo de fora deixaria o percentual ser
  escolhido lançamento a lançamento.

### Snapshot de tarifas

`LancamentoBaasItem` guarda **nome, preço e volume**. O preço é copiado de
propósito: se a tarifa do PIX passar de R$ 0,10 para R$ 0,15, o lançamento de
setembro continua valendo R$ 0,10. Apontar para o produto e ler o preço de lá
reescreveria o histórico a cada reajuste.

### Geração automática e idempotência

Ao lançar, três registros nascem — e **no máximo um de cada**:

| # | Registro | Conteúdo |
|---|---|---|
| 1 | `LancamentoFinanceiro` de RECEITA | tarifas + overprice, vinculado ao parceiro |
| 2 | `ContaReceber` | o título dessa receita |
| 3 | `LancamentoFinanceiro` de DESPESA | o valor residual devido ao cliente, PENDENTE |

**A idempotência é do BANCO.** As três FKs em `LancamentoBaas` são **UNIQUE**,
e `gerarTitulos` atualiza quando já existem. Chamar duas vezes não cria um
segundo conjunto, e quem garante é o índice — não a ordem das chamadas. Um
`UNIQUE (condicaoId, periodoInicio, periodoFim)` impede tarifar o mesmo
período duas vezes.

**Contas a Pagar lê `LancamentoFinanceiro` de despesa**, não uma tabela
própria — por isso o repasse ao cliente é um lançamento de despesa. Criar uma
segunda base de contas a pagar faria as duas discordarem.

O **título a receber** só nasce quando o número de conta casa com um cliente
cadastrado: `ContaReceber.clienteId` é obrigatório, e inventar um cliente para
satisfazer a FK criaria um registro fantasma. Sem cliente, a receita fica no
lançamento financeiro — que é onde ela conta — e a tela diz por que não houve
título.

### Estados

| Status | O que permite |
|---|---|
| **Rascunho** | editar e excluir; nenhum título gerado |
| **Lançado** | editar (recalcula e **atualiza** os títulos); fechar |
| **Fechado** | nada — há liquidação, e sobrescrever apagaria o que foi pago |

## 3. Conselho — governado por sócio

### O problema

A v21 gatava o Conselho por uma chave de permissão (`view_conselho`). O
usuário aparecia configurado "no contexto de Conselho" — departamento
CONSELHO, hierarquia Diretor — e **continuava bloqueado**, porque a chave era
outra metade que ninguém havia marcado. Duas fontes de verdade sobre o mesmo
acesso.

### A regra

Nasce **`User.isPartner`**: eixo próprio, uma coluna, um lugar.

**Nenhum outro eixo implica em sócio**, de propósito:

| Eixo | O que significa | Implica sócio? |
|---|---|---|
| Perfil **Admin** | administra o sistema | **não** |
| Hierarquia **Diretor** | está no topo da hierarquia | **não** |
| Departamento **Conselho** | trabalha com o conselho | **não** |

Inferir de qualquer um dos três daria falso positivo. `view_conselho` **saiu do
catálogo de permissões** — deixá-la ali daria a impressão de que conceder a
chave bastaria.

**João Lima** (`joaolima@basspago.com`) foi marcado como sócio. Verificado em
produção: `isPartner = true`.

### Os quatro eixos de governança

| Autorização | Governada por |
|---|---|
| **Conselho** | `isPartner` — sócio |
| **Auditoria** | chave restrita `view_auditoria` |
| **Lixeira de Leads** | hierarquia **Diretor** |
| **Gestor de Conta** | nenhuma das três — só estar ativo |

Cada confusão entre eles é travada por teste.

## 4. Leads — a Lixeira

### Excluir virou mover para a lixeira

A exclusão física obrigava a escolher entre **destruir o histórico de
pipeline** (cascade) ou **recusar a exclusão** (restrict) — e a constraint
`NO ACTION` do banco fazia a escolha virar um 500 silencioso. A lixeira não tem
de escolher: o lead sai de circulação e o passado continua legível.

`deletedAt` e `deletedById` são gravados. O lead:

- **sai** da lista, da busca e do seletor do Pipeline;
- **mantém** cards, movimentações, comentários e atividades, todos apontando
  para ele;
- **pode ser restaurado** por um Diretor.

`FILTRO_ATIVOS = { deletedAt: null }` é exportado como objeto para que o
esquecimento fique visível: uma consulta sem ele devolve leads descartados, e é
um erro silencioso — a lista volta a mostrar o que foi excluído.

**Cards não bloqueiam mais.** A recusa existia porque apagar levava o
histórico; mover não leva nada.

### A Lixeira

`/dashboard/leads/lixeira`, **registrada e oculta** (como os Funis). Restrita a
**hierarquia Diretor**, conferida no **banco** a cada requisição — um token de
sete dias faria um rebaixamento demorar uma semana para valer. A página, a API
e o proxy conferem; esconder a tela não impede um GET.

Cada linha mostra **quem descartou e quando**, e as contagens de cards,
comentários e atividades — a prova de que nada foi apagado. A consulta é
auditada.

**Restaurar** existe porque descartar por engano é comum, e a alternativa seria
recadastrar: dois registros para a mesma empresa, e o vínculo com os cards
antigos perdido.

## 5. Segmentos — entidade

Nasce `SegmentoComercial`: nome, slug, ativo, ordem. CRUD completo, pelo painel
**"Gerenciar segmentos"** dentro da Carteira — mesmo padrão de "Gerenciar
funis" dentro do Pipeline, porque é configuração de uma taxonomia, não um
ambiente.

**O enum `Segmento` continua.** Ele está gravado nas colunas antigas de
Cliente, Lead e Deal, e um enum não se apaga sem reescrever os dados que o
usam. Os dois convivem: `segmentoComercialId` é a fonte quando preenchido, e a
coluna enum é a retaguarda dos registros anteriores.

O **slug** é o que casa os dois: nos doze segmentos semeados, o slug é o próprio
valor do enum (`CRYPTO_EXCHANGES`). A migration semeou a tabela e vinculou os
registros existentes pelo slug — **14 clientes e 1 lead** foram casados, e nada
mudou de significado no dia da migration.

O slug **não muda ao renomear**: ele é a chave do vínculo legado, e reescrevê-lo
o desfaria.

### Exclusão

Só de segmento **sem uso**. Com cliente, lead ou card vinculado, a exclusão é
recusada com a contagem e a saída é **inativar**: o segmento sai dos seletores
e o vínculo histórico fica. Apagar zeraria o segmento desses registros pelo
`ON DELETE SET NULL` — perdendo a informação de que aquele cliente era daquele
segmento.

## 6. Clientes

### Edição

A tela **só criava** cliente. Agora edita: nome, CNPJ, e-mail, telefone,
modelo, segmento, data de fechamento, mensalidade de API, **número da conta**,
**gestor de conta** e **status**. A auditoria registra **o que mudou**, não só
que houve edição.

### Número da conta

**Opcional e nunca gerado** — inventar um número criaria um identificador que
não existe em lugar nenhum. É a chave que o Lançamento BaaS usa para achar o
cliente de um título, e entra na busca da Carteira.

### Gestor de Conta

É **responsabilidade pela conta, e nada além disso**. Não é Diretor, não é
sócio, não é Admin: qualquer usuário **ativo** é elegível, e filtrar por
hierarquia transformaria uma atribuição operacional em cargo. Pode ser
vinculado, trocado e **removido** — `gestorId: ''` significa remover, e tratar
string vazia como "não informado" tornaria a remoção impossível.

### Status e ordenação

A tela oferece **ATIVO** e **INATIVO**. O enum tem cinco valores (PROSPECCAO,
ENCERRADO, STANDBY vieram antes desta decisão) e eles ficam: há clientes
gravados com eles. A tela oferece dois; a leitura entende cinco.

**ATIVOS primeiro e alfabéticos, INATIVOS depois e alfabéticos.** A ordenação é
do **banco**, não da tela — ordenar em memória quebraria no dia em que a
listagem for paginada, com cada página ordenada só dentro de si mesma. Um
índice `(status, nome)` sustenta isso.

A busca cobre **nome, CNPJ e número da conta**, ignorando acento e caixa.
Filtros: status, modelo, segmento e gestor.

### "Últimos 5 dias" saiu

Era uma grade de marcação manual dentro da listagem: o gestor marcava à mão se
o cliente movimentou, e o dado não alimentava indicador nenhum — TPV e
transações vêm do Lançamento Diário, que é geral. Uma coluna de caixas de
marcação no meio da carteira competia com a informação que a tela existe para
dar.

## 7. Receita — a dupla contagem

### A regra

**As mensalidades de API já estão dentro da tarifa transacional.** É assim que
a Bass Pago cobra hoje: a mensalidade é apurada junto com o transacional, e o
que chega ao Lançamento Diário como `receitaTarifaria` já a contém.

Por isso, no Conselho, **Mensalidades é indicador e não soma no total**:

| Linha | Soma? |
|---|---|
| Transacional | sim |
| Setup | sim |
| **Mensalidades** | **não — indicador de recorrência** |
| Sustentação | sim |
| Serviços | sim |
| BaaS | sim |

Somá-la contaria o mesmo dinheiro duas vezes. **Omitir a linha seria pior**: a
pergunta "quanto é recorrente" não teria resposta na composição. Então ela
aparece, marcada como indicador, e a barra de proporção usa só as linhas que
somam — uma fatia de Mensalidades faria a proporção passar de 100%.

**Transacional é a Tarifária** — a mesma receita com o nome que o Conselho usa.
Nenhum rótulo diz "Tarifária" ao lado de "Transacional"; um teste verifica.

**Float** entrou em **Serviços**: as duas são receita realizada que não
pertence a nenhuma outra linha, e o Conselho tem seis tipos — criar um sétimo
contrariaria a lista oficial.

### Na Visão Geral Financeira

O KPI passou a se chamar **"Mensalidades de API BaaS + WL"**, e a tela diz em
voz alta que **MRR não se soma à receita realizada**: as mensalidades já estão
contadas em Receitas, e o MRR mede a recorrência contratada — é referência,
não uma segunda entrada de caixa.

MRR continua `Mensalidades + Sustentação`, sem contas ativas (v21).

## 8. Anexos — a visualização que não existia

**O defeito:** `urlAssinada` chamava `createSignedUrl` com `download: true`
**sempre**. Toda foto e todo PDF chegavam como **download forçado**, e não
havia como *visualizar* um comprovante — que é o caso comum.

**O que mudou:**

- `urlAssinada(chave, segundos, download)` — o default agora é **visualizar**;
- a rota aceita `?download=1` para forçar o download, e devolve `mime` e
  `visualizavel`;
- arquivo que o navegador não abre é sempre baixado, qualquer que seja o pedido
  — oferecer "visualizar" num `.xlsx` seria uma aba em branco;
- a tela mostra **tipo e tamanho** de cada anexo, com botões **Visualizar** e
  **Baixar** separados, e o nome do arquivo em envio;
- o seletor filtra pelos formatos aceitos (`accept`) — sem isso o usuário
  escolhe um `.mov` e descobre a recusa depois do upload inteiro;
- a auditoria distingue `ABRIU_ANEXO` de `BAIXOU_ANEXO`.

Formatos: **JPG, JPEG, PNG, WEBP, PDF**, além de DOC/DOCX/XLS/XLSX/CSV/TXT/ZIP.
Limite de **4 por lançamento**, validado no servidor — esconder o botão não
impede um POST. Bucket **privado**, signed URL de 60s.

## 9. Certificados

**Ordem numérica de verdade.** `identificacao` é texto, e a ordem alfabética
produzia `1, 10, 11, 2, 50` — a versão "2" aparecia depois de "11", e a lista
ficava ilegível justamente quando havia versões suficientes para precisar de
ordem. `compararIdentificacao` ordena numericamente quando os valores são
números, e identificações textuais ("2026-A") vão depois, em alfabético.

**Busca** por razão social, identificação da versão e **número do certificado
dentro do intervalo**: quem tem o certificado 37 na mão quer saber para quem
ele foi, e o registro que o contém diz "30 a 40" — não existe uma linha com
"37".

Cliente fora da base, AES-256-GCM e auditoria: inalterados.

## 10. Banco — migration v22

`supabase-migration-v22.sql`. **Incremental e idempotente.** Sem reset, sem
TRUNCATE, sem DROP de tabela, sem DELETE em massa.

| # | O que |
|---|---|
| 1 | `User.isPartner` (default false) |
| 2 | `Cliente.numeroConta` + índice `(status, nome)` |
| 3 | `Lead.deletedAt` / `deletedById` + índices |
| 4 | `SegmentoComercial` (tabela nova) |
| 5 | `segmentoComercialId` em Cliente, Lead e Deal |
| 6 | `CondicaoProduto` (tabela nova) |
| 7 | `LancamentoBaas` + `LancamentoBaasItem` + enum `StatusLancamentoBaas` |
| 8 | Semeadura de 12 segmentos, vínculo dos registros pelo slug, PIX/KYC como produtos |
| 9 | Categorias recriadas idempotentemente: Float, Setup, Sustentação, Tarifas BaaS, Repasse a Cliente BaaS |

**RLS.** As quatro tabelas novas entraram com `ENABLE ROW LEVEL SECURITY` e
**zero políticas** — deny-all para `anon` e `authenticated`, como as 48
existentes desde a v18. Verificado após a migration: nenhuma tabela do schema
`public` sem row security, nenhuma política criada.

**Dados**: `isPartner = true` para João Lima; `view_conselho` removida da lista
dele (o Conselho não é mais chave).

### O que continua no banco, de propósito

| Objeto | Por quê |
|---|---|
| enum `Segmento` | gravado nas colunas antigas; a tabela é a fonte nova |
| `ClienteStatus` com 5 valores | há clientes nos três legados |
| `CondicaoComercial.pix` / `.kyc` | semeados como produtos; as colunas ficam |
| `MetaTipo.MED_PERCENTUAL` | metas antigas gravadas com ele |
| `CategoriaFinanceira.natureza` | classifica a composição; saiu só da tela |
| `Deal.value`, `Deal.segmento` | legados, nunca exibidos |

## 11. Testes

`npm test` — **433 testes**.

| Arquivo | Cobre |
|---|---|
| `tests/lancamento-baas.test.ts` | a cascata completa; o overprice sobre o remanescente; **a conta fecha**; centavos; volume negativo e fracionário recusados; sobreposição de período |
| `tests/clientes.test.ts` | ATIVOS antes de INATIVOS, alfabéticos; acento não joga para o fim; busca por nome, CNPJ e conta; filtros combinados |
| `tests/segmentos.test.ts` | slug no formato do enum; vínculo vence o enum; ausência é null, nunca "Outros" |
| `tests/governanca.test.ts` | os **quatro eixos** não se confundem — sócio ≠ Diretor ≠ Admin ≠ gestor |
| `tests/leads.test.ts` | lixeira: filtro de ativos, quem e quando descartou |
| `tests/certificados.test.ts` | ordem numérica; busca por número dentro do intervalo |
| `tests/financeiro.test.ts` | Mensalidades não soma; "Tarifária" não aparece ao lado de "Transacional" |
| `tests/remocoes.test.ts` | RECEITA e FINANCEIRO separadas, nessa ordem; nenhuma função engole o prefixo de API de outra |

**`npx tsc --noEmit`** limpo · **`npm run lint`** limpo · **`npm run build`**
completo, 37 páginas.
