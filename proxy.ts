import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { checkAccess, firstAvailableRoute } from '@/lib/modules'

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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
