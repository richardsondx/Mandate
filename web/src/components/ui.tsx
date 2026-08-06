import type { ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronRight } from 'lucide-react'

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function EmptyRing({ label }: { label: string }) {
  return (
    <div className="empty-ring" aria-label={label}>
      <span />
      <small>{label}</small>
    </div>
  )
}

export type FlowStage = { name: string; value: string; detail: string }

export function FlowLine({ compact = false, stages: suppliedStages }: { compact?: boolean; stages?: FlowStage[] }) {
  const stages = suppliedStages ?? [
    { name: 'Receive', value: '+$3,338', detail: 'Stripe + USDC' },
    { name: 'Hold', value: '$18,429', detail: '3 positions' },
    { name: 'Spend', value: '$225', detail: 'Reserved today' },
    { name: 'Reinvest', value: 'Ready', detail: 'Agent operated' },
  ]
  return (
    <div className={`flow-line ${compact ? 'flow-line--compact' : ''}`}>
      <div className="flow-track" aria-hidden="true"><span /></div>
      {stages.map((stage, index) => (
        <div className="flow-stage" key={stage.name}>
          <span className={`flow-node ${index === 2 ? 'flow-node--active' : ''}`} aria-hidden="true">
            {index === stages.length - 1 ? <Check size={12} strokeWidth={2.5} /> : index + 1}
          </span>
          <p>{stage.name}</p>
          {!compact && <><strong>{stage.value}</strong><small>{stage.detail}</small></>}
        </div>
      ))}
    </div>
  )
}

export function ArrowAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button className="text-action" onClick={onClick}>
      {children}<ArrowUpRight size={14} />
    </button>
  )
}

export function RowAction({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label?: string }) {
  return (
    <button className="row-action" onClick={onClick} aria-label={label}>
      {children}<ChevronRight size={16} aria-hidden="true" />
    </button>
  )
}

export function formatAtomic(value: string, decimals: number) {
  const negative = value.startsWith('-')
  const raw = negative ? value.slice(1) : value
  const padded = raw.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals) || '0'
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : ''
  const readable = Number(whole).toLocaleString('en-US')
  return `${negative ? '-' : ''}${readable}${fraction ? `.${fraction.slice(0, 2).padEnd(2, '0')}` : '.00'}`
}
