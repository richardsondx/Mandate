import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { Guide } from './components/Guide'
import { CAPABILITY_MANIFEST } from './lib/capabilities.generated'
import { fixtureData } from './lib/fixtures'

vi.stubGlobal('scrollTo', vi.fn())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
}))

const snapshot = {
  csrf_token: 'csrf_test',
  snapshot: {
    accounts: [{ id: 'acct_1', name: 'Primary treasury' }],
    account: { id: 'acct_1', name: 'Primary treasury' },
    balance: { positions: [], estimated_usd_atomic: null, estimated_at: '2026-08-06T12:00:00Z' },
    transactions: { data: [] },
    agents: [],
    providers: [
      { id: 'coinbase-cdp-wallet', capabilities: ['balance', 'receive', 'transfer'], state: 'not_connected', mode: 'none' },
      { id: 'stripe-revenue', capabilities: ['checkout', 'invoice', 'refund'], state: 'not_connected', mode: 'none' },
      { id: 'lithic-card', capabilities: ['pay'], state: 'not_connected', mode: 'none' },
      { id: 'bridge-rail', capabilities: [], state: 'not_connected', mode: 'none' },
    ],
    outbox_cursor: 0,
    runtimes: { openclaw: false, hermes: true },
  },
}

const diagnostics = {
  version: '0.1.0', started_at: '2026-08-06T12:00:00Z',
  daemon: { status: 'running', detail: 'Local daemon is accepting requests.' },
  database: { status: 'protected', detail: 'Encrypted ledger is open.' },
  transport: {
    tcp: { status: 'ready', detail: 'Bound to loopback only.' },
    unix_socket: { status: 'ready', detail: 'Authoritative local socket exists.' },
  },
  provider_host: { status: 'not_configured', detail: 'External provider supervision is pending.' },
  reconciliation: { status: 'manual_only', detail: 'Automatic polling is pending.' },
  recovery: { status: 'not_configured', detail: 'Recovery export is pending.' },
}

describe('Mandate dashboard', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('starts a new user with real identity and account setup', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn(() => json({ initialized: false, runtimes: { openclaw: false, hermes: true } })))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Give your agents an economic account.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('heading', { name: 'Name the first economic account.' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Primary treasury')).toBeInTheDocument()
  })

  it('explains how to sign in when the local dashboard is opened directly', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      return json({}, 401)
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'This tab isn’t signed in.' })).toBeInTheDocument()
    expect(screen.getByText('cargo run -p mandate -- dashboard')).toBeInTheDocument()
    expect(screen.getByText(/direct visit to the local address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View demo preview instead' })).toBeInTheDocument()
  })

  it('shows a clean account and category-specific provider setup', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(snapshot)
    }))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Set up Primary treasury.' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Capabilities' })[0])
    expect(await screen.findByRole('heading', { name: 'Capabilities' })).toBeInTheDocument()
    expect(screen.getByText('0 of 3 connected')).toBeInTheDocument()
    expect(screen.getAllByText('Not connected')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Add Receive provider' }))
    expect(await screen.findByRole('heading', { name: 'Add a receive provider' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Stripe Revenue')).toBeInTheDocument()
    expect(within(dialog).queryByText('Lithic Cards')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Bridge provider' }))
    const bridgeDialog = screen.getByRole('dialog')
    fireEvent.click(within(bridgeDialog).getByRole('button', { name: /Bridge Rail/i }))
    expect(await within(bridgeDialog).findByText('Bridge API key')).toBeInTheDocument()
    expect(within(bridgeDialog).queryByText('Lithic API key')).not.toBeInTheDocument()
    expect(within(bridgeDialog).getByRole('link', { name: /Get key/i })).toHaveAttribute('href', 'https://dashboard.bridge.xyz/')
  })

  it('offers one clear connection test when managing an agent', async () => {
    const snapshotWithAgent = {
      ...snapshot,
      snapshot: {
        ...snapshot.snapshot,
        agents: [{
          id: 'agent_1',
          name: 'Revenue Agent',
          runtime: 'hermes',
          authority: 'shared',
          capabilities: ['balance', 'receive'],
          status: 'active',
          installation_status: 'installed',
          installation_detail: 'Authenticated through MCP',
          created_at: '2026-08-06T12:00:00Z',
        }],
      },
    }
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(snapshotWithAgent)
    }))

    render(<App />)
    await screen.findByText('Primary treasury')
    fireEvent.click(screen.getAllByRole('button', { name: 'Agent Access' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Manage access for Revenue Agent' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Check connection' })).not.toBeInTheDocument()
  })

  it('navigates to measured system diagnostics without fake readiness', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(snapshot)
    }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Set up Primary treasury.' })
    fireEvent.click(screen.getAllByRole('button', { name: 'System' })[0])
    expect(await screen.findByRole('heading', { name: 'System' })).toBeInTheDocument()
    // The calm page reads healthy without surfacing engineering detail as pending work.
    expect(screen.getByText('Mandate is healthy')).toBeInTheDocument()
    expect(screen.queryByText('tasks remaining')).not.toBeInTheDocument()
    // Engineering diagnostics live behind View diagnostics.
    fireEvent.click(screen.getByRole('button', { name: /view diagnostics/i }))
    expect(await screen.findByText('Provider process host')).toBeInTheDocument()
    expect(screen.getAllByText('not configured').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Opening Mandate…')).not.toBeInTheDocument())
  })

  it('supports sandbox mode environment selection and event simulation', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(snapshot)
    }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Set up Primary treasury.' })

    // Check environment selector is present and defaults to Sandbox
    const envBtn = screen.getByRole('button', { name: /Sandbox/i })
    expect(envBtn).toBeInTheDocument()

    // Open environment dropdown
    fireEvent.click(envBtn)
    expect(screen.getByText('Financial environment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Simulate event…/i })).toBeInTheDocument()

    // Open simulator modal
    fireEvent.click(screen.getByRole('button', { name: /Simulate event…/i }))
    expect(await screen.findByRole('heading', { name: 'Simulate financial event' })).toBeInTheDocument()
    expect(screen.getByText('Pay test customer')).toBeInTheDocument()
    expect(screen.getByText('Agent hosting spend')).toBeInTheDocument()

    // Trigger simulation event
    fireEvent.click(screen.getByText('Pay test customer'))
    expect(await screen.findByRole('status')).toHaveTextContent('Simulated event: Pay test customer')
  })


  it('simulated events mutate sandbox positions, ledger, and activity', async () => {
    const richSnapshot = {
      ...snapshot,
      snapshot: {
        ...snapshot.snapshot,
        balance: {
          positions: [
            { provider: 'fake-revenue', asset: 'USD', network: '', available: '487642', reserved: '0', pending: '0', settled: '487642', decimals: 2, reconciled_at: '2026-08-06T12:00:00Z' },
            { provider: 'fake-card', asset: 'USD', network: '', available: '100000', reserved: '0', pending: '0', settled: '100000', decimals: 2, reconciled_at: '2026-08-06T12:00:00Z' },
          ],
          estimated_usd_atomic: '100000',
          estimated_at: '2026-08-06T12:00:00Z',
        },
        transactions: { data: [] },
        providers: [
          { id: 'stripe-revenue', capabilities: ['checkout', 'invoice', 'refund'], state: 'sandbox', mode: 'sandbox' },
          { id: 'coinbase-cdp-wallet', capabilities: ['balance'], state: 'not_connected', mode: 'none' },
          { id: 'lithic-card', capabilities: ['payment_session'], state: 'sandbox', mode: 'sandbox' },
        ],
      },
    }
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(richSnapshot)
    }))
    render(<App />)
    await screen.findByText('Primary treasury')

    // Initial estimated value is $1,000.00
    expect(screen.getByText('1,000.00')).toBeInTheDocument()

    // Open the sandbox simulator and trigger a customer checkout (revenue in)
    fireEvent.click(screen.getByRole('button', { name: /Simulate sandbox event/i }))
    expect(await screen.findByRole('heading', { name: 'Simulate financial event' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pay test customer'))

    // Toast confirms the event was simulated
    expect(await screen.findByRole('status')).toHaveTextContent('Simulated event: Pay test customer')

    // Estimated value increased by the $49.00 settlement
    expect(screen.getByText('1,049.00')).toBeInTheDocument()

    // The simulated settlement appears immediately in the Live stream.
    fireEvent.click(screen.getAllByRole('button', { name: 'Activity' })[0])
    expect(screen.getByRole('tab', { name: 'Live', selected: true })).toBeInTheDocument()
    expect(screen.getAllByText('Pay test customer').length).toBeGreaterThan(0)
    expect(screen.getByText(/Sandbox Simulator/)).toBeInTheDocument()

    // History retains the durable transaction and its operation trace.
    fireEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getAllByText('Pay test customer').length).toBeGreaterThan(0)
    expect(screen.getByText('Sandbox Simulator')).toBeInTheDocument()

    // A card decline moves no funds but still records an event
    fireEvent.click(screen.getAllByRole('button', { name: 'Overview' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Simulate sandbox event/i }))
    expect(await screen.findByRole('heading', { name: 'Simulate financial event' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Card declined'))
    expect(await screen.findByRole('status')).toHaveTextContent('Simulated event: Card declined')
    // Estimate unchanged by the $0.00 decline
    expect(screen.getByText('1,049.00')).toBeInTheDocument()
  })

  it('opens a prompt-first Guide with playbook, reference, copy flow, and honest setup', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json(snapshot)
    }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Set up Primary treasury.' })

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })

    fireEvent.click(screen.getAllByRole('button', { name: 'Guide' })[0])
    expect(await screen.findByRole('heading', { name: 'What can your agent do with Mandate?' })).toBeInTheDocument()
    expect(screen.getByText('Earn money')).toBeInTheDocument()
    expect(screen.getByText('Use earned capital')).toBeInTheDocument()
    expect(screen.getByText('Manage customers')).toBeInTheDocument()
    expect(screen.getByText('Understand finances')).toBeInTheDocument()
    expect(screen.getByText('Operate autonomously')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Copy there. Verify here.' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Copy prompt/i })[0])
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Create a way for someone to pay me $20.'))
    expect(await screen.findByRole('status')).toHaveTextContent('Prompt copied')
    expect(screen.getAllByText('checkout').length).toBeGreaterThan(0)
    expect(screen.getByText('Waiting for a matching request…')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Playbook' }))
    expect(await screen.findByRole('heading', { name: 'Prompt Playbook' })).toBeInTheDocument()
    expect(screen.getByText('Accept a payment')).toBeInTheDocument()
    expect(screen.getByText('Pay a merchant')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(await screen.findByRole('heading', { name: 'Capability reference' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /checkout.*Accept a payment/i }))
    expect(await screen.findByRole('heading', { name: 'Accept a payment' })).toBeInTheDocument()
    expect(screen.getByText('Do not use when')).toBeInTheDocument()
    expect(screen.getByText('Mandate 0.1.0')).toBeInTheDocument()
    expect(screen.getByText('Not executable yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Setup/ }))
    expect(await screen.findByRole('heading', { name: 'Connect the economic loop' })).toBeInTheDocument()
    expect(screen.getByText('Connection is not continuity.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bridge Rail/i })).toBeInTheDocument()
  })

  it('proactively deep-links from Capabilities to Guide when routes are unclosed', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/v1/setup/status')) return json({ initialized: true, runtimes: { openclaw: false, hermes: true } })
      if (url.startsWith('/v1/admin/diagnostics')) return json(diagnostics)
      return json({
        ...snapshot,
        snapshot: {
          ...snapshot.snapshot,
          providers: [
            { id: 'stripe-revenue', capabilities: ['checkout'], state: 'sandbox', mode: 'sandbox' },
            { id: 'coinbase-cdp-wallet', capabilities: ['balance'], state: 'sandbox', mode: 'sandbox' },
          ],

        },
      })
    }))
    render(<App />)
    await screen.findByText('Primary treasury')

    // Go to Capabilities


    fireEvent.click(screen.getAllByRole('button', { name: 'Capabilities' })[0])
    expect(await screen.findByRole('heading', { name: 'Capabilities' })).toBeInTheDocument()

    // Deep-link banner should be present
    expect(screen.getByText("Your capabilities are connected, but your money can't flow between all of them yet.")).toBeInTheDocument()
    const deepLinkBtn = screen.getAllByRole('button', { name: /Close the loop/i })[0]
    expect(deepLinkBtn).toBeInTheDocument()


    // Click deep link button -> should take user straight to truthful route setup.
    fireEvent.click(deepLinkBtn)
    expect(await screen.findByRole('heading', { name: 'Connect the economic loop' })).toBeInTheDocument()
    expect(screen.getByText('Connection is not continuity.')).toBeInTheDocument()
  })

  it('advances the external-agent playground only from matching daemon evidence', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(
      <Guide
        data={fixtureData}
        events={[{
          id: 91,
          eventType: 'checkout.created',
          payload: { capability: 'checkout', provider: 'fake-revenue' },
          createdAt: new Date(Date.now() + 60_000).toISOString(),
        }]}
        navigate={vi.fn()}
        onOpenProvider={vi.fn()}
        notify={vi.fn()}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Copy prompt/i })[0])
    expect(await screen.findByText('Activity observed')).toBeInTheDocument()
    expect(screen.getByText('checkout.created')).toBeInTheDocument()
    expect(screen.getByText('fake-revenue')).toBeInTheDocument()
  })

  it('reconciles stale capability availability with currently connected providers', async () => {
    const staleCapabilities = CAPABILITY_MANIFEST.capabilities.map(capability => ({
      ...capability,
      granted: true,
      available: false,
      provider_ids: [],
      environment: null,
      unavailable_reason: `Connect a ${capability.requires_provider_categories.join(' or ')} provider to make this capability executable.`,
    }))
    render(
      <Guide
        data={{
          ...fixtureData,
          providers: fixtureData.providers.map(provider => ({
            ...provider,
            status: 'connected' as never,
          })),
          capabilities: {
            account_id: fixtureData.accountId,
            spec_version: CAPABILITY_MANIFEST.spec_version,
            updated_at: CAPABILITY_MANIFEST.updated_at,
            releases: [],
            capabilities: staleCapabilities as never,
          },
        }}
        events={[]}
        navigate={vi.fn()}
        onOpenProvider={vi.fn()}
        notify={vi.fn()}
      />,
    )

    expect(screen.getByText('8 of 8 capabilities available')).toBeInTheDocument()
    expect(screen.queryByText(/Agent connected$/)).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'How it works' })[0])
    expect(await screen.findByRole('heading', { name: 'Accept a payment' })).toBeInTheDocument()
    expect(screen.getByText('Available now')).toBeInTheDocument()
    expect(screen.queryByText('Not executable yet')).not.toBeInTheDocument()
  })
})
