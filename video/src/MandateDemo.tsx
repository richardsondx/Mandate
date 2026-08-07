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
  CreditCard,
  Database,
  KeyRound,
  LockKeyhole,
  Repeat2,
  Route,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  WalletCards,
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
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) => (
  <div className={`window ${className}`}>
    <div className="window-bar">
      <div className="traffic"><i /><i /><i /></div>
      <span>{title}</span>
      <PreviewBadge />
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

const Opening = () => {
  const frame = useCurrentFrame();
  const duration = 115;
  const lineWidth = interpolate(frame, [54, 101], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill className="scene opening" style={{opacity: fade(frame, duration, 10, 14)}}>
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="opening-nav" style={rise(frame, 2)}>
        <Logo light />
        <PreviewBadge />
      </div>
      <div className="opening-copy">
        <p className="kicker" style={rise(frame, 4)}>THE ECONOMIC LAYER FOR AGENTS</p>
        <h1>
          <RevealWords words={['AI', 'can', 'act.']} frame={frame} start={10} step={7} />
          <RevealWords words={['Now', 'it', 'has', 'economic', 'agency.']} frame={frame} start={29} step={6} className="accent" />
        </h1>
        <p className="opening-sub" style={rise(frame, 58)}>
          Earn. Hold. Spend. Grow—
          <strong>within the mandate you set.</strong>
        </p>
      </div>
      <div className="opening-rail" style={{width: `${lineWidth}%`}}>
        {['EARN', 'HOLD', 'SPEND'].map((word, index) => (
          <span key={word} style={{opacity: interpolate(frame, [70 + index * 7, 80 + index * 7], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{word}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Intent = () => {
  const frame = useCurrentFrame();
  const duration = 190;
  const message = 'Pay the $22 GitHub bill with what we earned today.';
  const chars = Math.floor(interpolate(frame, [24, 68], [0, message.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));
  const submitted = frame > 75;
  const mandateIn = spring({frame: frame - 79, fps: FPS, config: {damping: 18, stiffness: 150}});

  return (
    <AbsoluteFill className="scene light-scene" style={{opacity: fade(frame, duration)}}>
      <div className="scene-topline">
        <SceneLabel>Intent, not integration code</SceneLabel>
        <span>01 / 05</span>
      </div>
      <div className="intent-layout">
        <div className="intent-copy">
          <p className="kicker green" style={rise(frame, 6)}>A SINGLE REQUEST</p>
          <h2 style={rise(frame, 12)}>Your agent asks.<br />Mandate handles the economics.</h2>
          <p style={rise(frame, 22)}>No provider-specific orchestration in the agent. No shared admin key. No opaque pooled balance.</p>
          <div className="interface-pills" style={rise(frame, 34)}>
            <span><Terminal size={17} /> CLI</span>
            <span><Bot size={17} /> MCP</span>
            <span><Zap size={17} /> API</span>
          </div>
        </div>
        <Window title="Studio Operator · OpenClaw" className="agent-window">
          <div className="agent-body">
            <div className="agent-context">
              <span className="avatar"><Bot size={20} /></span>
              <div><strong>Studio Operator</strong><small>Connected through CLI</small></div>
              <span className="connected"><i /> Scoped</span>
            </div>
            <div className="conversation">
              <div className={`prompt-bubble ${submitted ? 'submitted' : ''}`}>
                <span>{message.slice(0, chars)}</span>
                {!submitted && <i className="caret" />}
              </div>
              <div className="mandate-call" style={{
                opacity: mandateIn,
                transform: `translateY(${interpolate(mandateIn, [0, 1], [18, 0])}px)`,
              }}>
                <div><Logo /><span className="tool-label">mandate.pay</span></div>
                <div className="tool-code">
                  <span>amount</span><strong>"2200"</strong>
                  <span>currency</span><strong>"USD"</strong>
                  <span>merchant</span><strong>"GitHub"</strong>
                </div>
                <div className="call-status">
                  <span className="spinner" />
                  Resolving authorized route…
                </div>
              </div>
            </div>
            <div className="composer"><span>Ask your agent…</span><i><ArrowUpRight size={17} /></i></div>
          </div>
        </Window>
      </div>
    </AbsoluteFill>
  );
};

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
        <SceneLabel>One intent. Explicit execution.</SceneLabel>
        <span>02 / 05</span>
      </div>
      <div className="orchestration-heading">
        <div>
          <p className="kicker mint">MANDATE EXECUTION GRAPH</p>
          <h2>Every action earns its authority.</h2>
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

const Dashboard = () => {
  const frame = useCurrentFrame();
  const duration = 200;
  const amount = interpolate(frame, [28, 70], [18451.48, 18429.64], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const rowIn = spring({frame: frame - 62, fps: FPS, config: {damping: 17, stiffness: 160}});

  return (
    <AbsoluteFill className="scene dashboard-scene" style={{opacity: fade(frame, duration)}}>
      <div className="scene-topline">
        <SceneLabel>One account. Full economic context.</SceneLabel>
        <span>03 / 05</span>
      </div>
      <Window title="Mandate · Studio treasury" className="dashboard-window">
        <div className="dashboard-shell">
          <aside>
            <Logo />
            <div className="account-chip"><b>S</b><span><strong>Studio treasury</strong><small>Economic account</small></span></div>
            {[
              ['Overview', WalletCards],
              ['Account', CircleDollarSign],
              ['Activity', Zap],
              ['Agent Access', Bot],
              ['Capabilities', Route],
            ].map(([label, Icon], index) => {
              const NavIcon = Icon as typeof Bot;
              return <div className={`nav-item ${index === 0 ? 'selected' : ''}`} key={label as string}><NavIcon size={18} />{label as string}</div>;
            })}
            <div className="local-operator">LOCAL OPERATOR</div>
          </aside>
          <main>
            <div className="dashboard-top"><PreviewBadge /><span className="search">Search <kbd>⌘ K</kbd></span></div>
            <div className="dashboard-content">
              <div className="dash-intro"><div><small>FRIDAY, AUGUST 7</small><h3>Economic continuity, at a glance.</h3><p>One account across every rail your agents use.</p></div><button>View activity <ArrowRight size={15} /></button></div>
              <div className="balance-card">
                <div><small>ESTIMATED ACCOUNT VALUE · USD</small><strong>${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong><p>Provider positions · Valued just now</p></div>
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
          </main>
        </div>
      </Window>
    </AbsoluteFill>
  );
};

const Primitive = () => {
  const frame = useCurrentFrame();
  const duration = 230;
  const phase = Math.min(3, Math.max(0, Math.floor((frame - 28) / 42)));
  const orbit = interpolate(frame, [18, 205], [0, 18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const events = [
    {icon: ArrowDownLeft, label: 'Revenue received', value: '+ $1,189.00', tone: 'positive'},
    {icon: Coins, label: 'Capital available', value: '12,420 USDC', tone: 'neutral'},
    {icon: CreditCard, label: 'Growth tool paid', value: '− $22.00', tone: 'spend'},
  ];

  return (
    <AbsoluteFill className="scene primitive-scene" style={{opacity: fade(frame, duration)}}>
      <div className="primitive-grid-bg" />
      <div className="scene-topline inverse">
        <SceneLabel>A new primitive</SceneLabel>
        <span>04 / 05</span>
      </div>
      <div className="primitive-layout">
        <div className="primitive-copy">
          <p className="kicker mint" style={rise(frame, 4)}>THE AUTONOMOUS ECONOMIC LOOP</p>
          <h2 style={rise(frame, 10)}>Capital becomes part of the agent’s loop.</h2>
          <p style={rise(frame, 18)}>
            Earn revenue. Hold it. Spend to grow. Repeat—
            <strong> autonomously within the mandate you set.</strong>
          </p>
          <div className="primitive-guardrails" style={rise(frame, 30)}>
            <span><KeyRound size={16} /> Scoped identity</span>
            <span><ShieldCheck size={16} /> Explicit limits</span>
            <span><Database size={16} /> Verifiable ledger</span>
          </div>
        </div>
        <div className="loop-visual">
          <div className="orbit-ring outer" style={{transform: `rotate(${orbit}deg)`}} />
          <div className="orbit-ring inner" style={{transform: `rotate(${-orbit * 1.4}deg)`}} />
          <div className="loop-agent">
            <span><Bot size={33} /></span>
            <small>ECONOMIC AGENT</small>
            <strong>Studio Operator</strong>
            <em><i /> Acting within mandate</em>
          </div>
          <div className={`loop-node earn ${phase === 0 || phase === 3 ? 'active' : ''}`}>
            <span><ArrowDownLeft size={23} /></span>
            <small>EARN</small>
            <strong>Invoice paid</strong>
            <b>+$1,189</b>
          </div>
          <div className={`loop-node hold ${phase === 1 ? 'active' : ''}`}>
            <span><Coins size={23} /></span>
            <small>HOLD</small>
            <strong>Treasury ready</strong>
            <b>12,420 USDC</b>
          </div>
          <div className={`loop-node spend ${phase === 2 ? 'active' : ''}`}>
            <span><CreditCard size={23} /></span>
            <small>SPEND</small>
            <strong>Growth tool</strong>
            <b>GitHub · $22</b>
          </div>
          <div className={`growth-signal ${phase === 3 ? 'visible' : ''}`}>
            <TrendingUp size={19} />
            <span><small>NEW OPPORTUNITY</small><strong>Research checkout · +$349</strong></span>
          </div>
          <div className="repeat-mark"><Repeat2 size={21} /></div>
        </div>
      </div>
      <div className="primitive-events">
        {events.map(({icon: Icon, label, value, tone}, index) => {
          const reveal = spring({frame: frame - 55 - index * 36, fps: FPS, config: {damping: 16, stiffness: 180}});
          return (
            <div className={`primitive-event ${tone}`} key={label} style={{opacity: reveal, transform: `translateY(${interpolate(reveal, [0, 1], [24, 0])}px)`}}>
              <span><Icon size={18} /></span>
              <div><small>{label}</small><strong>{value}</strong></div>
              <Check size={15} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Capabilities = () => {
  const frame = useCurrentFrame();
  const duration = 155;
  const categories = [
    {icon: ArrowDownLeft, label: 'EARN', title: 'Accept money', items: ['Checkout', 'Invoice', 'Receive'], color: 'teal'},
    {icon: WalletCards, label: 'HOLD', title: 'Understand capital', items: ['Balance', 'Transactions', 'Provider positions'], color: 'blue'},
    {icon: ArrowUpRight, label: 'SPEND', title: 'Use earned capital', items: ['Pay a merchant', 'Transfer capital', 'Merchant lock + limits'], color: 'amber'},
  ];

  return (
    <AbsoluteFill className="scene capability-scene" style={{opacity: fade(frame, duration)}}>
      <div className="capability-heading">
        <p className="kicker green" style={rise(frame, 3)}>THE CAPABILITY IT UNLOCKS · 05 / 05</p>
        <h2 style={rise(frame, 7)}>Agents that can participate<br />in the economy.</h2>
        <p style={rise(frame, 13)}>Independent enough to act. Bounded enough to trust.</p>
      </div>
      <div className="capability-grid">
        {categories.map(({icon: Icon, label, title, items, color}, index) => (
          <div className={`capability-card ${color}`} key={label} style={rise(frame, 18 + index * 5)}>
            <div className="capability-icon"><Icon size={25} /></div>
            <small>{label}</small>
            <h3>{title}</h3>
            <div>{items.map(item => <span key={item}><Check size={14} />{item}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="control-strip" style={rise(frame, 42)}>
        <span><KeyRound size={18} /> Scoped identity</span>
        <i />
        <span><ShieldCheck size={18} /> Explicit authority</span>
        <i />
        <span><Route size={18} /> Provider-aware routing</span>
        <i />
        <span><Database size={18} /> Ledger evidence</span>
      </div>
    </AbsoluteFill>
  );
};

const EndCard = () => {
  const frame = useCurrentFrame();
  const duration = 135;
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

export const MandateDemo = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill className="video-root">
      <Audio src={staticFile('mandate-soundtrack.m4a')} />
      <Sequence from={0} durationInFrames={115}><Opening /></Sequence>
      <Sequence from={90} durationInFrames={190}><Intent /></Sequence>
      <Sequence from={250} durationInFrames={235}><Orchestration /></Sequence>
      <Sequence from={455} durationInFrames={200}><Dashboard /></Sequence>
      <Sequence from={620} durationInFrames={230}><Primitive /></Sequence>
      <Sequence from={820} durationInFrames={155}><Capabilities /></Sequence>
      <Sequence from={945} durationInFrames={135}><EndCard /></Sequence>
      <div className="video-progress"><span style={{width: `${(frame / (durationInFrames - 1)) * 100}%`}} /></div>
    </AbsoluteFill>
  );
};
