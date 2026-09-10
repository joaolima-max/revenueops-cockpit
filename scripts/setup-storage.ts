/**
 * Prepara o bucket privado `cliente-arquivos` no Supabase Storage.
 *
 *   npm run setup:storage
 *
 * Idempotente: se o bucket ja existe, apenas confere que ele NAO e publico.
 * Exige SUPABASE_SERVICE_ROLE_KEY, que so existe no servidor — por isso este
 * script roda pela CLI, nunca pela aplicacao.
 */

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { BUCKET, TAMANHO_MAX, EXTENSOES_ACEITAS } from '../lib/storage'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    'Faltam variaveis. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY\n'
    + '(server-only — a service role key NUNCA pode receber o prefixo NEXT_PUBLIC_).',
  )
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: existentes, error: erroLista } = await supabase.storage.listBuckets()
  if (erroLista) {
    console.error('Nao foi possivel listar os buckets:', erroLista.message)
    process.exit(1)
  }

  const atual = existentes?.find((b) => b.name === BUCKET)

  if (!atual) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: TAMANHO_MAX,
    })
    if (error) {
      console.error(`Falha ao criar o bucket ${BUCKET}:`, error.message)
      process.exit(1)
    }
    console.log(`Bucket ${BUCKET} criado — privado, limite de ${Math.round(TAMANHO_MAX / 1024 / 1024)} MB.`)
  } else if (atual.public) {
    // Um bucket publico exporia todo documento de cliente por URL direta.
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: false })
    if (error) {
      console.error(`O bucket ${BUCKET} esta PUBLICO e nao foi possivel corrigir:`, error.message)
      process.exit(1)
    }
    console.log(`Bucket ${BUCKET} estava publico e foi fechado.`)
  } else {
    console.log(`Bucket ${BUCKET} ja existe e esta privado.`)
  }

  console.log(`Formatos aceitos pela aplicacao: ${EXTENSOES_ACEITAS.join(', ')}.`)
  console.log('Downloads sao servidos por signed URL de curta duracao, nunca por URL publica.')
}

main().catch((e) => {
  console.error('Falha inesperada:', e instanceof Error ? e.message : e)
  process.exit(1)
})
