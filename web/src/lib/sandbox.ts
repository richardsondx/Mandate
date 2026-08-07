import type { Transaction } from './types'

export type SandboxEventId =
  | 'checkout_payment'
  | 'hosting_spend'
  | 'customer_refund'
  | 'chargeback'
  | 'card_decline'
  | 'subscription_renewal'

export type SandboxSimulationEvent = {
  id: SandboxEventId
  title: string
  /** Signed, human-readable amount used in the simulator card. */
  amountLabel: string
  /** Atomic units to apply to the matching position (e.g. 4900 == $49.00 at 2 decimals). */
  amountAtomic: number
  asset: string
  direction: Transaction['direction']
  /** Provider position this event mutates. */
  providerId: string
  /** Display label used on transactions (matches fixture provider labels). */
  providerLabel: string
  /** Long description shown in the simulator card body. */
  blurb: string
  /** Short description attached to the created transaction. */
  summary: string
  /** Transaction id prefix for the synthetic journal row. */
  txPrefix: string
  status: Transaction['status']
  steps: string[]
  /** Double-entry journal rows posted for the event. Empty for no-movement events. */
  ledgerEntries: { account: string; amountAtomic: string }[]
}

/**
 * Deterministic sandbox event catalog. Each entry carries both the simulator
 * card presentation and the concrete effect a simulation has on sandbox
 * positions and the sandbox ledger, so the simulation actually mutates the
 * dashboard state instead of only showing a toast.
 */
export const SANDBOX_EVENTS: SandboxSimulationEvent[] = [
  {
    id: 'checkout_payment',
    title: 'Pay test customer',
    amountLabel: '+$49.00 USD',
    amountAtomic: 4900,
    asset: 'USD',
    direction: 'in',
    providerId: 'stripe-revenue',
    providerLabel: 'Stripe',
    blurb: 'Simulate revenue settlement from customer checkout',
    summary: 'Customer checkout · sandbox settlement',
    txPrefix: 'chk',
    status: 'settled',
    steps: ['Checkout created', 'Customer paid', 'Ledger posted'],
    ledgerEntries: [
      { account: 'asset:stripe:USD', amountAtomic: '+4900' },
      { account: 'equity:revenue:USD', amountAtomic: '+4900' },
    ],
  },
  {
    id: 'hosting_spend',
    title: 'Agent hosting spend',
    amountLabel: '-$20.00 USD',
    amountAtomic: 2000,
    asset: 'USD',
    direction: 'out',
    providerId: 'lithic-card',
    providerLabel: 'Lithic',
    blurb: 'Simulate virtual card payment for hosting / Twilio',
    summary: 'Virtual card · hosting spend',
    txPrefix: 'pay',
    status: 'settled',
    steps: ['Intent accepted', 'Funds reserved', 'Card authorized', 'Ledger posted'],
    ledgerEntries: [
      { account: 'asset:lithic:USD', amountAtomic: '-2000' },
      { account: 'expense:operations:USD', amountAtomic: '+2000' },
    ],
  },
  {
    id: 'customer_refund',
    title: 'Customer refund',
    amountLabel: '-$49.00 USD',
    amountAtomic: 4900,
    asset: 'USD',
    direction: 'out',
    providerId: 'stripe-revenue',
    providerLabel: 'Stripe',
    blurb: 'Simulate partial or full refund on a prior transaction',
    summary: 'Customer refund · sandbox',
    txPrefix: 'rf',
    status: 'refunded',
    steps: ['Refund initiated', 'Customer repaid', 'Ledger posted'],
    ledgerEntries: [
      { account: 'asset:stripe:USD', amountAtomic: '-4900' },
      { account: 'liability:customer:USD', amountAtomic: '+4900' },
    ],
  },
  {
    id: 'chargeback',
    title: 'Chargeback / Dispute',
    amountLabel: '-$49.00 USD',
    amountAtomic: 4900,
    asset: 'USD',
    direction: 'out',
    providerId: 'stripe-revenue',
    providerLabel: 'Stripe',
    blurb: 'Simulate chargeback event requiring agent reasoning',
    summary: 'Chargeback dispute · sandbox',
    txPrefix: 'cbk',
    status: 'pending',
    steps: ['Dispute opened', 'Funds pulled back', 'Ledger posted'],
    ledgerEntries: [
      { account: 'asset:stripe:USD', amountAtomic: '-4900' },
      { account: 'liability:dispute:USD', amountAtomic: '+4900' },
    ],
  },
  {
    id: 'card_decline',
    title: 'Card declined',
    amountLabel: '$0.00',
    amountAtomic: 0,
    asset: 'USD',
    direction: 'neutral',
    providerId: 'lithic-card',
    providerLabel: 'Lithic',
    blurb: 'Simulate insufficient funds or merchant authorization failure',
    summary: 'Card authorization declined',
    txPrefix: 'dcl',
    status: 'pending',
    steps: ['Authorization attempted', 'Card declined', 'No funds moved'],
    ledgerEntries: [],
  },
  {
    id: 'subscription_renewal',
    title: 'Subscription renewal',
    amountLabel: '+$99.00 USD',
    amountAtomic: 9900,
    asset: 'USD',
    direction: 'in',
    providerId: 'stripe-revenue',
    providerLabel: 'Stripe',
    blurb: 'Simulate recurring subscription billing settlement',
    summary: 'Subscription renewal · sandbox',
    txPrefix: 'sub',
    status: 'settled',
    steps: ['Subscription charged', 'Settlement received', 'Ledger posted'],
    ledgerEntries: [
      { account: 'asset:stripe:USD', amountAtomic: '+9900' },
      { account: 'equity:revenue:USD', amountAtomic: '+9900' },
    ],
  },
]

export const SANDBOX_EVENT_BY_ID: Record<SandboxEventId, SandboxSimulationEvent> = Object.fromEntries(
  SANDBOX_EVENTS.map(event => [event.id, event]),
) as Record<SandboxEventId, SandboxSimulationEvent>
