import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { checkAccess, firstAvailableRoute } from '@/lib/modules'

// Unicas rotas alcancaveis sem sessao. O ambiente Formularios saiu do produto
// e com ele a pagina publica `/f/` e a API `/api/formularios/publico/`: manter
// os prefixos aqui deixaria dois caminhos liberados sem autenticacao para
// codigo que nao existe mais.
const PUBLIC_PATHS = ['/login', '/api/auth/login']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api/')

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value
  const session = token ? verifyToken(token) : null

  if (!session) {
    return isApi
      ? NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url))
  }

  // Módulos e funções desligados são bloqueados aqui, não só escondidos no menu.
  const verdict = checkAccess(pathname, session.role)
  if (verdict !== 'allow') {
    if (isApi) {
      return verdict === 'disabled'
        ? NextResponse.json({ error: 'Função indisponível' }, { status: 404 })
        : NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }
    const fallback = firstAvailableRoute(session.role)
    // Sem nenhuma rota liberada, ou o destino seria a própria página bloqueada:
    // volta ao login em vez de entrar em loop de redirect.
    if (!fallback || fallback === pathname) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.redirect(new URL(fallback, request.url))
  }

  return NextResponse.next()
}

/**
 * O que o proxy NAO intercepta.
 *
 * Alem dos internos do Next, os ARQUIVOS DE MARCA em /public precisam sair
 * daqui. O favicon e requisitado pelo navegador direto em `/icon.png`, antes
 * de existir sessao: com o proxy no caminho, ele recebia 307 para /login e a
 * aba ficava sem icone. O mesmo valia para a logo quando referenciada por
 * caminho direto.
 *
 * Sao imagens publicas da marca — nao ha o que proteger nelas, e /public nao
 * guarda mais nada alem delas (os arquivos de exemplo do Next sairam). Todo o
 * resto continua passando pela checagem de sessao e de modulo.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|avif|woff2?)$).*)'],
}
