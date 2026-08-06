import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Check, Copy, KeyRound, Server, ShieldCheck, X } from 'lucide-react'
import { daemonRequest, type DataSource } from '../lib/api'
import type { Agent, EconomicAccount, Provider, Transaction } from '../lib/types'
import { Pill } from './ui'

export type ProviderCategory = 'Receive' | 'Hold' | 'Spend'

export function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>
}

export function OperationDialog({ accountId, source, initialKind, onClose, onComplete }: { accountId: string; source: DataSource; initialKind?: string; onClose: () => void; onComplete: (message: string) => void }) {
  const [kind, setKind] = useState(initialKind ?? 'pay')
  const [amount, setAmount] = useState('22.00')
  const [currency, setCurrency] = useState('USD')
  const [destination, setDestination] = useState('0x0000000000000000000000000000000000000001')
  const [merchant, setMerchant] = useState('Example merchant')
  const [transactionId, setTransactionId] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const atomic = () => String(Math.round(Number(amount) * (currency === 'USDC' ? 1_000_000 : 100)))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (source !== 'daemon') { setError('Open this dashboard with `mandate dashboard` to authenticate economic operations.'); return }
    setBusy(true)
    try {
      const common = { account_id: accountId, amount: atomic(), currency, idempotency_key: `web_${crypto.randomUUID()}`, metadata: {} }
      const route = kind === 'receive' ? '/v1/receive-endpoints' : kind === 'invoice' ? '/v1/invoices' : kind === 'checkout' ? '/v1/checkouts' : kind === 'pay' ? '/v1/payment-sessions' : kind === 'transfer' ? '/v1/transfers' : '/v1/refunds'
      const body = kind === 'receive'
        ? { account_id: accountId, currency: 'USDC', network: 'base-sepolia', idempotency_key: common.idempotency_key }
        : kind === 'pay' ? { ...common, mode: 'merchant_locked', merchant }
        : kind === 'transfer' ? { ...common, to: destination, network: currency === 'USDC' ? 'base-sepolia' : undefined }
        : kind === 'refund' ? { ...common, transaction_id: transactionId }
        : common
      const operation = await daemonRequest<Record<string, unknown>>(route, { method: 'POST', body: JSON.stringify(body) })
      setResult(operation)
      onComplete(`${kind.replace('_', ' ')} operation created`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed') } finally { setBusy(false) }
  }
  const title = kind === 'receive' ? 'Fund with a receive address' : kind === 'invoice' ? 'Create an invoice' : kind === 'checkout' ? 'Create a checkout' : kind === 'pay' ? 'Create a card payment' : kind === 'transfer' ? 'Transfer funds' : 'Refund a transaction'
  return <Modal eyebrow="Economic operation" title={title} onClose={onClose} wide>
    {result ? <div className="result-panel"><span><Check size={18} /></span><div><strong>Operation accepted by mandated</strong><p>The result below came from the encrypted local daemon—not a UI fixture.</p><pre>{JSON.stringify(result, null, 2)}</pre></div></div> : <form className="dialog-form" onSubmit={submit}>
      <label>Operation<select value={kind} onChange={event => setKind(event.target.value)}><option value="receive">Receive stablecoin</option><option value="invoice">Create invoice</option><option value="checkout">Create checkout</option><option value="pay">Create payment session</option><option value="transfer">Transfer funds</option><option value="refund">Refund transaction</option></select></label>
      {kind !== 'receive' && <div className="form-grid"><label>Amount<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></label><label>Currency<select value={currency} onChange={event => setCurrency(event.target.value)}><option>USD</option><option>USDC</option></select></label></div>}
      {kind === 'pay' && <label>Merchant lock<input value={merchant} onChange={event => setMerchant(event.target.value)} required /></label>}
      {kind === 'transfer' && <label>Destination<input value={destination} onChange={event => setDestination(event.target.value)} required /></label>}
      {kind === 'refund' && <label>Original transaction ID<input value={transactionId} onChange={event => setTransactionId(event.target.value)} required placeholder="jrn_…" /></label>}
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>Mandate uses the connected route for this capability.</strong> Demo routes never move external money; provider Test and Live routes are always labeled on the provider connection.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Create operation'} <ArrowRight size={14} /></button></footer>
    </form>}
  </Modal>
}

export function LedgerDialog({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const total = transaction.ledgerEntries.reduce((sum, entry) => sum + BigInt(entry.amountAtomic), BigInt(0))
  return <Modal eyebrow="Double-entry journal" title={transaction.title} onClose={onClose} wide>
    <div className="ledger-meta"><span>Journal ID<strong>{transaction.id}</strong></span><span>Asset<strong>{transaction.asset}</strong></span><span>Balance check<strong className={total === BigInt(0) ? 'positive-text' : 'danger-text'}>{total === BigInt(0) ? 'Balanced' : total.toString()}</strong></span></div>
    {transaction.ledgerEntries.length ? <div className="ledger-table"><div><span>Ledger account</span><span>Atomic amount</span></div>{transaction.ledgerEntries.map(entry => <div key={`${entry.account}-${entry.amountAtomic}`}><code>{entry.account}</code><strong className={entry.amountAtomic.startsWith('-') ? 'danger-text' : 'positive-text'}>{entry.amountAtomic}</strong></div>)}</div> : <div className="empty-dialog"><Server size={22} /><h3>No journal entries in preview data</h3><p>Authenticate the dashboard and create a payment or transfer to generate daemon-backed balanced entries.</p></div>}
  </Modal>
}

export function AccountingDialog({ onClose }: { onClose: () => void }) {
  return <Modal eyebrow="Accounting model" title="Positions stay truthful across rails" onClose={onClose} wide>
    <div className="accounting-explainer">
      <section><span>1</span><div><h3>Provider positions</h3><p>Coinbase USDC, Stripe revenue, and card-program funds remain separate positions. A consolidated USD number is only a timestamped estimate.</p></div></section>
      <section><span>2</span><div><h3>Reservations before spend</h3><p>A payment session moves value from an available asset account into a reserved liability account before a provider is called.</p></div></section>
      <section><span>3</span><div><h3>Balanced immutable journals</h3><p>Every accounting transaction contains at least two entries and must net to zero for its asset. Workflow status remains separate from accounting status.</p></div></section>
    </div>
  </Modal>
}

export function ProviderDialog({ accountId, providers, provider, category, source, onClose, onComplete }: { accountId: string; providers: Provider[]; provider?: Provider; category?: ProviderCategory; source: DataSource; onClose: () => void; onComplete: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(provider?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'sandbox' | 'live'>('sandbox')
  const [secretKey, setSecretKey] = useState('')
  const [walletAuth, setWalletAuth] = useState('')
  const [accountAddress, setAccountAddress] = useState('')
  const [accountToken, setAccountToken] = useState('')
  const choices = category ? providers.filter(item => item.category === category) : providers
  const selected = providers.find(item => item.id === selectedId)
  const connectDemo = async () => {
    if (!selected || source !== 'daemon') return
    setBusy(true); setError('')
    try {
      await daemonRequest('/v1/admin/provider-connections', { method: 'POST', body: JSON.stringify({ account_id: accountId, provider_id: selected.id, mode: 'demo' }) })
      onComplete(`${selected.name} demo route connected`)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Provider connection failed') } finally { setBusy(false) }
  }
  const connectExternal = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || source !== 'daemon') return
    setBusy(true); setError('')
    const config = selected.id === 'stripe-revenue' ? { secretKey } : selected.id === 'lithic-card' ? { apiKey: secretKey, accountToken, baseUrl: mode === 'sandbox' ? 'https://sandbox.lithic.com' : 'https://api.lithic.com' } : { bearerToken: secretKey, walletAuth, accountAddress, network: mode === 'sandbox' ? 'base-sepolia' : 'base', baseUrl: 'https://api.cdp.coinbase.com/platform' }
    try { await daemonRequest('/v1/admin/provider-connections', { method: 'POST', body: JSON.stringify({ account_id: accountId, provider_id: selected.id, mode, config }) }); onComplete(`${selected.name} ${mode} credentials verified`); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Provider verification failed') } finally { setBusy(false) }
  }
  const title = selected ? selected.name : category ? `Add a ${category.toLowerCase()} provider` : 'Add a provider'
  return <Modal eyebrow={category ? `${category} capability` : 'Provider catalog'} title={title} onClose={onClose}>
    {selected ? <div className="provider-dialog">
      <div className="dialog-status"><span className={`state-chip ${selected.status === 'disconnected' ? 'state-chip--disconnected' : 'state-chip--connected'}`}><span className="state-dot" />{selected.status === 'disconnected' ? 'Not connected' : selected.status === 'live_ready' ? 'Credentials verified' : selected.status === 'live' ? 'Live' : 'Demo connected'}</span><span>{selected.detail}</span></div>
      <p>{selected.description}</p>
      <dl><div><dt>Capability</dt><dd>{selected.category}</dd></div><div><dt>Operations</dt><dd>{selected.capabilities.join(', ') || 'Loaded after connection'}</dd></div><div><dt>Account</dt><dd>Scoped to this economic account</dd></div></dl>
      {selected.status === 'disconnected' ? <>
        <div className="connection-choice connection-choice--available"><div><strong>Demo route</strong><p>Connect deterministic local funds and exercise the full Mandate workflow without external credentials.</p></div><button className="primary-button" onClick={connectDemo} disabled={busy || source !== 'daemon'}>{busy ? 'Connecting…' : 'Connect demo route'}</button></div>
        <form className="connection-choice provider-credential-form" onSubmit={connectExternal}><div><strong>Provider test or live account</strong><p>Mandate validates access through the bundled provider process, then stores the configuration in macOS Keychain.</p></div><label>Environment<select value={mode} onChange={event => setMode(event.target.value as 'sandbox' | 'live')}><option value="sandbox">Provider test / sandbox</option><option value="live">Live</option></select></label><label>{selected.id === 'stripe-revenue' ? 'Stripe secret key' : selected.id === 'lithic-card' ? 'Lithic API key' : 'Coinbase bearer token'}<input type="password" autoComplete="off" value={secretKey} onChange={event => setSecretKey(event.target.value)} required /></label>{selected.id === 'coinbase-cdp-wallet' && <><label>Wallet authorization secret<input type="password" autoComplete="off" value={walletAuth} onChange={event => setWalletAuth(event.target.value)} /></label><label>Account address<input value={accountAddress} onChange={event => setAccountAddress(event.target.value)} placeholder="0x…" required /></label></>}{selected.id === 'lithic-card' && <label>Account token (if required by your program)<input value={accountToken} onChange={event => setAccountToken(event.target.value)} /></label>}<button className="secondary-button" disabled={busy}>{busy ? 'Verifying…' : 'Verify and save credentials'}</button><small>Verification does not override provider approval, program funding, compliance, or PCI requirements.</small></form>
      </> : <div className="form-truth"><ShieldCheck size={16} /><p><strong>{selected.status === 'live_ready' ? 'Credentials are verified, but live operations remain gated.' : 'This account is using a demo route.'}</strong> {selected.status === 'live_ready' ? 'Complete provider acceptance and reconciliation before enabling money movement.' : 'Operations post to the encrypted ledger and deterministic local provider. No external money moves.'}</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="secondary-button" onClick={() => provider ? onClose() : setSelectedId('')}>{provider ? 'Close' : 'Back to providers'}</button></footer>
    </div> : <div className="provider-options">{choices.map(option => <button key={option.id} onClick={() => setSelectedId(option.id)}><span>{option.name.charAt(0)}</span><div><strong>{option.name}</strong><small>{option.description}</small></div><span className={`state-chip ${option.status === 'disconnected' ? 'state-chip--disconnected' : 'state-chip--connected'}`}><span className="state-dot" />{option.status === 'disconnected' ? 'Not connected' : 'Connected'}</span></button>)}</div>}
  </Modal>
}

export function AccountDialog({ onClose, onComplete }: { onClose: () => void; onComplete: (account: EconomicAccount) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const account = await daemonRequest<EconomicAccount>('/v1/admin/accounts', { method: 'POST', body: JSON.stringify({ name }) })
      onComplete(account)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Account creation failed') } finally { setBusy(false) }
  }
  return <Modal eyebrow="Economic accounts" title="Create an account" onClose={onClose}>
    <form className="dialog-form" onSubmit={submit}><label>Account name<input value={name} onChange={event => setName(event.target.value)} placeholder="Operations treasury" required autoFocus /></label><div className="form-truth"><ShieldCheck size={16} /><p>Accounts keep balances, provider routes, ledger entries, and agent grants separate. You can connect multiple agents to one account.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></footer></form>
  </Modal>
}

export function EnvironmentDialog({ onClose }: { onClose: () => void }) {
  return <Modal eyebrow="Local connection" title="Mandate is running on this Mac" onClose={onClose}>
    <div className="environment-options">
      <div className="environment-option environment-option--selected"><span className="environment-icon"><Server size={18} /></span><div><span className="state-chip state-chip--connected"><span className="state-dot" />Running</span><h3>Local daemon</h3><p>The dashboard is connected to the encrypted ledger at 127.0.0.1. Provider environments are selected separately on each provider.</p></div><Check size={18} /></div>
    </div>
    <div className="form-truth"><ShieldCheck size={16} /><p><strong>This is a runtime status, not a money mode.</strong> Look for Demo, Test, or Live on each provider connection.</p></div>
  </Modal>
}

const ALL_CAPABILITIES = ['balance', 'receive', 'invoice', 'checkout', 'pay', 'transfer', 'transactions', 'refund']

export function AgentDialog({ accountId, detected, source, agent, presetRuntime, onClose, onComplete }: { accountId: string; detected: { openclaw: boolean; hermes: boolean }; source: DataSource; agent?: Agent; presetRuntime?: 'openclaw' | 'hermes'; onClose: () => void; onComplete: (message: string) => void }) {
  const [runtime, setRuntime] = useState(presetRuntime ?? 'hermes')
  const [name, setName] = useState(agent?.name ?? (runtime === 'hermes' ? 'Hermes Agent' : 'OpenClaw Agent'))
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [capabilities, setCapabilities] = useState(agent?.capabilities ?? ALL_CAPABILITIES)
  const [authority, setAuthority] = useState(agent?.mode ?? 'independent')
  const detectedRuntime = runtime === 'hermes' ? detected.hermes : detected.openclaw
  const toggleCapability = (capability: string) => setCapabilities(current => current.includes(capability) ? current.filter(item => item !== capability) : [...current, capability])
  const create = async () => {
    if (source !== 'daemon') { setError('Open the authenticated dashboard with `mandate dashboard` first.'); return }
    setBusy(true)
    try {
      const created = await daemonRequest<Record<string, unknown>>('/v1/admin/agents/connect', { method: 'POST', body: JSON.stringify({ name, runtime, account_id: accountId, capabilities }) })
      setResult(created)
      onComplete('Scoped agent identity created')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Agent creation failed') } finally { setBusy(false) }
  }
  const save = async () => {
    if (!agent) return
    setBusy(true); setError('')
    try { await daemonRequest(`/v1/admin/agents/${agent.id}`, { method: 'POST', body: JSON.stringify({ name, authority, capabilities }) }); onComplete(`${name} grant updated`); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Update failed') } finally { setBusy(false) }
  }
  const install = async () => {
    if (!agent) return
    setBusy(true); setError('')
    try { const receipt = await daemonRequest<Record<string, unknown>>(`/v1/admin/agents/${agent.id}/install`, { method: 'POST', body: '{}' }); setResult(receipt); onComplete(`${agent.runtime} connection verified`) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Runtime installation failed') } finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!agent) return
    try { await daemonRequest(`/v1/admin/agents/${agent.id}/revoke`, { method: 'POST', body: '{}' }); onComplete(`${agent.name} revoked`); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Revoke failed') }
  }
  return <Modal eyebrow={agent ? 'Agent grant' : 'Runtime connection'} title={agent ? agent.name : 'Connect an agent'} onClose={onClose} wide>
    {result ? <div className="result-panel"><span><KeyRound size={18} /></span><div><strong>{agent ? 'Runtime connection verified' : 'Scoped identity created'}</strong><p>The credential remains in a 0600 local file outside prompt context.</p><pre>{JSON.stringify(result, null, 2)}</pre><button className="secondary-button" onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}><Copy size={14} /> Copy connection receipt</button></div></div> : agent ? <div className="agent-dialog"><div className="dialog-status"><Pill tone={agent.installationStatus === 'installed' ? 'positive' : 'warning'}>{agent.installationStatus.replace('_', ' ')}</Pill><span>{agent.runtime} · {agent.mode.replace('_', ' ')}</span></div><label>Identity name<input value={name} onChange={event => setName(event.target.value)} /></label><label>Authority<select value={authority} onChange={event => setAuthority(event.target.value as Agent['mode'])}><option value="independent">Independent</option><option value="shared">Shared</option><option value="observe_only">Observe only</option></select></label><fieldset className="capability-checks"><legend>Allowed operations</legend>{ALL_CAPABILITIES.map(capability => <label key={capability}><input type="checkbox" checked={capabilities.includes(capability)} onChange={() => toggleCapability(capability)} /> {capability}</label>)}</fieldset><div className="form-truth"><ShieldCheck size={16} /><p><strong>Runtime connection:</strong> {agent.installationDetail ?? (agent.installationStatus === 'installed' ? 'MCP registration verified.' : 'Install Mandate into this runtime to make these tools available.')}</p></div>{error && <p className="form-error">{error}</p>}<footer><button className="danger-button" onClick={revoke}>Revoke</button><button className="secondary-button" onClick={install} disabled={busy || agent.runtime === 'Custom'}>{busy ? 'Working…' : agent.installationStatus === 'installed' ? 'Probe again' : `Install in ${agent.runtime}`}</button><button className="primary-button" onClick={save} disabled={busy || capabilities.length === 0}>Save grant</button></footer></div> : <div className="dialog-form"><div className="runtime-picker"><button className={runtime === 'openclaw' ? 'selected' : ''} onClick={() => { setRuntime('openclaw'); setName('OpenClaw Agent') }}><strong>OpenClaw</strong><small>CLI primary · MCP optional</small><Pill tone={detected.openclaw ? 'positive' : 'neutral'}>{detected.openclaw ? 'Detected' : 'Not installed'}</Pill></button><button className={runtime === 'hermes' ? 'selected' : ''} onClick={() => { setRuntime('hermes'); setName('Hermes Agent') }}><strong>Hermes</strong><small>Local stdio MCP</small><Pill tone={detected.hermes ? 'positive' : 'neutral'}>{detected.hermes ? 'Detected' : 'Not installed'}</Pill></button></div><label>Identity name<input value={name} onChange={event => setName(event.target.value)} /></label><fieldset className="capability-checks"><legend>Allowed operations</legend>{ALL_CAPABILITIES.map(capability => <label key={capability}><input type="checkbox" checked={capabilities.includes(capability)} onChange={() => toggleCapability(capability)} /> {capability}</label>)}</fieldset><div className="form-truth"><ShieldCheck size={16} /><p>{detectedRuntime ? `${runtime} is available. Create the identity, then use Install in the agent details to register and probe Mandate.` : `${runtime} is not installed or is not visible to the daemon. You can create the grant now and install later.`}</p></div>{error && <p className="form-error">{error}</p>}<footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={create} disabled={busy || !name.trim() || capabilities.length === 0}>{busy ? 'Creating…' : 'Create identity'} <ArrowRight size={14} /></button></footer></div>}
  </Modal>
}

export function SetupChecklistDialog({ providers, agents, onClose, navigate }: { providers: Provider[]; agents: Agent[]; onClose: () => void; navigate: (page: 'account' | 'capabilities' | 'agents') => void }) {
  const connected = providers.filter(provider => provider.status !== 'disconnected')
  const steps = [
    { title: 'Economic account created', detail: 'This account has its own ledger and provider routes.', done: true, page: 'account' as const },
    { title: 'Connect at least one provider', detail: connected.length ? `${connected.length} provider route${connected.length === 1 ? '' : 's'} connected.` : 'Choose a demo, provider test, or approved live route.', done: connected.length > 0, page: 'capabilities' as const },
    { title: 'Connect and install an agent', detail: agents.some(agent => agent.installationStatus === 'installed') ? 'A runtime-native connection has been verified.' : 'Create a scoped grant, install the MCP/CLI integration, and probe it.', done: agents.some(agent => agent.installationStatus === 'installed'), page: 'agents' as const },
  ]
  return <Modal eyebrow="Account readiness" title="Account setup checklist" onClose={onClose}><div className="setup-checklist setup-checklist--dialog">{steps.map((step, index) => <button key={step.title} onClick={() => { onClose(); navigate(step.page) }}><span>{step.done ? <Check size={14} /> : index + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div><ArrowRight size={15} /></button>)}</div><div className="form-truth"><ShieldCheck size={16} /><p>An account can be useful with one provider. “Ready” means its selected routes and agent connection are verified—not that every provider is live.</p></div></Modal>
}

export function ProfileDialog({ administratorName, principalName, onClose, onComplete }: { administratorName: string; principalName: string; onClose: () => void; onComplete: (message: string) => void }) {
  const [administrator, setAdministrator] = useState(administratorName)
  const [principal, setPrincipal] = useState(principalName)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); try { await daemonRequest('/v1/admin/profile', { method: 'POST', body: JSON.stringify({ administrator_name: administrator, principal_name: principal }) }); onComplete('Local profile updated'); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile update failed') } }
  return <Modal eyebrow="Local profile" title="Names used on this Mac" onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Your name<input value={administrator} onChange={event => setAdministrator(event.target.value)} required /></label><label>Organization or principal<input value={principal} onChange={event => setPrincipal(event.target.value)} required /></label><div className="form-truth"><ShieldCheck size={16} /><p>This changes local display names only. Economic accounts remain separate ledger and authorization boundaries.</p></div>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save names</button></footer></form></Modal>
}

export function copyText(value: string) {
  return navigator.clipboard.writeText(value)
}

export function CommandDialog({ onClose, navigate, newOperation }: { onClose: () => void; navigate: (page: 'overview' | 'account' | 'activity' | 'agents' | 'capabilities' | 'system') => void; newOperation: () => void }) {
  const commands = [
    ['Overview', 'overview'], ['Account positions', 'account'], ['Activity and ledger', 'activity'],
    ['Agent grants', 'agents'], ['Provider capabilities', 'capabilities'], ['System diagnostics', 'system'],
  ] as const
  return <Modal eyebrow="Command menu" title="Go somewhere or create an operation" onClose={onClose}>
    <div className="command-list"><button onClick={() => { onClose(); newOperation() }}><strong>New economic operation</strong><small>Receive, invoice, checkout, pay, transfer, or refund</small><ArrowRight size={14} /></button>{commands.map(([label, page]) => <button key={page} onClick={() => { navigate(page); onClose() }}><strong>{label}</strong><small>Open {page}</small><ArrowRight size={14} /></button>)}</div>
  </Modal>
}
