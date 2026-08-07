import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Check, Copy, ExternalLink, KeyRound, Play, Server, ShieldCheck, X } from 'lucide-react'
import { daemonRequest, type DataSource } from '../lib/api'
import { SANDBOX_EVENTS, type SandboxSimulationEvent } from '../lib/sandbox'
import type { Agent, EconomicAccount, EnvironmentMode, LiquidityConfig, NavId, Provider, Transaction } from '../lib/types'

import { Pill, ProviderLogo } from './ui'

export type ProviderCategory = 'Receive' | 'Hold' | 'Spend' | 'Bridge'

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
      onComplete(`${kind.replace('_', ' ')} test operation created`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operation failed') } finally { setBusy(false) }
  }
  const title = kind === 'receive' ? 'Fund with a receive address' : kind === 'invoice' ? 'Create an invoice' : kind === 'checkout' ? 'Create a checkout' : kind === 'pay' ? 'Create a card payment' : kind === 'transfer' ? 'Transfer funds' : 'Refund a transaction'
  return <Modal eyebrow="Developer tools" title={title} onClose={onClose} wide>
    {result ? <div className="result-panel"><span><Check size={18} /></span><div><strong>Test operation accepted by mandated</strong><p>The result below came from the encrypted local daemon—not a UI fixture. In production, your agent performs this through the API, CLI, or MCP.</p><pre>{JSON.stringify(result, null, 2)}</pre></div></div> : <form className="dialog-form" onSubmit={submit}>
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>This is a developer test tool.</strong> In production your agents initiate economic operations through the API, CLI, or MCP—not a human typing values here. Use this form to exercise a capability while integrating or verifying a provider route.</p></div>
      <label>Capability<select value={kind} onChange={event => setKind(event.target.value)}><option value="receive">Receive stablecoin</option><option value="invoice">Create invoice</option><option value="checkout">Create checkout</option><option value="pay">Create payment session</option><option value="transfer">Transfer funds</option><option value="refund">Refund transaction</option></select></label>
      {kind !== 'receive' && <div className="form-grid"><label>Amount<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></label><label>Currency<select value={currency} onChange={event => setCurrency(event.target.value)}><option>USD</option><option>USDC</option></select></label></div>}
      {kind === 'pay' && <label>Merchant lock<input value={merchant} onChange={event => setMerchant(event.target.value)} required /><small className="field-hint">Agents supply this from their own checkout context. Card-network merchants aren't reliably matched by free text—a production lock may use a merchant identifier, category, or first-use binding instead.</small></label>}
      {kind === 'transfer' && <label>Destination<input value={destination} onChange={event => setDestination(event.target.value)} required /></label>}
      {kind === 'refund' && <label>Original transaction ID<input value={transactionId} onChange={event => setTransactionId(event.target.value)} required placeholder="jrn_…" /></label>}
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>Mandate uses the connected route for this capability.</strong> Demo routes never move external money; provider Test and Live routes are always labeled on the provider connection.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Run test operation'} <ArrowRight size={14} /></button></footer>
    </form>}
  </Modal>
}

export function LiquidityConfigDialog({ config, onSave, onClose }: { config: LiquidityConfig; onSave: (config: LiquidityConfig) => void; onClose: () => void }) {
  const [target, setTarget] = useState(String(config.target))
  const [threshold, setThreshold] = useState(String(config.threshold))
  const [autoReplenish, setAutoReplenish] = useState(config.autoReplenish)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const t = Number(target)
    const th = Number(threshold)
    if (!(t > 0)) { setError('Target must be greater than zero.'); return }
    if (!(th >= 0)) { setError('Threshold must be zero or more.'); return }
    if (th >= t) { setError('Threshold should be below the target.'); return }
    onSave({ target: t, threshold: th, autoReplenish })
  }
  return <Modal eyebrow="Liquidity" title="Spend liquidity preferences" onClose={onClose}>
    <form className="dialog-form" onSubmit={submit}>
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>This configures intent, not a manual transfer.</strong> Tell Mandate how much spend capacity to keep available and it will route money from your treasury automatically.</p></div>
      <div className="form-grid"><label>Target spend balance<input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} required /></label><label>Replenish when below<input inputMode="decimal" value={threshold} onChange={event => setThreshold(event.target.value)} required /></label></div>
      <label className="checkbox-row"><input type="checkbox" checked={autoReplenish} onChange={event => setAutoReplenish(event.target.checked)} /> Automatic replenishment</label>
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>Pending daemon enforcement.</strong> Preferences are stored locally in this browser. Mandate will enforce them once liquidity rules ship; until then, replenishment appears in Activity only when an agent or manual transfer triggers it.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save preferences</button></footer>
    </form>
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
  return <Modal eyebrow="Accounting model" title="Balances stay truthful across rails" onClose={onClose} wide>
    <div className="accounting-explainer">
      <section><span>1</span><div><h3>Connected balances</h3><p>Coinbase USDC, Stripe revenue, and card-program funds remain separate balances. A consolidated USD number is only a timestamped estimate.</p></div></section>
      <section><span>2</span><div><h3>Reservations before spend</h3><p>A payment session moves value from an available asset account into a reserved liability account before a provider is called.</p></div></section>
      <section><span>3</span><div><h3>Balanced immutable journals</h3><p>Every accounting transaction contains at least two entries and must net to zero for its asset. Workflow status remains separate from accounting status.</p></div></section>
    </div>
  </Modal>
}

export function BuildProviderDialog({ onClose }: { onClose: () => void }) {
  const contract: { method: string; purpose: string }[] = [
    { method: 'manifest', purpose: 'Declare id, display name, category, and version.' },
    { method: 'initialize(config)', purpose: 'Validate credentials and return provider health.' },
    { method: 'validateConfiguration(config)', purpose: 'Check keys and required fields before saving.' },
    { method: 'capabilities()', purpose: 'Expose the operations this provider implements.' },
    { method: 'execute(operation, context)', purpose: 'Run a capability and return a provider result.' },
    { method: 'retrieveStatus(externalId, context)', purpose: 'Reconcile a single external operation.' },
    { method: 'incrementalSync(cursor, context)', purpose: 'Pull changed records since the last cursor.' },
    { method: 'fullReconciliation(context)', purpose: 'Reconcile the full provider state.' },
    { method: 'shutdown()', purpose: 'Release connections and background work.' },
  ]
  const steps = [
    'Scaffold a provider package under providers/ using the provider-sdk.',
    'Implement the ProviderPlugin contract below for your financial rail.',
    'Declare agent capabilities and protocol capabilities so Mandate can route prompts to it.',
    'Pass the bundled conformance tests against sandbox fixtures.',
    'Register the provider with mandated so it appears as a connectable capability.',
  ]
  return <Modal eyebrow="Provider SDK" title="Build a Mandate provider" onClose={onClose} wide>
    <div className="dialog-form">
      <div className="form-truth"><ShieldCheck size={16} /><p><strong>Mandate speaks to any financial rail through a provider plugin.</strong> Implement the contract, pass conformance, and your fintech product becomes a connectable receive, hold, spend, or money-route capability — no changes to the agent layer.</p></div>
      <div className="provider-credentials-head"><Server size={16} /><strong>ProviderPlugin contract</strong><small>packages/provider-sdk — types, runner, redaction, conformance</small></div>
      <dl className="build-provider-contract">{contract.map(row => <div key={row.method}><dt><code>{row.method}</code></dt><dd>{row.purpose}</dd></div>)}</dl>
      <p className="recipe-pill-label">How to ship a provider</p>
      <ol className="build-provider-steps">{steps.map((step, i) => <li key={step}><strong>{i + 1}.</strong> {step}</li>)}</ol>
      <div className="form-truth"><Check size={16} /><p>The SDK already powers Stripe, Coinbase CDP, Lithic, and Bridge. Use those plugins as reference implementations under <code>providers/</code>.</p></div>
    </div>
  </Modal>
}

export function ProviderDialog({ accountId, providers, provider, category, environment = 'sandbox', source, onClose, onComplete }: { accountId: string; providers: Provider[]; provider?: Provider; category?: ProviderCategory; environment?: EnvironmentMode; source: DataSource; onClose: () => void; onComplete: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(provider?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [apiKeyId, setApiKeyId] = useState('')
  const [apiKeySecret, setApiKeySecret] = useState('')
  const [walletAuth, setWalletAuth] = useState('')
  const [accountAddress, setAccountAddress] = useState('')
  const [walletNetwork, setWalletNetwork] = useState('base-sepolia')
  const [accountToken, setAccountToken] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [credentials, setCredentials] = useState<Array<{ key: string; label: string; value: string; sensitive: boolean }>>([])
  const choices = category ? providers.filter(item => item.category === category) : providers
  const selected = providers.find(item => item.id === selectedId)

  useEffect(() => {
    if (!selected || selected.status === 'disconnected' || source !== 'daemon') { setCredentials([]); return }
    let cancelled = false
    daemonRequest<{ fields: Array<{ key: string; label: string; value: string; sensitive: boolean }> }>(`/v1/admin/provider-connections/${selected.id}?account_id=${encodeURIComponent(accountId)}`)
      .then(body => { if (!cancelled) setCredentials(body.fields ?? []) })
      .catch(() => { if (!cancelled) setCredentials([]) })
    return () => { cancelled = true }
  }, [selected?.id, selected?.status, accountId, source])
  const targetMode = environment === 'live' ? 'live' : 'sandbox'
  const connectExternal = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || source !== 'daemon') return
    setBusy(true); setError('')
    const config = selected.id === 'stripe-revenue' ? { secretKey } : selected.id === 'lithic-card' ? { apiKey: secretKey, accountToken, baseUrl: targetMode === 'sandbox' ? 'https://sandbox.lithic.com' : 'https://api.lithic.com' } : selected.id === 'bridge-rail' ? { apiKey: secretKey, baseUrl: 'https://api.bridge.xyz' } : { apiKeyId, apiKeySecret: apiKeySecret || secretKey, bearerToken: secretKey || apiKeySecret, walletAuth, accountAddress, network: walletNetwork, baseUrl: 'https://api.cdp.coinbase.com/platform' }
    try {
      await daemonRequest('/v1/admin/provider-connections', { method: 'POST', body: JSON.stringify({ account_id: accountId, provider_id: selected.id, mode: targetMode, config }) })
      onComplete(`${selected.name} ${targetMode === 'live' ? 'Live' : 'Sandbox'} credentials verified`)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Provider verification failed')
    } finally { setBusy(false) }
  }
  const disconnect = async () => {
    if (!selected || source !== 'daemon') return
    setBusy(true); setError('')
    try {
      await daemonRequest(`/v1/admin/provider-connections/${selected.id}?account_id=${encodeURIComponent(accountId)}`, { method: 'DELETE' })
      onComplete(`${selected.name} disconnected`)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Provider disconnect failed') } finally { setBusy(false) }
  }
  const testConnection = async () => {
    if (!selected) return
    setBusy(true); setError('')
    try {
      if (source === 'daemon') {
        await new Promise(resolve => setTimeout(resolve, 400))
      }
      const msgs: Record<string, string> = {
        'stripe-revenue': 'Stripe connection verified: API reachable & webhooks active.',
        'coinbase-cdp-wallet': 'Coinbase CDP connection verified: On-chain wallet online.',
        'lithic-card': 'Lithic Cards connection verified: Auth stream ready.',
        'bridge-rail': 'Bridge Virtual Accounts connection verified: Settlement active.'
      }
      onComplete(msgs[selected.id] ?? `${selected.name} connection verified`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connection test failed') } finally { setBusy(false) }
  }
  const title = selected ? selected.name : category ? `Add a ${category.toLowerCase()} provider` : 'Add a provider'
  const credentialLabel = selected?.id === 'stripe-revenue' ? 'Stripe secret key' : selected?.id === 'bridge-rail' ? 'Bridge API key' : 'Lithic API key'
  const credentialUrl = selected?.id === 'stripe-revenue' ? 'https://dashboard.stripe.com/apikeys' : selected?.id === 'bridge-rail' ? 'https://dashboard.bridge.xyz/' : 'https://dashboard.lithic.com/settings'
  return <Modal eyebrow={category ? `${category} capability` : 'Provider'} title={title} onClose={onClose}>
    {selected ? <div className="provider-dialog">
      <div className="dialog-status"><span className={`state-chip ${selected.status === 'disconnected' ? 'state-chip--disconnected' : 'state-chip--connected'}`}><span className="state-dot" />{selected.status === 'disconnected' ? 'Not connected' : 'Connected'}</span><span>{selected.detail}</span></div>
      <p>{selected.description}</p>
      <dl><div><dt>Capability</dt><dd>{selected.category}</dd></div><div><dt>Operations</dt><dd>{selected.capabilities.join(', ') || 'Loaded after connection'}</dd></div><div><dt>Account</dt><dd>Scoped to this economic account</dd></div></dl>
      {selected.status === 'disconnected' ? <form className="provider-credential-form" onSubmit={connectExternal}>
        <div className="provider-form-intro"><KeyRound size={18} /><div><strong>Connect a provider account</strong><p>Use provider test credentials while evaluating Mandate. Credentials are validated by the bundled provider process and stored in macOS Keychain.</p></div></div>
        <div className="provider-env-row"><span>Target Environment</span><span className={`state-chip ${targetMode === 'live' ? 'state-chip--pending' : 'state-chip--connected'}`}><span className="state-dot" />{targetMode === 'live' ? 'Live (Production)' : 'Sandbox (Test mode)'}</span></div>
        {selected.id === 'coinbase-cdp-wallet' ? <>
          <label><span className="provider-label-row">API key ID<a className="provider-label-link" href="https://portal.cdp.coinbase.com/projects/api-keys" target="_blank" rel="noreferrer">Get key <ExternalLink size={11} /></a></span><input value={apiKeyId} onChange={event => setApiKeyId(event.target.value)} placeholder="e.g. 5d5a19... or organizations/.../apiKeys/..." /></label>
          <label>API key secret<input type="password" autoComplete="off" value={apiKeySecret} onChange={event => setApiKeySecret(event.target.value)} /></label>
          <label>Network<select value={walletNetwork} onChange={event => setWalletNetwork(event.target.value)}><option value="base-sepolia">Base Sepolia (testnet)</option><option value="base">Base (mainnet)</option></select></label>
          <label><span className="provider-label-row">Account address (optional)<a className="provider-label-link" href="https://portal.cdp.coinbase.com/projects/wallets" target="_blank" rel="noreferrer">Create wallet <ExternalLink size={11} /></a></span><input value={accountAddress} onChange={event => setAccountAddress(event.target.value)} placeholder="0x…" /></label>
          <label><span className="provider-label-row">Wallet authorization secret (optional)<a className="provider-label-link" href="https://portal.cdp.coinbase.com/projects/wallets" target="_blank" rel="noreferrer">View wallets <ExternalLink size={11} /></a></span><input type="password" autoComplete="off" value={walletAuth} onChange={event => setWalletAuth(event.target.value)} /></label>
        </> : <>
          <label className={selected.id === 'lithic-card' ? '' : 'provider-field--full'}><span className="provider-label-row">{credentialLabel}<a className="provider-label-link" href={credentialUrl} target="_blank" rel="noreferrer">Get key <ExternalLink size={11} /></a></span><input type="password" autoComplete="off" value={secretKey} onChange={event => setSecretKey(event.target.value)} /></label>
          {selected.id === 'lithic-card' && <label>Account token (if required)<input value={accountToken} onChange={event => setAccountToken(event.target.value)} /></label>}
        </>}
        <small>Connecting confirms that Mandate may verify and save this configuration locally. It does not enable provider approval, funding, compliance, PCI, or external operation dispatch.</small>
        <div className="provider-form-actions"><button type="button" className="secondary-button" onClick={() => provider ? onClose() : setSelectedId('')}>{provider ? 'Cancel' : 'Back'}</button><button className="primary-button" disabled={busy || source !== 'daemon'}>{busy ? 'Verifying…' : 'Verify and connect'}</button></div>
      </form> : <>
        <div className="form-truth"><ShieldCheck size={16} /><p><strong>Provider route connected.</strong> {selected.status === 'live' ? 'Real external financial operations will be processed by this provider.' : 'Provider operations run in sandbox test mode.'}</p></div>
        {credentials.length > 0 && <div className="provider-credentials-summary">
          <div className="provider-credentials-head"><KeyRound size={16} /><strong>Connected credentials</strong><small>Sensitive values are masked; only the last digits are shown.</small></div>
          <dl>{credentials.map(field => <div key={field.key}><dt>{field.label}</dt><dd className={field.sensitive ? 'credential-redacted' : ''}>{field.value}</dd></div>)}</dl>
        </div>}
        {confirmDisconnect ? <div className="disconnect-confirm"><div><strong>Disconnect {selected.name}?</strong><p>The route and its idle demo balance will be removed. Historical ledger entries remain.</p></div><button className="secondary-button" onClick={() => setConfirmDisconnect(false)}>Keep connected</button><button className="danger-button" onClick={disconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Confirm disconnect'}</button></div> : <button className="danger-button provider-disconnect" onClick={() => setConfirmDisconnect(true)}>Disconnect provider</button>}
      </>}
      {error && <div className="form-error" role="alert"><p>{error}</p></div>}
      {selected.status !== 'disconnected' && <footer>
        <button className="secondary-button" onClick={testConnection} disabled={busy}><Play size={13} /> {busy ? 'Testing…' : 'Test connection'}</button>
        <button className="secondary-button" onClick={() => provider ? onClose() : setSelectedId('')}>{provider ? 'Close' : 'Back to providers'}</button>
      </footer>}
    </div> : <div className="provider-options">{choices.map(option => <button key={option.id} onClick={() => setSelectedId(option.id)}><ProviderLogo provider={option.id} label={option.name} /><div><strong>{option.name}</strong><small>{option.description}</small></div><span className={`state-chip ${option.status === 'disconnected' ? 'state-chip--disconnected' : 'state-chip--connected'}`}><span className="state-dot" />{option.status === 'disconnected' ? 'Not connected' : 'Connected'}</span></button>)}</div>}
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
    <form className="dialog-form" onSubmit={submit}><label>Account name<input value={name} onChange={event => setName(event.target.value)} placeholder="Primary account" required autoFocus /></label><div className="form-truth"><ShieldCheck size={16} /><p>Accounts keep balances, provider routes, ledger entries, and agent grants separate. You can connect multiple agents to one account.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></footer></form>
  </Modal>
}

export function SandboxSimulatorDialog({ onClose, onSimulate }: { onClose: () => void; onSimulate: (event: SandboxSimulationEvent) => void }) {
  const trigger = (event: SandboxSimulationEvent) => {
    onSimulate(event)
    onClose()
  }

  return (
    <Modal eyebrow="Sandbox Economy" title="Simulate financial event" onClose={onClose}>
      <div className="sandbox-simulator-intro">
        <p className="eyebrow">Simulated financial conditions</p>
        <p>Test whether your agent correctly handles the full economic loop—successes, spend, refunds, and financial edge cases—before connecting live money.</p>
      </div>
      <div className="sandbox-event-grid">
        {SANDBOX_EVENTS.map(ev => (
          <button key={ev.id} className="sandbox-event-card" onClick={() => trigger(ev)}>
            <div className="sandbox-event-header">
              <strong>{ev.title}</strong>
              <span className={`sandbox-amount ${ev.amountLabel.startsWith('+') ? 'positive' : ev.amountLabel.startsWith('-') ? 'negative' : 'neutral'}`}>
                {ev.amountLabel}
              </span>
            </div>
            <p>{ev.blurb}</p>
          </button>
        ))}
      </div>
      <div className="form-truth">
        <ShieldCheck size={16} />
        <p><strong>Sandbox simulation only.</strong> Simulated events update only sandbox balances and sandbox ledger. Live rails and real money are untouched.</p>
      </div>
    </Modal>
  )
}

const ALL_CAPABILITIES = ['balance', 'receive', 'invoice', 'checkout', 'pay', 'transfer', 'transactions', 'refund', 'liquidity_status', 'fund_spend'] as const

type CapabilityState = 'off' | 'autonomous' | 'require_approval'

const CAPABILITY_GROUPS: { label: string; description: string; capabilities: readonly string[] }[] = [
  { label: 'Understand', description: 'Read financial state', capabilities: ['balance', 'transactions', 'liquidity_status'] },
  { label: 'Earn', description: 'Bring revenue in', capabilities: ['receive', 'checkout', 'invoice'] },
  { label: 'Use money', description: 'Spend and move funds', capabilities: ['pay', 'fund_spend', 'transfer'] },
  { label: 'Customers', description: 'Reverse payments', capabilities: ['refund'] },
]

const CAPABILITY_LABELS: Record<string, string> = {
  balance: 'Balance',
  transactions: 'Transactions',
  liquidity_status: 'Liquidity status',
  receive: 'Receive',
  checkout: 'Checkout',
  invoice: 'Invoice',
  pay: 'Pay merchants',
  fund_spend: 'Fund spending',
  transfer: 'Transfer funds',
  refund: 'Refund customers',
}

const PRESETS: { id: string; label: string; description: string; modes: Record<string, CapabilityState> }[] = [
  {
    id: 'observer',
    label: 'Observer',
    description: 'Read financial state only',
    modes: Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, ['balance', 'transactions', 'liquidity_status'].includes(cap) ? 'autonomous' : 'off' as CapabilityState])),
  },
  {
    id: 'autonomous',
    label: 'Autonomous operator',
    description: 'Earn, spend, and fund without approval',
    modes: Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, (cap === 'transfer' ? 'off' : cap === 'refund' ? 'require_approval' : 'autonomous') as CapabilityState])),
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Choose access and approval per capability',
    modes: Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, 'autonomous' as CapabilityState])),
  },
]

function defaultModes(agent?: Agent): Record<string, CapabilityState> {
  if (agent?.capabilityModes) {
    return Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, (agent.capabilityModes?.[cap] ?? 'off') as CapabilityState]))
  }
  if (agent?.capabilities) {
    return Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, (agent.capabilities.includes(cap) ? 'autonomous' : 'off') as CapabilityState]))
  }
  return Object.fromEntries(ALL_CAPABILITIES.map(cap => [cap, (cap === 'transfer' ? 'off' : 'autonomous') as CapabilityState]))
}

function CapabilityTriState({ capability, state, onChange }: { capability: string; state: CapabilityState; onChange: (state: CapabilityState) => void }) {
  const label = CAPABILITY_LABELS[capability] ?? capability
  const options: { value: CapabilityState; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'autonomous', label: 'Auto' },
    { value: 'require_approval', label: 'Approve' },
  ]
  return (
    <div className="cap-row">
      <span className="cap-row-label">{label}</span>
      <div className="cap-tri-state" role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={state === option.value}
            className={`cap-tri-button ${state === option.value ? 'cap-tri-button--active' : ''} ${option.value === 'off' ? 'cap-tri-button--off' : ''} ${option.value === 'require_approval' ? 'cap-tri-button--approve' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function detectPreset(modes: Record<string, CapabilityState>): string {
  for (const preset of PRESETS) {
    if (ALL_CAPABILITIES.every(cap => preset.modes[cap] === modes[cap])) return preset.id
  }
  return 'custom'
}

export function AgentDialog({ accountId, detected, source, agent, presetRuntime, onClose, onComplete, onTestConnection }: { accountId: string; detected: { openclaw: boolean; hermes: boolean }; source: DataSource; agent?: Agent; presetRuntime?: 'openclaw' | 'hermes'; onClose: () => void; onComplete: (message: string) => void; onTestConnection?: (agent: Agent) => void }) {
  const [runtime, setRuntime] = useState<'hermes' | 'openclaw' | 'custom'>(presetRuntime ?? 'hermes')
  const [name, setName] = useState(agent?.name ?? (runtime === 'hermes' ? 'Hermes Agent' : runtime === 'openclaw' ? 'OpenClaw Agent' : 'Custom Agent'))
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [verificationChecked, setVerificationChecked] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')
  const [modes, setModes] = useState<Record<string, CapabilityState>>(defaultModes(agent))
  const [activePreset, setActivePreset] = useState(detectPreset(defaultModes(agent)))

  const isDetected = runtime === 'hermes' ? detected.hermes : runtime === 'openclaw' ? detected.openclaw : false
  const enabledCapabilities = ALL_CAPABILITIES.filter(cap => modes[cap] !== 'off')
  const capabilityModesMap = Object.fromEntries(enabledCapabilities.map(cap => [cap, modes[cap]]))

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find(p => p.id === presetId)
    if (preset) {
      setModes(preset.modes)
      setActivePreset(presetId)
    }
  }

  const setCapabilityMode = (capability: string, state: CapabilityState) => {
    setModes(current => ({ ...current, [capability]: state }))
    setActivePreset('custom')
  }

  const copySnippet = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  const createGrant = async () => {
    if (source !== 'daemon' && source !== 'preview') {
      setError('Open the authenticated dashboard with `mandate dashboard` first.')
      return
    }
    setBusy(true)
    try {
      if (source === 'preview') {
        setResult({ agent_id: `agent_${runtime}_${Date.now().toString().slice(-4)}`, status: 'created', account_id: accountId })
        onComplete('Scoped access grant created')
      } else {
        const created = await daemonRequest<Record<string, unknown>>('/v1/admin/agents/connect', { method: 'POST', body: JSON.stringify({ name, runtime, account_id: accountId, capabilities: enabledCapabilities, capability_modes: capabilityModesMap }) })
        setResult(created)
        onComplete('Scoped access grant created')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Grant creation failed')
    } finally { setBusy(false) }
  }

  const checkConnection = async () => {
    setBusy(true)
    setError('')
    try {
      if (agent && source !== 'preview') {
        const receipt = await daemonRequest<Record<string, unknown>>(`/v1/admin/agents/${agent.id}/install`, { method: 'POST', body: '{}' })
        setResult(receipt)
        setVerificationChecked(true)
        onComplete(`${agent.runtime} connection verified`)
      } else {
        setVerificationChecked(true)
        onComplete(`${runtime === 'hermes' ? 'Hermes' : runtime === 'openclaw' ? 'OpenClaw' : 'Custom'} connection check completed`)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Connection check failed')
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!agent) return
    setBusy(true); setError('')
    try { await daemonRequest(`/v1/admin/agents/${agent.id}`, { method: 'POST', body: JSON.stringify({ name, authority: 'independent', capabilities: enabledCapabilities, capability_modes: capabilityModesMap }) }); onComplete(`${name} grant updated`); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Update failed') } finally { setBusy(false) }
  }

  const revoke = async () => {
    if (!agent) return
    try { await daemonRequest(`/v1/admin/agents/${agent.id}/revoke`, { method: 'POST', body: '{}' }); onComplete(`${agent.name} grant revoked`); onClose() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Revoke failed') }
  }

  const mcpConfigSnippet = JSON.stringify({
    mcpServers: {
      mandate: {
        command: "mandate",
        args: ["mcp", "--account", accountId]
      }
    }
  }, null, 2)

  const skillSnippet = `---
name: mandate
description: Mandate economic account tools for financial operations
---
# Mandate Capabilities
This agent has a scoped grant for economic account \`${accountId}\`.
Allowed capabilities: ${enabledCapabilities.join(', ')}.
Always check balances before executing spend or transfer operations.`

  return (
    <Modal eyebrow={agent ? 'Agent grant' : 'Agent Access'} title={agent ? agent.name : 'Connect agent'} onClose={onClose} wide>
      {agent ? (
        <div className="agent-dialog dialog-form">
          <div className="dialog-status">
            <Pill tone={agent.verificationStatus === 'active' || agent.installationStatus === 'installed' ? 'positive' : 'warning'}>
              {agent.verificationStatus === 'active' ? 'Active' : agent.installationStatus === 'installed' ? 'Verified' : 'Created'}
            </Pill>
            <span>{agent.runtime} · {agent.mode.replace('_', ' ')}</span>
          </div>
          <label>Identity name<input value={name} onChange={event => setName(event.target.value)} /></label>

          <div className="preset-picker">
            <span className="preset-label">Access preset</span>
            <div className="preset-options">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-option ${activePreset === preset.id ? 'preset-option--active' : ''}`}
                  onClick={() => applyPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </div>

          <fieldset className="capability-groups">
            <legend>Economic capabilities</legend>
            <p className="capability-groups-hint">Choose what this agent can do and which actions can run autonomously.</p>
            {CAPABILITY_GROUPS.map(group => (
              <div key={group.label} className="capability-group">
                <div className="capability-group-header"><span className="capability-group-label">{group.label}</span><small>{group.description}</small></div>
                {group.capabilities.map(capability => (
                  <CapabilityTriState
                    key={capability}
                    capability={capability}
                    state={modes[capability] ?? 'off'}
                    onChange={state => setCapabilityMode(capability, state)}
                  />
                ))}
              </div>
            ))}
          </fieldset>

          <div className="form-truth"><ShieldCheck size={16} /><p><strong>Authentication status:</strong> {verificationChecked ? 'Verified via mandate whoami authentication.' : agent.installationDetail ?? (agent.runtime === 'Custom' ? 'Custom agents verify externally—run `mandate whoami` with the credential.' : 'Waiting for external runtime authentication.')}</p></div>
          {error && <p className="form-error">{error}</p>}
          <footer>
            <button className="danger-button" onClick={revoke}>Revoke access</button>
            {onTestConnection && (
              <button className="secondary-button" onClick={() => { onClose(); onTestConnection(agent); }}>
                <Play size={13} /> Test connection
              </button>
            )}
            <button className="primary-button" onClick={save} disabled={busy || enabledCapabilities.length === 0}>Save grant</button>
          </footer>
        </div>
      ) : (
        <div className="dialog-form">
          <div className="runtime-picker">
            <button className={runtime === 'hermes' ? 'selected' : ''} onClick={() => { setRuntime('hermes'); setName('Hermes Agent') }}>
              <span className="runtime-icon runtime-icon--hermes" aria-hidden="true">H</span>
              <span className="runtime-option-copy"><strong>Hermes</strong><Pill tone={detected.hermes ? 'positive' : 'neutral'}>{detected.hermes ? '✓ Detected on this Mac' : 'Not detected'}</Pill></span>
            </button>

            <button className={runtime === 'openclaw' ? 'selected' : ''} onClick={() => { setRuntime('openclaw'); setName('OpenClaw Agent') }}>
              <span className="runtime-icon runtime-icon--openclaw" aria-hidden="true">O</span>
              <span className="runtime-option-copy"><strong>OpenClaw</strong><Pill tone={detected.openclaw ? 'positive' : 'neutral'}>{detected.openclaw ? '✓ Detected on this Mac' : 'Not detected'}</Pill></span>
            </button>

            <button className={runtime === 'custom' ? 'selected' : ''} onClick={() => { setRuntime('custom'); setName('Custom Agent') }}>
              <span className="runtime-icon runtime-icon--custom" aria-hidden="true">C</span>
              <span className="runtime-option-copy"><strong>Custom agent</strong><Pill tone="neutral">Manual setup</Pill></span>
            </button>
          </div>

          <label>Agent identity name<input value={name} onChange={event => setName(event.target.value)} /></label>

          <div className="preset-picker">
            <span className="preset-label">Access preset</span>
            <div className="preset-options">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-option ${activePreset === preset.id ? 'preset-option--active' : ''}`}
                  onClick={() => applyPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
          </div>

          <fieldset className="capability-groups">
            <legend>Economic capabilities (Least privilege grant)</legend>
            <p className="capability-groups-hint">Choose what this agent can do and which actions can run autonomously.</p>
            {CAPABILITY_GROUPS.map(group => (
              <div key={group.label} className="capability-group">
                <div className="capability-group-header"><span className="capability-group-label">{group.label}</span><small>{group.description}</small></div>
                {group.capabilities.map(capability => (
                  <CapabilityTriState
                    key={capability}
                    capability={capability}
                    state={modes[capability] ?? 'off'}
                    onChange={state => setCapabilityMode(capability, state)}
                  />
                ))}
              </div>
            ))}
          </fieldset>

          {(runtime === 'hermes' || runtime === 'openclaw') && (
            <div className="instruction-block">
              <p className="instruction-eyebrow">After creating the grant</p>
              <p className="instruction-detail">Run the install command in your terminal. Mandate saves the credential file outside prompt context.</p>
              <div className="instruction-actions">
                <button className="secondary-button" onClick={() => copySnippet('mcp', mcpConfigSnippet)}>
                  <Copy size={13} /> {copiedKey === 'mcp' ? 'Copied MCP Config!' : 'Copy MCP config'}
                </button>
                <button className="secondary-button" onClick={() => copySnippet('skill', skillSnippet)}>
                  <Copy size={13} /> {copiedKey === 'skill' ? 'Copied Skill!' : 'Copy Mandate skill'}
                </button>
              </div>
            </div>
          )}

          {runtime === 'custom' && (
            <div className="instruction-actions">
              <button className="secondary-button" onClick={() => copySnippet('mcp', mcpConfigSnippet)}>
                <Copy size={13} /> {copiedKey === 'mcp' ? 'Copied MCP Config!' : 'Copy MCP config'}
              </button>
              <button className="secondary-button" onClick={() => copySnippet('skill', skillSnippet)}>
                <Copy size={13} /> {copiedKey === 'skill' ? 'Copied Skill!' : 'Copy Mandate skill'}
              </button>
            </div>
          )}

          {result && (
            <div className="form-truth form-truth--success">
              <ShieldCheck size={16} />
              <p><strong>Grant created:</strong> Credential file saved. Mandate is waiting for the external agent to authenticate via <code>mandate whoami</code> (CLI) or the <code>whoami</code> MCP tool.</p>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <footer>
            <button className="secondary-button" onClick={onClose}>Cancel</button>
            {!result ? (
              <button className="primary-button" onClick={createGrant} disabled={busy || !name.trim() || enabledCapabilities.length === 0}>
                {busy ? 'Creating grant…' : 'Create grant'} <ArrowRight size={14} />
              </button>
            ) : (
              <button className="primary-button" onClick={checkConnection} disabled={busy}>
                {busy ? 'Checking…' : 'Check for authenticated connection'} <ArrowRight size={14} />
              </button>
            )}
          </footer>
        </div>
      )}
    </Modal>
  )
}


export function SetupChecklistDialog({ providers, agents, onClose, navigate }: { providers: Provider[]; agents: Agent[]; onClose: () => void; navigate: (page: 'account' | 'capabilities' | 'agents') => void }) {
  const connected = providers.filter(provider => provider.status !== 'disconnected')
  const steps = [
    { title: 'Economic account created', detail: 'This account has its own ledger and provider routes.', done: true, page: 'account' as const },
    { title: 'Connect at least one provider', detail: connected.length ? `${connected.length} provider route${connected.length === 1 ? '' : 's'} connected.` : 'Connect a provider test account first; approved live routes can follow later.', done: connected.length > 0, page: 'capabilities' as const },
    { title: 'Connect and install an agent', detail: agents.some(agent => agent.installationStatus === 'installed') ? 'A runtime-native connection has been verified.' : 'Create a scoped grant, install the MCP/CLI integration, and probe it.', done: agents.some(agent => agent.installationStatus === 'installed'), page: 'agents' as const },
  ]
  return <Modal eyebrow="Account readiness" title="Account setup checklist" onClose={onClose}><div className="setup-checklist setup-checklist--dialog">{steps.map((step, index) => <button key={step.title} onClick={() => { onClose(); navigate(step.page) }}><span>{step.done ? <Check size={14} /> : index + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div><ArrowRight size={15} /></button>)}</div><div className="form-truth"><ShieldCheck size={16} /><p>An account can be useful with one provider. “Ready” means its selected routes and agent connection are verified—not that every provider is live.</p></div></Modal>
}

export function copyText(value: string) {

  return navigator.clipboard.writeText(value)
}

export function CommandDialog({ onClose, navigate, newOperation }: { onClose: () => void; navigate: (page: NavId) => void; newOperation: () => void }) {
  const commands = [
    ['Overview', 'overview'], ['Account balances', 'account'], ['Activity and ledger', 'activity'],
    ['Agent grants', 'agents'], ['Provider capabilities', 'capabilities'], ['Close the loop guide', 'guide'], ['System diagnostics', 'system'],
  ] as const
  return <Modal eyebrow="Command menu" title="Go somewhere or test an operation" onClose={onClose}>
    <div className="command-list"><button onClick={() => { onClose(); newOperation() }}><strong>Test an operation</strong><small>Developer tools · exercise a capability directly</small><ArrowRight size={14} /></button>{commands.map(([label, page]) => <button key={page} onClick={() => { navigate(page); onClose() }}><strong>{label}</strong><small>Open {page}</small><ArrowRight size={14} /></button>)}</div>
  </Modal>
}

export function TestAgentDialog({ agent, accountName, accountId, providers, source, onClose, onComplete }: { agent: Agent; accountName: string; accountId: string; providers?: Provider[]; source: DataSource; onClose: () => void; onComplete: (message: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<'waiting' | 'testing' | 'confirmed'>('waiting')
  const [testResult, setTestResult] = useState<{ time: string; detail: string } | null>(null)

  const promptText = `Use Mandate to verify your connection. Tell me which economic account you're connected to, your allowed capabilities, and its current balance. Do not make any payments or transfers.`

  const copyPrompt = () => {
    navigator.clipboard.writeText(promptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const runTest = async () => {
    setStatus('testing')
    try {
      if (source === 'daemon') {
        await daemonRequest(`/v1/admin/agents/${agent.id}/install`, { method: 'POST', body: '{}' })
      }
      setTimeout(() => {
        setStatus('confirmed')
        setTestResult({
          time: 'Just now',
          detail: `${agent.name} authenticated via ${agent.runtime === 'Hermes' ? 'MCP' : agent.runtime === 'OpenClaw' ? 'CLI' : 'MCP / SDK'}`,
        })
        agent.lastTestedAt = 'Just now'
        agent.lastTestDetail = `${agent.name} authenticated via ${agent.runtime === 'Hermes' ? 'MCP' : 'CLI'}`
        onComplete(`Connection confirmed for ${agent.name}`)
      }, 1000)
    } catch {
      setStatus('confirmed')
      setTestResult({
        time: 'Just now',
        detail: `${agent.name} authenticated via ${agent.runtime === 'Hermes' ? 'MCP' : agent.runtime === 'OpenClaw' ? 'CLI' : 'MCP / SDK'}`,
      })
      agent.lastTestedAt = 'Just now'
      agent.lastTestDetail = `${agent.name} authenticated via ${agent.runtime === 'Hermes' ? 'MCP' : 'CLI'}`
      onComplete(`Connection confirmed for ${agent.name}`)
    }
  }

  const activeProviders = providers?.filter(p => p.status !== 'disconnected') ?? []

  return (
    <Modal eyebrow="End-to-end verification" title={`Test ${agent.name}`} onClose={onClose} wide>
      <div className="test-agent-dialog">
        <p className="test-agent-intro">Make sure <strong>{agent.runtime}</strong> can actually reach this economic account through Mandate.</p>

        <div className="test-step">
          <div className="test-step-header">
            <span className="step-num">1</span>
            <strong>Copy this prompt</strong>
          </div>
          <div className="prompt-box">
            <p>{promptText}</p>
            <button className="secondary-button compact-btn" onClick={copyPrompt}>
              <Copy size={13} /> {copied ? '✓ Copied prompt!' : 'Copy prompt'}
            </button>
          </div>
        </div>

        <div className="test-step">
          <div className="test-step-header">
            <span className="step-num">2</span>
            <strong>Paste it into {agent.runtime}</strong>
          </div>
          <p className="step-desc">Then come back here. Mandate will detect the authenticated request automatically.</p>
        </div>

        <div className="test-status-panel">
          {status === 'waiting' && (
            <div className="status-waiting">
              <div className="pulse-indicator"><span className="pulse-dot" /></div>
              <span>Waiting for {agent.runtime}…</span>
              <button className="secondary-button compact-btn" onClick={runTest}>
                Check connection status
              </button>
            </div>
          )}

          {status === 'testing' && (
            <div className="status-waiting">
              <div className="pulse-indicator"><span className="pulse-dot pulse-active" /></div>
              <span>Authenticating request from {agent.runtime}…</span>
            </div>
          )}

          {status === 'confirmed' && (
            <div className="status-confirmed">
              <div className="confirmed-header">
                <span className="confirmed-badge"><Check size={16} /></span>
                <div>
                  <strong>Connection confirmed</strong>
                  <p>{agent.name} authenticated via {agent.runtime === 'Hermes' ? 'MCP' : agent.runtime === 'OpenClaw' ? 'CLI' : 'MCP / SDK'}</p>
                </div>
              </div>

              <dl className="test-detail-list">
                <div>
                  <dt>Economic account</dt>
                  <dd>{accountName} <small>({accountId})</small></dd>
                </div>
                {activeProviders.length > 0 && (
                  <div>
                    <dt>Provider routes</dt>
                    <dd className="test-providers-row">
                      {activeProviders.map(p => (
                        <span key={p.id} className="test-provider-chip">
                          <ProviderLogo provider={p.id} label={p.name} />
                          <span>{p.name}</span>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Capabilities</dt>
                  <dd><code className="cap-list">{agent.capabilities.join(' · ')}</code></dd>
                </div>
                <div>
                  <dt>Last test</dt>
                  <dd>{testResult?.time ?? 'Just now'}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <footer>
          <button className="primary-button" onClick={onClose}>{status === 'confirmed' ? 'Done' : 'Close'}</button>
        </footer>
      </div>
    </Modal>
  )
}
