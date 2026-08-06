import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.stubGlobal('scrollTo', vi.fn())

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
}))

const snapshot = {
  csrf_token: 'csrf_test',
  snapshot: {
    principal: { id: 'principal_1', name: 'Northstar Studio' },
    administrator_name: 'Alex Rivera',
    accounts: [{ id: 'acct_1', name: 'Primary treasury' }],
    account: { id: 'acct_1', name: 'Primary treasury' },
    balance: { positions: [], estimated_usd_atomic: null, estimated_at: '2026-08-06T12:00:00Z' },
    transactions: { data: [] },
    agents: [],
    providers: [
      { id: 'coinbase-cdp-wallet', capabilities: ['balance', 'receive', 'transfer'], state: 'not_connected', mode: 'none' },
      { id: 'stripe-revenue', capabilities: ['checkout', 'invoice', 'refund'], state: 'not_connected', mode: 'none' },
      { id: 'lithic-card', capabilities: ['payment_session'], state: 'not_connected', mode: 'none' },
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
    expect(await screen.findByRole('heading', { name: 'Who owns this Mandate instance?' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Alex Rivera')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Northstar Studio')).toBeInTheDocument()
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
    expect(screen.getAllByText('Not connected')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Add Receive provider' }))
    expect(await screen.findByRole('heading', { name: 'Add a receive provider' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Stripe Revenue')).toBeInTheDocument()
    expect(within(dialog).queryByText('Lithic Cards')).not.toBeInTheDocument()
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
    expect(screen.getByText('Provider process host')).toBeInTheDocument()
    expect(screen.getAllByText('not configured').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Opening Mandate…')).not.toBeInTheDocument())
  })
})
