import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CircleDollarSign,
  Coins,
  Command,
  CreditCard,
  Database,
  Globe,
  KeyRound,
  Layers3,
  LockKeyhole,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';

const FPS = 30;

const fade = (frame: number, duration: number, enter = 18, exit = 18) =>
  interpolate(frame, [0, enter, duration - exit, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const rise = (frame: number, delay = 0, distance = 28) => {
  const progress = spring({
    frame: frame - delay,
    fps: FPS,
    config: {damping: 18, stiffness: 150, mass: 0.8},
  });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(progress, [0, 1], [distance, 0])}px)`,
  };
};

const Logo = ({light = false}: {light?: boolean}) => (
  <div className={`logo ${light ? 'logo--light' : ''}`}>
    <span className="logo-mark" aria-hidden>
      <i />
      <i />
      <i />
    </span>
    <span>Mandate</span>
  </div>
);

const PreviewBadge = () => (
  <div className="preview-badge">
    <span />
    Demo preview
  </div>
);

const Window = ({
  children,
  title = 'Mandate',
  className = '',
  badge = true,
  style,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  badge?: boolean;
  style?: React.CSSProperties;
}) => (
  <div className={`window ${className}`} style={style}>
    <div className="window-bar">
      <div className="traffic"><i /><i /><i /></div>
      <span>{title}</span>
      {badge && <PreviewBadge />}
    </div>
    {children}
  </div>
);

const SceneLabel = ({children}: {children: React.ReactNode}) => (
  <div className="scene-label"><Sparkles size={15} />{children}</div>
);

const RevealWords = ({
  words,
  frame,
  start,
  step,
  className = '',
}: {
  words: string[];
  frame: number;
  start: number;
  step: number;
  className?: string;
}) => (
  <span className={`reveal-line ${className}`}>
    {words.map((word, index) => {
      const progress = interpolate(
        frame,
        [start + index * step, start + index * step + 12],
        [0, 1],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.cubic),
        },
      );
      return (
        <span
          key={`${word}-${index}`}
          style={{
            opacity: progress,
            filter: `blur(${interpolate(progress, [0, 1], [14, 0])}px)`,
            transform: `translateY(${interpolate(progress, [0, 1], [28, 0])}px) scale(${interpolate(progress, [0, 1], [0.96, 1])})`,
          }}
        >
          {word}
        </span>
      );
    })}
  </span>
);

/* ------------------------------------------------------------------ */
/* Scene 1 — The prompt, in ChatGPT                                    */
/* ------------------------------------------------------------------ */

const Cursor = ({x, y, scale = 1}: {x: number; y: number; scale?: number}) => (
  <div
    className="cursor-pointer"
    style={{
      left: x,
      top: y,
      transform: `translate(-2px,-2px) scale(${scale})`,
    }}
  >
    <svg viewBox="0 0 16 18" width="22" height="24">
      <path
        d="M2 1 L2 14.5 L5.4 11.2 L7.4 16.8 L9.4 16 L7.4 10.4 L12.4 10.4 Z"
        fill="white"
        stroke="#14110f"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

const ChatGptPrompt = () => {
  const frame = useCurrentFrame();
  const duration = 180;
  const message = 'Pay the $22 GitHub bill with what we earned today.';
  const chars = Math.floor(
    interpolate(frame, [22, 64], [0, message.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const sent = frame > 70;
  const assistantIn = spring({frame: frame - 78, fps: FPS, config: {damping: 18, stiffness: 150}});
  const toolIn = spring({frame: frame - 108, fps: FPS, config: {damping: 17, stiffness: 150}});

  return (
    <AbsoluteFill className="scene chatgpt-scene" style={{opacity: fade(frame, duration)}}>
      <div className="scene-topline">
        <SceneLabel>It starts with a prompt</SceneLabel>
        <span>01 / 05</span>
      </div>
      <Window title="ChatGPT" className="chatgpt-window" badge={false}>
        <div className="chatgpt-body">
          <aside className="chatgpt-sidebar">
            <div className="chatgpt-brand">
              <span className="gpt-mark"><Sparkles size={18} /></span>
              <strong>ChatGPT</strong>
            </div>
            <div className="chatgpt-newchat"><span>+</span> New chat</div>
            <div className="chatgpt-history">
              {['GitHub billing flow', 'Stripe settlement timing', 'Agent spending limits', 'USDC treasury plan'].map((h, i) => (
                <div className="chatgpt-history-row" key={h} style={{opacity: interpolate(frame, [10 + i * 4, 22 + i * 4], [0, 0.55], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{h}</div>
              ))}
            </div>
          </aside>
          <main className="chatgpt-main">
            <div className="chatgpt-thread">
              <div className={`gpt-user-bubble ${sent ? 'sent' : ''}`}>
                <span>{message.slice(0, chars)}</span>
                {!sent && <i className="caret" />}
              </div>
              <div className="gpt-assistant" style={{opacity: assistantIn, transform: `translateY(${interpolate(assistantIn, [0, 1], [16, 0])}px)`}}>
                <span className="gpt-avatar"><Sparkles size={18} /></span>
                <div className="gpt-response">
                  <RevealWords words={['On', 'it.']} frame={frame} start={84} step={5} />
                  <br />
                  <RevealWords words={["I'll", 'route', 'this', 'through', 'Mandate', 'so', 'it', 'stays', 'within', 'your', 'authority', 'and', 'ledger.']} frame={frame} start={92} step={4} />
                  <div className="mandate-tool-call" style={{opacity: toolIn, transform: `translateY(${interpolate(toolIn, [0, 1], [18, 0])}px) scale(${interpolate(toolIn, [0, 1], [0.98, 1])})`}}>
                    <div className="tool-call-head">
                      <Logo />
                      <span className="tool-label">mandate.pay</span>
                    </div>
                    <div className="tool-code">
                      <span>amount</span><strong>"2200"</strong>
                      <span>currency</span><strong>"USD"</strong>
                      <span>merchant</span><strong>"GitHub"</strong>
                      <span>idempotency</span><strong>"order-49"</strong>
                    </div>
                    <div className="call-status">
                      <span className="spinner" />
                      Resolving authorized route…
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="gpt-composer">
              <span className="gpt-composer-input">Ask anything</span>
              <span className="gpt-send"><ArrowUpRight size={17} /></span>
            </div>
          </main>
        </div>
      </Window>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 2 — Behind the scenes                                         */
/* ------------------------------------------------------------------ */

const Step = ({
  icon: Icon,
  title,
  detail,
  active,
  done,
}: {
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
  active: boolean;
  done: boolean;
}) => (
  <div className={`execution-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
    <span className="step-icon">{done ? <Check size={18} /> : <Icon size={18} />}</span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className="step-state">{done ? 'Complete' : active ? 'Running' : 'Waiting'}</span>
  </div>
);

const Provider = ({
  symbol,
  name,
  kind,
  active,
}: {
  symbol: React.ReactNode;
  name: string;
  kind: string;
  active: boolean;
}) => (
  <div className={`provider-node ${active ? 'active' : ''}`}>
    <span>{symbol}</span>
    <div><strong>{name}</strong><small>{kind}</small></div>
    {active && <i className="pulse-dot" />}
  </div>
);

const Orchestration = () => {
  const frame = useCurrentFrame();
  const duration = 235;
  const activeIndex = Math.min(3, Math.max(0, Math.floor((frame - 28) / 34)));
  const routeProgress = interpolate(frame, [58, 142], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const approved = frame > 150;

  return (
    <AbsoluteFill className="scene dark-console" style={{opacity: fade(frame, duration)}}>
      <div className="console-glow" />
      <div className="scene-topline inverse">
        <SceneLabel>Behind the scenes — every action earns its authority</SceneLabel>
        <span>02 / 05</span>
      </div>
      <div className="orchestration-heading">
        <div>
          <p className="kicker mint">MANDATE EXECUTION GRAPH</p>
          <h2>The agent asks. Mandate resolves the economics.</h2>
        </div>
        <div className="operation-id"><span>OPERATION</span><strong>pay_8KM2</strong></div>
      </div>
      <div className="orchestration-grid">
        <div className="execution-card">
          <div className="card-heading"><span>Policy & ledger</span><span className="live-chip"><i /> DEMO TRACE</span></div>
          <Step icon={KeyRound} title="Authenticate agent" detail="Studio Operator · grant_openclaw" active={activeIndex === 0} done={activeIndex > 0} />
          <Step icon={ShieldCheck} title="Check authority" detail="pay · up to $50 · merchant locked" active={activeIndex === 1} done={activeIndex > 1} />
          <Step icon={Coins} title="Reserve funds" detail="$22.00 USD · no commingling" active={activeIndex === 2} done={activeIndex > 2} />
          <Step icon={Database} title="Post ledger evidence" detail="Double-entry journal · idempotent" active={activeIndex === 3} done={approved} />
        </div>
        <div className="route-card">
          <div className="card-heading"><span>Provider route</span><span>Separate positions</span></div>
          <div className="route-map">
            <Provider symbol={<Coins size={21} />} name="Coinbase CDP" kind="Hold · 100 USDC" active={frame > 52 && frame < 105} />
            <div className="route-link">
              <div><span style={{width: `${routeProgress}%`}} /></div>
              <small>explicit route</small>
              <ArrowRight size={18} />
            </div>
            <Provider symbol={<Route size={21} />} name="Bridge Rail" kind="Convert · sandbox" active={frame >= 98 && frame < 145} />
            <div className="route-link">
              <div><span style={{width: `${Math.max(0, routeProgress - 35) * 1.54}%`}} /></div>
              <small>fund spend</small>
              <ArrowRight size={18} />
            </div>
            <Provider symbol={<CreditCard size={21} />} name="Lithic" kind="Spend · merchant lock" active={frame >= 138} />
          </div>
          <div className="route-truth"><LockKeyhole size={17} /><span><strong>GitHub only</strong> · $22 ceiling · single use</span></div>
          <div className={`approval-card ${approved ? 'visible' : ''}`}>
            <span><Check size={23} /></span>
            <div><small>PAYMENT SESSION READY</small><strong>Temporary card provisioned</strong></div>
            <div className="amount"><strong>$22.00</strong><small>reserved</small></div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 3 — The app, page by page (the bulk of the video)            */
/* ------------------------------------------------------------------ */

const NAV_ITEMS: {label: string; icon: typeof Bot}[] = [
  {label: 'Overview', icon: WalletCards},
  {label: 'Account', icon: CircleDollarSign},
  {label: 'Activity', icon: Zap},
  {label: 'Agent Access', icon: Bot},
  {label: 'Capabilities', icon: Layers3},
];

const NAV_CENTERS = [22, 70, 118, 166, 214];

const PageHead = ({kicker, title, sub}: {kicker: string; title: string; sub: string}) => (
  <div className="page-head">
    <div>
      <small>{kicker}</small>
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
  </div>
);

const OverviewPage = ({frame}: {frame: number}) => {
  const amount = interpolate(frame, [18, 58], [18451.48, 18429.64], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const rowIn = spring({frame: frame - 40, fps: FPS, config: {damping: 17, stiffness: 160}});
  return (
    <div className="page page-overview">
      <div className="dash-intro">
        <div>
          <small>FRIDAY, AUGUST 7</small>
          <h3>Economic continuity, at a glance.</h3>
          <p>One account across every rail your agents use.</p>
        </div>
        <button>View activity <ArrowRight size={15} /></button>
      </div>
      <div className="balance-card">
        <div>
          <small>ESTIMATED ACCOUNT VALUE · USD</small>
          <strong>${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
          <p>Provider positions · Valued just now</p>
        </div>
        <div className="flow">
          <span><ArrowDownLeft size={18} /><b>Receive</b><small>Stripe ready</small></span>
          <i />
          <span><Coins size={18} /><b>Hold</b><small>$12,420.00</small></span>
          <i />
          <span><ArrowUpRight size={18} /><b>Spend</b><small>$22 reserved</small></span>
        </div>
      </div>
      <div className="dash-panels">
        <section>
          <header><span><small>LATEST ACTIVITY</small><strong>Economic activity</strong></span><b>View all</b></header>
          <div className="activity-row new" style={{opacity: rowIn, transform: `translateY(${interpolate(rowIn, [0, 1], [16, 0])}px)`}}>
            <span className="activity-icon"><CreditCard size={18} /></span>
            <div><strong>GitHub payment session</strong><small>Temporary card · merchant locked</small></div>
            <span><strong>− $22.00</strong><small>Ready · just now</small></span>
          </div>
          <div className="activity-row">
            <span className="activity-icon receive"><ArrowDownLeft size={18} /></span>
            <div><strong>Atlas Labs invoice</strong><small>Stripe Revenue · settlement pending</small></div>
            <span><strong>+ $1,189.00</strong><small>Today · 9:18 AM</small></span>
          </div>
        </section>
        <section className="agent-panel">
          <header><span><small>AGENT ACCESS</small><strong>Connected agents</strong></span><b>Manage</b></header>
          <div><span className="agent-avatar"><Bot size={19} /></span><p><strong>Studio Operator</strong><small>OpenClaw · CLI</small></p><em><i /> Active</em></div>
          <div className="scope-note"><ShieldCheck size={17} /><span><strong>Scoped by design</strong><small>balance · transactions · pay ≤ $50</small></span></div>
        </section>
      </div>
    </div>
  );
};

const POSITIONS = [
  {icon: Coins, name: 'Coinbase CDP', asset: 'USDC', network: 'Base Sepolia', available: '12,420.00', reserved: '225.00', status: 'Sandbox'},
  {icon: CircleDollarSign, name: 'Stripe Revenue', asset: 'USD', network: 'Test mode', available: '4,876.42', reserved: '0.00', status: 'Sandbox'},
  {icon: CreditCard, name: 'Lithic Cards', asset: 'USD', network: 'Sandbox', available: '5,222.02', reserved: '225.00', status: 'Sandbox'},
];

const AccountPage = ({frame}: {frame: number}) => (
  <div className="page page-account">
    <PageHead kicker="ACCOUNT" title="Positions across providers" sub="Independent balances. No commingling. Double-entry evidence." />
    <div className="positions">
      <div className="positions-head"><span>Provider</span><span>Asset</span><span>Available</span><span>Reserved</span><span>Status</span></div>
      {POSITIONS.map((p, i) => {
        const Icon = p.icon;
        const r = spring({frame: frame - 8 - i * 8, fps: FPS, config: {damping: 17, stiffness: 170}});
        return (
          <div className="position-row" key={p.name} style={{opacity: r, transform: `translateX(${interpolate(r, [0, 1], [20, 0])}px)`}}>
            <span className="pos-name"><i><Icon size={17} /></i>{p.name}</span>
            <span><strong>{p.asset}</strong><small>{p.network}</small></span>
            <span className="mono">{p.available}</span>
            <span className="mono muted">{p.reserved}</span>
            <span className="state-chip sandbox"><span className="state-dot" />{p.status}</span>
          </div>
        );
      })}
    </div>
    <div className="ledger-note"><Database size={17} /><span><strong>Double-entry ledger</strong><small>Every reservation and settlement is journaled · idempotent</small></span></div>
  </div>
);

const TXNS = [
  {icon: ArrowDownLeft, tone: 'in', title: 'Atlas Labs invoice', desc: 'Stripe Revenue · settlement pending', amount: '+ $1,189.00', status: 'Pending', time: '9:18 AM'},
  {icon: CreditCard, tone: 'out', title: 'GitHub payment session', desc: 'Temporary card · merchant locked', amount: '− $22.00', status: 'Ready', time: '10:41 AM'},
  {icon: Coins, tone: 'in', title: 'USDC received', desc: 'Base Sepolia · 0x7e3…a19', amount: '+ 2,500.00 USDC', status: 'Settled', time: 'Yesterday'},
  {icon: ArrowDownLeft, tone: 'in', title: 'Research package', desc: 'Checkout session · completed', amount: '+ $349.00', status: 'Settled', time: 'Aug 4'},
  {icon: ArrowDownLeft, tone: 'neutral', title: 'Tool subscription refund', desc: 'Original payment pay_1BD2', amount: '+ $49.00', status: 'Refunded', time: 'Yesterday'},
];

const ActivityPage = ({frame}: {frame: number}) => (
  <div className="page page-activity">
    <PageHead kicker="ACTIVITY" title="Every economic event, journaled" sub="Earn, hold, spend — one auditable history per account." />
    <div className="txn-list">
      {TXNS.map((t, i) => {
        const Icon = t.icon;
        const r = spring({frame: frame - 6 - i * 9, fps: FPS, config: {damping: 17, stiffness: 170}});
        return (
          <div className="txn-row" key={t.title} style={{opacity: r, transform: `translateX(${interpolate(r, [0, 1], [-18, 0])}px)`}}>
            <span className={`txn-icon ${t.tone}`}><Icon size={17} /></span>
            <div><strong>{t.title}</strong><small>{t.desc}</small></div>
            <span className="txn-amount"><strong>{t.amount}</strong><small>{t.status} · {t.time}</small></span>
          </div>
        );
      })}
    </div>
  </div>
);

const AGENTS = [
  {name: 'Studio Operator', runtime: 'OpenClaw · CLI', caps: 'balance · pay · transactions', status: 'Active', tone: 'active'},
  {name: 'Revenue Agent', runtime: 'Hermes · MCP', caps: 'balance · receive · invoice · checkout', status: 'Connected', tone: 'active'},
  {name: 'Auditor', runtime: 'Custom · observe-only', caps: 'balance · transactions', status: 'Offline', tone: 'offline'},
];

const AgentsPage = ({frame}: {frame: number}) => (
  <div className="page page-agents">
    <PageHead kicker="AGENT ACCESS" title="Scoped credentials, never admin keys" sub="Each agent gets its own grant. Authority is explicit, never inherited." />
    <div className="agents-list">
      {AGENTS.map((a, i) => {
        const r = spring({frame: frame - 6 - i * 10, fps: FPS, config: {damping: 17, stiffness: 170}});
        return (
          <div className="agent-row" key={a.name} style={{opacity: r, transform: `translateY(${interpolate(r, [0, 1], [16, 0])}px)`}}>
            <span className="agent-avatar"><Bot size={19} /></span>
            <div className="agent-meta"><strong>{a.name}</strong><small>{a.runtime}</small></div>
            <div className="agent-caps"><KeyRound size={14} />{a.caps}</div>
            <em className={`agent-status ${a.tone}`}><i />{a.status}</em>
          </div>
        );
      })}
    </div>
    <div className="scope-note wide"><ShieldCheck size={17} /><span><strong>Scoped by design</strong><small>Agent grants are isolated per account · revocable · audited</small></span></div>
  </div>
);

const PROVIDERS = [
  {icon: Coins, name: 'Coinbase CDP', cat: 'Hold', detail: 'Base Sepolia · healthy'},
  {icon: ArrowDownLeft, name: 'Stripe Revenue', cat: 'Receive', detail: 'Test mode · polling'},
  {icon: CreditCard, name: 'Lithic Cards', cat: 'Spend', detail: 'Sandbox · healthy'},
  {icon: Route, name: 'Bridge Rail', cat: 'Bridge', detail: 'Sandbox route · connected'},
];

const CapabilitiesPage = ({frame}: {frame: number}) => (
  <div className="page page-capabilities">
    <PageHead kicker="CAPABILITIES" title="Provider rails, connected per account" sub="Hold, receive, spend, and bridge — each position independent." />
    <div className="provider-grid">
      {PROVIDERS.map((p, i) => {
        const Icon = p.icon;
        const r = spring({frame: frame - 4 - i * 9, fps: FPS, config: {damping: 17, stiffness: 170}});
        return (
          <div className="provider-card" key={p.name} style={{opacity: r, transform: `translateY(${interpolate(r, [0, 1], [18, 0])}px)`}}>
            <span className="provider-icon"><Icon size={20} /></span>
            <div><strong>{p.name}</strong><small>{p.detail}</small></div>
            <span className="provider-cat">{p.cat}</span>
          </div>
        );
      })}
    </div>
  </div>
);

const Walkthrough = () => {
  const frame = useCurrentFrame();
  const duration = 415;
  const windowIn = spring({frame: frame - 2, fps: FPS, config: {damping: 18, stiffness: 130}});

  const activePhase = frame < 112 ? 0 : frame < 202 ? 1 : frame < 282 ? 2 : frame < 357 ? 3 : 4;
  const phaseStarts = [18, 112, 202, 282, 357];
  const appear = interpolate(frame, [phaseStarts[activePhase], phaseStarts[activePhase] + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cursorY = interpolate(
    frame,
    [0, 95, 112, 185, 202, 265, 282, 340, 357, duration],
    [22, 22, 70, 70, 118, 118, 166, 166, 214, 214],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const clickTimes = [112, 202, 282, 357];
  const clickScale = clickTimes.reduce((min, t) => Math.min(min, interpolate(frame, [t - 2, t + 2, t + 9], [1, 0.82, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})), 1);

  const renderPage = () => {
    const f = frame - phaseStarts[activePhase];
    if (activePhase === 0) return <OverviewPage frame={f} />;
    if (activePhase === 1) return <AccountPage frame={f} />;
    if (activePhase === 2) return <ActivityPage frame={f} />;
    if (activePhase === 3) return <AgentsPage frame={f} />;
    return <CapabilitiesPage frame={f} />;
  };

  return (
    <AbsoluteFill className="scene walkthrough-scene" style={{opacity: fade(frame, duration)}}>
      <div className="scene-topline">
        <SceneLabel>The app — one account, every page</SceneLabel>
        <span>03 / 05</span>
      </div>
      <Window title="Mandate · Studio treasury" className="dashboard-window walkthrough-window" style={{transform: `scale(${interpolate(windowIn, [0, 1], [0.97, 1])})`}}>
        <div className="dashboard-shell">
          <aside>
            <Logo />
            <div className="account-chip"><b>S</b><span><strong>Studio treasury</strong><small>Economic account</small></span></div>
            <div className="walk-nav">
              {NAV_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div className={`nav-item ${activePhase === i ? 'selected' : ''}`} key={item.label}>
                    <Icon size={18} />{item.label}
                  </div>
                );
              })}
              <Cursor x={4} y={cursorY} scale={clickScale} />
              {clickTimes.map((t) => {
                const p = interpolate(frame, [t, t + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
                if (p <= 0 || p >= 1) return null;
                const idx = clickTimes.indexOf(t);
                return <span key={t} className="click-ripple" style={{top: NAV_CENTERS[idx + 1] ?? 22, opacity: 1 - p, transform: `scale(${interpolate(p, [0, 1], [0.4, 1.8])})`}} />;
              })}
            </div>
            <div className="local-operator">LOCAL OPERATOR</div>
          </aside>
          <main>
            <div className="dashboard-top">
              <PreviewBadge />
              <span className="search"><Search size={13} />Search<kbd><Command size={9} />K</kbd></span>
            </div>
            <div className="dashboard-content" style={{opacity: appear}}>
              {renderPage()}
            </div>
          </main>
        </div>
      </Window>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 4 — Why this is not Stripe or a Cloudflare wallet             */
/* ------------------------------------------------------------------ */

const CompareCard = ({
  icon: Icon,
  name,
  tag,
  lines,
  highlight,
  strike,
  delay,
  frame,
}: {
  icon: typeof CreditCard;
  name: string;
  tag: string;
  lines: {ok: boolean; text: string}[];
  highlight?: boolean;
  strike?: boolean;
  delay: number;
  frame: number;
}) => {
  const r = spring({frame: frame - delay, fps: FPS, config: {damping: 17, stiffness: 140}});
  return (
    <div
      className={`compare-card ${highlight ? 'mandate' : ''} ${strike ? 'strike' : ''}`}
      style={{opacity: r, transform: `translateY(${interpolate(r, [0, 1], [34, 0])}px) scale(${interpolate(r, [0, 1], [0.96, 1])})`}}
    >
      <div className="compare-head">
        <span className={`compare-icon ${highlight ? 'hl' : ''}`}><Icon size={highlight ? 24 : 21} /></span>
        <div><strong>{name}</strong><small>{tag}</small></div>
        {highlight && <span className="compare-badge">MORE POWERFUL</span>}
      </div>
      <div className="compare-lines">
        {lines.map((l) => (
          <span key={l.text} className={l.ok ? 'ok' : 'no'}>
            {l.ok ? <Check size={15} /> : <X size={15} />}
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
};

const Comparison = () => {
  const frame = useCurrentFrame();
  const duration = 190;
  const headline = spring({frame: frame - 4, fps: FPS, config: {damping: 16, stiffness: 130}});
  return (
    <AbsoluteFill className="scene comparison-scene" style={{opacity: fade(frame, duration)}}>
      <div className="scene-topline">
        <SceneLabel>Not a rail. Not a vault. An economy.</SceneLabel>
        <span>04 / 05</span>
      </div>
      <div className="comparison-heading" style={{opacity: headline, transform: `translateY(${interpolate(headline, [0, 1], [26, 0])}px)`}}>
        <p className="kicker green">WHY THIS IS DIFFERENT</p>
        <h2>Stripe is a rail. A wallet is a vault.<br />Mandate is the economic layer.</h2>
      </div>
      <div className="compare-grid">
        <CompareCard
          icon={CreditCard}
          name="Stripe"
          tag="Payments only"
          delay={20}
          frame={frame}
          strike
          lines={[
            {ok: true, text: 'Accept payments'},
            {ok: false, text: 'Hold capital'},
            {ok: false, text: 'Spend authority'},
            {ok: false, text: 'Agent grants'},
            {ok: false, text: 'Double-entry ledger'},
          ]}
        />
        <CompareCard
          icon={Globe}
          name="Cloudflare Wallet"
          tag="Custody only"
          delay={46}
          frame={frame}
          strike
          lines={[
            {ok: true, text: 'Hold crypto'},
            {ok: false, text: 'Earn revenue'},
            {ok: false, text: 'Spend authority'},
            {ok: false, text: 'Agent grants'},
            {ok: false, text: 'Double-entry ledger'},
          ]}
        />
        <CompareCard
          icon={WalletCards}
          name="Mandate"
          tag="Economic operating system"
          delay={74}
          frame={frame}
          highlight
          lines={[
            {ok: true, text: 'Earn — checkout, invoice, receive'},
            {ok: true, text: 'Hold — provider positions'},
            {ok: true, text: 'Spend — merchant lock + limits'},
            {ok: true, text: 'Agent grants — scoped, revocable'},
            {ok: true, text: 'Double-entry ledger'},
            {ok: true, text: 'Multi-provider routing'},
          ]}
        />
      </div>
      <div className="compare-footer" style={rise(frame, 120)}>
        <span><Coins size={16} /> Coinbase</span>
        <i />
        <span><ArrowDownLeft size={16} /> Stripe</span>
        <i />
        <span><CreditCard size={16} /> Lithic</span>
        <i />
        <span><Route size={16} /> Bridge</span>
        <b>One account. Many rails.</b>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 5 — End card                                                  */
/* ------------------------------------------------------------------ */

const EndCard = () => {
  const frame = useCurrentFrame();
  const duration = 120;
  const ring = spring({frame: frame - 8, fps: FPS, config: {damping: 15, stiffness: 90}});

  return (
    <AbsoluteFill className="scene end-card" style={{opacity: fade(frame, duration, 8, 1)}}>
      <div className="end-grid" />
      <div className="end-mark" style={{transform: `scale(${interpolate(ring, [0, 1], [0.82, 1])})`, opacity: ring}}>
        <Logo light />
      </div>
      <h2 style={rise(frame, 16)}>Give agents economic agency.</h2>
      <p style={rise(frame, 24)}>Earn. Hold. Spend. Grow—within the mandate you set.</p>
      <div className="end-cta" style={rise(frame, 34)}>
        <span>github.com/richardsondx/Mandate</span>
        <ArrowRight size={18} />
      </div>
      <small className="demo-disclaimer">DEMO PREVIEW · SIMULATED PROVIDER RAILS</small>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

export const MandateDemo = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill className="video-root">
      <Audio src={staticFile('mandate-soundtrack.m4a')} />
      <Sequence from={0} durationInFrames={180}><ChatGptPrompt /></Sequence>
      <Sequence from={165} durationInFrames={235}><Orchestration /></Sequence>
      <Sequence from={385} durationInFrames={415}><Walkthrough /></Sequence>
      <Sequence from={785} durationInFrames={190}><Comparison /></Sequence>
      <Sequence from={960} durationInFrames={120}><EndCard /></Sequence>
      <div className="video-progress"><span style={{width: `${(frame / (durationInFrames - 1)) * 100}%`}} /></div>
    </AbsoluteFill>
  );
};
