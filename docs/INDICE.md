# Índice Estrutural — Documentação RevenueOps Cockpit

> **Comece por [`RODADA-V29.md`](./RODADA-V29.md)** — a rodada mais recente:
> o **histórico diário foi normalizado** — de fevereiro a setembro cada mês
> tinha um lançamento só, com o valor do mês inteiro, e os oito consolidados
> foram distribuídos dia a dia com **soma idêntica ao original** (migration
> v29, com conferência que aborta em qualquer divergência); o piso dos gráficos
> desceu de 01/10 para **01/06/2026**, e as janelas de 30 e 90 dias passaram a
> medir o que prometem; a **sidebar** foi consolidada — 7 seções e 24 itens
> viraram **6 e 19**, sem perder nenhuma tela: **CP / CR** (Contas a Pagar +
> Contas a Receber + Lançamentos), **Condições BaaS** (absorveu Lançamentos
> BaaS) e **Clientes** (absorveu Volumetria e Certificados), e o Cockpit virou
> **Home**; a Previsão ganhou **receita prevista automática** (MRR projetado +
> quatro metas de receita), com a origem de cada parcela e navegação profunda;
> **três tipos novos de meta** (Lançamentos WL/BaaS, Serviços, Setup); um
> **serviço central de comparação temporal** com quatro granularidades, em que
> as duas janelas têm sempre o mesmo tamanho; e os **três gráficos mensais**
> deixaram de desenhar zero onde o que havia era ausência de cadastro.
>
> Antes dela, [`RODADA-V23.md`](./RODADA-V23.md):
> o **Conselho foi corrigido** — o proxy barrava o sócio porque lia `isPartner`
> de um token de 7 dias que não tinha o campo, e a autoridade passou para a
> página, que lê do banco; **Usuários** ganham alçadas próprias
> (`view_usuarios` e `manage_usuarios`, separadas), com o controle de **sócio**
> na tela; a Sidebar fecha com **RECEITA** em dois itens e **Lançamentos BaaS
> em FINANCEIRO**; as **metas de pipeline** caem para duas (Geração de Leads e
> **Conversão de Fechamento**); e as **tarifas de Condições BaaS viraram
> produtos** com unidade, acabando com as duas fontes de preço.
>
> Antes dela, [`RODADA-V22.md`](./RODADA-V22.md):
> **RECEITA** volta a ser seção própria (Metas, Lançamento Diário e o novo
> **Lançamento BaaS**), separada de FINANCEIRO; nasce o **Lançamento BaaS**,
> que tarifa o volume do parceiro e gera lançamento, título a receber e título
> a pagar de forma idempotente, com **snapshot de tarifas**; o **Conselho**
> passa a ser governado por **`isPartner`** (sócio) e o acesso de João Lima foi
> corrigido; excluir um Lead virou **mover para a Lixeira**, restrita a
> **Diretores**; **Segmentos** viraram entidade com CRUD; Clientes ganham
> **edição**, número da conta, gestor e ordenação ATIVOS→INATIVOS; as
> **Mensalidades deixam de somar** na receita (já estão na tarifa transacional);
> e o **anexo** passou a poder ser visualizado — antes todo arquivo vinha como
> download forçado.
>
> Antes dela, [`RODADA-V21.md`](./RODADA-V21.md):
> **Conselho e Auditoria** passam a exigir chave explícita (ser ADMIN não
> basta, e a conferência é no banco a cada requisição); Usuários ganham
> **Departamento** e **Hierarquia**; nasce o **motor de lembretes** (tarefas,
> follow-up, compliance, contas a pagar/receber e Lançamento Diário), idempotente
> por chave única; a **Visão geral** do Comercial ganha analítica de leads
> (segmento, etapa, segmento × etapa, **atividade assistida**, comparativos) e
> **metas de pipeline**; o Cockpit ganha **velas** de TPV, Receita e Transações,
> com BaaS e White Label em séries separadas; **MRR = Mensalidades +
> Sustentação** (conta ativa sai); o Conselho passa a ter os seis tipos de
> receita; e a **exclusão de Lead** foi corrigida — era um 500 silencioso
> causado por FK `NO ACTION`.
>
> Antes dela, [`RODADA-V20.md`](./RODADA-V20.md):
> Incidentes absorve **Métricas Operacionais**; CRM vira **Visão geral** e abre
> o Comercial; **Funis** sai do menu e vira área interna do Pipeline; **MED
> passa a ser um indicador só**, governado pela unidade; Contas a Receber deixa
> de criar título (todo título nasce em Lançamentos); **Natureza** sai da tela
> de Categorias; e o Cockpit ganha dez gráficos, com Acompanhamento de metas
> abaixo deles.
>
> Antes dela, [`RODADA-V18.md`](./RODADA-V18.md):
> RLS fechada no banco (a leitura pública de dados privados estava aberta),
> **Acompanhamento de metas** no Cockpit (projetado × realizado, pacing),
> o menu passa a ser **Condições BaaS**, certificado para **cliente que saiu
> da base**, e Contas a Receber / Tarefas / Follow-ups padronizadas.
>
> Antes dela, [`RODADA-V17.md`](./RODADA-V17.md).
> Nela: Ganho e Perdido deixam de ser etapas do Pipeline e viram **resultado**
> do card (que perdeu o valor financeiro); Metas ganham **direção** e
> **unidade** (meta de MED em 2%); Lançamentos ganham data de vencimento,
> fornecedor, vínculo com BaaS/White Label e recorrência indefinida; nasce
> **Contas a Pagar**; a Visão Geral Financeira vira visual; e a logo oficial da
> Bass Pago entra no topo do sistema.
>
> Em seguida, [`RODADA-V16.md`](./RODADA-V16.md) — remodelagem de Operações e
> Financeiro. Os capítulos 15 (Documentos), 18 (Automações) e 19 (Formulários)
> descrevem ambientes que **não existem mais**, e os capítulos 5, 7, 8 e 11
> mudaram de conteúdo. Ficam abaixo como registro histórico.
>
> A v16 também derivou o downtime de Incidentes, restringiu edição/exclusão de
> Incidentes e de Volumetria a ADMIN e adicionou exclusão de etapa de funil.
>
> **Capítulos superados pela v17:** 8 (Dashboard — Float e Margem saíram),
> 12 (CRM — analítica reescrita sobre o resultado), 13 (Pipeline — etapa ×
> resultado) e 23 (Testes — 192).

Arquivo principal: **`DOCUMENTACAO-COMPLETA.md`** (29 capítulos)

| # | Capítulo | Conteúdo |
|---|---|---|
| 1 | **O que é o RevenueOps Cockpit** | propósito, problema central, o que não é, perfis, camadas de leitura |
| 2 | **Estado real do sistema** | métricas apuradas do repositório e do banco |
| 3 | **História e evolução** | origem, refatoração dos KPIs, redesign, v10–v15, consolidação |
| 4 | **Decisões de arquitetura** | os 10 porquês estruturantes |
| 5 | **Usuários e permissões** | papéis, chaves (33 na v16), matriz, alçada por funil, server-side |
| 6 | **Arquitetura técnica** | stack, fluxo de requisição, fluxo de arquivo, domínio × dados, registro de módulos |
| 7 | **Catálogo do banco** | visão conceitual, classificação, modelos (33 na v16), enums com regra |
| 8 | **Dashboard** | KPIs e origens, linhas de faturamento (4 na v16), metas, insights |
| 9 | **Float** | conceito, fórmula, exemplo numérico, gaps, multiplicador versionado |
| 10 | **Volumetria** | conceito, volumetria × TPV, consolidação, status, não sobreposição |
| 11 | **Carteira Comercial** | gestor, expectativa, indicador dos 5 dias, por que não é TPV |
| 12 | **CRM** | cadastro, por que sem entidade própria, as 7 métricas |
| 13 | **Pipeline multi-funil** | 3 funis, vocabulário, mover × transferir, passo a passo, administração |
| 14 | **Notificações** | modelo, produtores, interface, notificação × alerta |
| 15 | ~~**Documentos**~~ | **ambiente removido na v16**; anexos vivem em Financeiro → Lançamentos |
| 16 | **Certificados** | estoque × envio, numeração relativa, AES-256-GCM, revelação auditada |
| 17 | **Compliance** | modelo, máquina de estados, prazo, fluxo operacional |
| 18 | ~~**Automações**~~ | **removido na v16** |
| 19 | ~~**Formulários**~~ | **removido na v16** |
| 20 | **Auditoria** | o que é auditado, os dois casos sensíveis, o que não é registrado |
| 21 | **Segurança** | autenticação, 3 camadas de autorização, segredos, storage, criptografia |
| 22 | **Design System** | filosofia, tipografia, tokens, Light/Dark, componentes |
| 23 | **Testes** | estratégia, 142 testes por área (v16), o que a suíte não cobre |
| 24 | **Deploy e infraestrutura** | ambientes, processo, migrations, conexões, armadilha do alias |
| 25 | **Manutenção** | como alterar schema, permissão, API, automação, campo; invariantes |
| 26 | **Limitações e débitos** | CRÍTICO / ALTO / MÉDIO / BAIXO |
| 27 | **Roadmap** | curto, médio e longo prazo |
| 28 | **Glossário** | 38 termos do domínio |
| 29 | **Diagramas** | 8 diagramas consolidados |

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `docs/RODADA-V18.md` | **a rodada mais recente** — RLS, metas analytics, Condições BaaS, certificados |
| `docs/RODADA-V17.md` | pipeline por resultado, metas com direção, financeiro, marca |
| `docs/RODADA-V16.md` | rodada anterior — remoção de ambientes, incidentes, financeiro |
| `docs/DOCUMENTACAO-COMPLETA.md` | documento integral, editável |
| `docs/RESUMO-EXECUTIVO.md` | 2 páginas para diretoria e conselho |
| `docs/INDICE.md` | este índice |
| `docs/Bass_Pago_RevOps_Cockpit_Documentacao_Completa.pdf` | versão final para distribuição |
| `docs/DEPLOY-CHECKLIST.md` | procedimento operacional de publicação (pré-existente) |

## Como usar

| Quem | Comece por |
|---|---|
| **Diretoria / Conselho** | `RESUMO-EXECUTIVO.md` · depois caps. 1, 8, 9, 26 |
| **Novo desenvolvedor** | caps. 6, 7, 4 · depois 25 e 23 |
| **Novo gestor comercial** | caps. 1, 11, 12, 13 |
| **Operação** | caps. 13, 15, 16, 17, 14 |
| **Compliance / auditoria** | caps. 17, 20, 21, 16 |
| **Quem vai publicar** | cap. 24 e `DEPLOY-CHECKLIST.md` |
