import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  Command,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Layers3,
  Menu,
  MoreHorizontal,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  WalletCards,
  X,
} from 'lucide-react'
import { initializeInstance, loadDashboard, type DataSource } from './lib/api'
import { fixtureData } from './lib/fixtures'
import type { Agent, DashboardData, EconomicAccount, NavId, Provider, Transaction } from './lib/types'
import { ArrowAction, FlowLine, LogoMark, Pill, RowAction, SectionHeading, formatAtomic } from './components/ui'
import { AccountDialog, AccountingDialog, AgentDialog, CommandDialog, EnvironmentDialog, LedgerDialog, OperationDialog, ProfileDialog, ProviderDialog, SetupChecklistDialog, type ProviderCategory } from './components/dialogs'

const NAV: { id: NavId; label: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'account', label: 'Account', icon: WalletCards },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'capabilities', label: 'Capabilities', icon: Layers3 },
  { id: 'system', label: 'System', icon: Settings2 },
]

function EnvironmentBadge({ source, onClick }: { source: DataSource; onClick: () => void }) {
  const label = source === 'daemon' ? 'Local daemon' : source === 'preview' ? 'Demo preview' : source === 'locked' ? 'Locked' : 'Setup'
  const tone = source === 'daemon' ? 'state-chip--connected' : source === 'locked' ? 'state-chip--pending' : 'state-chip--sandbox'
  return <div className="environment-badge"><button className="mode-button" onClick={onClick}><span className={`state-chip ${tone}`}><span className="state-dot" />{label}</span><ChevronDown size={13} /></button></div>
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M'
}

function Shell({ page, onNavigate, source, data, children, openSetup, openCommand, openEnvironment, editProfile, selectAccount, createAccount }: { page: NavId; onNavigate: (id: NavId) => void; source: DataSource; data: DashboardData; children: React.ReactNode; openSetup: () => void; openCommand: () => void; openEnvironment: () => void; editProfile: () => void; selectAccount: (id: string) => void; createAccount: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="brand"><LogoMark /><span>Mandate</span></div>
        <button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        <button className="account-switcher" onClick={() => { setAccountOpen(open => !open); setProfileOpen(false) }} aria-expanded={accountOpen}>
          <span className="account-glyph">{data.accountName.charAt(0).toUpperCase()}</span>
          <div><strong>{data.accountName}</strong><small>Economic account</small></div>
          <ChevronDown size={15} />
        </button>
        {accountOpen && <div className="account-menu"><p className="eyebrow">Economic accounts</p><strong>{data.principalName}</strong><small>{source === 'daemon' ? `${data.accounts.length} ${data.accounts.length === 1 ? 'account' : 'accounts'} configured` : 'Illustrative preview account'}</small><div className="account-menu-list">{data.accounts.map(account => <button key={account.id} className={account.id === data.accountId ? 'selected' : ''} onClick={() => { setAccountOpen(false); selectAccount(account.id) }}><span><strong>{account.name}</strong><small>{account.id === data.accountId ? 'Current account' : 'Switch account'}</small></span>{account.id === data.accountId && <Check size={14} />}</button>)}</div>{source === 'daemon' && <button onClick={() => { setAccountOpen(false); createAccount() }}><Plus size={13} /> Create account</button>}<button onClick={() => { setAccountOpen(false); onNavigate('account') }}>View current account <ArrowUpRight size={13} /></button></div>}
        <nav aria-label="Primary navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => { onNavigate(id); setMobileOpen(false) }} aria-current={page === id ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.7} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`sandbox-card ${source === 'daemon' ? 'sandbox-card--connected' : ''}`}><span>{source === 'daemon' ? 'Local runtime' : 'Demo preview'}</span><p>{source === 'daemon' ? <>Encrypted and account-scoped.<br />Provider status shown per rail.</> : <>Illustrative data only.<br />No operations will run.</>}</p></div>
          <button className="profile-button" onClick={() => { setProfileOpen(open => !open); setAccountOpen(false) }} aria-expanded={profileOpen}>
            <span className="avatar">{initials(data.administratorName)}</span><span><strong>{data.administratorName}</strong><small>{data.principalName}</small></span><MoreHorizontal size={16} />
          </button>
          {profileOpen && <div className="profile-menu"><p className="eyebrow">Local operator</p><strong>{data.administratorName}</strong><small>{data.principalName} · {source === 'daemon' ? 'this Mac only' : 'illustrative preview'}</small>{source === 'daemon' && <button onClick={() => { setProfileOpen(false); editProfile() }}>Edit local profile <ArrowUpRight size={13} /></button>}<button onClick={() => { setProfileOpen(false); openEnvironment() }}>Local connection <ArrowUpRight size={13} /></button><button onClick={() => { setProfileOpen(false); openSetup() }}>{source === 'preview' ? 'Exit demo preview' : 'Account setup checklist'} <ArrowUpRight size={13} /></button><button onClick={() => { setProfileOpen(false); onNavigate('system') }}>System diagnostics <ArrowUpRight size={13} /></button></div>}
        </div>
      </aside>
      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <main id="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="mobile-brand"><LogoMark /><strong>Mandate</strong></div>
          <div className="topbar-actions">
            <EnvironmentBadge source={source} onClick={openEnvironment} />
            <button className="command-button" onClick={openCommand}><Search size={15} /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" aria-label="Open command menu" onClick={openCommand}><Command size={17} /></button>
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {NAV.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={19} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  )
}

function PageIntro({ kicker, title, description, actions }: { kicker?: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <div className="page-intro">
      <div>{kicker && <p className="eyebrow">{kicker}</p>}<h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

function Overview({ data, source, navigate, newOperation }: { data: DashboardData; source: DataSource; navigate: (id: NavId) => void; newOperation: () => void }) {
  const reserved = data.positions.reduce((total, position) => total + Number(position.reserved) / (10 ** position.decimals), 0)
  const connectedProviders = data.providers.filter(provider => provider.status !== 'disconnected')
  const flowStages = [
    { name: 'Receive', value: connectedProviders.some(provider => provider.category === 'Receive') ? 'Ready' : 'Not connected', detail: 'Provider route' },
    { name: 'Hold', value: `$${data.estimateUsd}`, detail: `${data.positions.length} positions` },
    { name: 'Spend', value: `$${reserved.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, detail: 'Currently reserved' },
    { name: 'Reinvest', value: 'Explicit', detail: 'No auto-routing' },
  ]
  if (source === 'daemon' && connectedProviders.length === 0) return <div className="page page-enter">
    <PageIntro kicker="Welcome to Mandate" title={`Set up ${data.accountName}.`} description="This economic account is empty. Connect only the capabilities this account needs, then assign one or more scoped agents." />
    <section className="zero-state-hero"><div className="zero-state-line"><span>1</span><i /><span>2</span><i /><span>3</span></div><div><p className="eyebrow">Your first working account</p><h2>Connect a provider route, add an agent, then run a test operation.</h2><p>Nothing has been preloaded. Demo routes are optional and remain visibly separate from future external provider connections.</p></div><button className="primary-button" onClick={() => navigate('capabilities')}>Choose capabilities <ArrowRight size={15} /></button></section>
    <div className="setup-checklist"><button onClick={() => navigate('capabilities')}><span>1</span><div><strong>Connect a capability</strong><small>Receive with Stripe, hold with Coinbase, or spend with Lithic.</small></div><ArrowRight size={15} /></button><button onClick={() => navigate('agents')}><span>2</span><div><strong>Connect an agent</strong><small>Every agent receives a scoped identity for this account.</small></div><ArrowRight size={15} /></button><button onClick={newOperation} disabled><span>3</span><div><strong>Run the proof</strong><small>Available after at least one provider route is connected.</small></div><ArrowRight size={15} /></button></div>
    <div className="truth-note zero-state-note"><ShieldCheck size={16} /><p><strong>Accounts are independent boundaries.</strong> Provider positions, agent grants, transactions, and reservations belong to this account only.</p></div>
  </div>
  return (
    <div className="page page-enter">
      <PageIntro kicker="Thursday, August 6" title="Economic continuity, at a glance." description="One account across every rail your agents use." actions={<button className="primary-button" onClick={newOperation}><Plus size={15} /> New operation</button>} />
      <section className="hero-balance">
        <div className="balance-copy">
          <div className="balance-label"><span>Estimated account value</span><Pill tone="neutral">USD estimate</Pill></div>
          <div className="big-amount"><sup>$</sup>{data.estimateUsd}</div>
          <p>{source === 'daemon' ? 'Local provider test positions' : 'Illustrative preview'} <span aria-hidden="true">·</span> Valued {data.valuationAt}</p>
        </div>
        <button className="balance-link" onClick={() => navigate('account')}>View positions <ArrowUpRight size={15} /></button>
        <FlowLine stages={flowStages} />
      </section>
      <div className="overview-grid">
        <section className="panel readiness-panel">
          <SectionHeading eyebrow="Capability readiness" title="Your economic loop" action={<ArrowAction onClick={() => navigate('capabilities')}>Manage</ArrowAction>} />
          <div className="readiness-list">
            {[
              { title: 'Receive', detail: connectedProviders.filter(p => p.category === 'Receive').map(p => p.name).join(' + ') || 'No route connected', icon: ArrowDownLeft, note: `${connectedProviders.filter(p => p.category === 'Receive').length} connected` },
              { title: 'Hold', detail: connectedProviders.filter(p => p.category === 'Hold').map(p => p.name).join(' + ') || 'No route connected', icon: CircleDollarSign, note: `${connectedProviders.filter(p => p.category === 'Hold').length} connected` },
              { title: 'Spend', detail: connectedProviders.filter(p => p.category === 'Spend').map(p => p.name).join(' + ') || 'No route connected', icon: ArrowUpRight, note: `${connectedProviders.filter(p => p.category === 'Spend').length} connected` },
            ].map(({ title, detail, icon: Icon, note }) => (
              <div className="readiness-row" key={title}>
                <span className="capability-icon"><Icon size={17} /></span>
                <div><strong>{title}</strong><small>{detail}</small></div>
                <span className="ready-note"><Check size={13} />{note}</span>
              </div>
            ))}
          </div>
          <div className="truth-note"><ShieldCheck size={16} /><p><strong>Rails remain separate.</strong> Mandate never moves funds between providers without an explicit operation.</p></div>
        </section>
        <section className="panel agents-glance">
          <SectionHeading eyebrow="Agents" title="Operating now" action={<ArrowAction onClick={() => navigate('agents')}>View all</ArrowAction>} />
          {data.agents.slice(0, 2).map(agent => <AgentRow key={agent.id} agent={agent} compact />)}
          {data.agents.length ? <div className="agent-pulse"><span><Sparkles size={14} /></span><p><strong>{data.agents[0].name}</strong> has a scoped grant for this economic account.</p><small>{data.agents[0].lastSeen}</small></div> : <div className="empty-inline"><Bot size={18} /><p>No agent identities yet. Connect Hermes or OpenClaw from the Agents view.</p></div>}
        </section>
      </div>
      <section className="panel activity-panel">
        <SectionHeading eyebrow="Activity" title="Latest across the account" action={<ArrowAction onClick={() => navigate('activity')}>Full history</ArrowAction>} />
        <TransactionTable transactions={data.transactions.slice(0, 4)} />
      </section>
    </div>
  )
}

function Account({ data, explainAccounting, newOperation, fundAccount, reconcile }: { data: DashboardData; explainAccounting: () => void; newOperation: () => void; fundAccount: () => void; reconcile: () => void }) {
  const totals = useMemo(() => {
    const sum = (field: 'available' | 'reserved' | 'pending') => data.positions.reduce((value, position) => value + Number(position[field]) / (10 ** position.decimals), 0)
    return { available: `$${sum('available').toLocaleString(undefined, { minimumFractionDigits: 2 })}`, reserved: `$${sum('reserved').toLocaleString(undefined, { minimumFractionDigits: 2 })}`, pending: `$${sum('pending').toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
  }, [data.positions])
  if (data.positions.length === 0) return <div className="page page-enter"><PageIntro kicker="Economic account" title={data.accountName} description="No provider positions have been created for this account yet." /><section className="panel account-empty"><WalletCards size={24} /><h2>No balances or reservations</h2><p>Connect a provider route from Capabilities. A position appears only after that account has a real or demo rail.</p></section><div className="callout"><ShieldCheck size={20} /><div><strong>This is a clean account.</strong><p>Agents, providers, and ledger entries from other economic accounts are not visible here.</p></div><button className="text-action" onClick={explainAccounting}>How accounting works <ArrowUpRight size={14} /></button></div></div>
  return (
    <div className="page page-enter">
      <PageIntro kicker="Economic account" title={data.accountName} description="Every provider position, reconciled without pretending the rails are interchangeable." actions={<><button className="secondary-button" onClick={reconcile}><RefreshCw size={15} /> Refresh ledger</button><button className="secondary-button" onClick={fundAccount}>Fund account</button><button className="primary-button" onClick={newOperation}>Move money</button></>} />
      <div className="metric-strip">
        <div><span>Estimated value</span><strong>${data.estimateUsd}</strong><small>USD · {data.valuationAt}</small></div>
        <div><span>Available</span><strong>{totals.available}</strong><small>Across {data.positions.length} {data.positions.length === 1 ? 'position' : 'positions'}</small></div>
        <div><span>Reserved</span><strong>{totals.reserved}</strong><small>{data.positions.some(position => BigInt(position.reserved) > 0n) ? 'Active reservations' : 'No active reservations'}</small></div>
        <div><span>Pending</span><strong>{totals.pending}</strong><small>{data.positions.some(position => BigInt(position.pending) > 0n) ? 'Awaiting provider settlement' : 'Nothing pending'}</small></div>
      </div>
      <section className="panel positions-panel">
        <SectionHeading eyebrow="Underlying positions" title="Where value actually lives" action={<Pill tone="positive"><Check size={12} /> Reconciled</Pill>} />
        <div className="position-list">
          {data.positions.map(position => (
            <div className="position-row" key={position.provider}>
              <span className="provider-monogram">{position.label.slice(0, 1)}</span>
              <div className="position-name"><strong>{position.label}</strong><small>{position.asset}{position.network ? ` · ${position.network}` : ''}</small></div>
              <div><span>Available</span><strong>{formatAtomic(position.available, position.decimals)} {position.asset}</strong></div>
              <div><span>Reserved</span><strong>{formatAtomic(position.reserved, position.decimals)} {position.asset}</strong></div>
              <div><span>Pending</span><strong>{formatAtomic(position.pending, position.decimals)} {position.asset}</strong></div>
              <div className="position-status"><Pill tone="info">Test route</Pill><small>{position.reconciledAt}</small></div>
            </div>
          ))}
        </div>
      </section>
      <div className="callout"><ShieldCheck size={20} /><div><strong>Valuation is context, not liquidity.</strong><p>The total uses a timestamped USD estimate. Each position remains spendable only through its own provider rail.</p></div><button className="text-action" onClick={explainAccounting}>How accounting works <ArrowUpRight size={14} /></button></div>
    </div>
  )
}

function TransactionTable({ transactions, onSelect }: { transactions: Transaction[]; onSelect?: (transaction: Transaction) => void }) {
  return (
    <div className="transaction-table" role="table" aria-label="Transactions">
      {transactions.map(tx => (
        <button className="transaction-row" role="row" key={tx.id} onClick={() => onSelect?.(tx)}>
          <span className={`transaction-icon transaction-icon--${tx.direction}`}>{tx.direction === 'in' ? <ArrowDownLeft size={16} /> : tx.direction === 'out' ? <ArrowUpRight size={16} /> : <RotateCw size={16} />}</span>
          <span className="transaction-main"><strong>{tx.title}</strong><small>{tx.description}</small></span>
          <span className="transaction-provider">{tx.provider}</span>
          <span><Pill tone={tx.status === 'settled' ? 'positive' : tx.status === 'pending' ? 'warning' : 'info'}>{tx.status}</Pill></span>
          <span className={`transaction-amount ${tx.direction === 'in' ? 'positive-text' : ''}`}>{tx.direction === 'in' ? '+' : tx.direction === 'out' ? '−' : ''}{tx.amount} <small>{tx.asset}</small></span>
          <span className="transaction-time">{tx.time}</span>
        </button>
      ))}
    </div>
  )
}

function Activity({ data, viewLedger }: { data: DashboardData; viewLedger: (transaction: Transaction) => void }) {
  const [selected, setSelected] = useState<Transaction | null>(data.transactions[0] ?? null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    setSelected(current => data.transactions.find(transaction => transaction.id === current?.id) ?? data.transactions[0] ?? null)
  }, [data.transactions])
  const filtered = data.transactions.filter(transaction => `${transaction.title} ${transaction.description} ${transaction.provider}`.toLowerCase().includes(query.toLowerCase()))
  const exportActivity = () => {
    const blob = new Blob([JSON.stringify(data.transactions, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mandate-activity.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return (
    <div className="page page-enter">
      <PageIntro kicker="Immutable history" title="Activity" description="Follow every operation from agent intent to provider event and ledger posting." actions={<button className="secondary-button" onClick={exportActivity}><ArrowDownLeft size={15} /> Export</button>} />
      <div className="toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search activity" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by operation, agent, or provider" /></div></div>
      <div className="activity-layout">
        <section className="panel activity-list-panel">{filtered.length ? <TransactionTable transactions={filtered} onSelect={setSelected} /> : <div className="empty-inline"><Search size={18} /><p>No activity matches this search.</p></div>}</section>
        <aside className="panel trace-panel">
          <div className="trace-header"><div><p className="eyebrow">Operation trace</p><h2>{selected?.title ?? 'No journal entries yet'}</h2></div>{selected && <button className="icon-button" aria-label="More operation actions" onClick={() => viewLedger(selected)}><MoreHorizontal size={17} /></button>}</div>
          {selected ? <><div className="trace-amount"><span>{selected.direction === 'in' ? '+' : '−'}${selected.amount}</span><Pill tone={selected.status === 'settled' ? 'positive' : 'info'}>{selected.status}</Pill></div>
            <dl className="detail-list"><div><dt>Operation</dt><dd>{selected.id}<Copy size={13} /></dd></div><div><dt>Agent</dt><dd>{selected.actor}</dd></div><div><dt>Provider</dt><dd>{selected.provider}</dd></div><div><dt>Account</dt><dd>{data.accountName}</dd></div></dl>
            <div className="trace-steps">{selected.steps.map((step, i) => <div key={step}><span><Check size={12} /></span><p><strong>{step}</strong><small>{i === 0 ? selected.time : `Step ${i + 1}`}</small></p></div>)}</div>
            <button className="secondary-button full-width" onClick={() => viewLedger(selected)}>View ledger entries <ArrowRight size={14} /></button></> : <div className="empty-dialog"><ActivityIcon size={22} /><p>Create a payment or transfer to see its causal trace and balanced journal here.</p></div>}
        </aside>
      </div>
    </div>
  )
}

function AgentRow({ agent, compact = false, onMore }: { agent: Agent; compact?: boolean; onMore?: (agent: Agent) => void }) {
  return (
    <div className={`agent-row ${compact ? 'agent-row--compact' : ''}`}>
      <span className={`agent-avatar agent-avatar--${agent.runtime.toLowerCase()}`}>{agent.runtime === 'OpenClaw' ? 'O' : agent.runtime === 'Hermes' ? 'H' : 'C'}<i /></span>
      <div className="agent-name"><strong>{agent.name}</strong><small>{agent.runtime} · {agent.mode.replace('_', ' ')}</small></div>
      {!compact && <div className="capability-tags">{agent.capabilities.map(c => <span key={c}>{c}</span>)}</div>}
      <div className="agent-last"><strong>{agent.lastSeen}</strong><small>Last seen</small></div>
      {!compact && <button className="icon-button" aria-label={`More actions for ${agent.name}`} onClick={() => onMore?.(agent)}><MoreHorizontal size={17} /></button>}
    </div>
  )
}

function Agents({ data, connect, manage, reviewDetected }: { data: DashboardData; connect: () => void; manage: (agent: Agent) => void; reviewDetected: () => void }) {
  return (
    <div className="page page-enter">
      <PageIntro kicker="Scoped operators" title="Agents" description="Give each runtime only the authority and economic account it needs." actions={<button className="primary-button" onClick={connect}><Plus size={15} /> Connect agent</button>} />
      <div className="agent-summary"><div><Bot size={19} /><span><strong>{data.agents.length} connected</strong><small>{data.agents.length ? 'Scoped identities' : 'No active grants'}</small></span></div><div><ShieldCheck size={19} /><span><strong>Least privilege</strong><small>Every grant is account-scoped</small></span></div><div><KeyRound size={19} /><span><strong>Credential files</strong><small>Stored outside prompt context</small></span></div></div>
      <section className="panel agents-panel">
        <div className="list-heading"><span>Agent</span><span>Capabilities</span><span>Last seen</span><span /></div>
        {data.agents.length ? data.agents.map(agent => <AgentRow key={agent.id} agent={agent} onMore={manage} />) : <div className="empty-dialog"><Bot size={22} /><h3>No agents assigned to this account</h3><p>Connect OpenClaw or Hermes with an account-scoped identity and explicit capability grant.</p><button className="primary-button" onClick={connect}>Connect an agent</button></div>}
      </section>
      <section className="integration-banner"><div className="integration-art"><TerminalSquare size={21} /><span /><PlugZap size={20} /></div><div><p className="eyebrow">Runtime discovery</p><h2>{data.detectedRuntimes.openclaw || data.detectedRuntimes.hermes ? 'Agent runtimes detected on this Mac.' : 'No supported runtime detected yet.'}</h2><p>OpenClaw: {data.detectedRuntimes.openclaw ? 'detected' : 'not detected'} · Hermes: {data.detectedRuntimes.hermes ? 'detected' : 'not detected'}</p></div><button className="secondary-button" onClick={reviewDetected}>Review connection <ArrowRight size={15} /></button></section>
    </div>
  )
}

function ProviderCard({ provider, configure }: { provider: Provider; configure: (provider: Provider) => void }) {
  const tone = provider.status === 'degraded' ? 'warning' : provider.status === 'disconnected' ? 'danger' : 'positive'
  const statusLabel = provider.status === 'sandbox' ? 'Demo connected' : provider.status === 'disconnected' ? 'Not connected' : provider.status.replace('_', ' ')
  return (
    <article className="provider-card">
      <div className="provider-head"><span className="provider-logo">{provider.name.charAt(0)}</span><Pill tone={tone}>{statusLabel}</Pill></div>
      <h3>{provider.name}</h3><p>{provider.description}</p>
      <div className="provider-tags">{provider.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
      <footer><span className={provider.status === 'disconnected' ? 'provider-disconnected' : ''}><i />{provider.detail}</span><button onClick={() => configure(provider)}>{provider.status === 'disconnected' ? 'Set up' : 'Manage'} <ArrowUpRight size={13} /></button></footer>
    </article>
  )
}

function Capabilities({ data, configure, addProvider }: { data: DashboardData; configure: (provider: Provider) => void; addProvider: (category?: ProviderCategory) => void }) {
  const connected = data.providers.filter(provider => provider.status !== 'disconnected').length
  return (
    <div className="page page-enter">
      <PageIntro kicker="Interchangeable rails" title="Capabilities" description="Choose what agents can do first. Providers are the replaceable implementation." actions={<button className="secondary-button" onClick={() => addProvider()}><Plus size={15} /> Add provider</button>} />
      <div className={`capability-map ${connected === 0 ? 'capability-map--empty' : ''}`}><div className="cap-map-copy"><Pill tone={connected === 3 ? 'positive' : connected === 0 ? 'neutral' : 'warning'}>{connected} of 3 connected</Pill><h2>{connected === 0 ? 'Choose the first rail for this account.' : connected === 3 ? 'Receive, hold, and spend are available.' : 'This account is partially configured.'}</h2><p>{connected === 0 ? 'No provider routes are connected. Start with the capability your agents need first.' : 'Each route is account-scoped and keeps its own provider position.'}</p></div><FlowLine compact /></div>
      {(['Receive', 'Hold', 'Spend'] as const).map(category => (
        <section className="capability-section" key={category}>
          <SectionHeading eyebrow={`${data.providers.filter(p => p.category === category).length} provider`} title={category} action={<button className="icon-button" aria-label={`Add ${category} provider`} onClick={() => addProvider(category)}><Plus size={17} /></button>} />
          <div className="provider-grid">{data.providers.filter(p => p.category === category).map(provider => <ProviderCard key={provider.id} provider={provider} configure={configure} />)}</div>
        </section>
      ))}
      <div className="callout callout--warning"><ShieldCheck size={20} /><div><strong>{connected === 3 ? 'The demo loop is complete, not financially closed.' : 'Connections are explicit and account-scoped.'}</strong><p>{connected === 3 ? 'Stripe revenue and Coinbase treasury do not automatically fund Lithic. A production funding rail is still required.' : 'Adding a provider here affects only this economic account. It does not grant access to other accounts or agents.'}</p></div></div>
    </div>
  )
}

function System({ data, source, notify, refresh }: { data: DashboardData; source: DataSource; notify: (message: string) => void; refresh: () => void }) {
  const healthy = data.diagnostics.filter(check => check.status === 'healthy').length
  const overall = data.diagnostics.some(check => check.status === 'unavailable') ? 'Unavailable checks' : data.diagnostics.some(check => check.status === 'attention') ? 'Action required' : 'Healthy'
  return (
    <div className="page page-enter">
      <PageIntro kicker="Local runtime" title="System" description="Measured daemon health and clearly separated incomplete operational controls." actions={<button className="secondary-button" onClick={() => navigator.clipboard.writeText(JSON.stringify({ source, diagnostics: data.diagnostics }, null, 2)).then(() => notify('Diagnostics copied'))}><Copy size={15} /> Copy diagnostics</button>} />
      <section className="system-hero"><div className="system-orbit"><span className="orbit orbit-1" /><span className="orbit orbit-2" /><Server size={28} /></div><div><Pill tone={overall === 'Healthy' ? 'positive' : 'warning'}><span className="status-dot" />{overall}</Pill><h2>{healthy} of {data.diagnostics.length} runtime checks healthy.</h2><p>Healthy local storage does not imply that external providers, reconciliation, backup, or live money are ready.</p></div><div className="system-facts"><span>Version<strong>{data.version}</strong></span><span>Started<strong>{data.startedAt}</strong></span><span>Account<strong>{data.accountName}</strong></span></div></section>
      <div className="system-grid">
        <section className="panel diagnostics"><SectionHeading eyebrow="Doctor" title="Runtime checks" action={<button className="text-action" onClick={() => { refresh(); notify('Runtime data refreshed') }}><RefreshCw size={13} /> Run again</button>} />{data.diagnostics.map(check => <div className={`diagnostic-row diagnostic-row--${check.status}`} key={check.name}><span>{check.status === 'healthy' ? <Check size={13} /> : <MoreHorizontal size={13} />}</span><div><strong>{check.name}</strong><small>{check.detail}</small></div><Pill tone={check.status === 'healthy' ? 'positive' : check.status === 'attention' ? 'warning' : 'danger'}>{check.label}</Pill></div>)}</section>
        <div className="system-stack"><section className="panel mini-panel"><span className="mini-icon"><KeyRound size={18} /></span><div><p className="eyebrow">Recovery</p><h3>Recovery export is pending</h3><p>The encrypted ledger and Keychain key exist. A user-exportable recovery-package workflow is tracked but not implemented.</p><button className="text-action" disabled>Not available yet</button></div></section><section className="panel mini-panel"><span className="mini-icon"><RefreshCw size={18} /></span><div><p className="eyebrow">Reconciliation</p><h3>Manual snapshot available</h3><p>Automatic incremental polling and nightly full comparisons are not wired into the daemon yet.</p><button className="text-action" disabled>Scheduler pending</button></div></section></div>
      </div>
    </div>
  )
}

const ONBOARDING_STEPS = ['Welcome', 'Identity', 'Account', 'Starting point']

function FirstRun({ detected, onInitialized, onPreview }: { detected: { openclaw: boolean; hermes: boolean }; onInitialized: () => void; onPreview: () => void }) {
  const [step, setStep] = useState(0)
  const [administratorName, setAdministratorName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [accountName, setAccountName] = useState('Primary treasury')
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await initializeInstance({ administrator_name: administratorName, organization_name: organizationName, account_name: accountName, demo })
      onInitialized()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Setup failed') } finally { setBusy(false) }
  }
  const visuals = [
    <div className="welcome-visual"><LogoMark /><div className="continuity-word">Receive <span /> Hold <span /> Spend</div></div>,
    <div className="onboarding-form"><label>Your name<input value={administratorName} onChange={event => setAdministratorName(event.target.value)} placeholder="Alex Rivera" autoFocus /></label><label>Organization or principal<input value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="Northstar Studio" /></label><div className="local-note"><ShieldCheck size={16} /><span>These names are stored in your encrypted local instance.</span></div></div>,
    <div className="onboarding-form"><label>First economic account<input value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="Primary treasury" /></label><div className="account-model"><strong>One principal, multiple accounts</strong><p>Each account owns its provider positions, ledger, and grants. Multiple agents can share one account without sharing administrator authority.</p></div></div>,
    <div className="starting-options"><button className={!demo ? 'selected' : ''} onClick={() => setDemo(false)}><span><WalletCards size={18} /></span><div><strong>Start empty</strong><small>Connect each route yourself. Best for learning the real setup flow.</small></div>{!demo && <Check size={16} />}</button><button className={demo ? 'selected' : ''} onClick={() => setDemo(true)}><span><Sparkles size={18} /></span><div><strong>Add demo routes</strong><small>Seed local Coinbase, Stripe, and Lithic test routes and funds.</small></div>{demo && <Check size={16} />}</button><div className="detected-summary">OpenClaw {detected.openclaw ? 'detected' : 'not found'} · Hermes {detected.hermes ? 'detected' : 'not found'}</div></div>,
  ]
  const copy = [
    ['Welcome to Mandate', 'Give your agents an economic account.', 'Set up a clean local instance from first principles. Demo data is optional and never mixed with your real account state.'],
    ['Administrator and principal', 'Who owns this Mandate instance?', 'Your administrator is the human operator. The organization or principal owns every economic account created here.'],
    ['Account boundary', 'Name the first economic account.', 'Use separate accounts when agents, providers, authority, or accounting histories should remain isolated.'],
    ['Initial state', 'Start clean or add an explicit demo.', 'A clean account contains no providers, funds, agents, or activity. Demo routes can be connected later at any time.'],
  ]
  const [eyebrow, title, body] = copy[step]
  const canContinue = step !== 1 || (administratorName.trim() && organizationName.trim())
  return <div className="onboarding"><header><div className="brand"><LogoMark /><span>Mandate</span></div><Pill tone="neutral">First-time setup</Pill></header><main><div className="onboarding-progress" aria-label={`Setup step ${step + 1} of ${ONBOARDING_STEPS.length}`}>{ONBOARDING_STEPS.map((name, index) => <div key={name} className={index <= step ? 'complete' : ''}><span>{index < step ? <Check size={11} /> : index + 1}</span><small>{name}</small></div>)}</div><section className="onboarding-card page-enter" key={step}><div className="onboarding-copy"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{body}</p>{step === 0 && <div className="local-note"><ShieldCheck size={16} /><span><strong>Local-first.</strong> Your encrypted ledger and agent policy remain on this Mac.</span></div>}</div><div className="onboarding-visual">{visuals[step]}</div></section>{error && <p className="form-error onboarding-error" role="alert">{error}</p>}<footer><button className="secondary-button" onClick={() => step === 0 ? onPreview() : setStep(step - 1)}>{step === 0 ? 'View demo first' : 'Back'}</button><span>Step {step + 1} of {ONBOARDING_STEPS.length}</span><button className="primary-button" disabled={!canContinue || busy} onClick={() => step === ONBOARDING_STEPS.length - 1 ? submit() : setStep(step + 1)}>{busy ? 'Creating…' : step === ONBOARDING_STEPS.length - 1 ? 'Create Mandate' : 'Continue'} <ArrowRight size={15} /></button></footer></main></div>
}

function AccessGate({ onPreview }: { onPreview: () => void }) {
  return <div className="onboarding access-gate"><header><div className="brand"><LogoMark /><span>Mandate</span></div><Pill tone="warning">Dashboard locked</Pill></header><main><section className="onboarding-card"><div className="onboarding-copy"><p className="eyebrow">Administrator session</p><h1>Open Mandate securely.</h1><p>This instance is initialized, but this browser does not have an administrator session.</p><div className="local-note"><KeyRound size={16} /><span>Run the command below. Mandate will open a single-use local login URL.</span></div><pre className="setup-command">cargo run -p mandate -- dashboard</pre><button className="secondary-button" onClick={onPreview}>View explicit demo instead</button></div><div className="onboarding-visual"><div className="security-visual"><span className="security-ring security-ring-1" /><span className="security-ring security-ring-2" /><KeyRound size={42} /><small>Administrator authentication required</small></div></div></section></main></div>
}

export function App() {
  const [page, setPage] = useState<NavId>('overview')
  const [data, setData] = useState<DashboardData>(fixtureData)
  const [source, setSource] = useState<DataSource>('preview')
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [toast, setToast] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [dialog, setDialog] = useState<
    | { type: 'operation'; kind?: string }
    | { type: 'accounting' }
    | { type: 'ledger'; transaction: Transaction }
    | { type: 'provider'; provider?: Provider; category?: ProviderCategory }
    | { type: 'agent'; agent?: Agent; runtime?: 'openclaw' | 'hermes' }
    | { type: 'command' }
    | { type: 'environment' }
    | { type: 'account' }
    | { type: 'setup' }
    | { type: 'profile' }
    | null
  >(null)

  const refresh = useCallback((accountId?: string) => {
    const controller = new AbortController()
    loadDashboard(controller.signal, accountId || selectedAccountId || undefined).then(result => {
      setData(result.data); setSource(result.source); setLoading(false)
      if (result.source === 'daemon') setSelectedAccountId(result.data.accountId)
    }).catch(() => setLoading(false))
    return () => controller.abort()
  }, [selectedAccountId])

  useEffect(() => {
    const cancel = refresh()
    return () => cancel()
  }, [refresh, refreshVersion])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (id: NavId) => { setPage(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const completed = (message: string) => { setToast(message); setRefreshVersion(version => version + 1) }
  const preview = () => { setData(fixtureData); setSource('preview'); setLoading(false) }
  const returnToRealState = () => { setLoading(true); setSelectedAccountId(''); setRefreshVersion(version => version + 1) }
  const selectAccount = (id: string) => { setLoading(true); setSelectedAccountId(id) }
  const accountCreated = (account: EconomicAccount) => { setDialog(null); setToast(`${account.name} created`); selectAccount(account.id) }

  if (loading) return <div className="app-loading"><LogoMark /><span>Opening Mandate…</span></div>
  if (source === 'uninitialized') return <FirstRun detected={data.detectedRuntimes} onInitialized={returnToRealState} onPreview={preview} />
  if (source === 'locked') return <AccessGate onPreview={preview} />

  return (
    <Shell page={page} onNavigate={navigate} source={source} data={data} openSetup={source === 'preview' ? returnToRealState : () => setDialog({ type: 'setup' })} openCommand={() => setDialog({ type: 'command' })} openEnvironment={() => setDialog({ type: 'environment' })} editProfile={() => setDialog({ type: 'profile' })} selectAccount={selectAccount} createAccount={() => setDialog({ type: 'account' })}>
      {page === 'overview' && <Overview data={data} source={source} navigate={navigate} newOperation={() => setDialog({ type: 'operation' })} />}
      {page === 'account' && <Account data={data} explainAccounting={() => setDialog({ type: 'accounting' })} newOperation={() => setDialog({ type: 'operation' })} fundAccount={() => setDialog({ type: 'operation', kind: 'receive' })} reconcile={() => { setRefreshVersion(version => version + 1); setToast('Ledger snapshot refreshed') }} />}
      {page === 'activity' && <Activity data={data} viewLedger={transaction => setDialog({ type: 'ledger', transaction })} />}
      {page === 'agents' && <Agents data={data} connect={() => setDialog({ type: 'agent' })} manage={agent => setDialog({ type: 'agent', agent })} reviewDetected={() => setDialog({ type: 'agent', runtime: data.detectedRuntimes.hermes && !data.detectedRuntimes.openclaw ? 'hermes' : 'openclaw' })} />}
      {page === 'capabilities' && <Capabilities data={data} configure={provider => setDialog({ type: 'provider', provider })} addProvider={category => setDialog({ type: 'provider', category })} />}
      {page === 'system' && <System data={data} source={source} notify={setToast} refresh={() => setRefreshVersion(version => version + 1)} />}
      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
      {dialog?.type === 'operation' && <OperationDialog accountId={data.accountId} source={source} initialKind={dialog.kind} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'accounting' && <AccountingDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'ledger' && <LedgerDialog transaction={dialog.transaction} onClose={() => setDialog(null)} />}
      {dialog?.type === 'provider' && <ProviderDialog accountId={data.accountId} providers={data.providers} provider={dialog.provider} category={dialog.category} source={source} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'agent' && <AgentDialog accountId={data.accountId} detected={data.detectedRuntimes} source={source} agent={dialog.agent} presetRuntime={dialog.runtime} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'command' && <CommandDialog onClose={() => setDialog(null)} navigate={navigate} newOperation={() => setDialog({ type: 'operation' })} />}
      {dialog?.type === 'environment' && <EnvironmentDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'account' && <AccountDialog onClose={() => setDialog(null)} onComplete={accountCreated} />}
      {dialog?.type === 'setup' && <SetupChecklistDialog providers={data.providers} agents={data.agents} onClose={() => setDialog(null)} navigate={navigate} />}
      {dialog?.type === 'profile' && <ProfileDialog administratorName={data.administratorName} principalName={data.principalName} onClose={() => setDialog(null)} onComplete={completed} />}
    </Shell>
  )
}
