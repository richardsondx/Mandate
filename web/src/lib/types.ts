export type NavId = 'overview' | 'account' | 'activity' | 'agents' | 'capabilities' | 'system'

export type Position = {
  provider: string
  label: string
  asset: string
  network?: string
  available: string
  reserved: string
  pending: string
  settled: string
  decimals: number
  status: 'sandbox' | 'live' | 'degraded'
  reconciledAt: string
}

export type Transaction = {
  id: string
  title: string
  description: string
  amount: string
  asset: string
  direction: 'in' | 'out' | 'neutral'
  status: 'settled' | 'pending' | 'ready' | 'refunded'
  provider: string
  actor: string
  time: string
  steps: string[]
  ledgerEntries: { account: string; amountAtomic: string }[]
}

export type Agent = {
  id: string
  name: string
  runtime: 'OpenClaw' | 'Hermes' | 'Custom'
  mode: 'independent' | 'shared' | 'observe_only'
  capabilities: string[]
  lastSeen: string
  status: 'connected' | 'attention' | 'offline'
  installationStatus: 'installed' | 'not_installed' | 'runtime_missing' | 'failed'
  installationDetail?: string
}

export type Provider = {
  id: string
  name: string
  category: 'Receive' | 'Hold' | 'Spend'
  description: string
  capabilities: string[]
  status: 'sandbox' | 'live_ready' | 'live' | 'degraded' | 'disconnected'
  detail: string
}

export type EconomicAccount = {
  id: string
  name: string
}

export type DiagnosticCheck = {
  name: string
  status: 'healthy' | 'attention' | 'unavailable'
  label: string
  detail: string
}

export type DashboardData = {
  principalName: string
  administratorName: string
  accounts: EconomicAccount[]
  accountId: string
  accountName: string
  estimateUsd: string
  valuationAt: string
  positions: Position[]
  transactions: Transaction[]
  agents: Agent[]
  providers: Provider[]
  outboxCursor: string
  detectedRuntimes: { openclaw: boolean; hermes: boolean }
  version: string
  startedAt: string
  diagnostics: DiagnosticCheck[]
}
