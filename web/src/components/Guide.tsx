import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  BookOpen,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  Code2,
  Compass,
  CreditCard,
  ExternalLink,
  Landmark,
  Layers,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react'
import { CAPABILITY_MANIFEST } from '../lib/capabilities.generated'
import type {
  AccountTopology,
  ActivityEvent,
  CapabilityAvailability,
  DashboardData,
  GuideTabId,
  LoopRouteStep,
  NavId,
} from '../lib/types'
import { Pill, ProviderLogo, SectionHeading } from './ui'

type ProviderGuideType = 'Receive' | 'Hold' | 'Spend' | 'Bridge'

const TAB_COPY: Record<GuideTabId, { eyebrow: string; title: string; subtitle: string }> = {
  start: {
    eyebrow: 'Prompt playbook',
    title: 'What can your agent do with Mandate?',
    subtitle: 'Ask naturally. Mandate resolves the financial capability connected to this economic account.',
  },
  playbook: {
    eyebrow: 'Things to ask',
    title: 'Prompt Playbook',
    subtitle: 'Start with the outcome you want. Your provider choices stay underneath the prompt.',
  },
  reference: {
    eyebrow: 'Live capability reference',
    title: 'What this account can do',
    subtitle: 'Semantic guidance, requirements, side effects, and the current truth for this account.',
  },
  setup: {
    eyebrow: 'Account setup',
    title: 'Connect the economic loop',
    subtitle: 'Configure the providers and external routes your prompts need to become executable.',
  },
}

const ICONS: Record<string, typeof Banknote> = {
  'Earn money': Banknote,
  'Use earned capital': CreditCard,
  'Manage customers': Landmark,
  'Understand finances': CircleDollarSign,
}

const OPERATION_KIND: Record<string, string> = {
  checkout: 'checkout',
  invoice: 'invoice',
  receive: 'receive_endpoint',
  pay: 'payment_session',
  transfer: 'transfer',
  refund: 'refund',
}

function accountCapabilities(data: DashboardData): CapabilityAvailability[] {
  const reported = new Map(
    data.capabilities?.account_id === data.accountId
      ? data.capabilities.capabilities.map(capability => [capability.id, capability])
      : [],
  )
  const executableProviderIds = new Set(
    data.providers
      .filter(provider => !['disconnected', 'not_connected', 'degraded'].includes(String(provider.status)))
      .map(provider => provider.id),
  )

  return CAPABILITY_MANIFEST.capabilities.map(definition => {
    const current = reported.get(definition.id)
    const providerIds: string[] = CAPABILITY_MANIFEST.providers
      .filter(provider =>
        executableProviderIds.has(provider.id)
        && provider.agent_capabilities.some(capability => capability === definition.id),
      )
      .map(provider => provider.id)
    const routeRequired = definition.requires_provider_categories.length > 0
    const granted = current?.granted ?? true
    const available = granted && (!routeRequired || providerIds.length > 0)
    const connectedProviders = data.providers.filter(provider => providerIds.includes(provider.id))
    const unavailableReason = !granted
      ? 'This agent grant does not allow this capability.'
      : routeRequired && providerIds.length === 0
        ? `Connect a ${definition.requires_provider_categories.join(' or ')} provider to make this capability executable.`
        : null

    return {
      ...(current ?? definition),
      examples: [...definition.examples],
      requires_provider_categories: [...definition.requires_provider_categories],
      requires_provider_capabilities: [...definition.requires_provider_capabilities],
      environments: [...definition.environments],
      flow: [...definition.flow],
      tools: [...definition.tools],
      granted,
      available,
      provider_ids: providerIds,
      environment: connectedProviders.some(provider => provider.status === 'live')
        ? 'live'
        : connectedProviders.length
          ? 'sandbox'
          : null,
      unavailable_reason: unavailableReason,
    }
  })
}

export function getAccountTopology(data: DashboardData): AccountTopology {
  const receiveProvider = data.providers.find(provider => provider.category === 'Receive' && provider.status !== 'disconnected')
  const holdProvider = data.providers.find(provider => provider.category === 'Hold' && provider.status !== 'disconnected')
  const spendProvider = data.providers.find(provider => provider.category === 'Spend' && provider.status !== 'disconnected')
  const verified = new Set(data.verifiedRoutes ?? [])
  const receiveConnected = Boolean(receiveProvider)
  const holdConnected = Boolean(holdProvider)
  const spendConnected = Boolean(spendProvider)
  const steps: LoopRouteStep[] = []

  if (!receiveProvider || !holdProvider) {
    steps.push({
      id: 'receive-to-hold',
      title: 'Revenue → operating treasury',
      sourceProvider: receiveProvider?.name ?? 'Receive provider',
      targetProvider: holdProvider?.name ?? 'Hold provider',
      summary: receiveConnected
        ? 'Revenue can arrive, but no connected treasury is available to hold operating capital.'
        : 'Connect a Receive provider and a Hold provider before configuring settlement.',
      inMandateCapabilities: ['Checkout, invoice, and receive intents', 'Provider-scoped positions', 'Normalized ledger activity'],
      externalSteps: ['Connect the missing provider.', 'Configure its payout or deposit destination directly with the provider.', 'Wait for daemon reconciliation to report the route.'],
      routeCaveat: 'A provider connection does not prove that value can settle into the next position.',
      actionLabel: 'Configure providers',
      status: 'pending',
    })
  } else {
    const routeReady = verified.has('stripe-to-treasury') || receiveProvider?.status === 'live'
    steps.push({
      id: 'receive-to-hold',
      title: `${receiveProvider.name} → ${holdProvider.name}`,
      sourceProvider: receiveProvider.name,
      targetProvider: holdProvider.name,
      summary: 'Configure settlement from the revenue position into operating treasury.',
      inMandateCapabilities: ['Customer payment operations', 'Provider positions', 'Ledger reconciliation'],
      externalSteps: ['Configure the payout destination with the Receive provider.', 'Use a supported bank or Bridge route when the positions cannot connect directly.', 'Wait for reconciliation evidence before relying on the route.'],
      routeCaveat: 'Mandate does not mark this route ready from a button click. Readiness requires provider or daemon evidence.',
      actionLabel: 'Review provider setup',
      status: routeReady ? 'completed' : 'attention',
      verifyNote: routeReady ? 'Route readiness was reported by the daemon or connected live provider.' : undefined,
    })
  }

  if (!holdProvider || !spendProvider) {
    steps.push({
      id: 'hold-to-spend',
      title: 'Operating treasury → purchasing power',
      sourceProvider: holdProvider?.name ?? 'Hold provider',
      targetProvider: spendProvider?.name ?? 'Spend provider',
      summary: spendConnected
        ? 'The Spend provider is connected, but no treasury position is available to back it.'
        : 'Connect a Spend provider and define how it is funded.',
      inMandateCapabilities: ['Balance checks', 'Controlled payment sessions', 'Reservations and audit trail'],
      externalSteps: ['Connect the missing provider.', 'Configure the card-program or transfer funding source.', 'Test in sandbox before using live money.'],
      routeCaveat: 'Purchasing power is not implied by value held at another provider.',
      actionLabel: 'Configure providers',
      status: 'pending',
    })
  } else {
    const routeReady = verified.has('treasury-to-spend') || spendProvider?.status === 'live'
    steps.push({
      id: 'hold-to-spend',
      title: `${holdProvider.name} → ${spendProvider.name}`,
      sourceProvider: holdProvider.name,
      targetProvider: spendProvider.name,
      summary: 'Configure the funding rail that backs controlled merchant payments.',
      inMandateCapabilities: ['Balance checks', 'Payment sessions', 'Ledger reservations'],
      externalSteps: ['Configure the Spend provider funding source.', 'Confirm supported currency and settlement timing.', 'Test a sandbox payment through your agent.'],
      routeCaveat: 'A connected Spend provider can still reject a payment when its funding rail is unavailable.',
      actionLabel: 'Review provider setup',
      status: routeReady ? 'completed' : 'attention',
      verifyNote: routeReady ? 'Funding readiness was reported by the daemon or connected live provider.' : undefined,
    })
  }

  const isClosed = receiveConnected && holdConnected && spendConnected && steps.every(step => step.status === 'completed')
  return {
    isClosed,
    receiveConnected,
    holdConnected,
    spendConnected,
    receiveProvider,
    holdProvider,
    spendProvider,
    steps,
    statusSummary: isClosed
      ? 'The daemon reports connected Receive, Hold, and Spend rails with route evidence.'
      : 'Connected providers and executable routes are separate. Finish the steps below, then verify through real activity.',
    missingRoutesCount: steps.filter(step => step.status !== 'completed').length,
  }
}

function eventMatchesCapability(event: ActivityEvent, capabilityId: string, copiedAt: number) {
  const createdAt = Date.parse(event.createdAt)
  if (Number.isFinite(createdAt) && createdAt < copiedAt) return false
  const payloadCapability = String(event.payload.capability ?? '')
  const kind = OPERATION_KIND[capabilityId]
  return payloadCapability === capabilityId || Boolean(kind && event.eventType.includes(kind))
}

function CapabilityStatus({ capability }: { capability: CapabilityAvailability }) {
  if (capability.available) return <Pill tone="positive">Available now</Pill>
  if (!capability.granted) return <Pill tone="warning">Not in agent grant</Pill>
  return <Pill tone="neutral">Setup required</Pill>
}

export function Guide({
  data,
  events,
  navigate,
  onOpenProvider,
  notify,
  initialTab = 'start',
  providerFocus,
}: {
  data: DashboardData
  events: ActivityEvent[]
  navigate: (id: NavId) => void
  onOpenProvider: (providerId?: string) => void
  notify: (message: string) => void
  initialTab?: GuideTabId
  providerFocus?: ProviderGuideType
}) {
  const [activeTab, setActiveTab] = useState<GuideTabId>(initialTab)
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null)
  const [copied, setCopied] = useState<{ capabilityId: string; copiedAt: number } | null>(null)
  const capabilities = useMemo(() => accountCapabilities(data), [data])
  const topology = getAccountTopology(data)
  const copy = TAB_COPY[activeTab]
  const selected = capabilities.find(capability => capability.id === selectedCapabilityId)
  const availableCount = capabilities.filter(capability => capability.available).length
  const connectedAgent = data.agents.find(agent => agent.status === 'connected')
  const matchingEvent = copied
    ? events.find(event => eventMatchesCapability(event, copied.capabilityId, copied.copiedAt))
    : undefined

  const copyPrompt = async (capability: CapabilityAvailability, example = capability.examples[0]) => {
    await navigator.clipboard?.writeText(example)
    setCopied({ capabilityId: capability.id, copiedAt: Date.now() })
    notify('Prompt copied. Paste it into your agent; Mandate is watching for activity.')
  }

  const openCapability = (id: string, tab: GuideTabId = 'reference') => {
    setSelectedCapabilityId(id)
    setActiveTab(tab)
  }

  return (
    <div className="page page-enter prompt-guide">
      <header className="guide-header-hero prompt-guide-hero">
        <div className="guide-title-block">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="guide-subtitle">{copy.subtitle}</p>
          <div className="guide-live-summary">
            <span>{availableCount} of {capabilities.length} capabilities available</span>
            <span>Spec {data.capabilities?.spec_version ?? CAPABILITY_MANIFEST.spec_version}</span>
          </div>
        </div>
        <nav className="guide-tabs" aria-label="Guide sub-navigation">
          {([
            ['start', Compass, 'Start here'],
            ['playbook', Sparkles, 'Playbook'],
            ['reference', BookOpen, 'Reference'],
            ['setup', Layers, 'Setup'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} className={`guide-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon size={15} /><span>{label}</span>
              {id === 'setup' && topology.missingRoutesCount > 0 && <span className="guide-tab-badge">{topology.missingRoutesCount}</span>}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === 'start' && (
        <div className="guide-section page-enter">
          <SectionHeading eyebrow="Start with intent" title="Choose an outcome, then copy the prompt" action={<span className="recipe-tagline">Built for OpenClaw and Hermes</span>} />
          <div className="intent-card-grid">
            {Object.entries(ICONS).map(([group, Icon]) => {
              const groupCapabilities = capabilities.filter(capability => capability.intent_group === group)
              const example = groupCapabilities.find(capability => capability.available) ?? groupCapabilities[0]
              if (!example) return null
              return (
                <article className="intent-card" key={group}>
                  <header><span className="intent-icon"><Icon size={19} /></span><CapabilityStatus capability={example} /></header>
                  <p className="eyebrow">{group}</p>
                  <blockquote>“{example.examples[0]}”</blockquote>
                  <div className="intent-capability-list">{groupCapabilities.map(capability => <code key={capability.id}>{capability.id}</code>)}</div>
                  <footer>
                    <button className="secondary-button" onClick={() => openCapability(example.id)}>How it works</button>
                    <button className="primary-button" onClick={() => copyPrompt(example)}><Clipboard size={14} /> Copy prompt</button>
                  </footer>
                </article>
              )
            })}
            <article className="intent-card intent-card--future">
              <header><span className="intent-icon"><RefreshCw size={19} /></span><Pill tone="neutral">Routes required</Pill></header>
              <p className="eyebrow">Operate autonomously</p>
              <blockquote>“Make sure you have enough spending power to keep operating.”</blockquote>
              <p className="intent-note">This becomes executable only when Mandate can prove a treasury-to-spend route. It is not inferred from connected balances.</p>
              <footer><button className="secondary-button" onClick={() => setActiveTab('setup')}>Review routes <ArrowRight size={14} /></button></footer>
            </article>
          </div>

          <section className="agent-playground">
            <div className="playground-heading">
              <div><p className="eyebrow">Try with your agent</p><h2>Copy there. Verify here.</h2></div>
              <Pill tone={matchingEvent ? 'positive' : copied ? 'info' : 'neutral'}>{matchingEvent ? 'Activity observed' : copied ? 'Waiting for Mandate' : 'Ready'}</Pill>
            </div>
            <div className="playground-steps">
              <div className={copied ? 'complete' : ''}><span>1</span><strong>Pick and copy a prompt</strong><small>{copied ? copied.capabilityId : 'Choose a card above'}</small></div>
              <div className={connectedAgent ? 'complete' : ''}><span>2</span><strong>Paste into your agent</strong><small>{connectedAgent ? `${connectedAgent.runtime} · ${connectedAgent.name}` : 'Connect OpenClaw or Hermes first'}</small></div>
              <div className={matchingEvent ? 'complete' : copied ? 'active' : ''}><span>3</span><strong>Mandate activity</strong><small>{matchingEvent ? matchingEvent.eventType : copied ? 'Waiting for a matching request…' : 'No prompt in progress'}</small></div>
              <div className={matchingEvent && matchingEvent.payload.provider ? 'complete' : ''}><span>4</span><strong>Provider route</strong><small>{matchingEvent?.payload.provider ? String(matchingEvent.payload.provider) : 'Marked only when the daemon reports it'}</small></div>
            </div>
            {!connectedAgent && <button className="text-action" onClick={() => navigate('agents')}>Connect an agent before testing <ArrowRight size={13} /></button>}
          </section>

          <section className="whats-new-card">
            <div><p className="eyebrow">What’s new</p><h3>Mandate {data.capabilities?.releases[0]?.version ?? CAPABILITY_MANIFEST.releases[0].version}</h3></div>
            <ul>{(data.capabilities?.releases[0]?.items ?? CAPABILITY_MANIFEST.releases[0].items).map(item => <li key={item}><Check size={13} />{item}</li>)}</ul>
          </section>
        </div>
      )}

      {activeTab === 'playbook' && (
        <div className="guide-section page-enter">
          {[...new Set(capabilities.map(capability => capability.intent_group))].map(group => (
            <section className="playbook-group" key={group}>
              <SectionHeading eyebrow={group.toUpperCase()} title={group} />
              <div className="playbook-list">
                {capabilities.filter(capability => capability.intent_group === group).map(capability => (
                  <article className="playbook-row" key={capability.id}>
                    <button className="playbook-main" onClick={() => openCapability(capability.id)}>
                      <span><strong>{capability.title}</strong><small>{capability.summary}</small></span>
                      <CapabilityStatus capability={capability} />
                      <ChevronRight size={16} />
                    </button>
                    <blockquote>“{capability.examples[0]}”</blockquote>
                    <button className="copy-icon-button" aria-label={`Copy prompt for ${capability.title}`} onClick={() => copyPrompt(capability)}><Clipboard size={15} /></button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeTab === 'reference' && (
        <div className="guide-section page-enter">
          {selected ? (
            <article className="capability-detail">
              <button className="text-action" onClick={() => setSelectedCapabilityId(null)}>← All capabilities</button>
              <header className="capability-detail-header">
                <div><p className="eyebrow">{selected.intent_group}</p><h2>{selected.title}</h2><p>{selected.description}</p></div>
                <CapabilityStatus capability={selected} />
              </header>
              {!selected.available && <div className="capability-blocker"><Route size={17} /><div><strong>Not executable yet</strong><p>{selected.unavailable_reason}</p></div><button className="secondary-button" onClick={() => setActiveTab('setup')}>Fix setup</button></div>}
              <section className="capability-prompts">
                <p className="eyebrow">Try saying</p>
                {selected.examples.map(example => <button key={example} onClick={() => copyPrompt(selected, example)}><span>“{example}”</span><Clipboard size={14} /></button>)}
              </section>
              <section className="capability-flow">
                <p className="eyebrow">What happens</p>
                <div>{selected.flow.map((step, index) => <span key={step}><i>{index + 1}</i>{step}{index < selected.flow.length - 1 && <ArrowRight size={13} />}</span>)}</div>
              </section>
              <div className="semantic-split">
                <section><strong>Use when</strong><p>{selected.use_when}</p></section>
                <section><strong>Do not use when</strong><p>{selected.do_not_use_when}</p></section>
              </div>
              <dl className="capability-facts">
                <div><dt>Capability</dt><dd><code>{selected.id}</code></dd></div>
                <div><dt>Requires</dt><dd>{selected.requires_provider_categories.join(' · ') || 'No provider route'}{selected.provider_ids.length ? ` · ${selected.provider_ids.join(', ')}` : ''}</dd></div>
                <div><dt>Side effect</dt><dd>{selected.side_effect}</dd></div>
                <div><dt>Environment</dt><dd>{selected.environment ?? selected.environments.join(' / ')}</dd></div>
                <div><dt>Introduced</dt><dd>Mandate {selected.introduced}</dd></div>
                <div><dt>Updated</dt><dd>{selected.updated}</dd></div>
              </dl>
              <details className="developer-details">
                <summary><Code2 size={15} /> Developer details</summary>
                <div><p><strong>MCP tools</strong> <code>{selected.tools.join(' · ')}</code></p><p><strong>Provider protocol</strong> <code>{selected.requires_provider_capabilities.join(' · ') || 'none'}</code></p><p><strong>Money direction</strong> <code>{selected.direction}</code></p></div>
              </details>
            </article>
          ) : (
            <>
              <SectionHeading eyebrow="By human intent" title="Capability reference" action={<span className="recipe-tagline">Current for {data.accountName}</span>} />
              <div className="capability-reference-list">
                {capabilities.map(capability => (
                  <button key={capability.id} onClick={() => setSelectedCapabilityId(capability.id)}>
                    <span><code>{capability.id}</code><strong>{capability.title}</strong><small>{capability.summary}</small></span>
                    <CapabilityStatus capability={capability} /><ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'setup' && (
        <div className="guide-section page-enter">
          <section className={`loop-status-card ${topology.isClosed ? 'loop-status-card--closed' : ''}`}>
            <div className="loop-status-header">
              <div><p className="eyebrow">Account topology · {data.accountName}</p><h2>Your economic loop</h2></div>
              <Pill tone={topology.isClosed ? 'positive' : 'warning'}>{topology.isClosed ? 'Routes reported ready' : 'Setup incomplete'}</Pill>
            </div>
            <div className="loop-diagram">
              {([
                ['Receive', topology.receiveProvider, CreditCard],
                ['Hold', topology.holdProvider, Wallet],
                ['Spend', topology.spendProvider, Zap],
              ] as const).map(([label, provider, Icon], index) => (
                <div className="loop-fragment" key={label}>
                  <div className={`loop-node ${provider ? 'loop-node--connected' : ''}`}><span className="node-icon"><Icon size={16} /></span><strong>{label}</strong><small>{provider?.name ?? 'Not connected'}</small><span className="node-check">{provider ? '✓' : '○'}</span></div>
                  {index < 2 && <div className="loop-arrow loop-arrow--attention"><span className="arrow-label">{index ? 'Fund' : 'Settle'}</span><span className="arrow-symbol">→</span></div>}
                </div>
              ))}
            </div>
            <div className="loop-status-message"><strong>{topology.isClosed ? 'Provider evidence is available.' : 'Connection is not continuity.'}</strong><p>{topology.statusSummary}</p></div>
          </section>

          <SectionHeading eyebrow="Required actions" title="Make prompts executable" />
          <div className="route-steps-list">
            {topology.steps.map((step, index) => (
              <article className={`route-step-card ${step.status === 'completed' ? 'route-step-card--completed' : ''}`} key={step.id}>
                <header className="step-card-header"><div className="step-number-tag"><span>{index + 1}</span></div><div><h3>{step.title}</h3><p className="step-summary">{step.summary}</p></div><Pill tone={step.status === 'completed' ? 'positive' : 'warning'}>{step.status === 'completed' ? 'Evidence reported' : 'Setup needed'}</Pill></header>
                <div className="step-execution-split">
                  <div className="split-box split-box--mandate"><div className="split-heading"><span className="badge-mandate">IN MANDATE</span></div><ul>{step.inMandateCapabilities.map(item => <li key={item}><Check size={13} />{item}</li>)}</ul></div>
                  <div className="split-box split-box--external"><div className="split-heading"><span className="badge-external">EXTERNAL SETUP</span></div><ol>{step.externalSteps.map((item, i) => <li key={item}><strong>{i + 1}.</strong> {item}</li>)}</ol></div>
                </div>
                <div className="route-caveat-box"><ShieldCheck size={16} /><p>{step.routeCaveat}</p></div>
                <footer className="step-card-footer">
                  {step.verifyNote ? <div className="verified-banner"><ShieldCheck size={16} />{step.verifyNote}</div> : (
                    <div className="step-action-group"><button className="secondary-button" onClick={() => navigate('capabilities')}>Open Capabilities</button><button className="primary-button" onClick={() => onOpenProvider(step.id === 'receive-to-hold' ? 'stripe-revenue' : 'lithic-card')}>Configure provider <ExternalLink size={13} /></button></div>
                  )}
                </footer>
              </article>
            ))}
          </div>

          <SectionHeading eyebrow="Provider catalog" title="Capability implementations" action={<span className="recipe-tagline">Choose the capability first, provider second</span>} />
          <div className="provider-catalog-grid">
            {data.providers.map(provider => (
              <button className={`provider-catalog-card ${providerFocus === provider.category ? 'provider-type-card--focused' : ''}`} key={provider.id} onClick={() => onOpenProvider(provider.id)}>
                <ProviderLogo provider={provider.id} label={provider.name} />
                <span><strong>{provider.name}</strong><small>{provider.category === 'Bridge' ? 'Money route' : provider.category}</small><code>{provider.capabilities.join(' · ') || 'Route capabilities'}</code></span>
                <Pill tone={provider.status !== 'disconnected' ? 'positive' : 'neutral'}>{provider.status !== 'disconnected' ? provider.detail : 'Explore'}</Pill>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
