import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { ArrowUpRight, Check, ChevronRight } from 'lucide-react'

const PROVIDER_LOGO_URLS: Record<string, string> = {
  'coinbase-cdp-wallet': 'https://www.coinbase.com/favicon.ico',
  'stripe-revenue': 'https://stripe.com/favicon.ico',
  'lithic-card': 'https://www.lithic.com/favicon.ico',
  'bridge-rail': 'https://www.bridge.xyz/favicon.ico',
}

function StripeLogoIcon() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#635BFF" />
      <path fillRule="evenodd" clipRule="evenodd" d="M14.73 11.23c0-.66.54-1.07 1.42-1.07 1.28 0 2.91.49 4.14 1.16l.87-4.14C19.82 6.55 17.99 6 16.03 6c-4.32 0-7.23 2.27-7.23 6.07 0 5.92 8.16 4.96 8.16 7.52 0 .78-.68 1.17-1.63 1.17-1.48 0-3.37-.62-4.78-1.47l-.92 4.29c1.55.77 3.61 1.22 5.67 1.22 4.46 0 7.63-2.18 7.63-6.08 0-6.38-8.2-5.18-8.2-7.49z" fill="#FFFFFF" />
    </svg>
  )
}

function CoinbaseLogoIcon() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#0052FF" />
      <circle cx="16" cy="16" r="8.5" stroke="#FFFFFF" strokeWidth="4" />
      <rect x="13.5" y="13.5" width="5" height="5" rx="0.75" fill="#0052FF" />
    </svg>
  )
}

function LithicLogoIcon() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#0F172A" />
      <rect x="7.5" y="9.5" width="17" height="13" rx="2" stroke="#10B981" strokeWidth="1.8" />
      <rect x="10" y="12" width="4.5" height="3.5" rx="0.75" fill="#10B981" />
      <line x1="7.5" y1="17.5" x2="24.5" y2="17.5" stroke="#10B981" strokeWidth="1.5" />
    </svg>
  )
}

function BridgeLogoIcon() {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#4F46E5" />
      <path d="M9.5 22V10C9.5 10 13 10 16 10C19 10 22.5 12 22.5 16C22.5 20 19 22 16 22H9.5Z" stroke="#FFFFFF" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1="9.5" y1="16" x2="16" y2="16" stroke="#FFFFFF" strokeWidth="2.2" />
    </svg>
  )
}

export function ProviderLogo({ provider, label }: { provider: string; label: string }) {
  const [failed, setFailed] = useState(false)
  const id = (provider || '').toLowerCase()

  if (id.includes('stripe')) {
    return <span className="provider-logo provider-logo--stripe" aria-label={label}><StripeLogoIcon /></span>
  }
  if (id.includes('coinbase')) {
    return <span className="provider-logo provider-logo--coinbase" aria-label={label}><CoinbaseLogoIcon /></span>
  }
  if (id.includes('lithic')) {
    return <span className="provider-logo provider-logo--lithic" aria-label={label}><LithicLogoIcon /></span>
  }
  if (id.includes('bridge')) {
    return <span className="provider-logo provider-logo--bridge" aria-label={label}><BridgeLogoIcon /></span>
  }

  const src = PROVIDER_LOGO_URLS[provider]

  if (!src || failed) {
    return <span className="provider-monogram">{label ? label.slice(0, 1) : 'P'}</span>
  }

  return (
    <span className="provider-logo">
      <img
        src={src}
        alt={label}
        width={22}
        height={22}
        style={{ objectFit: 'contain', borderRadius: 3 }}
        onError={(_e: SyntheticEvent<HTMLImageElement>) => setFailed(true)}
      />
    </span>
  )
}


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
