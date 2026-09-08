import { cn } from '@/lib/utils'

/**
 * Tabela executiva. Primitivos, não configuração — assim as telas existentes
 * são convertidas trocando as tags, sem reescrever a lógica de filtro.
 *
 * O wrapper é obrigatório: garante scroll horizontal em vez de estourar o
 * viewport (6 das 11 tabelas do app não tinham nenhum).
 */
export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-surface border border-line rounded-2xl overflow-hidden', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <table className={cn('w-full min-w-[44rem] border-collapse', className)}>{children}</table>
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface">{children}</thead>
}

export function HeadRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-line">{children}</tr>
}

export function Th({
  align = 'left', className, children,
}: { align?: 'left' | 'right' | 'center'; className?: string; children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        't-label text-subtle font-medium px-4 py-3.5 whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
    >
      {children}
    </th>
  )
}

export function Row({
  className, children, ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={cn(
        'border-b border-line/60 last:border-0',
        'transition-colors duration-[180ms] ease-bp hover:bg-surface-2',
        className
      )}
    >
      {children}
    </tr>
  )
}

export function Td({
  align = 'left', numeric = false, className, children, ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; numeric?: boolean }) {
  return (
    <td
      {...rest}
      className={cn(
        'px-4 py-3.5 t-body text-muted align-middle',
        numeric && 'tabular-nums',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
    >
      {children}
    </td>
  )
}

/** Linha de estado vazio que ocupa a largura toda da tabela. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center t-sm text-subtle">{children}</td>
    </tr>
  )
}
