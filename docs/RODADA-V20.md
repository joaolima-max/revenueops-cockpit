# Rodada v20 — Consolidação de telas, MED como indicador único e o Cockpit analítico

> Documento da rodada. Complementa [`RODADA-V18.md`](./RODADA-V18.md) (RLS,
> Acompanhamento de metas, Condições BaaS) e [`RODADA-V17.md`](./RODADA-V17.md)
> (pipeline por resultado, financeiro remodelado).

Esta rodada **não alterou o banco**. Nenhuma migration foi aplicada: o schema
que a v19 deixou já comporta tudo o que mudou aqui. Histórico financeiro, de
pipeline, de compliance, de incidentes e a auditoria ficam intactos.

---

## Sumário

| Área | O que mudou |
|---|---|
| **Incidentes** | Absorveu Métricas Operacionais. Indicadores em cima, registro embaixo, uma tela só. |
| **Comercial** | CRM vira **Visão geral** e abre a seção, antes do Pipeline. |
| **Pipeline** | **Funis** deixa de ser menu e passa a ser área interna, sob `/dashboard/pipeline/funis`. |
| **Metas** | **MED é um indicador só.** A unidade (% ou quantidade) decide cálculo, comparação e formato. |
| **Contas a Receber** | Deixa de criar título. Todo título nasce em **Lançamentos**. |
| **Categorias** | O campo **Natureza** sai da tela. A natureza passa a ser derivada no servidor. |
| **Cockpit** | Dez gráficos de série real; **Acompanhamento de metas** desce para baixo deles. |
| **Permissões** | `view_metricas_op` sai do catálogo junto com a tela. |

---

## 1. Incidentes absorve Métricas Operacionais

As métricas operacionais **são derivadas dos incidentes**: total, em aberto,
downtime acumulado, MTTR, distribuição por criticidade e volume mensal saem
todos da mesma tabela. Mantê-las numa tela separada obrigava a abrir duas telas
para ler o mesmo fato — e a conferir de memória se o número do painel batia com
a linha do registro.

Agora a leitura e a operação estão na mesma página, nessa ordem:

1. **Métricas operacionais** — quatro indicadores, criticidade e seis meses.
2. **Registro de incidentes** — a lista, com registrar/editar/excluir.

O cálculo acontece **no servidor, a partir da mesma consulta que alimenta a
lista**. Não há segunda query nem segunda regra: o downtime sai de
`calcularDowntime`, exatamente como na lista, e o MTTR é a média desses mesmos
números. Um incidente isolado tem MTTR igual ao próprio downtime.

Só os **encerrados** entram no acumulado e na média. A duração de um incidente
aberto ainda está crescendo, e somá-la faria o total mudar a cada refresh.

Edição e exclusão continuam **restritas a ADMIN**, como na v16.

- `app/dashboard/metricas-op/` — **removido**
- `components/incidentes/MetricasOperacionais.tsx` — novo
- `app/dashboard/incidentes/page.tsx` — calcula e compõe as duas áreas

## 2. Comercial — "Visão geral" abre a seção

O menu **CRM** passou a se chamar **Visão geral** e subiu para o topo de
Comercial, antes do Pipeline: é a leitura agregada (evolução, conversão por
responsável, distribuição por resultado), e lê-la antes de abrir o quadro é a
ordem natural de trabalho.

A rota `/dashboard/crm` **não mudou**, nem a chave de permissão `view_crm`.
Renomear a chave invalidaria a permissão já gravada em cada usuário, e todos
perderiam o acesso de uma vez. Só o rótulo mudou — em `lib/modules.ts` e no
catálogo de permissões.

## 3. Funis sai do menu e entra no Pipeline

Administrar funil e etapa é configuração do Pipeline, não um ambiente paralelo.
Os funis passaram para `/dashboard/pipeline/funis`, alcançáveis pelo botão
**Gerenciar funis** dentro do Pipeline.

A função **continua registrada** em `lib/modules.ts`, marcada `oculto: true`.
Apagar o registro teria liberado `/api/pipeline/funis` para qualquer
autenticado — caminho não registrado é caminho permitido. Oculto, ela some da
sidebar e do fallback de primeira rota, mas **mantém `roles: ['ADMIN']`**.

Isso expôs um problema real em `checkAccess`: a rota nova casa com **duas**
funções — Pipeline por prefixo (aberto ao comercial) e Funis pela rota exata
(só ADMIN). A resolução passou a ser pela **rota mais específica**, senão a
permissão aberta do Pipeline venceria e qualquer comercial administraria funil.

**Ganho e Perdido continuam não sendo etapas** — são resultado do card, como a
v17 definiu.

## 4. MED — um indicador, duas unidades

Existiam dois tipos para o mesmo conceito: `MEDS` e `MED_PERCENTUAL`. Duas
metas concorrentes para o mesmo indicador, e nenhuma forma de dizer qual valia.

Agora **MED é um tipo só**, e a **unidade** decide tudo:

| Unidade | Realizado | Formato | Acumula no mês | Projeção |
|---|---|---|---|---|
| `PERCENTUAL` | `percentMed` | `1,50%` | não | não projeta — é uma taxa |
| `QUANTIDADE` | `qtdMed` | `150` | sim | projeta pelo ritmo do mês |

O padrão de MED nasce `PERCENTUAL` / `MENOR_MELHOR`: MED é erro, e menos é
melhor. Nada disso está hardcoded — `realizadoPorTipo(kpis, unidade)` escolhe a
série pela unidade, e `acumulaNoMes(tipo, unidade)` decide a projeção.

`MED_PERCENTUAL` **saiu da criação** mas **continua no enum do banco e no
Prisma**: metas antigas gravadas com ele precisam continuar legíveis. Removê-lo
do schema quebraria a leitura de linhas que existem.

## 5. Contas a Receber não cria mais título

Havia dois caminhos para o mesmo fato: criar o lançamento e criar o título.
Quem usasse os dois gerava a receita duas vezes.

**Todo título nasce em Lançamentos.** Ao criar um lançamento de receita, um
cliente e a opção *"Gerar título em Contas a Receber"* produzem um título por
linha gerada — inclusive nas parcelas de uma recorrência.

Contas a Receber permanece como **tela de acompanhamento**: filtrar, baixar,
cancelar, ver situação e atraso. O estado vazio aponta para Lançamentos.

## 6. Categorias sem Natureza

O campo **Natureza** saiu da tela — e **nada o substituiu**. Pedir ao usuário
que classificasse a natureza de uma categoria chamada "Float" era pedir que
repetisse uma informação que o próprio nome já carrega, com a chance de
divergir dele.

A natureza passou a ser **derivada no servidor** pelo nome e pelo tipo
(`naturezaPeloNome`), no POST e no PUT. A coluna `natureza` continua no banco e
continua alimentando os relatórios de receita por natureza — o que saiu foi a
digitação, não o dado.

**Continua não havendo subcategoria.**

## 7. Cockpit — dez gráficos e as metas embaixo

A ordem da página inverteu: **gráficos primeiro, Acompanhamento de metas
depois**. A leitura começa pelo que aconteceu e termina no quanto falta.

Dez séries, todas sobre dado real, nenhuma inventada:

| Gráfico | Série |
|---|---|
| TPV | volume transacionado por mês |
| Receita | receita tarifária por mês |
| Transações | quantidade de transações |
| Saldo | saldo médio em conta |
| MEDs | conforme a unidade da meta vigente |
| Clientes ativos | clientes com atividade no mês |
| Parceiros | BaaS e White Label ativos |
| Take rate | receita sobre TPV |
| Atividade operacional | incidentes e tarefas |
| MRR | receita recorrente |

Sem dado, o gráfico mostra ausência — **nunca zero**. Valores monetários saem
sempre por extenso (`R$ 4.250.000,00`): **nunca BI, MM, M ou K**, nem no eixo,
nem no tooltip. A ordem dos cards é arrastável e persiste por navegador
(`dashboard_chart_order_v3`), lida por `useSyncExternalStore` — ler
`localStorage` dentro de `useEffect` com `setState` viola as regras do React
Compiler.

## 8. Permissões — a chave de uma tela que não existe

`view_metricas_op` continuava no catálogo e nos perfis padrão, sem ser
verificada em lugar nenhum. O administrador via na tela de Usuários uma
permissão que não abria nada.

A chave saiu de `ALL_PERMISSIONS` e de `DEFAULT_PERMISSIONS`. Um teste novo
trava o invariante que havia quebrado: **todo perfil padrão só concede chaves
que existem no catálogo**.

Permissões já gravadas em usuários não foram tocadas — a chave simplesmente
deixa de ser oferecida e deixa de ser concedida a novos perfis.

> Pendência registrada, fora do escopo desta rodada: `view_metricas` e
> `view_pedidos` também não são verificados em lugar nenhum. Entraram antes
> desta rodada e foram deixados como estão.

---

## 9. Navegação final

```
Cockpit        Dashboard · Carteira · Forecast
Financeiro     Visão Geral · Lançamentos · Contas a Pagar · Contas a Receber
               Categorias · Fornecedores · Condições BaaS
Operações      Incidentes · Volumetria · Tarefas · Compliance · Certificados
Comercial      Visão geral · Pipeline · Leads · Follow-up
Admin          Usuários · Auditoria · Notificações · Conselho
```

Não aparecem, por decisão: **CRM**, **Funis**, **Métricas Operacionais**,
**Condições Comerciais BaaS**. E seguem removidos desde as rodadas anteriores:
Relatórios, Documentos, Alertas, Parâmetros, Formulários e Automações.

---

## 10. Banco

**Nenhuma migration nesta rodada.** O schema da v19 já comportava tudo.

O que **continua** no banco e foi deliberadamente preservado:

| Objeto | Por quê |
|---|---|
| `MetaTipo.MED_PERCENTUAL` | metas antigas gravadas com esse tipo |
| `CategoriaFinanceira.natureza` | alimenta receita por natureza; saiu só da tela |
| `CategoriaNatureza` | enum em uso pela coluna acima |
| RLS nas 48 tabelas | fechada na v18, intocada aqui |

---

## 11. Testes

`npm test` — **250 testes**.

| Arquivo | O que ganhou |
|---|---|
| `tests/remocoes.test.ts` | Funis fora do menu mas registrado e restrito; rota mais específica vence; "Visão geral" antes de Pipeline; CRM e Métricas fora da sidebar; catálogo de permissões coerente |
| `tests/metas.test.ts` | MED percentual × quantidade, com a unidade governando projeção e comparação |

Os três testes de "Funil e Pipeline em rotas irmãs" foram **substituídos**, não
apagados: afirmavam a arquitetura anterior, e as novas asserções cobrem o mesmo
risco (administrar funil não pode vazar para quem opera o pipeline).
