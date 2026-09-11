# Índice Estrutural — Documentação RevenueOps Cockpit

Arquivo principal: **`DOCUMENTACAO-COMPLETA.md`** (29 capítulos)

| # | Capítulo | Conteúdo |
|---|---|---|
| 1 | **O que é o RevenueOps Cockpit** | propósito, problema central, o que não é, perfis, camadas de leitura |
| 2 | **Estado real do sistema** | métricas apuradas do repositório e do banco |
| 3 | **História e evolução** | origem, refatoração dos KPIs, redesign, v10–v15, consolidação |
| 4 | **Decisões de arquitetura** | os 10 porquês estruturantes |
| 5 | **Usuários e permissões** | papéis, 42 chaves, matriz, alçada por funil, server-side |
| 6 | **Arquitetura técnica** | stack, fluxo de requisição, fluxo de arquivo, domínio × dados, registro de módulos |
| 7 | **Catálogo do banco** | visão conceitual, classificação, 35 modelos, enums com regra |
| 8 | **Dashboard** | KPIs e origens, 5 linhas de faturamento, metas, insights, alertas |
| 9 | **Float** | conceito, fórmula, exemplo numérico, gaps, multiplicador versionado |
| 10 | **Volumetria** | conceito, volumetria × TPV, consolidação, status, não sobreposição |
| 11 | **Carteira Comercial** | gestor, expectativa, indicador dos 5 dias, por que não é TPV |
| 12 | **CRM** | cadastro, por que sem entidade própria, as 7 métricas |
| 13 | **Pipeline multi-funil** | 3 funis, vocabulário, mover × transferir, passo a passo, administração |
| 14 | **Notificações** | modelo, produtores, interface, notificação × alerta |
| 15 | **Documentos** | categorias, upload, validação, signed URL, inativação |
| 16 | **Certificados** | estoque × envio, numeração relativa, AES-256-GCM, revelação auditada |
| 17 | **Compliance** | modelo, máquina de estados, prazo, fluxo operacional |
| 18 | **Automações** | no-code, por que sem event bus, depois da transação, as 4 ações |
| 19 | **Formulários** | 5 modelos, 24 tipos de campo, construtor, versionamento, link público, anexos |
| 20 | **Auditoria** | o que é auditado, os dois casos sensíveis, o que não é registrado |
| 21 | **Segurança** | autenticação, 3 camadas de autorização, segredos, storage, criptografia |
| 22 | **Design System** | filosofia, tipografia, tokens, Light/Dark, componentes |
| 23 | **Testes** | estratégia, 104 testes por área, o que a suíte não cobre |
| 24 | **Deploy e infraestrutura** | ambientes, processo, migrations, conexões, armadilha do alias |
| 25 | **Manutenção** | como alterar schema, permissão, API, automação, campo; invariantes |
| 26 | **Limitações e débitos** | CRÍTICO / ALTO / MÉDIO / BAIXO |
| 27 | **Roadmap** | curto, médio e longo prazo |
| 28 | **Glossário** | 38 termos do domínio |
| 29 | **Diagramas** | 8 diagramas consolidados |

## Arquivos

| Arquivo | Conteúdo |
|---|---|
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
