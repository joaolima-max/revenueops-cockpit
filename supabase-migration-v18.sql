-- Migration v18: fechar a leitura publica das tabelas de dados (RLS)
--
-- POR QUE EXISTE
--
--   30 das 48 tabelas do schema `public` estavam SEM row level security. O
--   Supabase concede SELECT/INSERT/UPDATE/DELETE aos papeis `anon` e
--   `authenticated` por padrao, e o PostgREST expoe o schema `public` na
--   internet. Como a chave anon e `NEXT_PUBLIC_` e portanto viaja no bundle do
--   navegador, qualquer pessoa que abrisse o aplicativo e copiasse a chave lia
--   essas tabelas direto, sem passar por autenticacao nenhuma.
--
--   Confirmado por sondagem antes da correcao:
--     GET /rest/v1/LancamentoDiario  ->  HTTP 200, linha real (TPV, receita
--                                        tarifaria, transacoes)
--
--   Entre as 30 expostas estavam:
--     Certificado                 senha cifrada dos certificados
--     CondicaoComercial           taxas e mensalidades dos parceiros
--     LancamentoFinanceiro        receita e despesa
--     LancamentoDiario            TPV, receita tarifaria, MEDs
--     PendenciaCompliance         pendencias de compliance por cliente
--     PipelineMovimentacao        historico comercial
--     Documento                   metadados de arquivo
--
--   As outras 18 ja tinham RLS ligada e nenhuma politica — por isso `User`
--   respondia vazio na mesma sondagem. Esta migration estende esse mesmo
--   estado as 30 restantes.
--
-- A SOLUCAO MINIMA
--
--   `ENABLE ROW LEVEL SECURITY`, sem criar politica nenhuma. Sem politica, a
--   tabela nega tudo para quem esta sujeito a RLS.
--
--   Nao e preciso escrever regra de negocio no banco porque NINGUEM deveria
--   chegar por esse caminho: a autorizacao do produto vive em
--   lib/permissions.ts e lib/pipeline.ts, e e aplicada nas rotas. Uma politica
--   aqui seria uma segunda descricao da mesma regra, livre para divergir.
--
-- POR QUE ISSO NAO QUEBRA O APLICATIVO
--
--   O produto NAO usa PostgREST para dado nenhum. Ha exatamente dois caminhos
--   de acesso, e os dois passam por cima de RLS:
--
--     1. Prisma -> conexao Postgres direta (DATABASE_URL), no papel `postgres`.
--        Verificado: `postgres` e DONO das 48 tabelas e tem rolbypassrls.
--     2. Supabase Storage -> server-side, com SUPABASE_SERVICE_ROLE_KEY, no
--        papel `service_role` (rolbypassrls) — e operando no schema `storage`,
--        nao neste.
--
--   Quem NAO passa por cima: `anon`, `authenticated` e `authenticator`
--   (rolbypassrls = false). Exatamente os papeis que nao deveriam ler nada.
--
--   Nao ha formulario publico a preservar: o ambiente Formularios saiu do
--   produto na v16, junto com a pagina `/f/` e a API `/api/formularios/publico`
--   (ver PUBLIC_PATHS em proxy.ts — so `/login` e `/api/auth/login`).
--
-- O QUE NAO E FEITO, DE PROPOSITO
--
--   * FORCE ROW LEVEL SECURITY — sujeitaria o DONO (postgres) a RLS e
--     derrubaria o Prisma. Nao usar aqui.
--   * REVOKE dos grants de anon/authenticated — RLS ja nega; revogar mexeria
--     em mais superficie do que o necessario para fechar o buraco.
--   * Qualquer politica — ver acima.
--
-- EFEITO OBSERVAVEL
--
--   Leitura anon : HTTP 200 com lista VAZIA (RLS filtra as linhas, nao
--                  derruba a requisicao). Nenhum dado vaza.
--   Escrita anon : HTTP 401 — "new row violates row-level security policy".
--   Backend      : inalterado.
--
-- NAO destrutiva: nao altera dado, coluna, tipo, indice ou constraint.
-- Idempotente: habilitar RLS em tabela que ja tem e no-op.
--
-- ATENCAO PARA O FUTURO
--   Tabela NOVA nasce sem RLS. Ao criar uma, acrescente o ENABLE aqui — ou o
--   advisor de seguranca do Supabase volta a acusar `rls_disabled_in_public`.

ALTER TABLE "Automacao"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomacaoExecucao"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoriaFinanceira"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certificado"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificadoEnvio"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificadoVersao"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClienteDiaMovimento"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CondicaoComercial"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CondicaoComercialHistorico" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealComentario"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Documento"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FloatConfig"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Formulario"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormularioAnexo"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormularioLink"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormularioResposta"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormularioVersao"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fornecedor"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LancamentoAnexo"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LancamentoDiario"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LancamentoFinanceiro"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadComentario"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacao"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendenciaCompliance"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendenciaEvento"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineEtapa"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineFunil"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineMovimentacao"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelinePermissao"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolumetriaMinima"           ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- VERIFICACAO
-- ===========================================================================

DO $$
DECLARE
  n_tabelas BIGINT; n_rls BIGINT; n_sem BIGINT; n_force BIGINT; n_pol BIGINT;
BEGIN
  SELECT count(*) INTO n_tabelas FROM pg_tables WHERE schemaname = 'public';
  SELECT count(*) INTO n_rls     FROM pg_tables WHERE schemaname = 'public' AND rowsecurity;
  SELECT count(*) INTO n_sem     FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  SELECT count(*) INTO n_pol     FROM pg_policies WHERE schemaname = 'public';
  SELECT count(*) INTO n_force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;

  RAISE NOTICE '--- migration v18 aplicada ---';
  RAISE NOTICE 'tabelas em public:        %', n_tabelas;
  RAISE NOTICE 'com RLS:                  %', n_rls;
  RAISE NOTICE 'SEM RLS (deve ser 0):     %', n_sem;
  RAISE NOTICE 'com FORCE (deve ser 0):   %', n_force;
  RAISE NOTICE 'politicas (deve ser 0):   %', n_pol;

  IF n_sem > 0 THEN
    RAISE EXCEPTION 'Ainda ha % tabela(s) sem RLS em public.', n_sem;
  END IF;
  IF n_force > 0 THEN
    RAISE EXCEPTION 'FORCE RLS ativo em % tabela(s) — isso derruba o Prisma.', n_force;
  END IF;
END $$;
