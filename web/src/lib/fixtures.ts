import type { DashboardData } from './types'

export const fixtureData: DashboardData = {
  principalName: 'Northstar Studio',
  administratorName: 'Alex Rivera',
  accounts: [{ id: 'acct_studio_01', name: 'Studio treasury' }],
  accountId: 'acct_studio_01',
  accountName: 'Studio treasury',
  estimateUsd: '18,429.64',
  valuationAt: 'Today, 10:42 AM',
  outboxCursor: 'evt_0084',
  positions: [
    { provider: 'coinbase-cdp-wallet', label: 'Coinbase CDP', asset: 'USDC', network: 'Base Sepolia', available: '12420000000', reserved: '225000000', pending: '75000000', settled: '12720000000', decimals: 6, status: 'sandbox', reconciledAt: '18 sec ago' },
    { provider: 'stripe-revenue', label: 'Stripe Revenue', asset: 'USD', available: '487642', reserved: '0', pending: '118900', settled: '487642', decimals: 2, status: 'sandbox', reconciledAt: '1 min ago' },
    { provider: 'lithic-card', label: 'Lithic Cards', asset: 'USD', available: '522202', reserved: '22500', pending: '0', settled: '544702', decimals: 2, status: 'sandbox', reconciledAt: '42 sec ago' },
  ],
  transactions: [
    { id: 'pay_8KM2', title: 'Design assets', description: 'Temporary card · merchant locked', amount: '225.00', asset: 'USD', direction: 'out', status: 'ready', provider: 'Lithic', actor: 'Studio Operator', time: '10:41 AM', steps: ['Intent accepted', 'Funds reserved', 'Card provisioned'], ledgerEntries: [{ account: 'asset:lithic:USD', amountAtomic: '-22500' }, { account: 'liability:reserved:lithic:USD', amountAtomic: '22500' }] },
    { id: 'inv_4PJ8', title: 'Atlas Labs invoice', description: 'Invoice #1048 · paid', amount: '1,189.00', asset: 'USD', direction: 'in', status: 'pending', provider: 'Stripe', actor: 'Revenue Agent', time: '9:18 AM', steps: ['Invoice created', 'Customer paid', 'Settlement pending'], ledgerEntries: [] },
    { id: 'tx_2DN4', title: 'USDC received', description: 'Base Sepolia · 0x7e3…a19', amount: '2,500.00', asset: 'USDC', direction: 'in', status: 'settled', provider: 'Coinbase CDP', actor: 'Treasury Agent', time: 'Yesterday', steps: ['Transfer detected', 'Finality reached', 'Ledger posted'], ledgerEntries: [] },
    { id: 'rf_0CQ7', title: 'Tool subscription refund', description: 'Original payment pay_1BD2', amount: '49.00', asset: 'USD', direction: 'in', status: 'refunded', provider: 'Lithic', actor: 'Studio Operator', time: 'Yesterday', steps: ['Refund detected', 'Reservation released', 'Ledger posted'], ledgerEntries: [] },
    { id: 'chk_6LM3', title: 'Research package', description: 'Checkout session · completed', amount: '349.00', asset: 'USD', direction: 'in', status: 'settled', provider: 'Stripe', actor: 'Revenue Agent', time: 'Aug 4', steps: ['Checkout created', 'Payment confirmed', 'Ledger posted'], ledgerEntries: [] },
  ],
  agents: [
    { id: 'agent_openclaw', name: 'Studio Operator', runtime: 'OpenClaw', mode: 'independent', capabilities: ['balance', 'pay', 'transactions'], lastSeen: 'Now', status: 'connected', installationStatus: 'installed' },
    { id: 'agent_hermes', name: 'Revenue Agent', runtime: 'Hermes', mode: 'shared', capabilities: ['balance', 'receive', 'invoice', 'checkout'], lastSeen: '2 min ago', status: 'connected', installationStatus: 'installed' },
    { id: 'agent_audit', name: 'Auditor', runtime: 'Custom', mode: 'observe_only', capabilities: ['balance', 'transactions'], lastSeen: '3 days ago', status: 'offline', installationStatus: 'not_installed' },
  ],
  providers: [
    { id: 'coinbase-cdp-wallet', name: 'Coinbase CDP', category: 'Hold', description: 'USDC treasury on Base with provider-managed signing.', capabilities: ['Receive', 'Balance', 'Transfer'], status: 'sandbox', detail: 'Base Sepolia · healthy' },
    { id: 'stripe-revenue', name: 'Stripe Revenue', category: 'Receive', description: 'Customer checkouts, invoices, settlement and refunds.', capabilities: ['Checkout', 'Invoice', 'Refund'], status: 'sandbox', detail: 'Test mode · polling' },
    { id: 'lithic-card', name: 'Lithic Cards', category: 'Spend', description: 'Single-use and merchant-locked virtual card sessions.', capabilities: ['Temporary card', 'Authorization', 'Refund'], status: 'sandbox', detail: 'Sandbox · healthy' },
  ],
  detectedRuntimes: { openclaw: true, hermes: true },
  version: '0.1.0-preview',
  startedAt: 'Preview session',
  diagnostics: [
    { name: 'Preview data', status: 'attention', label: 'Preview', detail: 'Illustrative data only; no local financial state is being shown' },
    { name: 'Local daemon', status: 'unavailable', label: 'Locked', detail: 'Open the authenticated dashboard to inspect runtime health' },
  ],
}
