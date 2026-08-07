import { CAPABILITY_MANIFEST } from './capabilities.generated'
import type { ActivityEvent, CapabilityAvailabilityResponse, DashboardData, DiagnosticCheck, Transaction } from './types'

export type DataSource = 'daemon' | 'preview' | 'uninitialized' | 'offline'

let csrfToken: string | null = null
let eventCursor = 0

type RuntimeDetection = { openclaw: boolean; hermes: boolean }

type SnapshotResponse = {
  csrf_token: string | null
  snapshot: {
    accounts: Array<{ id: string; name: string }>
    account: { id: string; name: string }
    balance: {
      positions: Array<{ provider: string; asset: string; network?: string; available: string; reserved: string; pending: string; settled: string; decimals: number; reconciled_at: string }>
      estimated_usd_atomic: string | null
      estimated_at: string
    }
    transactions: {
      data: Array<{ id: string; operation_id?: string; description: string; asset: string; created_at: string; entries: Array<{ account: string; amount_atomic: string }> }>
    }
    agents: Array<{ id: string; name: string; runtime: string; authority: 'independent' | 'shared' | 'observe_only'; capabilities: string[]; capability_modes?: Record<string, 'autonomous' | 'require_approval'>; status: string; created_at: string; installation_status: 'installed' | 'not_installed' | 'runtime_missing' | 'failed'; installation_detail?: string }>
    providers: Array<{ id: string; capabilities: string[]; state: string; mode: string }>
    capabilities: CapabilityAvailabilityResponse
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
  'bridge-rail': { name: 'Bridge Rail', category: 'Bridge' as const, description: 'Virtual accounts & liquidation addresses for automated fiat/stablecoin routing.' },
}

function fallbackCapabilities(accountId: string): CapabilityAvailabilityResponse {
  return {
    account_id: accountId,
    spec_version: CAPABILITY_MANIFEST.spec_version,
    updated_at: CAPABILITY_MANIFEST.updated_at,
    releases: CAPABILITY_MANIFEST.releases.map(release => ({ ...release, items: [...release.items] })),
    capabilities: CAPABILITY_MANIFEST.capabilities.map(capability => ({
      ...capability,
      examples: [...capability.examples],
      requires_provider_categories: [...capability.requires_provider_categories],
      requires_provider_capabilities: [...capability.requires_provider_capabilities],
      environments: [...capability.environments],
      flow: [...capability.flow],
      tools: [...capability.tools],
      granted: true,
      available: false,
      provider_ids: [],
      environment: null,
      unavailable_reason: capability.requires_provider_categories.length
        ? `Connect a ${capability.requires_provider_categories.join(' or ')} provider to make this capability executable.`
        : null,
    })),
  }
}

function displayPositionProvider(id: string) {
  if (id.includes('card') || id.includes('lithic')) return 'Lithic Cards'
  if (id.includes('revenue') || id.includes('stripe')) return 'Stripe Revenue'
  if (id.includes('treasury') || id.includes('coinbase')) return 'Coinbase CDP Wallet'
  if (id.includes('bridge')) return 'Bridge Rail'
  return id
}

// Daemon positions store the internal route id (e.g. "fake-treasury") rather than
// the canonical provider id used for branding/icons. Normalize so ProviderLogo
// and display labels resolve to the correct brand mark.
const ROUTE_TO_PROVIDER: Record<string, string> = {
  'fake-treasury': 'coinbase-cdp-wallet',
  'fake-revenue': 'stripe-revenue',
  'fake-card': 'lithic-card',
  'fake-bridge': 'bridge-rail',
}

function canonicalProviderId(id: string): string {
  return ROUTE_TO_PROVIDER[id] ?? id
}

function positionStatusFor(mode: string): 'demo' | 'sandbox' | 'live' {
  if (mode === 'demo') return 'demo'
  if (mode === 'live') return 'live'
  return 'sandbox'
}

function titleCaseNetwork(network?: string): string | undefined {
  if (!network) return network
  return network.split(/[-_ ]+/).map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ')
}

function formatAtomicValue(value: string, decimals: number) {
  const negative = value.startsWith('-')
  const raw = (negative ? value.slice(1) : value).padStart(decimals + 1, '0')
  const whole = raw.slice(0, -decimals || undefined)
  const fraction = decimals ? raw.slice(-decimals).padEnd(decimals, '0').slice(0, 2) : '00'
  return `${negative ? '-' : ''}${Number(whole).toLocaleString()}.${fraction}`
}

type DiagEntry = { status: string; detail: string }

function diagStatus(entry?: DiagEntry): DiagnosticCheck['status'] {
  const status = entry?.status ?? 'unavailable'
  if (['running', 'protected', 'ready'].includes(status)) return 'healthy'
  if (['manual_only', 'not_configured'].includes(status)) return 'attention'
  return 'unavailable'
}

function diagLabel(entry?: DiagEntry): string {
  return (entry?.status ?? 'unavailable').replaceAll('_', ' ')
}

function mapDiagnostics(input?: DiagnosticsResponse): { version: string; startedAt: string; diagnostics: DiagnosticCheck[] } {
  if (!input) return { version: '0.1.0', startedAt: 'Unavailable', diagnostics: [] }
  const agent = input.transport.unix_socket
  const checks: DiagnosticCheck[] = [
    { name: 'Local daemon', group: 'runtime', status: diagStatus(input.daemon), label: diagLabel(input.daemon), detail: input.daemon.detail },
    { name: 'Encrypted storage', group: 'runtime', status: diagStatus(input.database), label: diagLabel(input.database), detail: input.database.detail },
    { name: 'Agent access', group: 'runtime', status: diagStatus(agent), label: diagLabel(agent), detail: agent.detail },
    { name: 'Loopback HTTP', group: 'advanced', status: diagStatus(input.transport.tcp), label: diagLabel(input.transport.tcp), detail: input.transport.tcp.detail },
    { name: 'Unix socket', group: 'advanced', status: diagStatus(input.transport.unix_socket), label: diagLabel(input.transport.unix_socket), detail: input.transport.unix_socket.detail },
    { name: 'Provider process host', group: 'advanced', status: diagStatus(input.provider_host), label: diagLabel(input.provider_host), detail: input.provider_host.detail },
    { name: 'Reconciliation', group: 'advanced', status: diagStatus(input.reconciliation), label: diagLabel(input.reconciliation), detail: input.reconciliation.detail },
    { name: 'Recovery package', group: 'advanced', status: diagStatus(input.recovery), label: diagLabel(input.recovery), detail: input.recovery.detail },
  ]
  return { version: input.version, startedAt: new Date(input.started_at).toLocaleString(), diagnostics: checks }
}

function mapSnapshot(response: SnapshotResponse, diagnostics?: DiagnosticsResponse): DashboardData {
  const { snapshot } = response
  eventCursor = Math.max(eventCursor, snapshot.outbox_cursor)
  const decimalsByAsset = new Map(snapshot.balance.positions.map(position => [position.asset, position.decimals]))
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
  const providerModeById = new Map(snapshot.providers.map(provider => [provider.id, provider.mode]))
  return {
    accounts: snapshot.accounts,
    accountId: snapshot.account.id,
    accountName: snapshot.account.name,
    estimateUsd: snapshot.balance.estimated_usd_atomic === null
      ? '—'
      : formatAtomicValue(snapshot.balance.estimated_usd_atomic, 2),
    valuationAt: new Date(snapshot.balance.estimated_at).toLocaleString(),
    outboxCursor: String(snapshot.outbox_cursor),
    detectedRuntimes: snapshot.runtimes,
    positions: snapshot.balance.positions.map(position => {
      const providerId = canonicalProviderId(position.provider)
      const mode = providerModeById.get(providerId) ?? 'sandbox'
      return {
        provider: providerId,
        label: displayPositionProvider(providerId),
        asset: position.asset,
        network: titleCaseNetwork(position.network),
        available: position.available,
        reserved: position.reserved,
        pending: position.pending,
        settled: position.settled,
        decimals: position.decimals,
        status: positionStatusFor(mode),
        reconciledAt: new Date(position.reconciled_at).toLocaleString(),
      }
    }),
    transactions,
    agents: snapshot.agents.filter(agent => agent.status !== 'revoked').map(agent => ({
      id: agent.id,
      name: agent.name,
      runtime: agent.runtime === 'openclaw' ? 'OpenClaw' : agent.runtime === 'hermes' ? 'Hermes' : 'Custom',
      mode: agent.authority,
      capabilities: agent.capabilities,
      capabilityModes: agent.capability_modes,
      lastSeen: new Date(agent.created_at).toLocaleString(),
      status: agent.installation_status === 'installed' ? 'connected' : agent.installation_status === 'failed' ? 'attention' : 'offline',
      installationStatus: agent.installation_status,
      installationDetail: agent.installation_detail,
    })),
    providers: snapshot.providers.map(provider => {
      const catalog = PROVIDERS[provider.id as keyof typeof PROVIDERS] ?? { name: provider.id, category: 'Hold' as const, description: 'Bundled provider adapter.' }
      const connected = provider.state !== 'not_connected' && provider.state !== 'disconnected' && provider.mode !== 'none'
      const modeLabel = provider.mode === 'demo' ? 'Demo route' : provider.mode === 'sandbox' ? 'Sandbox credentials' : provider.mode === 'live' ? 'Live credentials' : 'Credentials'
      return {
        id: provider.id,
        name: catalog.name,
        category: catalog.category,
        description: catalog.description,
        capabilities: provider.capabilities,
        mode: provider.mode as any,
        status: connected ? (provider.state as any) : 'disconnected',
        detail: connected ? `${modeLabel} · connected` : 'No route connected',
      }
    }),
    capabilities: snapshot.capabilities ?? fallbackCapabilities(snapshot.account.id),
    ...system,
  }
}

export function emptyData(runtimes: RuntimeDetection = { openclaw: false, hermes: false }): DashboardData {
  return {
    accounts: [],
    accountId: '',
    accountName: '',
    estimateUsd: '0.00',
    valuationAt: 'Not initialized',
    positions: [],
    transactions: [],
    agents: [],
    providers: Object.entries(PROVIDERS).map(([id, provider]) => ({ id, ...provider, capabilities: [], status: 'disconnected' as const, detail: 'No route connected' })),
    capabilities: fallbackCapabilities(''),
    outboxCursor: '0',
    detectedRuntimes: runtimes,
    version: 'Unavailable',
    startedAt: 'Unavailable',
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
    return { data: emptyData(), source: 'offline' }
  }
}

export async function initializeInstance(input: { account_name: string; demo: boolean }) {
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

export function subscribeToEvents(onMessage: (events: ActivityEvent[]) => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined
  const events = new EventSource(`/v1/events?after=${eventCursor}`)
  events.addEventListener('batch', event => {
    try {
      const rows = JSON.parse((event as MessageEvent).data) as Array<{ id: number; event_type: string; payload: Record<string, unknown>; created_at: string }>
      if (rows.length > 0) {
        eventCursor = Math.max(eventCursor, ...rows.map(row => row.id))
        onMessage(rows.map(row => ({
          id: row.id,
          eventType: row.event_type,
          payload: row.payload,
          createdAt: row.created_at,
        })))
      }
    } catch { /* reconnect will refresh */ }
  })
  return () => events.close()
}
