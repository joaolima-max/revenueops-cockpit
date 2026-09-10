/**
 * FORMULARIOS — definicao, validacao e leitura de respostas. Sem Prisma.
 *
 * A estrutura do formulario mora num unico JSON versionado
 * (`FormularioVersao.definicao`), em vez de uma tabela por campo. Publicada, a
 * versao vira snapshot imutavel: editar cria a proxima. E isso que impede uma
 * alteracao futura de reescrever o significado de respostas ja coletadas.
 *
 * O usuario nunca ve esse JSON — o construtor visual gera e interpreta.
 */

export const TIPOS_CAMPO = [
  'TEXTO', 'TEXTO_LONGO', 'NUMERO', 'DATA', 'DATA_HORA', 'EMAIL', 'TELEFONE',
  'DOCUMENTO', 'SELECT', 'MULTIPLA', 'CHECKBOX', 'RADIO', 'DROPDOWN',
  'UPLOAD', 'UPLOAD_MULTIPLO', 'VOLUMETRIA', 'MOEDA', 'PERCENTUAL',
  'ASSINATURA', 'ACEITE', 'OCULTO', 'SECAO', 'TEXTO_INFORMATIVO', 'IMAGEM',
] as const
export type TipoCampo = (typeof TIPOS_CAMPO)[number]

export const TIPO_CAMPO_LABELS: Record<TipoCampo, string> = {
  TEXTO: 'Texto curto', TEXTO_LONGO: 'Texto longo', NUMERO: 'Número',
  DATA: 'Data', DATA_HORA: 'Data e hora', EMAIL: 'E-mail', TELEFONE: 'Telefone',
  DOCUMENTO: 'CNPJ / CPF', SELECT: 'Seleção', MULTIPLA: 'Múltipla seleção',
  CHECKBOX: 'Checkbox', RADIO: 'Radio', DROPDOWN: 'Dropdown',
  UPLOAD: 'Upload', UPLOAD_MULTIPLO: 'Upload múltiplo', VOLUMETRIA: 'Volumetria',
  MOEDA: 'Moeda', PERCENTUAL: 'Percentual', ASSINATURA: 'Assinatura',
  ACEITE: 'Aceite de termos', OCULTO: 'Campo oculto', SECAO: 'Seção / separador',
  TEXTO_INFORMATIVO: 'Texto informativo', IMAGEM: 'Imagem',
}

/** Tipos que nao coletam valor — sao layout, nao pergunta. */
const DECORATIVOS: TipoCampo[] = ['SECAO', 'TEXTO_INFORMATIVO', 'IMAGEM']

export function ehDecorativo(tipo: TipoCampo): boolean {
  return DECORATIVOS.includes(tipo)
}

export function aceitaOpcoes(tipo: TipoCampo): boolean {
  return ['SELECT', 'MULTIPLA', 'RADIO', 'DROPDOWN'].includes(tipo)
}

export function ehUpload(tipo: TipoCampo): boolean {
  return tipo === 'UPLOAD' || tipo === 'UPLOAD_MULTIPLO'
}

export interface CampoDefinicao {
  id: string
  tipo: TipoCampo
  rotulo: string
  obrigatorio?: boolean
  placeholder?: string
  ajuda?: string
  opcoes?: string[]
  valorPadrao?: string
  /** Largura em colunas de um grid de 12. */
  colunas?: number
  min?: number
  max?: number
  /** Texto informativo, legenda de seção ou URL da imagem, conforme o tipo. */
  conteudo?: string
}

export interface SecaoDefinicao {
  id: string
  titulo?: string
  descricao?: string
  campos: CampoDefinicao[]
}

export interface AparenciaDefinicao {
  capaUrl?: string
  logoUrl?: string
  titulo?: string
  subtitulo?: string
  introducao?: string
  rodape?: string
  mensagemFinal?: string
}

export interface DefinicaoFormulario {
  aparencia: AparenciaDefinicao
  secoes: SecaoDefinicao[]
}

export const DEFINICAO_VAZIA: DefinicaoFormulario = {
  aparencia: { mensagemFinal: 'Recebemos sua resposta. Obrigado!' },
  secoes: [{ id: 'sec-1', titulo: 'Dados', campos: [] }],
}

/** Todos os campos, achatados na ordem em que aparecem. */
export function todosOsCampos(d: DefinicaoFormulario): CampoDefinicao[] {
  return d.secoes.flatMap((s) => s.campos)
}

export function camposQueColetam(d: DefinicaoFormulario): CampoDefinicao[] {
  return todosOsCampos(d).filter((c) => !ehDecorativo(c.tipo))
}

/**
 * Valida a estrutura vinda do construtor antes de gravar. Pega o que a UI
 * poderia deixar passar: id repetido, opcao faltando, secao sem campo.
 */
export function validarDefinicao(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'Definição inválida.'
  const def = d as Partial<DefinicaoFormulario>

  if (!Array.isArray(def.secoes) || def.secoes.length === 0) {
    return 'O formulário precisa de pelo menos uma seção.'
  }

  const vistos = new Set<string>()
  let coletam = 0

  for (const secao of def.secoes) {
    if (!secao || typeof secao.id !== 'string' || !secao.id) return 'Seção sem identificador.'
    if (!Array.isArray(secao.campos)) return `Seção "${secao.titulo ?? secao.id}" sem lista de campos.`

    for (const campo of secao.campos) {
      if (!campo || typeof campo.id !== 'string' || !campo.id) return 'Campo sem identificador.'
      if (vistos.has(campo.id)) return `Há dois campos com o identificador "${campo.id}".`
      vistos.add(campo.id)

      if (!TIPOS_CAMPO.includes(campo.tipo)) return `Tipo de campo desconhecido: ${String(campo.tipo)}.`
      if (!ehDecorativo(campo.tipo)) {
        coletam++
        if (!campo.rotulo || !String(campo.rotulo).trim()) return 'Todo campo precisa de um rótulo.'
      }
      if (aceitaOpcoes(campo.tipo) && (!Array.isArray(campo.opcoes) || campo.opcoes.length === 0)) {
        return `O campo "${campo.rotulo}" é de seleção e precisa de pelo menos uma opção.`
      }
    }
  }

  if (coletam === 0) return 'O formulário precisa de pelo menos um campo que colete resposta.'
  return null
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RE_DOCUMENTO = /^\d{11}$|^\d{14}$/

/**
 * Valida os valores de uma resposta contra a definicao da versao. Devolve um
 * mapa campo -> erro; vazio significa resposta valida.
 *
 * A mesma funcao roda no navegador (feedback imediato) e no servidor (a
 * validacao que vale). Sem duplicar a regra em dois lugares.
 */
export function validarResposta(
  d: DefinicaoFormulario, valores: Record<string, unknown>,
): Record<string, string> {
  const erros: Record<string, string> = {}

  for (const campo of camposQueColetam(d)) {
    // Campos de upload viajam como arquivos, fora de `valores`. Quem os valida
    // e `prepararAnexos`; aqui eles pareceriam sempre vazios.
    if (ehUpload(campo.tipo)) continue

    const bruto = valores[campo.id]
    const vazio = bruto === undefined || bruto === null || bruto === ''
      || (Array.isArray(bruto) && bruto.length === 0)
      || (campo.tipo === 'ACEITE' && bruto !== true)

    if (campo.obrigatorio && vazio) {
      erros[campo.id] = campo.tipo === 'ACEITE' ? 'É preciso aceitar para continuar.' : 'Campo obrigatório.'
      continue
    }
    if (vazio) continue

    const texto = String(bruto)

    switch (campo.tipo) {
      case 'EMAIL':
        if (!RE_EMAIL.test(texto)) erros[campo.id] = 'E-mail inválido.'
        break
      case 'TELEFONE':
        if (texto.replace(/\D/g, '').length < 10) erros[campo.id] = 'Telefone incompleto.'
        break
      case 'DOCUMENTO':
        if (!RE_DOCUMENTO.test(texto.replace(/\D/g, ''))) erros[campo.id] = 'CNPJ ou CPF inválido.'
        break
      case 'NUMERO': case 'MOEDA': case 'PERCENTUAL': case 'VOLUMETRIA': {
        const n = Number(texto.replace(',', '.'))
        if (!Number.isFinite(n)) { erros[campo.id] = 'Informe um número.'; break }
        if (campo.min !== undefined && n < campo.min) erros[campo.id] = `Mínimo ${campo.min}.`
        if (campo.max !== undefined && n > campo.max) erros[campo.id] = `Máximo ${campo.max}.`
        if (campo.tipo === 'PERCENTUAL' && (n < 0 || n > 100)) erros[campo.id] = 'Percentual entre 0 e 100.'
        if (campo.tipo === 'VOLUMETRIA' && n < 0) erros[campo.id] = 'A volumetria não pode ser negativa.'
        break
      }
      case 'SELECT': case 'RADIO': case 'DROPDOWN':
        if (campo.opcoes && !campo.opcoes.includes(texto)) erros[campo.id] = 'Opção inválida.'
        break
      case 'MULTIPLA': {
        const lista = Array.isArray(bruto) ? bruto.map(String) : [texto]
        if (campo.opcoes && lista.some((v) => !campo.opcoes!.includes(v))) {
          erros[campo.id] = 'Opção inválida.'
        }
        break
      }
      case 'DATA': case 'DATA_HORA':
        if (Number.isNaN(new Date(texto).getTime())) erros[campo.id] = 'Data inválida.'
        break
    }
  }

  return erros
}

/** Token do link publico. Nunca o id interno — id em URL vaza a ordem dos registros. */
export function gerarToken(): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let saida = ''
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24))
  for (const b of bytes) saida += alfabeto[b % alfabeto.length]
  return saida
}

export type MotivoLinkInvalido = 'REVOGADO' | 'EXPIRADO' | 'ESGOTADO' | null

export function linkUtilizavel(link: {
  revogadoEm: Date | string | null
  expiraEm: Date | string | null
  usos: number
  usosMax: number | null
}, agora = new Date()): MotivoLinkInvalido {
  if (link.revogadoEm) return 'REVOGADO'
  if (link.expiraEm && new Date(link.expiraEm).getTime() < agora.getTime()) return 'EXPIRADO'
  if (link.usosMax !== null && link.usos >= link.usosMax) return 'ESGOTADO'
  return null
}

/** Descricao minima de um arquivo — o que File e o servidor tem em comum. */
export interface ArquivoRecebido {
  name: string
  type: string
  size: number
}

export interface AnexoPreparado {
  campoId: string
  arquivo: ArquivoRecebido
}

export interface AnexosPreparados {
  erro: string | null
  /** Erros por campo, no mesmo formato de `validarResposta`. */
  errosPorCampo: Record<string, string>
  anexos: AnexoPreparado[]
}

export function camposDeUpload(d: DefinicaoFormulario): CampoDefinicao[] {
  return camposQueColetam(d).filter((c) => ehUpload(c.tipo))
}

/**
 * Confere os arquivos de uma resposta antes de qualquer byte subir.
 *
 * Um anexo vira um `Documento`, que pertence a um `Cliente` — entao um link
 * publico sem cliente vinculado nao tem onde guardar arquivo. Recusamos com
 * essa explicacao em vez de aceitar e perder o arquivo depois.
 *
 * `validar` e injetado (lib/arquivos.validarArquivo) para esta funcao nao
 * depender de nada e poder ser exercitada sozinha.
 */
export function prepararAnexos(
  d: DefinicaoFormulario,
  arquivosPorCampo: Record<string, ArquivoRecebido[]>,
  clienteId: string | null,
  validar: (nome: string, mime: string, tamanho: number) => string | null,
): AnexosPreparados {
  const campos = camposDeUpload(d)
  const errosPorCampo: Record<string, string> = {}
  const anexos: AnexoPreparado[] = []

  const totalArquivos = Object.values(arquivosPorCampo).reduce((s, l) => s + l.length, 0)
  if (totalArquivos > 0 && !clienteId) {
    return {
      erro: 'Este link não está vinculado a um cliente, então não aceita anexos.',
      errosPorCampo: {}, anexos: [],
    }
  }

  for (const campo of campos) {
    const lista = arquivosPorCampo[campo.id] ?? []

    if (campo.obrigatorio && lista.length === 0) {
      errosPorCampo[campo.id] = 'Envie ao menos um arquivo.'
      continue
    }
    if (campo.tipo === 'UPLOAD' && lista.length > 1) {
      errosPorCampo[campo.id] = 'Este campo aceita um arquivo só.'
      continue
    }

    for (const arquivo of lista) {
      const problema = validar(arquivo.name, arquivo.type, arquivo.size)
      if (problema) { errosPorCampo[campo.id] = problema; break }
      anexos.push({ campoId: campo.id, arquivo })
    }
  }

  // Arquivo enviado para um campo que nao existe (ou nao e de upload) na versao
  // publicada: sinal de payload forjado, nao de engano do respondente.
  const conhecidos = new Set(campos.map((c) => c.id))
  for (const campoId of Object.keys(arquivosPorCampo)) {
    if (!conhecidos.has(campoId) && (arquivosPorCampo[campoId]?.length ?? 0) > 0) {
      return { erro: 'Arquivo enviado para um campo que não existe neste formulário.', errosPorCampo: {}, anexos: [] }
    }
  }

  return {
    erro: Object.keys(errosPorCampo).length > 0 ? 'Confira os arquivos destacados.' : null,
    errosPorCampo, anexos,
  }
}

export const MOTIVO_LINK_MENSAGEM: Record<Exclude<MotivoLinkInvalido, null>, string> = {
  REVOGADO: 'Este link foi revogado.',
  EXPIRADO: 'Este link expirou.',
  ESGOTADO: 'Este link já atingiu o número máximo de respostas.',
}
