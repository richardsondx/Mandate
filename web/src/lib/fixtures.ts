import type { ActivityEvent, DashboardData } from './types'

export const fixtureActivityEvents: ActivityEvent[] = [
  { id: 'evt_live_6', eventType: 'transaction.authorized', createdAt: new Date(Date.now() - 2_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_name: 'Revenue Agent', provider: 'lithic-card', merchant: 'GitHub', amount_display: '$21.84', request_id: 'req_8km2', latency_ms: 483 } },
  { id: 'evt_live_5', eventType: 'payment_session.created', createdAt: new Date(Date.now() - 4_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_name: 'Revenue Agent', provider: 'lithic-card', merchant: 'GitHub', amount_display: '$22.00', status: 'ready', operation_id: 'pay_8KM2', grant_id: 'grant_hermes' } },
  { id: 'evt_live_4', eventType: 'route.selected', createdAt: new Date(Date.now() - 6_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_name: 'Revenue Agent', route: 'Coinbase → Bridge → Lithic', request_id: 'req_8km2' } },
  { id: 'evt_live_3', eventType: 'payment.requested', createdAt: new Date(Date.now() - 8_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_name: 'Revenue Agent', merchant: 'GitHub', amount_display: '$22.00', request_id: 'req_8km2' } },
  { id: 'evt_live_2', eventType: 'balance.requested', createdAt: new Date(Date.now() - 11_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_name: 'Revenue Agent', provider: 'coinbase-cdp-wallet', balance_display: '100 USDC', request_id: 'req_17pd' } },
  { id: 'evt_live_1', eventType: 'agent.authenticated', createdAt: new Date(Date.now() - 14_000).toISOString(), payload: { account_id: 'acct_studio_01', agent_id: 'agent_hermes', agent_name: 'Revenue Agent', transport: 'MCP', grant_id: 'grant_hermes', request_id: 'req_17pd' } },
]

export const fixtureData: DashboardData = {
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
    { id: 'liq_0AB1', title: 'Spend liquidity replenished', description: 'Coinbase Treasury → Lithic Spend · Route: Bridge', amount: '200.00', asset: 'USD', direction: 'neutral', status: 'settled', provider: 'Mandate', actor: 'Liquidity rule', time: '11:02 AM', steps: ['Spend balance fell below $100', 'Route resolved: Coinbase → Bridge → Lithic', 'Transfer executed', 'Ledger posted'], ledgerEntries: [], route: 'Coinbase → Bridge → Lithic', trigger: 'Spend balance fell below $100', initiatedBy: 'Mandate liquidity rule', fee: '0.74' },
    { id: 'pay_8KM2', title: 'Design assets', description: 'Temporary card · merchant locked', amount: '225.00', asset: 'USD', direction: 'out', status: 'ready', provider: 'Lithic', actor: 'Studio Operator', time: '10:41 AM', steps: ['Intent accepted', 'Funds reserved', 'Card provisioned'], ledgerEntries: [{ account: 'asset:lithic:USD', amountAtomic: '-22500' }, { account: 'liability:reserved:lithic:USD', amountAtomic: '22500' }] },
    { id: 'inv_4PJ8', title: 'Atlas Labs invoice', description: 'Invoice #1048 · paid', amount: '1,189.00', asset: 'USD', direction: 'in', status: 'pending', provider: 'Stripe', actor: 'Revenue Agent', time: '9:18 AM', steps: ['Invoice created', 'Customer paid', 'Settlement pending'], ledgerEntries: [] },
    { id: 'tx_2DN4', title: 'USDC received', description: 'Base Sepolia · 0x7e3…a19', amount: '2,500.00', asset: 'USDC', direction: 'in', status: 'settled', provider: 'Coinbase CDP', actor: 'Treasury Agent', time: 'Yesterday', steps: ['Transfer detected', 'Finality reached', 'Ledger posted'], ledgerEntries: [] },
    { id: 'rf_0CQ7', title: 'Tool subscription refund', description: 'Original payment pay_1BD2', amount: '49.00', asset: 'USD', direction: 'in', status: 'refunded', provider: 'Lithic', actor: 'Studio Operator', time: 'Yesterday', steps: ['Refund detected', 'Reservation released', 'Ledger posted'], ledgerEntries: [] },
    { id: 'chk_6LM3', title: 'Research package', description: 'Checkout session · completed', amount: '349.00', asset: 'USD', direction: 'in', status: 'settled', provider: 'Stripe', actor: 'Revenue Agent', time: 'Aug 4', steps: ['Checkout created', 'Payment confirmed', 'Ledger posted'], ledgerEntries: [] },
  ],
  agents: [
    { id: 'agent_openclaw', name: 'Studio Operator', runtime: 'OpenClaw', mode: 'independent', capabilities: ['balance', 'pay', 'transactions'], lastSeen: '1 min ago', verificationStatus: 'active', status: 'connected', installationStatus: 'installed', lastTestedAt: '12 sec ago', lastTestDetail: 'Studio Operator authenticated via CLI' },
    { id: 'agent_hermes', name: 'Revenue Agent', runtime: 'Hermes', mode: 'shared', capabilities: ['balance', 'receive', 'invoice', 'checkout'], lastSeen: '2 min ago', verificationStatus: 'verified', status: 'connected', installationStatus: 'installed', lastTestedAt: 'Just now', lastTestDetail: 'Revenue Agent authenticated via MCP' },
    { id: 'agent_audit', name: 'Auditor', runtime: 'Custom', mode: 'observe_only', capabilities: ['balance', 'transactions'], lastSeen: '3 days ago', verificationStatus: 'created', status: 'offline', installationStatus: 'not_installed' },
  ],
  providers: [
    { id: 'coinbase-cdp-wallet', name: 'Coinbase CDP', category: 'Hold', description: 'USDC treasury on Base with provider-managed signing.', capabilities: ['Receive', 'Balance', 'Transfer'], status: 'sandbox', detail: 'Base Sepolia · healthy' },
    { id: 'stripe-revenue', name: 'Stripe Revenue', category: 'Receive', description: 'Customer checkouts, invoices, settlement and refunds.', capabilities: ['Checkout', 'Invoice', 'Refund'], status: 'sandbox', detail: 'Test mode · polling' },
    { id: 'lithic-card', name: 'Lithic Cards', category: 'Spend', description: 'Single-use and merchant-locked virtual card sessions.', capabilities: ['Temporary card', 'Authorization', 'Refund'], status: 'sandbox', detail: 'Sandbox · healthy' },
    { id: 'bridge-rail', name: 'Bridge Rail', category: 'Bridge', description: 'Virtual accounts and liquidation addresses for fiat/stablecoin routes.', capabilities: [], status: 'sandbox', detail: 'Sandbox route · connected' },
  ],
  detectedRuntimes: { openclaw: true, hermes: true },
  version: '0.1.0-preview',
  startedAt: 'Preview session',
  verifiedRoutes: ['stripe-to-treasury', 'treasury-to-spend'],
  diagnostics: [
    { name: 'Preview data', group: 'runtime', status: 'attention', label: 'Preview', detail: 'Illustrative data only; no local financial state is being shown' },
    { name: 'Local daemon', group: 'runtime', status: 'unavailable', label: 'Locked', detail: 'Open the authenticated dashboard to inspect runtime health' },
  ],
}
