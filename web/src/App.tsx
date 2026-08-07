import { useCallback, useEffect, useState, SyntheticEvent } from 'react'
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
  Compass,
  Copy,
  Droplets,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Layers3,
  Menu,
  MoreHorizontal,
  Pause,
  Play,
  PlugZap,
  Plus,
  Radio,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import { emptyData, initializeInstance, loadDashboard, subscribeToEvents, type DataSource } from './lib/api'
import { fixtureActivityEvents, fixtureData } from './lib/fixtures'
import type { SandboxSimulationEvent } from './lib/sandbox'
import type { ActivityEvent, Agent, DashboardData, EconomicAccount, EnvironmentMode, GuideTabId, LiquidityConfig, NavId, Position, Provider, Transaction } from './lib/types'
import { ArrowAction, FlowLine, LogoMark, Pill, ProviderLogo, RowAction, SectionHeading, formatAtomic } from './components/ui'
import { AccountDialog, AccountingDialog, AgentDialog, BuildProviderDialog, CommandDialog, LedgerDialog, LiquidityConfigDialog, OperationDialog, ProviderDialog, SandboxSimulatorDialog, SetupChecklistDialog, TestAgentDialog, type ProviderCategory } from './components/dialogs'
import { Guide, getAccountTopology } from './components/Guide'

const NAV: { id: NavId; label: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'account', label: 'Account', icon: WalletCards },
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
  { id: 'agents', label: 'Agent Access', icon: Bot },
  { id: 'capabilities', label: 'Capabilities', icon: Layers3 },
  { id: 'guide', label: 'Guide', icon: Compass },
  { id: 'system', label: 'System', icon: Settings2 },
]


function EnvironmentSelector({ environment, source, onSelectEnvironment, onOpenSimulator }: { environment: EnvironmentMode; source: DataSource; onSelectEnvironment: (env: EnvironmentMode) => void; onOpenSimulator?: () => void }) {
  const [open, setOpen] = useState(false)

  const activeLabel = source === 'preview' || environment === 'preview' ? 'Demo preview' : environment === 'live' ? 'Live' : 'Sandbox'
  const tone = source === 'preview' || environment === 'preview' ? 'state-chip--sandbox' : environment === 'live' ? 'state-chip--pending' : 'state-chip--connected'

  return (
    <div className="environment-selector">
      <button className="mode-button" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={`state-chip ${tone}`}><span className="state-dot" />{activeLabel}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="environment-dropdown">
          <div className="dropdown-header">
            <p className="eyebrow">Financial environment</p>
            <small>Mandate resolves provider routes & credentials</small>
          </div>
          <div className="environment-dropdown-list">
            <button className={`environment-option-item ${environment === 'sandbox' && source !== 'preview' ? 'selected' : ''}`} onClick={() => { setOpen(false); onSelectEnvironment('sandbox') }}>
              <div className="option-title">
                <span className="state-dot state-dot--sandbox" />
                <strong>Sandbox</strong>
                {environment === 'sandbox' && source !== 'preview' && <Check size={14} />}
              </div>
              <p>Simulated economy & test keys. Free & deterministic.</p>
            </button>

            <button className={`environment-option-item ${environment === 'live' && source !== 'preview' ? 'selected' : ''}`} onClick={() => { setOpen(false); onSelectEnvironment('live') }}>
              <div className="option-title">
                <span className="state-dot state-dot--live" />
                <strong>Live</strong>
                {environment === 'live' && source !== 'preview' && <Check size={14} />}
              </div>
              <p>Production rails & real money. Strict key isolation.</p>
            </button>

            <button className={`environment-option-item ${source === 'preview' || environment === 'preview' ? 'selected' : ''}`} onClick={() => { setOpen(false); onSelectEnvironment('preview') }}>
              <div className="option-title">
                <span className="state-dot state-dot--preview" />
                <strong>Demo preview</strong>
                {(source === 'preview' || environment === 'preview') && <Check size={14} />}
              </div>
              <p>Sample illustrative dataset; no credentials required.</p>
            </button>
          </div>

          {(environment === 'sandbox' || environment === 'preview') && onOpenSimulator && (
            <div className="dropdown-footer">
              <button className="secondary-button full-width" onClick={() => { setOpen(false); onOpenSimulator() }}>
                <Sparkles size={14} /> Simulate event…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Shell({ page, onNavigate, source, environment, onSelectEnvironment, data, children, openSetup, openCommand, openSimulator, selectAccount, createAccount }: { page: NavId; onNavigate: (id: NavId) => void; source: DataSource; environment: EnvironmentMode; onSelectEnvironment: (env: EnvironmentMode) => void; data: DashboardData; children: React.ReactNode; openSetup: () => void; openCommand: () => void; openSimulator: () => void; selectAccount: (id: string) => void; createAccount: () => void }) {
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
        {accountOpen && <div className="account-menu"><p className="eyebrow">Economic accounts</p><small style={{ marginTop: '5px', display: 'block' }}>{source === 'daemon' ? `${data.accounts.length} ${data.accounts.length === 1 ? 'account' : 'accounts'} configured` : 'Illustrative preview account'}</small><div className="account-menu-list">{data.accounts.map(account => <button key={account.id} className={account.id === data.accountId ? 'selected' : ''} onClick={() => { setAccountOpen(false); selectAccount(account.id) }}><span><strong>{account.name}</strong><small>{account.id === data.accountId ? 'Current account' : 'Switch account'}</small></span>{account.id === data.accountId && <Check size={14} />}</button>)}</div>{source === 'daemon' && <button onClick={() => { setAccountOpen(false); createAccount() }}><Plus size={13} /> Create account</button>}<button onClick={() => { setAccountOpen(false); onNavigate('account') }}>View current account <ArrowUpRight size={13} /></button></div>}
        <nav aria-label="Primary navigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => { onNavigate(id); setMobileOpen(false) }} aria-current={page === id ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.7} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile-button" onClick={() => { setProfileOpen(open => !open); setAccountOpen(false) }} aria-expanded={profileOpen}>
            <span>LOCAL OPERATOR</span><MoreHorizontal size={16} />
          </button>
          {profileOpen && <div className="profile-menu"><p className="eyebrow">Local operator</p><button onClick={() => { setProfileOpen(false); openSetup() }}>{source === 'preview' ? 'Exit demo preview' : 'Account setup checklist'} <ArrowUpRight size={13} /></button><button onClick={() => { setProfileOpen(false); onNavigate('system') }}>System diagnostics <ArrowUpRight size={13} /></button></div>}
        </div>
      </aside>
      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <main id="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="mobile-brand"><LogoMark /><strong>Mandate</strong></div>
          <div className="topbar-actions">
            <EnvironmentSelector environment={environment} source={source} onSelectEnvironment={onSelectEnvironment} onOpenSimulator={openSimulator} />
            <button className="command-button" onClick={openCommand}><Search size={15} /><span>Search</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" aria-label="Open command menu" onClick={openCommand}><Command size={17} /></button>
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {NAV.slice(0, 6).map(({ id, label, icon: Icon }) => (
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

function Overview({ data, source, environment, navigate, newOperation, openSimulator, onTestConnection }: { data: DashboardData; source: DataSource; environment: EnvironmentMode; navigate: (id: NavId) => void; newOperation: () => void; openSimulator: () => void; onTestConnection?: (agent: Agent) => void }) {
  const reserved = data.positions.reduce((total, position) => total + Number(position.reserved) / (10 ** position.decimals), 0)
  const connectedProviders = data.providers.filter(provider => provider.status !== 'disconnected')
  const topology = getAccountTopology(data)
  const flowStages = [
    { name: 'Receive', value: connectedProviders.some(provider => provider.category === 'Receive') ? 'Ready' : 'Not connected', detail: 'Provider route' },
    { name: 'Hold', value: data.estimateUsd === '—' ? 'See positions' : `$${data.estimateUsd}`, detail: `${data.positions.length} positions` },
    { name: 'Spend', value: `$${reserved.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, detail: 'Currently reserved' },
  ]
  if (source === 'daemon' && connectedProviders.length === 0) return <div className="page page-enter">
    <PageIntro kicker="Welcome to Mandate" title={`Set up ${data.accountName}.`} description="This economic account is empty. Connect only the capabilities this account needs, then assign one or more scoped agents." />
    <section className="zero-state-hero"><div className="zero-state-line"><span>1</span><i /><span>2</span><i /><span>3</span></div><div><p className="eyebrow">Your first working account</p><h2>Connect a provider route, add an agent, then run a test operation.</h2><p>Nothing has been preloaded. Demo routes are optional and remain visibly separate from future external provider connections.</p></div><button className="primary-button" onClick={() => navigate('capabilities')}>Choose capabilities <ArrowRight size={15} /></button></section>
    <div className="setup-checklist"><button onClick={() => navigate('capabilities')}><span>1</span><div><strong>Connect a capability</strong><small>Receive with Stripe, hold with Coinbase, or spend with Lithic.</small></div><ArrowRight size={15} /></button><button onClick={() => navigate('agents')}><span>2</span><div><strong>Connect an agent</strong><small>Every agent receives a scoped identity for this account.</small></div><ArrowRight size={15} /></button><button onClick={newOperation} disabled><span>3</span><div><strong>Test a capability</strong><small>Run a test operation once a provider route is connected.</small></div><ArrowRight size={15} /></button></div>
    <div className="truth-note zero-state-note"><ShieldCheck size={16} /><p><strong>Accounts are independent boundaries.</strong> Provider positions, agent grants, transactions, and reservations belong to this account only.</p></div>
  </div>
  return (
    <div className="page page-enter">
      <PageIntro
        kicker={new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
        title="Economic continuity, at a glance."
        description="One account across every rail your agents use."
        actions={
          <div className="page-actions-group">
            {(environment === 'sandbox' || environment === 'preview') && (
              <button className="secondary-button" onClick={openSimulator}>
                <Sparkles size={15} /> Simulate sandbox event
              </button>
            )}
            {topology.isClosed ? (
              <button className="primary-button" onClick={() => navigate('activity')}>
                <ActivityIcon size={15} /> View activity
              </button>
            ) : (
              <button className="primary-button" onClick={() => navigate('guide')}>
                <Compass size={15} /> Close the loop
              </button>
            )}
          </div>
        }
      />
      {environment === 'sandbox' && source !== 'preview' && (
        <div className="sandbox-banner">
          <div className="sandbox-banner-content">
            <span className="state-chip state-chip--connected"><span className="state-dot" />🟢 SANDBOX MODE</span>
            <p>Simulated economy & test provider rails. Test your agent's full economic loop before connecting real money.</p>
          </div>
          <button className="secondary-button" onClick={openSimulator}>
            Simulate event <ArrowRight size={13} />
          </button>
        </div>
      )}
      <section className="hero-balance">
        <div className="balance-copy">
          <div className="balance-label"><span>Estimated account value</span><Pill tone="neutral">USD estimate</Pill></div>
          <div className="big-amount">{data.estimateUsd === '—' ? '—' : <><sup>$</sup>{data.estimateUsd}</>}</div>
          <p>{data.estimateUsd === '—' ? 'No consolidated valuation is available; review each provider position.' : `${source === 'daemon' ? 'Provider positions' : 'Illustrative preview'} · Valued ${data.valuationAt}`}</p>
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
          <SectionHeading eyebrow="Agent Access" title="Connected agents" action={<ArrowAction onClick={() => navigate('agents')}>View all</ArrowAction>} />
          {data.agents.slice(0, 2).map(agent => <AgentRow key={agent.id} agent={agent} compact />)}
          {!data.agents.length && <div className="empty-inline"><Bot size={18} /><p>No authorized agents yet. Connect Hermes or OpenClaw from Agent Access.</p></div>}
        </section>
      </div>
      <section className="panel activity-panel">
        <SectionHeading eyebrow="Activity" title="Latest across the account" action={<ArrowAction onClick={() => navigate('activity')}>Full history</ArrowAction>} />
        <TransactionTable transactions={data.transactions.slice(0, 4)} />
      </section>
    </div>
  )
}

const LIQUIDITY_KEY = 'mandate.liquidity'
const DEFAULT_LIQUIDITY: LiquidityConfig = { target: 250, threshold: 100, autoReplenish: true }

function loadLiquidity(): LiquidityConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_LIQUIDITY
  try {
    const raw = localStorage.getItem(LIQUIDITY_KEY)
    if (!raw) return DEFAULT_LIQUIDITY
    const parsed = JSON.parse(raw) as Partial<LiquidityConfig>
    return {
      target: typeof parsed.target === 'number' && parsed.target > 0 ? parsed.target : DEFAULT_LIQUIDITY.target,
      threshold: typeof parsed.threshold === 'number' && parsed.threshold >= 0 ? parsed.threshold : DEFAULT_LIQUIDITY.threshold,
      autoReplenish: typeof parsed.autoReplenish === 'boolean' ? parsed.autoReplenish : DEFAULT_LIQUIDITY.autoReplenish,
    }
  } catch { return DEFAULT_LIQUIDITY }
}

function saveLiquidity(config: LiquidityConfig) {
  try { localStorage.setItem(LIQUIDITY_KEY, JSON.stringify(config)) } catch { /* ignore */ }
}

function LiquidityPanel({ data, liquidity, onConfigure, onManualTransfer, onFund, navigate }: { data: DashboardData; liquidity: LiquidityConfig; onConfigure: () => void; onManualTransfer: () => void; onFund: () => void; navigate: (id: NavId) => void }) {
  const connected = data.providers.filter(provider => provider.status !== 'disconnected')
  const hold = connected.find(provider => provider.category === 'Hold')
  const spend = connected.find(provider => provider.category === 'Spend')
  const bridge = connected.find(provider => provider.category === 'Bridge')
  const spendPosition = data.positions.find(position => spend && (position.provider === spend.id || position.provider.includes('lithic') || position.provider.includes('card')))
  const holdPosition = data.positions.find(position => hold && (position.provider === hold.id || position.provider.includes('coinbase') || position.provider.includes('treasury')))
  const current = spendPosition ? Number(formatAtomic(spendPosition.available, spendPosition.decimals).replace(/,/g, '')) : 0
  const target = liquidity.target
  const healthy = current >= target
  const routeReady = Boolean(hold && spend && bridge)
  const holdAvailable = holdPosition ? `${formatAtomic(holdPosition.available, holdPosition.decimals)} ${holdPosition.asset}` : '—'
  return (
    <section className="panel liquidity-panel">
      <SectionHeading title="Spend liquidity" action={<ArrowAction onClick={onConfigure}>Configure</ArrowAction>} />
      <p className="panel-lede">Keep enough spending power available so your agents can operate without you moving money manually.</p>
      <div className="liquidity-grid">
        <div className="liquidity-metric">
          <span className="liquidity-label"><Droplets size={15} /> Spend liquidity</span>
          <strong className="liquidity-value">${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <div className="liquidity-meta"><span>Target ${target.toLocaleString()}</span>{spend ? <Pill tone={healthy ? 'positive' : 'warning'}>{healthy ? 'Healthy' : 'Below target'}</Pill> : <Pill tone="neutral">No spend route</Pill>}</div>
        </div>
        <div className="liquidity-route">
          <span className="liquidity-label">Funding route</span>
          <div className="route-chain"><span>{hold ? hold.name : 'Hold not connected'}</span><span className="route-arrow">→</span><span className={bridge ? '' : 'route-gap'}>{bridge ? bridge.name : 'Bridge'}</span><span className="route-arrow">→</span><span>{spend ? spend.name : 'Spend not connected'}</span></div>
          <div className="liquidity-meta"><small>{hold ? `Funding source: ${hold.name} · ${holdAvailable}` : 'No hold route connected'}</small>{!routeReady && <button className="text-action" onClick={() => navigate('guide')}>Close the loop <ArrowUpRight size={13} /></button>}</div>
        </div>
        <div className="liquidity-auto">
          <span className="liquidity-label">Automatic replenishment</span>
          <Pill tone="warning">Pending daemon enforcement</Pill>
          <small>Replenish when below ${liquidity.threshold.toLocaleString()} · restore to ${target.toLocaleString()}</small>
        </div>
      </div>
      <div className="liquidity-footer">
        <span>Manual treasury tools</span>
        <div>
          <button className="text-action" onClick={onManualTransfer}>Transfer funds manually <ArrowUpRight size={13} /></button>
          <button className="text-action" onClick={onFund}>Fund via receive address <ArrowUpRight size={13} /></button>
        </div>
      </div>
    </section>
  )
}

function Account({ data, explainAccounting, reconcile, liquidity, onConfigureLiquidity, onManualTransfer, onFund, navigate }: { data: DashboardData; explainAccounting: () => void; reconcile: () => void; liquidity: LiquidityConfig; onConfigureLiquidity: () => void; onManualTransfer: () => void; onFund: () => void; navigate: (id: NavId) => void }) {
  if (data.positions.length === 0) return <div className="page page-enter"><PageIntro kicker="Economic account" title={data.accountName} description="No provider positions have been created for this account yet." /><section className="panel account-empty"><WalletCards size={24} /><h2>No balances or reservations</h2><p>Connect a provider route from Capabilities. A position appears only after that account has a real or demo rail.</p></section><div className="callout"><ShieldCheck size={20} /><div><strong>This is a clean account.</strong><p>Agents, providers, and ledger entries from other economic accounts are not visible here.</p></div><button className="text-action" onClick={explainAccounting}>How accounting works <ArrowUpRight size={14} /></button></div></div>
  return (
    <div className="page page-enter">
      <PageIntro kicker="Economic account" title="Liquidity & positions" description="Mandate routes money automatically; you configure the limits." actions={<><button className="secondary-button" onClick={reconcile}><RefreshCw size={15} /> Refresh ledger</button><button className="primary-button" onClick={onConfigureLiquidity}><Droplets size={15} /> Configure liquidity</button></>} />
      <LiquidityPanel data={data} liquidity={liquidity} onConfigure={onConfigureLiquidity} onManualTransfer={onManualTransfer} onFund={onFund} navigate={navigate} />
      <div className="metric-strip">
        <div><span>Estimated value</span><strong>{data.estimateUsd === '—' ? '—' : `$${data.estimateUsd}`}</strong><small>{data.estimateUsd === '—' ? 'No valuation feed configured' : `USD · ${data.valuationAt}`}</small></div>
        <div><span>Positions</span><strong>{data.positions.length}</strong><small>Never netted across rails</small></div>
        <div><span>Reserved positions</span><strong>{data.positions.filter(position => BigInt(position.reserved) > 0n).length}</strong><small>{data.positions.some(position => BigInt(position.reserved) > 0n) ? 'Inspect amounts below' : 'No active reservations'}</small></div>
        <div><span>Pending positions</span><strong>{data.positions.filter(position => BigInt(position.pending) > 0n).length}</strong><small>{data.positions.some(position => BigInt(position.pending) > 0n) ? 'Inspect amounts below' : 'Nothing pending'}</small></div>
      </div>
      <section className="panel positions-panel">
        <SectionHeading eyebrow="Underlying positions" title="Where value actually lives" action={<Pill tone="positive"><Check size={12} /> Reconciled</Pill>} />
        <div className="position-list">
          {data.positions.map(position => (
            <div className="position-row" key={position.provider}>
              <ProviderLogo provider={position.provider} label={position.label} />
              <div className="position-name"><strong>{position.label}</strong><small>{position.asset}{position.network ? ` · ${position.network}` : ''}</small></div>
              <div><span>Available</span><strong>{formatAtomic(position.available, position.decimals)} {position.asset}</strong></div>
              <div><span>Reserved</span><strong>{formatAtomic(position.reserved, position.decimals)} {position.asset}</strong></div>
              <div><span>Pending</span><strong>{formatAtomic(position.pending, position.decimals)} {position.asset}</strong></div>
              <div className="position-status"><Pill tone={position.status === 'demo' ? 'neutral' : 'info'}>{position.status === 'demo' ? 'Demo position' : position.status}</Pill><small>Updated {position.reconciledAt}</small></div>
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

function eventValue(event: ActivityEvent, key: string): string | undefined {
  const value = event.payload[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function activityEventCopy(event: ActivityEvent, data: DashboardData): { title: string; detail: string; tone: 'complete' | 'working' | 'neutral' } {
  const type = event.eventType
  const providerId = eventValue(event, 'provider') ?? eventValue(event, 'provider_id')
  const provider = data.providers.find(item => item.id === providerId)?.name ?? providerId
  const agentId = eventValue(event, 'agent_id')
  const agent = eventValue(event, 'agent_name') ?? data.agents.find(item => item.id === agentId)?.name ?? 'Agent'
  const amount = eventValue(event, 'amount_display') ?? eventValue(event, 'amount')
  const currency = eventValue(event, 'currency') ?? eventValue(event, 'asset')
  const merchant = eventValue(event, 'merchant')

  if (type === 'agent.authenticated') return { title: `${agent} authenticated`, detail: `via ${eventValue(event, 'transport') ?? 'Mandate'} · ${data.accountName}`, tone: 'complete' }
  if (type === 'balance.requested') return { title: `${agent} requested account balance`, detail: `✓ ${provider ?? 'Treasury'}${eventValue(event, 'balance_display') ? ` · ${eventValue(event, 'balance_display')}` : ''}`, tone: 'complete' }
  if (type === 'payment.requested') return { title: `${agent} requested payment`, detail: [amount && `${amount}${currency && !amount.includes(currency) ? ` ${currency}` : ''}`, merchant].filter(Boolean).join(' · '), tone: 'working' }
  if (type === 'route.selected') return { title: 'Funding route selected', detail: eventValue(event, 'route') ?? 'Provider route resolved', tone: 'complete' }
  if (type === 'transaction.authorized') return { title: 'Transaction authorized', detail: `✓ ${[merchant, amount].filter(Boolean).join(' · ')}`, tone: 'complete' }
  if (type === 'funds.reserved') return { title: 'Funds reserved', detail: [amount, currency].filter(Boolean).join(' '), tone: 'complete' }
  if (type === 'provider.event') return { title: `${provider ?? 'Provider'} event received`, detail: eventValue(event, 'external_event_id') ?? 'Provider state changed', tone: 'complete' }
  if (type === 'provider.connected' || type === 'provider.verified') return { title: `${provider ?? 'Provider'} connected`, detail: `${eventValue(event, 'mode') ?? 'Provider'} route · ready`, tone: 'complete' }
  if (type === 'provider.disconnected') return { title: `${provider ?? 'Provider'} disconnected`, detail: 'Route is no longer available', tone: 'neutral' }
  if (type === 'agent.created') return { title: `${eventValue(event, 'name') ?? agent} authorized`, detail: 'Account-scoped grant created', tone: 'complete' }
  if (type === 'sandbox.simulated') return { title: eventValue(event, 'title') ?? 'Sandbox event', detail: eventValue(event, 'detail') ?? provider ?? 'Simulated provider response', tone: 'complete' }
  if (type.endsWith('.created')) {
    const operation = type.slice(0, -'.created'.length).replaceAll('_', ' ')
    const ready = eventValue(event, 'status') ?? 'ready'
    return { title: `${operation.charAt(0).toUpperCase()}${operation.slice(1)} created`, detail: `✓ ${[provider, amount && `${amount}${currency ? ` ${currency}` : ''}`, ready].filter(Boolean).join(' · ')}`, tone: 'complete' }
  }
  const title = type.replaceAll(/[._]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  return { title, detail: provider ?? eventValue(event, 'detail') ?? 'Mandate state changed', tone: 'neutral' }
}

function relativeEventTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  if (elapsed < 5_000) return 'Just now'
  if (elapsed < 60_000) return `${Math.floor(elapsed / 1_000)}s ago`
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function Activity({ data, events, source, viewLedger }: { data: DashboardData; events: ActivityEvent[]; source: DataSource; viewLedger: (transaction: Transaction) => void }) {
  const [tab, setTab] = useState<'live' | 'history'>('live')
  const [selected, setSelected] = useState<Transaction | null>(data.transactions[0] ?? null)
  const [query, setQuery] = useState('')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [frozenEvents, setFrozenEvents] = useState<ActivityEvent[]>([])
  const [clearedEvents, setClearedEvents] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setSelected(current => data.transactions.find(transaction => transaction.id === current?.id) ?? data.transactions[0] ?? null)
  }, [data.transactions])
  const filtered = data.transactions.filter(transaction => `${transaction.title} ${transaction.description} ${transaction.provider}`.toLowerCase().includes(query.toLowerCase()))
  const accountEvents = events
    .filter(event => !eventValue(event, 'account_id') || eventValue(event, 'account_id') === data.accountId)
    .filter(event => !clearedEvents.has(String(event.id)))
  const visibleEvents = paused ? frozenEvents : accountEvents
  const togglePaused = () => {
    if (!paused) setFrozenEvents(accountEvents)
    setPaused(current => !current)
  }
  const clearEvents = () => {
    setClearedEvents(current => new Set([...current, ...visibleEvents.map(event => String(event.id))]))
    setFrozenEvents([])
    setExpandedEvent(null)
  }
  const exportActivity = () => {
    const blob = new Blob([JSON.stringify(data.transactions, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mandate-activity.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return (
    <div className="page page-enter">
      <PageIntro kicker="Economic account" title="Activity" description="Everything happening across this economic account." actions={tab === 'history' ? <button className="secondary-button" onClick={exportActivity}><ArrowDownLeft size={15} /> Export</button> : undefined} />
      <div className="activity-tabs" role="tablist" aria-label="Activity view">
        <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}><Radio size={14} /> Live</button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><ActivityIcon size={14} /> History</button>
      </div>
      {tab === 'live' ? (
        <section className="panel live-activity-panel">
          <header className="live-activity-header">
            <div><span className={`live-indicator ${paused ? 'paused' : ''}`}><i />{paused ? 'Paused' : source === 'preview' ? 'Live demo' : 'Live'}</span><p>Agent intent, route resolution, and provider execution as they happen.</p></div>
            <div><button className="secondary-button" onClick={togglePaused}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Resume' : 'Pause'}</button><button className="icon-button" aria-label="Clear live activity" onClick={clearEvents} disabled={!visibleEvents.length}><Trash2 size={15} /></button></div>
          </header>
          <div className="live-event-stream" aria-live="polite">
            {visibleEvents.length ? visibleEvents.map(event => {
              const copy = activityEventCopy(event, data)
              const eventId = String(event.id)
              const expanded = expandedEvent === eventId
              const details = [
                ['Provider', eventValue(event, 'provider') ?? eventValue(event, 'provider_id')],
                ['Agent', eventValue(event, 'agent_name') ?? eventValue(event, 'agent_id')],
                ['Grant', eventValue(event, 'grant_id')],
                ['Latency', eventValue(event, 'latency_ms') ? `${eventValue(event, 'latency_ms')}ms` : undefined],
                ['Request ID', eventValue(event, 'request_id') ?? eventValue(event, 'operation_id') ?? eventValue(event, 'id')],
              ].filter((item): item is [string, string] => Boolean(item[1]))
              return <article className={`live-event live-event--${copy.tone}`} key={eventId}>
                <button className="live-event-summary" aria-expanded={expanded} onClick={() => setExpandedEvent(expanded ? null : eventId)}>
                  <span className="live-event-mark">{copy.tone === 'working' ? <span className="working-dot" /> : <Check size={13} />}</span>
                  <span><strong>{copy.title}</strong><small>{copy.detail}</small></span>
                  <time dateTime={event.createdAt}>{relativeEventTime(event.createdAt)}</time>
                </button>
                {expanded && <div className="live-event-details">
                  {details.length > 0 && <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
                  <button className="text-action" onClick={() => setShowRaw(showRaw === eventId ? null : eventId)}><TerminalSquare size={13} />{showRaw === eventId ? 'Hide raw event' : 'View raw event'}</button>
                  {showRaw === eventId && <pre>{JSON.stringify({ id: event.id, event_type: event.eventType, created_at: event.createdAt, payload: event.payload }, null, 2)}</pre>}
                </div>}
              </article>
            }) : <div className="live-empty"><span className="live-radar"><i /></span><h2>Waiting for agent activity…</h2><p>Requests, route decisions, and provider responses will appear here in near real time.</p></div>}
          </div>
        </section>
      ) : <>
        <div className="toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search activity" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by operation, agent, or provider" /></div></div>
        <div className="activity-layout">
          <section className="panel activity-list-panel">{filtered.length ? <TransactionTable transactions={filtered} onSelect={setSelected} /> : <div className="empty-inline"><Search size={18} /><p>No activity matches this search.</p></div>}</section>
          <aside className="panel trace-panel">
            <div className="trace-header"><div><p className="eyebrow">Operation trace</p><h2>{selected?.title ?? 'No journal entries yet'}</h2></div>{selected && <button className="icon-button" aria-label="More operation actions" onClick={() => viewLedger(selected)}><MoreHorizontal size={17} /></button>}</div>
            {selected ? <><div className="trace-amount"><span>{selected.direction === 'in' ? '+' : '−'}${selected.amount}</span><Pill tone={selected.status === 'settled' ? 'positive' : 'info'}>{selected.status}</Pill></div>
              <dl className="detail-list"><div><dt>Operation</dt><dd>{selected.id}<Copy size={13} /></dd></div><div><dt>Agent</dt><dd>{selected.actor}</dd></div><div><dt>Provider</dt><dd>{selected.provider}</dd></div><div><dt>Account</dt><dd>{data.accountName}</dd></div>{selected.route && <div><dt>Route</dt><dd>{selected.route}</dd></div>}{selected.trigger && <div><dt>Trigger</dt><dd>{selected.trigger}</dd></div>}{selected.initiatedBy && <div><dt>Initiated by</dt><dd>{selected.initiatedBy}</dd></div>}{selected.fee && <div><dt>Fee</dt><dd>${selected.fee}</dd></div>}</dl>
              <div className="trace-steps">{selected.steps.map((step, i) => <div key={step}><span><Check size={12} /></span><p><strong>{step}</strong><small>{i === 0 ? selected.time : `Step ${i + 1}`}</small></p></div>)}</div>
              <button className="secondary-button full-width" onClick={() => viewLedger(selected)}>View ledger entries <ArrowRight size={14} /></button></> : <div className="empty-dialog"><ActivityIcon size={22} /><p>Create a payment or transfer to see its causal trace and balanced journal here.</p></div>}
          </aside>
        </div>
      </>}
    </div>
  )
}

function AgentRow({ agent, compact = false, onMore, onTestConnection }: { agent: Agent; compact?: boolean; onMore?: (agent: Agent) => void; onTestConnection?: (agent: Agent) => void }) {
  const isVerified = agent.verificationStatus === 'verified' || agent.verificationStatus === 'active' || agent.installationStatus === 'installed'
  const statusLabel = agent.verificationStatus === 'active' ? 'Active' : isVerified ? 'Verified' : 'Created'
  const tone = agent.verificationStatus === 'active' ? 'positive' : isVerified ? 'positive' : 'neutral'
  const [showTooltip, setShowTooltip] = useState(false)
  // Custom agents have no runtime install probe, so a `not_installed` grant is
  // expected and ready to use — not a broken state. Surface that on hover so the
  // "Created" pill is not misread as a failed installation.
  const isCustomReady = !isVerified && agent.runtime === 'Custom' && agent.installationStatus === 'not_installed'

  return (
    <div className={`agent-row ${compact ? 'agent-row--compact' : ''}`}>
      <span className={`agent-avatar agent-avatar--${agent.runtime.toLowerCase()}`}>{agent.runtime === 'OpenClaw' ? 'O' : agent.runtime === 'Hermes' ? 'H' : 'C'}<i /></span>
      <div className="agent-name"><strong>{agent.name}</strong><small>{agent.runtime} · {agent.mode.replace('_', ' ')}</small></div>
      {!compact && <div className="capability-tags">{agent.capabilities.map(c => <span key={c}>{c}</span>)}</div>}
      {!compact && (
      <div className="agent-last">
        <div className="status-pill-group">
          <span
            className="status-pill-wrapper"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Pill tone={tone}>{isVerified ? '✓ ' : ''}{statusLabel}</Pill>
            {isVerified && showTooltip && (
              <div className="status-tooltip" role="tooltip">
                <strong>✓ Verified</strong>
                <span>{agent.lastTestDetail ?? `${agent.name} successfully authenticated through ${agent.runtime === 'Hermes' ? 'MCP' : 'CLI'}`}</span>
              </div>
            )}
            {isCustomReady && showTooltip && (
              <div className="status-tooltip" role="tooltip">
                <strong>Ready · not installed</strong>
                <span>Custom agents have no runtime install probe. The grant is active—verify it by running <code>mandate whoami</code> with this credential.</span>
              </div>
            )}
          </span>
          {isVerified && onTestConnection && (
            <button className="test-connection-trigger" onClick={(e) => { e.stopPropagation(); onTestConnection(agent); }}>
              Test connection
            </button>
          )}
        </div>
        <small>{agent.lastTestedAt ? `Tested ${agent.lastTestedAt}` : `Last activity ${agent.lastSeen}`}</small>
      </div>
      )}
      {!compact && <button className="icon-button" aria-label={`Manage access for ${agent.name}`} onClick={() => onMore?.(agent)}><MoreHorizontal size={17} /></button>}
    </div>
  )
}

function Agents({ data, connect, manage, testConnection }: { data: DashboardData; connect: () => void; manage: (agent: Agent) => void; testConnection: (agent: Agent) => void; reviewDetected: () => void }) {
  return (
    <div className="page page-enter">
      <PageIntro kicker="Authorized operators" title="Agent Access" description="Give external agents scoped access to this economic account." actions={<button className="primary-button" onClick={connect}><Plus size={15} /> Connect agent</button>} />
      <div className="agent-summary">
        <div><Bot size={19} /><span><strong>{data.agents.length} authorized</strong><small>{data.agents.length ? `${data.agents.filter(agent => agent.installationStatus === 'installed' || agent.verificationStatus === 'verified' || agent.verificationStatus === 'active').length} active grants` : 'No active grants'}</small></span></div>
        <div><ShieldCheck size={19} /><span><strong>Least privilege</strong><small>Every grant is account-scoped</small></span></div>
        <div><KeyRound size={19} /><span><strong>Credential files</strong><small>Stored outside prompt context</small></span></div>
      </div>
      <section className="panel agents-panel">
        <div className="list-heading"><span>Agent</span><span>Allowed capabilities</span><span>Status & activity</span><span /></div>
        {data.agents.length ? data.agents.map(agent => <AgentRow key={agent.id} agent={agent} onMore={manage} onTestConnection={testConnection} />) : <div className="empty-dialog"><Bot size={22} /><h3>No agents authorized for this account</h3><p>Connect OpenClaw, Hermes, or a custom agent with an account-scoped grant.</p><button className="primary-button" onClick={connect}>Connect agent</button></div>}
      </section>
    </div>
  )
}

function ProviderCard({ provider, configure }: { provider: Provider; configure: (provider: Provider) => void }) {
  const isConnected = provider.status !== 'disconnected'
  const tone = provider.status === 'degraded' ? 'warning' : isConnected ? 'positive' : 'danger'
  const statusLabel = provider.status === 'degraded' ? 'Degraded' : isConnected ? 'Connected' : 'Not connected'
  return (
    <article className="provider-card">
      <div className="provider-head"><ProviderLogo provider={provider.id} label={provider.name} /><Pill tone={tone}>{statusLabel}</Pill></div>
      <h3>{provider.name}</h3><p>{provider.description}</p>
      <div className="provider-tags">{provider.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
      <footer><span className={provider.status === 'disconnected' ? 'provider-disconnected' : ''}><i />{provider.detail}</span><button onClick={() => configure(provider)}>{provider.status === 'disconnected' ? 'Set up' : 'Manage'} <ArrowUpRight size={13} /></button></footer>
    </article>
  )
}

function Capabilities({ data, configure, addProvider, exploreProviders, closeLoop }: { data: DashboardData; configure: (provider: Provider) => void; addProvider: (category?: ProviderCategory) => void; exploreProviders: (category?: ProviderCategory) => void; closeLoop: () => void }) {
  const connected = data.providers.filter(provider => provider.category !== 'Bridge' && provider.status !== 'disconnected').length
  const topology = getAccountTopology(data)
  return (
    <div className="page page-enter">
      <PageIntro kicker="Interchangeable rails" title="Capabilities" description="Choose what agents can do first. Providers are the replaceable implementation." actions={<div className="page-actions-group"><button className="text-action" onClick={() => exploreProviders()}>Explore provider types <ArrowRight size={14} /></button><button className="secondary-button" onClick={() => addProvider()}><Plus size={15} /> Add provider</button></div>} />

      {connected > 0 && !topology.isClosed && (
        <section className="loop-unclosed-banner">
          <div className="banner-icon-wrap">
            <Compass size={22} />
          </div>
          <div className="banner-copy">
            <span className="banner-tag">Route setup needed</span>
            <h3>Your capabilities are connected, but your money can't flow between all of them yet.</h3>
            <p>{topology.missingRoutesCount} {topology.missingRoutesCount === 1 ? 'route needs' : 'routes need'} setup for a closed economic loop.</p>
          </div>
          <button className="primary-button" onClick={() => closeLoop()}>
            Close the loop <ArrowRight size={14} />
          </button>
        </section>
      )}

      {connected === 0 && <section className="capability-onboarding"><div><p className="eyebrow">Account setup · choose a starting point</p><h2>What should this account do first?</h2><p>Connect only the rails this account needs. You can add the others later without changing the account or its agent grants.</p></div><div className="capability-start-grid">
        <button onClick={() => addProvider('Receive')}><span><ArrowDownLeft size={18} /></span><strong>Receive revenue</strong><small>Create checkouts, invoices, and refunds with Stripe.</small><ArrowRight size={15} /></button>
        <button onClick={() => addProvider('Hold')}><span><CircleDollarSign size={18} /></span><strong>Hold and transfer</strong><small>Receive and manage USDC through Coinbase.</small><ArrowRight size={15} /></button>
        <button onClick={() => addProvider('Spend')}><span><ArrowUpRight size={18} /></span><strong>Spend with cards</strong><small>Create controlled virtual card payment sessions with Lithic.</small><ArrowRight size={15} /></button>
      </div></section>}
      <div className={`capability-map ${connected === 0 ? 'capability-map--empty' : ''}`}><div className="cap-map-copy"><Pill tone={connected === 3 ? 'positive' : connected === 0 ? 'neutral' : 'warning'}>{connected} of 3 connected</Pill><h2>{connected === 0 ? 'Choose the first rail for this account.' : connected === 3 ? 'Receive, hold, and spend are available.' : 'This account is partially configured.'}</h2><p>{connected === 0 ? 'No provider routes are connected. Start with the capability your agents need first.' : 'Each route is account-scoped and keeps its own provider position.'}</p></div><FlowLine compact /></div>
      {(['Receive', 'Hold', 'Spend', 'Bridge'] as const).map(category => (
        <section className="capability-section" key={category}>
          <SectionHeading eyebrow={`${data.providers.filter(p => p.category === category).length} provider`} title={category} action={<div className="capability-heading-actions"><button className="text-action" onClick={() => exploreProviders(category)}>How {category} providers work</button><button className="icon-button" aria-label={`Add ${category} provider`} onClick={() => addProvider(category)}><Plus size={17} /></button></div>} />
          <div className="provider-grid">{data.providers.filter(p => p.category === category).map(provider => <ProviderCard key={provider.id} provider={provider} configure={configure} />)}</div>
        </section>
      ))}
      <div className="callout callout--warning">
        <ShieldCheck size={20} />
        <div>
          <strong>{topology.isClosed ? 'Your economic loop is closed.' : 'Your economic loop needs external setup.'}</strong>
          <p>
            {topology.isClosed
              ? 'The daemon reports the required providers and route evidence for this account.'
              : 'Stripe revenue and Coinbase treasury do not automatically fund Lithic without a configured settlement rail.'}
          </p>
        </div>
        {!topology.isClosed && (
          <button className="secondary-button" onClick={() => closeLoop()}>
            Close the loop <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  )
}



function System({ data, source, notify, refresh, navigate }: { data: DashboardData; source: DataSource; notify: (message: string) => void; refresh: () => void; navigate: (id: NavId) => void }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const runtimeChecks = data.diagnostics.filter(check => check.group === 'runtime')
  const advancedChecks = data.diagnostics.filter(check => check.group === 'advanced')
  const daemonCheck = runtimeChecks.find(check => check.name === 'Local daemon')
  const storageCheck = runtimeChecks.find(check => check.name === 'Encrypted storage')
  const connectedProviders = data.providers.filter(provider => provider.status !== 'disconnected')
  const systemHealthy = runtimeChecks.length > 0 && runtimeChecks.every(check => check.status === 'healthy')
  const needsAttention = runtimeChecks.some(check => check.status === 'unavailable')

  const copyDiagnostics = () => navigator.clipboard.writeText(JSON.stringify({ source, diagnostics: data.diagnostics }, null, 2)).then(() => notify('Diagnostics copied'))
  const runAgain = () => { refresh(); notify('Runtime data refreshed') }

  const headline = source === 'preview' ? 'Preview mode' : systemHealthy ? 'Mandate is healthy' : 'Mandate needs attention'
  const heroLine = source === 'preview' ? 'Illustrative preview of the System page.' : systemHealthy ? 'Everything required for normal operation is running.' : 'One or more local runtime checks are unavailable.'
  const heroDetail = source === 'preview' ? 'No local financial state is shown. Open the authenticated dashboard for real runtime health.' : systemHealthy ? 'The daemon, agent interface, and encrypted storage are running locally.' : needsAttention ? 'Mandate cannot fully operate until the local runtime is available.' : 'Open diagnostics for details.'
  const tone: 'positive' | 'danger' | 'neutral' = source === 'preview' ? 'neutral' : systemHealthy ? 'positive' : 'danger'

  const credentialState = daemonCheck?.status === 'healthy' ? 'Protected' : 'Unavailable'
  const ledgerState = storageCheck?.status === 'healthy' ? 'Protected' : 'Unavailable'

  const facts = [
    { label: 'Version', value: data.version },
    { label: 'Started', value: data.startedAt },
    { label: 'Account', value: data.accountName },
  ]

  if (source === 'preview') {
    return (
      <div className="page page-enter">
        <PageIntro kicker="Local runtime" title="System" description="A calm view of local runtime health. Engineering diagnostics live behind View diagnostics." actions={<button className="secondary-button" onClick={copyDiagnostics}><Copy size={15} /> Copy diagnostics</button>} />
        <section className="system-hero">
          <div className="system-orbit"><span className="orbit orbit-1" /><span className="orbit orbit-2" /><Server size={28} /></div>
          <div><Pill tone={tone}><span className="status-dot" />{headline}</Pill><h2>{heroLine}</h2><p>{heroDetail}</p></div>
          <div className="system-facts">{facts.map(fact => <span key={fact.label}>{fact.label}<strong>{fact.value}</strong></span>)}</div>
        </section>
        <section className="panel system-preview">
          <span className="mini-icon"><Eye size={18} /></span>
          <div><p className="eyebrow">Preview</p><h3>Illustrative System view</h3><p>This is a static preview of how System reads once a local Mandate daemon is running. Runtime checks, provider health, and diagnostics all reflect a live instance.</p><button className="secondary-button" onClick={copyDiagnostics}><Copy size={14} /> Copy diagnostics</button></div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-enter">
      <PageIntro kicker="Local runtime" title="System" description="A calm view of local runtime health. Engineering diagnostics live behind View diagnostics." actions={<button className="secondary-button" onClick={copyDiagnostics}><Copy size={15} /> Copy diagnostics</button>} />
      <section className="system-hero">
        <div className="system-orbit"><span className="orbit orbit-1" /><span className="orbit orbit-2" /><Server size={28} /></div>
        <div><Pill tone={tone}><span className="status-dot" />{headline}</Pill><h2>{heroLine}</h2><p>{heroDetail}</p></div>
        <div className="system-facts">{facts.map(fact => <span key={fact.label}>{fact.label}<strong>{fact.value}</strong></span>)}</div>
      </section>
      <div className="system-calm-grid">
        <section className="panel system-panel">
          <SectionHeading eyebrow="Runtime" title="Local services" />
          <div className="system-checks">
            {runtimeChecks.map(check => (
              <div className={`system-check system-check--${check.status}`} key={check.name}>
                <span className="check-mark">{check.status === 'healthy' ? <Check size={13} /> : <X size={13} />}</span>
                <div><strong>{check.name}</strong>{check.status !== 'healthy' && <small>{check.detail}</small>}</div>
              </div>
            ))}
            {runtimeChecks.length === 0 && <p className="system-empty">No runtime checks reported.</p>}
          </div>
        </section>
        <section className="panel system-panel">
          <SectionHeading eyebrow="Providers" title="Connected routes" />
          <div className="system-checks">
            {connectedProviders.map(provider => (
              <div className="system-check system-check--healthy" key={provider.id}>
                <span className="check-mark"><Check size={13} /></span>
                <div><strong>{provider.name}</strong><small>{provider.detail}</small></div>
              </div>
            ))}
            {connectedProviders.length === 0 && <p className="system-empty">No provider routes connected yet. Set them up in <button className="inline-link" onClick={() => navigate('capabilities')}>Capabilities</button>.</p>}
          </div>
        </section>
        <section className="panel system-panel">
          <SectionHeading eyebrow="Data & security" title="Protection" />
          <div className="system-fact-rows">
            <div className="system-fact-row"><span>Encrypted ledger</span><strong className={ledgerState === 'Protected' ? 'system-fact-ok' : 'system-fact-warn'}>{ledgerState}</strong></div>
            <div className="system-fact-row"><span>Local credentials</span><strong className={credentialState === 'Protected' ? 'system-fact-ok' : 'system-fact-warn'}>{credentialState}</strong></div>
          </div>
        </section>
        <section className="panel system-panel">
          <SectionHeading eyebrow="Advanced" title="Instance" />
          <div className="system-fact-rows">
            <div className="system-fact-row"><span>Version</span><strong>{data.version}</strong></div>
            <div className="system-fact-row"><span>Started</span><strong>{data.startedAt}</strong></div>
          </div>
          <div className="system-actions">
            <button className="secondary-button" onClick={() => setShowDiagnostics(open => !open)} aria-expanded={showDiagnostics}>{showDiagnostics ? <><EyeOff size={15} /> Hide diagnostics</> : <><Eye size={15} /> View diagnostics</>}</button>
            <button className="text-action" onClick={runAgain}><RefreshCw size={13} /> Run again</button>
          </div>
        </section>
      </div>
      {showDiagnostics && advancedChecks.length > 0 && (
        <section className="panel diagnostics system-diagnostics">
          <SectionHeading eyebrow="Diagnostics" title="Advanced diagnostics" action={<button className="text-action" onClick={runAgain}><RefreshCw size={13} /> Run again</button>} />
          {advancedChecks.map(check => (
            <div className={`diagnostic-row diagnostic-row--${check.status}`} key={check.name}>
              <span>{check.status === 'healthy' ? <Check size={13} /> : <MoreHorizontal size={13} />}</span>
              <div><strong>{check.name}</strong><small>{check.detail}</small></div>
              <Pill tone={check.status === 'healthy' ? 'positive' : check.status === 'attention' ? 'warning' : 'danger'}>{check.label}</Pill>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

const ONBOARDING_STEPS = ['Welcome', 'Account', 'Starting point']

function FirstRun({ detected, onInitialized, onPreview }: { detected: { openclaw: boolean; hermes: boolean }; onInitialized: () => void; onPreview: () => void }) {
  const [step, setStep] = useState(0)
  const [accountName, setAccountName] = useState('Primary treasury')
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await initializeInstance({ account_name: accountName, demo })
      onInitialized()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Setup failed') } finally { setBusy(false) }
  }
  const visuals = [
    <div className="welcome-visual"><LogoMark /><div className="continuity-word">Receive <span /> Hold <span /> Spend</div></div>,
    <div className="onboarding-form"><label>First economic account<input value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="Primary treasury" /></label><div className="account-model"><strong>One principal, multiple accounts</strong><p>Each account owns its provider positions, ledger, and grants. Multiple agents can share one account without sharing administrator authority.</p></div></div>,
    <div className="starting-options"><button className={!demo ? 'selected' : ''} onClick={() => setDemo(false)}><span><WalletCards size={18} /></span><div><strong>Start empty</strong><small>Connect each route yourself. Best for learning the real setup flow.</small></div>{!demo && <Check size={16} />}</button><button className={demo ? 'selected' : ''} onClick={() => setDemo(true)}><span><Sparkles size={18} /></span><div><strong>Add demo routes</strong><small>Seed local Coinbase, Stripe, and Lithic test routes and funds.</small></div>{demo && <Check size={16} />}</button><div className="detected-summary">OpenClaw {detected.openclaw ? 'detected' : 'not found'} · Hermes {detected.hermes ? 'detected' : 'not found'}</div></div>,
  ]
  const copy = [
    ['Welcome to Mandate', 'Give your agents an economic account.', 'Set up a clean local instance from first principles. Demo data is optional and never mixed with your real account state.'],
    ['Account boundary', 'Name the first economic account.', 'Use separate accounts when agents, providers, authority, or accounting histories should remain isolated.'],
    ['Initial state', 'Start clean or add an explicit demo.', 'A clean account contains no providers, funds, agents, or activity. Demo routes can be connected later at any time.'],
  ]
  const [eyebrow, title, body] = copy[step]
  const canContinue = step !== 1 || accountName.trim()
  return <div className="onboarding"><header><div className="brand"><LogoMark /><span>Mandate</span></div><Pill tone="neutral">First-time setup</Pill></header><main><div className="onboarding-progress" aria-label={`Setup step ${step + 1} of ${ONBOARDING_STEPS.length}`}>{ONBOARDING_STEPS.map((name, index) => <div key={name} className={index <= step ? 'complete' : ''}><span>{index < step ? <Check size={11} /> : index + 1}</span><small>{name}</small></div>)}</div><section className="onboarding-card page-enter" key={step}><div className="onboarding-copy"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{body}</p>{step === 0 && <div className="local-note"><ShieldCheck size={16} /><span><strong>Local-first.</strong> Your encrypted ledger and agent policy remain on this Mac.</span></div>}</div><div className="onboarding-visual">{visuals[step]}</div></section>{error && <p className="form-error onboarding-error" role="alert">{error}</p>}<footer><button className="secondary-button" onClick={() => step === 0 ? onPreview() : setStep(step - 1)}>{step === 0 ? 'View demo first' : 'Back'}</button><span>Step {step + 1} of {ONBOARDING_STEPS.length}</span><button className="primary-button" disabled={!canContinue || busy} onClick={() => step === ONBOARDING_STEPS.length - 1 ? submit() : setStep(step + 1)}>{busy ? 'Creating…' : step === ONBOARDING_STEPS.length - 1 ? 'Create Mandate' : 'Continue'} <ArrowRight size={15} /></button></footer></main></div>
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard.writeText(command).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
  return (
    <div className="setup-command-wrap">
      <pre className="setup-command">{command}</pre>
      <button className="setup-copy" type="button" onClick={copy} aria-label="Copy command to clipboard">
        {copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}

function positionMatchesEvent(position: Position, event: SandboxSimulationEvent): boolean {
  if (position.asset !== event.asset) return false
  const provider = position.provider.toLowerCase()
  if (event.providerId === 'stripe-revenue') return provider.includes('stripe') || provider.includes('revenue')
  if (event.providerId === 'lithic-card') return provider.includes('card') || provider.includes('lithic')
  if (event.providerId === 'coinbase-cdp-wallet') return provider.includes('treasury') || provider.includes('coinbase')
  return position.provider === event.providerId
}

function applySandboxEvent(data: DashboardData, event: SandboxSimulationEvent): DashboardData {
  const positions = data.positions.map(position => {
    if (!positionMatchesEvent(position, event)) return position
    if (event.direction === 'neutral') return { ...position, reconciledAt: 'Just now' }
    const delta = BigInt(event.amountAtomic)
    if (event.direction === 'in') {
      return {
        ...position,
        available: String(BigInt(position.available) + delta),
        settled: String(BigInt(position.settled) + delta),
        reconciledAt: 'Just now',
      }
    }
    const available = BigInt(position.available)
    const settled = BigInt(position.settled)
    return {
      ...position,
      available: String(available >= delta ? available - delta : 0n),
      settled: String(settled >= delta ? settled - delta : 0n),
      reconciledAt: 'Just now',
    }
  })

  const transaction: Transaction = {
    id: `${event.txPrefix}_${Math.random().toString(36).slice(2, 6)}`,
    title: event.title,
    description: event.summary,
    amount: (event.amountAtomic / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    asset: event.asset,
    direction: event.direction,
    status: event.status,
    provider: event.providerLabel,
    actor: 'Sandbox Simulator',
    time: 'Just now',
    steps: event.steps,
    ledgerEntries: event.ledgerEntries,
  }

  let estimateUsd = data.estimateUsd
  if (event.asset === 'USD' && event.direction !== 'neutral' && estimateUsd !== '—') {
    const parsed = Number(estimateUsd.replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(parsed)) {
      const dollars = event.amountAtomic / 100
      const next = parsed + (event.direction === 'in' ? dollars : -dollars)
      estimateUsd = next.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
  }

  return { ...data, positions, transactions: [transaction, ...data.transactions], estimateUsd }
}

function getScopedDashboardData(data: DashboardData, environment: EnvironmentMode): DashboardData {
  if (environment === 'preview') return data
  const isLive = environment === 'live'

  const providers = data.providers.map(provider => {
    if (isLive) {
      const isLiveConnected = provider.status === 'live' || provider.status === 'live_ready'
      if (!isLiveConnected) {
        return { ...provider, status: 'disconnected' as const, detail: 'No live route connected' }
      }
    } else {
      const isSandboxConnected = provider.status === 'sandbox' || provider.detail.toLowerCase().includes('demo') || provider.detail.toLowerCase().includes('sandbox')
      if (!isSandboxConnected && provider.status === 'live') {
        return { ...provider, status: 'disconnected' as const, detail: 'No sandbox route connected' }
      }
    }
    return provider
  })

  const positions = data.positions.filter(position => {
    if (isLive) return position.status === 'live'
    // Demo (seeded) positions belong only to the explicit demo preview, not the
    // real sandbox view backed by daemon state.
    if (position.status === 'demo') return false
    return position.status === 'sandbox'
  })

  return {
    ...data,
    providers,
    positions,
  }
}

export function App() {
  const [page, setPage] = useState<NavId>('overview')
  const [data, setData] = useState<DashboardData>(() => emptyData())
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [source, setSource] = useState<DataSource>('offline')
  const [environment, setEnvironment] = useState<EnvironmentMode>('sandbox')
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [toast, setToast] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [liquidity, setLiquidityState] = useState<LiquidityConfig>(() => loadLiquidity())
  const [guideEntry, setGuideEntry] = useState<{ tab: GuideTabId; providerFocus?: ProviderCategory }>({ tab: 'start' })
  const [dialog, setDialog] = useState<
    | { type: 'operation'; kind?: string }
    | { type: 'liquidity' }
    | { type: 'accounting' }
    | { type: 'ledger'; transaction: Transaction }
    | { type: 'provider'; provider?: Provider; category?: ProviderCategory }
    | { type: 'agent'; agent?: Agent; runtime?: 'openclaw' | 'hermes' }
    | { type: 'test_agent'; agent: Agent }
    | { type: 'command' }
    | { type: 'sandbox_simulator' }
    | { type: 'account' }
    | { type: 'setup' }
    | { type: 'build_provider' }
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
    if (source !== 'daemon') return
    return subscribeToEvents(incoming => {
      setActivityEvents(current => {
        const seen = new Set(current.map(event => String(event.id)))
        return [...incoming.filter(event => !seen.has(String(event.id))).reverse(), ...current].slice(0, 100)
      })
      setRefreshVersion(version => version + 1)
    })
  }, [source, selectedAccountId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (id: NavId) => { setPage(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openGuide = (tab: GuideTabId = 'start', providerFocus?: ProviderCategory) => {
    setGuideEntry({ tab, providerFocus })
    navigate('guide')
  }
  const completed = (message: string) => { setToast(message); setRefreshVersion(version => version + 1) }
  const simulateSandboxEvent = (event: SandboxSimulationEvent) => {
    setData(current => applySandboxEvent(current, event))
    setActivityEvents(current => [{
      id: `sandbox_${Date.now()}`,
      eventType: 'sandbox.simulated',
      createdAt: new Date().toISOString(),
      payload: { account_id: data.accountId, title: event.title, detail: `Sandbox Simulator · ${event.summary}`, provider: event.providerId, amount_display: `$${(event.amountAtomic / 100).toFixed(2)}` },
    }, ...current])
    setToast(`Simulated event: ${event.title}`)
  }
  const preview = () => { setData(fixtureData); setActivityEvents(fixtureActivityEvents); setSource('preview'); setEnvironment('preview'); setLoading(false) }
  const returnToRealState = () => { setLoading(true); setActivityEvents([]); setSelectedAccountId(''); setRefreshVersion(version => version + 1) }
  const selectAccount = (id: string) => { setLoading(true); setActivityEvents([]); setSelectedAccountId(id) }
  const accountCreated = (account: EconomicAccount) => { setDialog(null); setToast(`${account.name} created`); selectAccount(account.id) }
  const selectEnvironment = (mode: EnvironmentMode) => {
    if (mode === 'preview') {
      preview()
    } else {
      setEnvironment(mode)
      if (source === 'preview') returnToRealState()
    }
  }

  const scopedData = getScopedDashboardData(data, environment)

  if (loading) return <div className="app-loading"><LogoMark /><span>Opening Mandate…</span></div>
  if (source === 'uninitialized') return <FirstRun detected={scopedData.detectedRuntimes} onInitialized={returnToRealState} onPreview={preview} />
  if (source === 'offline') return <div className="onboarding access-gate"><header><div className="brand"><LogoMark /><span>Mandate</span></div><Pill tone="danger">Daemon offline</Pill></header><main><section className="onboarding-card"><div className="onboarding-copy"><p className="eyebrow">Local runtime unavailable</p><h1>Start Mandate to continue.</h1><p>The dashboard could not reach the local daemon. No preview or sample financial data has been substituted.</p><CopyCommand command="cargo run -p mandated" /><button className="secondary-button" onClick={() => setRefreshVersion(version => version + 1)}>Try again</button><button className="secondary-button" onClick={preview}>View explicit demo preview</button></div><div className="onboarding-visual"><div className="security-visual"><Server size={42} /><small>Waiting for 127.0.0.1:7741</small></div></div></section></main></div>

  return (
    <Shell page={page} onNavigate={navigate} source={source} environment={environment} onSelectEnvironment={selectEnvironment} data={scopedData} openSetup={source === 'preview' ? returnToRealState : () => setDialog({ type: 'setup' })} openCommand={() => setDialog({ type: 'command' })} openSimulator={() => setDialog({ type: 'sandbox_simulator' })} selectAccount={selectAccount} createAccount={() => setDialog({ type: 'account' })}>
      {page === 'overview' && <Overview data={scopedData} source={source} environment={environment} navigate={navigate} newOperation={() => setDialog({ type: 'operation' })} openSimulator={() => setDialog({ type: 'sandbox_simulator' })} onTestConnection={agent => setDialog({ type: 'test_agent', agent })} />}
      {page === 'account' && <Account data={scopedData} explainAccounting={() => setDialog({ type: 'accounting' })} reconcile={() => { setRefreshVersion(version => version + 1); setToast('Ledger snapshot refreshed') }} liquidity={liquidity} onConfigureLiquidity={() => setDialog({ type: 'liquidity' })} onManualTransfer={() => setDialog({ type: 'operation', kind: 'transfer' })} onFund={() => setDialog({ type: 'operation', kind: 'receive' })} navigate={navigate} />}
      {page === 'activity' && <Activity data={scopedData} events={activityEvents} source={source} viewLedger={transaction => setDialog({ type: 'ledger', transaction })} />}
      {page === 'agents' && <Agents data={scopedData} connect={() => setDialog({ type: 'agent' })} manage={agent => setDialog({ type: 'agent', agent })} testConnection={agent => setDialog({ type: 'test_agent', agent })} reviewDetected={() => setDialog({ type: 'agent', runtime: scopedData.detectedRuntimes.hermes && !scopedData.detectedRuntimes.openclaw ? 'hermes' : 'openclaw' })} />}
      {page === 'capabilities' && <Capabilities data={scopedData} configure={provider => setDialog({ type: 'provider', provider })} addProvider={category => setDialog({ type: 'provider', category })} exploreProviders={category => openGuide('providers', category)} closeLoop={() => openGuide('setup')} />}
      {page === 'guide' && <Guide data={scopedData} events={activityEvents} navigate={navigate} initialTab={guideEntry.tab} providerFocus={guideEntry.providerFocus} onOpenProvider={providerId => setDialog({ type: 'provider', provider: scopedData.providers.find(p => p.id === providerId) })} onBuildProvider={() => setDialog({ type: 'build_provider' })} notify={setToast} />}
      {page === 'system' && <System data={scopedData} source={source} notify={setToast} refresh={() => setRefreshVersion(version => version + 1)} navigate={navigate} />}

      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
      {dialog?.type === 'operation' && <OperationDialog accountId={scopedData.accountId} source={source} initialKind={dialog.kind} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'liquidity' && <LiquidityConfigDialog config={liquidity} onSave={next => { setLiquidityState(next); saveLiquidity(next); setToast('Liquidity preferences saved'); setDialog(null) }} onClose={() => setDialog(null)} />}
      {dialog?.type === 'accounting' && <AccountingDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'ledger' && <LedgerDialog transaction={dialog.transaction} onClose={() => setDialog(null)} />}
      {dialog?.type === 'provider' && <ProviderDialog accountId={scopedData.accountId} providers={scopedData.providers} provider={dialog.provider} category={dialog.category} environment={environment} source={source} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'agent' && <AgentDialog accountId={scopedData.accountId} detected={scopedData.detectedRuntimes} source={source} agent={dialog.agent} presetRuntime={dialog.runtime} onClose={() => setDialog(null)} onComplete={completed} onTestConnection={agent => setDialog({ type: 'test_agent', agent })} />}
      {dialog?.type === 'test_agent' && <TestAgentDialog agent={dialog.agent} accountName={scopedData.accountName} accountId={scopedData.accountId} providers={scopedData.providers} source={source} onClose={() => setDialog(null)} onComplete={completed} />}
      {dialog?.type === 'command' && <CommandDialog onClose={() => setDialog(null)} navigate={navigate} newOperation={() => setDialog({ type: 'operation' })} />}
      {dialog?.type === 'sandbox_simulator' && <SandboxSimulatorDialog onClose={() => setDialog(null)} onSimulate={(event) => simulateSandboxEvent(event)} />}
      {dialog?.type === 'account' && <AccountDialog onClose={() => setDialog(null)} onComplete={accountCreated} />}
      {dialog?.type === 'setup' && <SetupChecklistDialog providers={scopedData.providers} agents={scopedData.agents} onClose={() => setDialog(null)} navigate={navigate} />}
      {dialog?.type === 'build_provider' && <BuildProviderDialog onClose={() => setDialog(null)} />}

    </Shell>
  )
}
