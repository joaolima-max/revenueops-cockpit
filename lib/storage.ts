/**
 * Supabase Storage — bucket PRIVADO `cliente-arquivos`.
 *
 * Regras que este modulo existe para garantir:
 *   * a service role key nunca sai do servidor;
 *   * o bucket nunca e publico;
 *   * download so por signed URL de curta duracao;
 *   * extensao, MIME e tamanho validados ANTES de qualquer byte subir.
 *
 * Nao importar em componente de cliente. As rotas de upload e download sao os
 * unicos pontos de acesso.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Reexportado para quem ja importava daqui; a regra mora em lib/arquivos.ts.
export {
  validarArquivo, nomeSeguro, extensaoDe, chaveDocumento, chaveLancamento,
  EXTENSOES_ACEITAS, TAMANHO_MAX,
} from '@/lib/arquivos'

export const BUCKET = 'cliente-arquivos'

export function storageConfigurado(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

let cliente: SupabaseClient | null = null

function admin(): SupabaseClient {
  if (cliente) return cliente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Storage nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (server-only).',
    )
  }
  cliente = createClient(url, key, { auth: { persistSession: false } })
  return cliente
}

export async function enviarArquivo(chave: string, bytes: ArrayBuffer, mime: string): Promise<void> {
  const { error } = await admin().storage.from(BUCKET).upload(chave, bytes, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`)
}

/**
 * URL assinada de curta duracao. Padrao de 60s: tempo de clicar, nao de
 * compartilhar.
 *
 * `download` decide se o navegador BAIXA ou ABRE o arquivo.
 *
 * Antes era sempre `true`, e o efeito era que NAO DAVA PARA VISUALIZAR nada:
 * toda foto e todo PDF chegavam como download forcado. Para um comprovante
 * anexado a um lancamento, o caso comum e abrir e olhar — baixar e a exce��o.
 * Agora quem chama escolhe, e o default e visualizar.
 */
export async function urlAssinada(
  chave: string, segundos = 60, download = false,
): Promise<string> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(chave, segundos, {
    download,
  })
  if (error || !data) throw new Error(`Falha ao gerar link: ${error?.message ?? 'sem resposta'}`)
  return data.signedUrl
}

/** MIMEs que o navegador abre inline. O resto so faz sentido baixar. */
const VISUALIZAVEIS = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]

export function podeVisualizar(mime: string): boolean {
  return VISUALIZAVEIS.includes(mime)
}

/**
 * Remocao fisica. Usada apenas quando o upload falha no meio e precisamos
 * desfazer; a exclusao pela interface e logica (`Documento.ativo = false`),
 * para nao perder o rastro de que o arquivo existiu.
 */
export async function removerArquivo(chave: string): Promise<void> {
  await admin().storage.from(BUCKET).remove([chave])
}
