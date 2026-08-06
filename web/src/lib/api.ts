import { fixtureData } from './fixtures'
import type { DashboardData, DiagnosticCheck, Transaction } from './types'

export type DataSource = 'daemon' | 'preview' | 'uninitialized' | 'locked'

let csrfToken: string | null = null
let eventCursor = 0

type RuntimeDetection = { openclaw: boolean; hermes: boolean }

type SnapshotResponse = {
  csrf_token: string | null
  snapshot: {
    principal: { id: string; name: string }
    administrator_name: string
    accounts: Array<{ id: string; name: string }>
    account: { id: string; name: string }
    balance: {
      positions: Array<{ provider: string; asset: string; network?: string; available: string; reserved: string; pending: string; settled: string; decimals: number; reconciled_at: string }>
      estimated_at: string
    }
    transactions: {
      data: Array<{ id: string; operation_id?: string; description: string; asset: string; created_at: string; entries: Array<{ account: string; amount_atomic: string }> }>
    }
    agents: Array<{ id: string; name: string; runtime: string; authority: 'independent' | 'shared' | 'observe_only'; capabilities: string[]; status: string; created_at: string; installation_status: 'installed' | 'not_installed' | 'runtime_missing' | 'failed'; installation_detail?: string }>
    providers: Array<{ id: string; capabilities: string[]; state: string; mode: string }>
    outbox_cursor: number
    runtimes: RuntimeDetection
  }
}

type DiagnosticsResponse = {
  version: string
  started_at: string
  daemon: { status: string; detail: string }
  database: { status: string; detail: string }
  transport: { tcp: { status: string; detail: string }; unix_socket: { status: string; detail: string } }
  provider_host: { status: string; detail: string }
  reconciliation: { status: string; detail: string }
  recovery: { status: string; detail: string }
}

const PROVIDERS = {
  'coinbase-cdp-wallet': { name: 'Coinbase CDP Wallet', category: 'Hold' as const, description: 'USDC treasury on Base with provider-managed signing.' },
  'stripe-revenue': { name: 'Stripe Revenue', category: 'Receive' as const, description: 'Customer checkout, invoice, settlement, and refund workflows.' },
  'lithic-card': { name: 'Lithic Cards', category: 'Spend' as const, description: 'Single-use and merchant-locked virtual card sessions.' },
}

function displayPositionProvider(id: string) {
  if (id.includes('card')) return 'Lithic demo position'
  if (id.includes('revenue')) return 'Stripe demo position'
  if (id.includes('treasury')) return 'Coinbase demo position'
  return id
}

function formatAtomicValue(value: string, decimals: number) {
  const negative = value.startsWith('-')
  const raw = (negative ? value.slice(1) : value).padStart(decimals + 1, '0')
  const whole = raw.slice(0, -decimals || undefined)
  const fraction = decimals ? raw.slice(-decimals).padEnd(decimals, '0').slice(0, 2) : '00'
  return `${negative ? '-' : ''}${Number(whole).toLocaleString()}.${fraction}`
}

function mapDiagnostics(input?: DiagnosticsResponse): { version: string; startedAt: string; diagnostics: DiagnosticCheck[] } {
  if (!input) return { version: '0.1.0', startedAt: 'Unavailable', diagnostics: [] }
  const checks = [
    ['Local daemon', input.daemon],
    ['Encrypted ledger', input.database],
    ['Loopback HTTP', input.transport.tcp],
    ['Unix socket', input.transport.unix_socket],
    ['Provider process host', input.provider_host],
    ['Reconciliation', input.reconciliation],
    ['Recovery package', input.recovery],
  ] as const
  return {
    version: input.version,
    startedAt: new Date(input.started_at).toLocaleString(),
    diagnostics: checks.map(([name, check]) => {
      const healthy = ['running', 'protected', 'ready'].includes(check.status)
      const attention = ['manual_only', 'not_configured'].includes(check.status)
      return {
        name,
        status: healthy ? 'healthy' as const : attention ? 'attention' as const : 'unavailable' as const,
        label: check.status.replaceAll('_', ' '),
        detail: check.detail,
      }
    }),
  }
}

function mapSnapshot(response: SnapshotResponse, diagnostics?: DiagnosticsResponse): DashboardData {
  const { snapshot } = response
  eventCursor = Math.max(eventCursor, snapshot.outbox_cursor)
  const decimalsByAsset = new Map(snapshot.balance.positions.map(position => [position.asset, position.decimals]))
  const estimatedCents = snapshot.balance.positions.reduce((sum, position) => {
    const atomic = BigInt(position.available) + BigInt(position.reserved) + BigInt(position.pending)
    const scale = BigInt(10) ** BigInt(position.decimals)
    return sum + Number((atomic * BigInt(100)) / scale)
  }, 0)
  const transactions: Transaction[] = snapshot.transactions.data.map(record => {
    const decimals = decimalsByAsset.get(record.asset) ?? (record.asset === 'USDC' ? 6 : 2)
    const first = record.entries[0]?.amount_atomic ?? '0'
    const amount = first.replace('-', '')
    const direction = first.startsWith('-') ? 'out' as const : first === '0' ? 'neutral' as const : 'in' as const
    const providerAccount = record.entries.find(entry => entry.account.startsWith('asset:'))?.account.split(':')[1]
    return {
      id: record.id,
      title: record.description,
      description: record.operation_id ? `Operation ${record.operation_id}` : 'Manual journal posting',
      amount: formatAtomicValue(amount, decimals),
      asset: record.asset,
      direction,
      status: 'settled',
      provider: providerAccount ? displayPositionProvider(providerAccount) : 'Mandate ledger',
      actor: 'Mandate',
      time: new Date(record.created_at).toLocaleString(),
      steps: ['Operation accepted', 'Ledger transaction posted', 'Journal verified balanced'],
      ledgerEntries: record.entries.map(entry => ({ account: entry.account, amountAtomic: entry.amount_atomic })),
    }
  })
  const system = mapDiagnostics(diagnostics)
  return {
    principalName: snapshot.principal.name,
    administratorName: snapshot.administrator_name,
    accounts: snapshot.accounts,
    accountId: snapshot.account.id,
    accountName: snapshot.account.name,
    estimateUsd: (estimatedCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    valuationAt: new Date(snapshot.balance.estimated_at).toLocaleString(),
    outboxCursor: String(snapshot.outbox_cursor),
    detectedRuntimes: snapshot.runtimes,
    positions: snapshot.balance.positions.map(position => ({
      provider: position.provider,
      label: displayPositionProvider(position.provider),
      asset: position.asset,
      network: position.network,
      available: position.available,
      reserved: position.reserved,
      pending: position.pending,
      settled: position.settled,
      decimals: position.decimals,
      status: 'sandbox',
      reconciledAt: new Date(position.reconciled_at).toLocaleString(),
    })),
    transactions,
    agents: snapshot.agents.filter(agent => agent.status !== 'revoked').map(agent => ({
      id: agent.id,
      name: agent.name,
      runtime: agent.runtime === 'openclaw' ? 'OpenClaw' : agent.runtime === 'hermes' ? 'Hermes' : 'Custom',
      mode: agent.authority,
      capabilities: agent.capabilities,
      lastSeen: new Date(agent.created_at).toLocaleString(),
      status: 'connected',
      installationStatus: agent.installation_status,
      installationDetail: agent.installation_detail,
    })),
    providers: snapshot.providers.map(provider => {
      const catalog = PROVIDERS[provider.id as keyof typeof PROVIDERS] ?? { name: provider.id, category: 'Hold' as const, description: 'Bundled provider adapter.' }
      const connected = provider.state === 'sandbox' || provider.state === 'live' || provider.state === 'live_ready'
      return {
        id: provider.id,
        name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        capabilities: provider.capabilities,
        status: connected ? provider.state as 'sandbox' | 'live_ready' | 'live' : 'disconnected',
        detail: connected ? provider.state === 'live_ready' ? `${provider.mode} credentials · verified` : `${provider.mode === 'demo' ? 'Demo route' : provider.mode} · connected` : 'No route connected',
      }
    }),
    ...system,
  }
}

function emptyData(runtimes: RuntimeDetection): DashboardData {
  return {
    ...fixtureData,
    principalName: '',
    administratorName: '',
    accounts: [],
    accountId: '',
    accountName: '',
    estimateUsd: '0.00',
    valuationAt: 'Not initialized',
    positions: [],
    transactions: [],
    agents: [],
    providers: Object.entries(PROVIDERS).map(([id, provider]) => ({ id, ...provider, capabilities: [], status: 'disconnected' as const, detail: 'No route connected' })),
    detectedRuntimes: runtimes,
    diagnostics: [],
  }
}

export async function loadDashboard(signal?: AbortSignal, accountId?: string): Promise<{ data: DashboardData; source: DataSource }> {
  try {
    const statusResponse = await fetch('/v1/setup/status', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
    if (!statusResponse.ok) throw new Error(`Daemon returned ${statusResponse.status}`)
    const status = await statusResponse.json() as { initialized: boolean; runtimes: RuntimeDetection }
    if (!status.initialized) return { data: emptyData(status.runtimes), source: 'uninitialized' }
    const query = accountId ? `?account_id=${encodeURIComponent(accountId)}` : ''
    const response = await fetch(`/v1/dashboard${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
    if (response.status === 401) return { data: fixtureData, source: 'locked' }
    if (!response.ok) throw new Error(`Daemon returned ${response.status}`)
    const [body, diagnosticsResponse] = await Promise.all([
      response.json() as Promise<SnapshotResponse>,
      fetch('/v1/admin/diagnostics', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal }),
    ])
    const diagnostics = diagnosticsResponse.ok ? await diagnosticsResponse.json() as DiagnosticsResponse : undefined
    csrfToken = body.csrf_token
    return { data: mapSnapshot(body, diagnostics), source: 'daemon' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { data: fixtureData, source: 'preview' }
  }
}

export async function initializeInstance(input: { administrator_name: string; organization_name: string; account_name: string; demo: boolean }) {
  const response = await fetch('/v1/setup', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message ?? `Mandate returned ${response.status}`)
  csrfToken = body.csrf_token ?? null
  return body as Record<string, unknown>
}

export async function daemonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-Mandate-CSRF': csrfToken } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message ?? `Mandate returned ${response.status}`)
  return body as T
}

export function subscribeToEvents(onMessage: () => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined
  const events = new EventSource(`/v1/events?after=${eventCursor}`)
  events.addEventListener('batch', event => {
    try {
      const rows = JSON.parse((event as MessageEvent).data) as Array<{ id: number }>
      if (rows.length > 0) {
        eventCursor = Math.max(eventCursor, ...rows.map(row => row.id))
        onMessage()
      }
    } catch { /* reconnect will refresh */ }
  })
  return () => events.close()
}
