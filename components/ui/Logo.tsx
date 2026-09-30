import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * LOGO OFICIAL BASS PAGO.
 *
 * A fonte é o arquivo entregue pela marca — `public/logo-bass-pago-original.png`,
 * preservado intacto. Os arquivos servidos aqui são derivados dele por recorte
 * e transparência; nenhum traço foi redesenhado, e não há reconstrução em CSS
 * nem SVG inventado.
 *
 *   logo-bass-pago.png       tipografia original (#333) — tema claro
 *   logo-bass-pago-dark.png  mesma forma em tom claro    — tema escuro
 *
 * Por que DOIS arquivos e não um filtro CSS: a marca tem duas cores, e o azul
 * do arco não pode mudar entre temas. Um `invert()` inverteria os dois.
 *
 * A troca acontece por visibilidade, resolvida em CSS a partir do
 * `data-theme` do <html> — o mesmo atributo que o resto do sistema usa, e que
 * o script anti-flash já carimba antes da primeira pintura.
 */
const RAZAO = 975 / 213

export default function Logo({
  altura = 22, className,
}: {
  /** Altura em pixels. A largura acompanha a proporção do arquivo original. */
  altura?: number
  className?: string
}) {
  const largura = Math.round(altura * RAZAO)
  const comum = 'block w-auto'

  return (
    <span className={cn('inline-flex items-center flex-none', className)}>
      <Image
        src="/logo-bass-pago-dark.png"
        alt="Bass Pago"
        width={largura}
        height={altura}
        priority
        className={cn(comum, 'bp-logo-escuro')}
        style={{ height: altura }}
      />
      <Image
        src="/logo-bass-pago.png"
        alt=""
        aria-hidden
        width={largura}
        height={altura}
        priority
        className={cn(comum, 'bp-logo-claro')}
        style={{ height: altura }}
      />
    </span>
  )
}
