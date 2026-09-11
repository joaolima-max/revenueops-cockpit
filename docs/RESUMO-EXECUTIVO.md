# RevenueOps Cockpit — Resumo Executivo

**Bass Pago RevOps** · Versão 1.0 · 10 de setembro de 2026
Commit `4890630` · Production: `revenueops-cockpit.vercel.app`

---

## O que é

O sistema interno de operação e gestão da Bass Pago. Concentra num único lugar a
informação que antes vivia em planilhas separadas: quanto a operação processou,
quanto faturou, em que estágio está cada cliente, o que o Compliance precisa
resolver e quais documentos existem de cada conta.

## O problema que resolve

Três perguntas precisavam ter **uma resposta única**, não uma por departamento:
quanto processamos e ganhamos, em que estágio está cada cliente, e o que está
pendente com quem.

A regra que atravessa todo o sistema: **cada indicador tem uma fonte oficial, e
quando não há dado o valor é vazio — nunca zero.** Um zero falso parece uma
medição; um vazio honesto não engana ninguém.

## O que ele não é

Não processa pagamento, não é ERP nem contabilidade, não faz reconciliação, não
mede TPV por cliente, e não é produto para o cliente final — com uma exceção: o
link público de formulário.

## Os módulos

| Área | Módulos |
|---|---|
| **Executivo** | Cockpit, Conselho |
| **Receita** | Lançamento Diário, Metas, Relatórios |
| **Carteira** | Clientes, Volumetria, Alertas, Documentos, Certificados |
| **Operações** | Incidentes, Tarefas, Métricas Op., Compliance |
| **Comercial** | Pipeline, Funis, Leads, Follow-up, CRM, Formulários |
| **Financeiro** | Contas a Receber |
| **Admin** | Usuários, Parâmetros, Auditoria, Automações |

## Os quatro perfis

**Administrador** — acesso global · **Gestor** — carteira e comercial ·
**Operador** — execução operacional, onboarding, compliance · **Comercial** —
leads e vendas, só os próprios negócios.

Além do papel, cada funil tem **alçada própria**: quem vê, edita, move, cria,
transfere e administra. A autorização é sempre decidida no servidor.

## Números do sistema

| | |
|---|---|
| Modelos de dados | 35 |
| Rotas de API | 67 |
| Telas | 34 |
| Testes automatizados | **104**, todos passando |
| Migrations versionadas | 14 (v1 a v15) |
| Linhas de código | ~21.300 |

## Estado em Production

Banco migrado e verificado: 41 tabelas, 31 enums, 67 chaves estrangeiras, 100
índices, **drift zero** contra o schema. Bucket de arquivos privado, validado —
URL pública bloqueada, link assinado expira em 60 segundos. Segredos fora do
navegador, garantido estruturalmente.

## As decisões que definem o produto

1. **Uma fonte por indicador.** Só `LancamentoDiario` grava TPV, receita, saldo,
   transações e MEDs.
2. **O CRM não tem base própria.** É analítica sobre o histórico do Pipeline —
   duas verdades sobre o mesmo fato divergiriam no primeiro bug.
3. **O Float é derivado, nunca digitado.** Se pudesse ser lançado, deixaria de
   ser medição e viraria opinião.
4. **Um único card atravessa os três funis.** Vendas → Onboarding → Operações,
   preservando lead, cliente e histórico.
5. **Automação nunca derruba a operação.** Roda depois do commit; falha vira log.
6. **Versão de formulário respondida é imutável.** Editar cria a próxima.
7. **Nada é excluído.** Funis, etapas, documentos, envios e usuários são
   inativados — o histórico sempre resolve.
8. **Senha de certificado é cifrada com AES-256-GCM**, revelada só por
   administrador, sempre auditada, e copiada para a área de transferência sem
   aparecer na tela.

## O que precisa de atenção

**ALTO — o smoke test autenticado nunca foi executado.** As telas com sessão
foram validadas por compilação, testes de domínio e escrita real contra o banco,
mas nunca clicadas em Production.

**ALTO — a chave de criptografia de certificados existe apenas no Vercel.** Sem
cópia em cofre, perder acesso torna irrecuperável qualquer senha já cifrada.
Como ainda não há certificado emitido, rotacionar hoje custa zero.

**MÉDIO** — quatro rotas antigas sem permissão granular; seis tabelas legadas
vazias no banco; dois componentes órfãos; ausência de testes de integração.

Nenhum item **crítico**.

## Próximos passos sugeridos

**Curto prazo:** executar o smoke test autenticado, guardar a chave de
criptografia em cofre, fechar as quatro rotas antigas, remover o código órfão,
ligar um banco ao ambiente de Preview.

**Médio prazo:** testes de integração nas rotas sensíveis, aposentar o campo
legado `Deal.stage`, decidir sobre a unificação dos papéis Comercial e Gestor.

**Longo prazo:** ampliar automações, relatórios sobre respostas de formulário,
retenção de auditoria.
