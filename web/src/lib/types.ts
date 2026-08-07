export type NavId = 'overview' | 'account' | 'activity' | 'agents' | 'capabilities' | 'guide' | 'system'

export type GuideTabId = 'start' | 'playbook' | 'reference' | 'setup' | 'providers'

export type RouteStepStatus = 'completed' | 'attention' | 'pending'

export type LoopRouteStep = {
  id: string
  title: string
  sourceProvider: string
  targetProvider: string
  summary: string
  inMandateCapabilities: string[]
  externalSteps: string[]
  routeCaveat: string
  actionLabel: string
  status: RouteStepStatus
  verifyNote?: string
}

export type AccountTopology = {
  isClosed: boolean
  receiveConnected: boolean
  holdConnected: boolean
  spendConnected: boolean
  receiveProvider?: Provider
  holdProvider?: Provider
  spendProvider?: Provider
  steps: LoopRouteStep[]
  statusSummary: string
  missingRoutesCount: number
}


export type EnvironmentMode = 'sandbox' | 'live' | 'preview'

export type SandboxEventType =
  | 'checkout_payment'
  | 'hosting_spend'
  | 'customer_refund'
  | 'chargeback'
  | 'card_decline'
  | 'subscription_renewal'

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
  status: 'demo' | 'sandbox' | 'live' | 'degraded'
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
  route?: string
  trigger?: string
  initiatedBy?: string
  fee?: string
}

export type ActivityEvent = {
  id: number | string
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export type LiquidityConfig = {
  target: number
  threshold: number
  autoReplenish: boolean
}

export type Agent = {
  id: string
  name: string
  runtime: 'OpenClaw' | 'Hermes' | 'Custom'
  mode: 'independent' | 'shared' | 'observe_only'
  capabilities: string[]
  lastSeen: string
  verificationStatus?: 'created' | 'verified' | 'active' | 'revoked'
  status: 'connected' | 'attention' | 'offline'
  installationStatus: 'installed' | 'not_installed' | 'runtime_missing' | 'failed'
  installationDetail?: string
  lastTestedAt?: string
  lastTestDetail?: string
}

export type Provider = {
  id: string
  name: string
  category: 'Receive' | 'Hold' | 'Spend' | 'Bridge'
  description: string
  capabilities: string[]
  status: 'sandbox' | 'live_ready' | 'live' | 'degraded' | 'disconnected'
  detail: string
}

export type CapabilityDefinition = {
  id: string
  title: string
  intent_group: string
  summary: string
  description: string
  direction: string
  examples: string[]
  use_when: string
  do_not_use_when: string
  requires_provider_categories: string[]
  requires_provider_capabilities: string[]
  side_effect: string
  mutation: boolean
  environments: string[]
  introduced: string
  updated: string
  flow: string[]
  tools: string[]
}

export type CapabilityAvailability = CapabilityDefinition & {
  granted: boolean
  available: boolean
  provider_ids: string[]
  environment?: string | null
  unavailable_reason?: string | null
}

export type CapabilityAvailabilityResponse = {
  account_id: string
  spec_version: string
  updated_at: string
  releases: Array<{ version: string; date: string; items: string[] }>
  capabilities: CapabilityAvailability[]
}


export type EconomicAccount = {
  id: string
  name: string
}

export type DiagnosticCheck = {
  name: string
  group: 'runtime' | 'advanced'
  status: 'healthy' | 'attention' | 'unavailable'
  label: string
  detail: string
}

export type DashboardData = {
  accounts: EconomicAccount[]
  accountId: string
  accountName: string
  estimateUsd: string
  valuationAt: string
  positions: Position[]
  transactions: Transaction[]
  agents: Agent[]
  providers: Provider[]
  capabilities?: CapabilityAvailabilityResponse
  outboxCursor: string
  detectedRuntimes: { openclaw: boolean; hermes: boolean }
  version: string
  startedAt: string
  diagnostics: DiagnosticCheck[]
  verifiedRoutes?: string[]
}
