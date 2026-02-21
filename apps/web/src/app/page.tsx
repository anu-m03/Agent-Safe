'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSpatialAtlas, getAppEvolutionAtlas, seedTestApp } from '@/services/backendClient';
import type { AppSpatialMemory, AppSpatialMarker, AppSpatialZone } from '@/services/backendClient';
import type { SpatialMemory, AgentMarker, DetectedZone } from '@agent-safe/shared';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  HeartPulse,
  Layers,
  LogOut,
  Moon,
  Play,
  Radio,
  ShieldAlert,
  Sun,
  Vote,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

type Theme = 'dark' | 'light';
type View = 'landing' | 'dashboard' | 'approval' | 'governance' | 'liquidation' | 'stats' | 'spatial';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  cluster: 0 | 1 | 2;
  phase: number;
};

type FeedItem = {
  id: string;
  icon: 'danger' | 'success' | 'warning' | 'accent';
  text: string;
  time: string;
};

type ReviewItem = {
  id: string;
  type: 'BLOCK' | 'REVIEW_REQUIRED' | 'REPAY';
  text: string;
  risk: number;
  state: 'idle' | 'flyout' | 'signed';
};

type Proposal = {
  id: string;
  title: string;
  source: 'Nouns DAO' | 'Snapshot' | 'Compound';
  state: 'active' | 'voted' | 'vetoed';
  risk: number;
  signals: string[];
  summary: string;
  recommendation: 'FOR' | 'AGAINST' | 'ABSTAIN';
  confidence: number;
  vetoTime?: number;
};

const HEX_CHARS = '0123456789ABCDEF';
const walletAddress = '0x742d35Cc6634C0532925a3b8D4C9C8f3a1bE4c2';

const navItems = [
  { key: 'dashboard', label: 'Overview', icon: Bot },
  { key: 'approval', label: 'Approval Guard', icon: ShieldAlert },
  { key: 'governance', label: 'Governance Safe', icon: Vote },
  { key: 'liquidation', label: 'Liquidation', icon: Activity },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'spatial', label: 'Spatial Atlas', icon: Globe },
] as const;

const feedSeed: FeedItem[] = [
  { id: 'f1', icon: 'danger', text: 'Blocked unlimited USDC approval to unverified spender.', time: '2 min ago' },
  { id: 'f2', icon: 'warning', text: 'Queued human veto window for NounsDAO Proposal #247.', time: '14 min ago' },
  { id: 'f3', icon: 'success', text: 'Executed repay protection intent: 0.847 ETH on Aave.', time: '1h 23m ago' },
  { id: 'f4', icon: 'accent', text: 'Swarm consensus updated to REVIEW_REQUIRED on policy conflict.', time: '2h 01m ago' },
  { id: 'f5', icon: 'warning', text: 'Governance Safe flagged Compound v3.2 risk shift.', time: '3h 12m ago' },
  { id: 'f6', icon: 'success', text: 'Prepared ADD_COLLATERAL intent: 2,400 USDC.', time: '5h 40m ago' },
];

const proposalSeed: Proposal[] = [
  {
    id: 'p247',
    title: 'NounsDAO Proposal #247: Treasury Diversification into stETH',
    source: 'Nouns DAO',
    state: 'active',
    risk: 67,
    signals: ['TREASURY_RISK', 'GOV_POWER_SHIFT'],
    summary:
      'Diversification improves idle capital efficiency but increases correlated exposure during liquidity compression. Human veto review is recommended before queuing.',
    recommendation: 'ABSTAIN',
    confidence: 74,
    vetoTime: 23 * 60 + 14,
  },
  {
    id: 'c32',
    title: 'Compound v3.2: Interest Rate Model Update',
    source: 'Compound',
    state: 'active',
    risk: 88,
    signals: ['URGENCY_FLAG', 'GOV_POWER_SHIFT'],
    summary:
      'Borrower rate curve changes increase tail liquidation risk for leveraged positions. Model lacks deep market stress simulations at whale scale.',
    recommendation: 'AGAINST',
    confidence: 83,
    vetoTime: 11 * 60 + 5,
  },
  {
    id: 's18',
    title: 'Snapshot Signaling: Delegate Compensation Framework',
    source: 'Snapshot',
    state: 'voted',
    risk: 45,
    signals: ['GOV_POWER_SHIFT'],
    summary:
      'Compensation framework is broadly aligned with participation goals and includes clawback controls. Budget pressure remains manageable.',
    recommendation: 'FOR',
    confidence: 69,
  },
];

const areaData = [
  { t: 'Mon', v: 18 },
  { t: 'Tue', v: 26 },
  { t: 'Wed', v: 32 },
  { t: 'Thu', v: 27 },
  { t: 'Fri', v: 39 },
  { t: 'Sat', v: 35 },
  { t: 'Sun', v: 44 },
];

function cssValue(name: string) {
  if (typeof window === 'undefined') return 'rgb(255,255,255)';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function alpha(color: string, value: number) {
  const c = color.trim();
  if (c.startsWith('rgb')) {
    const parts = c.replace(/rgba?\(/, '').replace(')', '').split(',').map((n) => Number(n.trim()));
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${value})`;
  }
  if (c.startsWith('#')) {
    const raw = c.slice(1);
    const full = raw.length === 3 ? raw.split('').map((x) => `${x}${x}`).join('') : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${value})`;
  }
  return c;
}

function useScramble(finalText: string, duration: number, trigger: number) {
  const [text, setText] = useState(finalText);

  useEffect(() => {
    let step = 0;
    const total = Math.max(1, Math.floor(duration / 30));
    const tick = finalText.length / total;
    const id = window.setInterval(() => {
      setText(
        finalText
          .split('')
          .map((char, idx) => {
            if (char === ' ') return ' ';
            if (idx < step) return finalText[idx];
            return HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)];
          })
          .join(''),
      );
      step += tick;
      if (step >= finalText.length) {
        window.clearInterval(id);
        setText(finalText);
      }
    }, 30);

    return () => window.clearInterval(id);
  }, [finalText, duration, trigger]);

  return text;
}

function useTypewriter(text: string, open: boolean) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setValue(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [text, open]);

  return value;
}

function MagneticButton({
  children,
  className,
  onClick,
  style,
  enable,
  disabled,
}: {
  children: React.ReactNode;
  className: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  enable: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);

  function onMove(event: React.MouseEvent<HTMLButtonElement>) {
    if (!enable || disabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > 100) {
      ref.current.style.transform = 'translate3d(0,0,0) scale(1.01)';
      return;
    }
    ref.current.style.transform = `translate3d(${dx * 0.25}px, ${dy * 0.25}px, 0) scale(1.01)`;
    ref.current.style.transition = 'transform 120ms ease';
  }

  function onLeave() {
    if (!ref.current) return;
    ref.current.style.transition = 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    ref.current.style.transform = 'translate3d(0,0,0) scale(1)';
  }

  return (
    <button
      ref={ref}
      className={className}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={style}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}

function Reveal({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <div className="reveal" style={{ transitionDelay: `${index * 60}ms` }}>
      {children}
    </div>
  );
}

function RiskBar({ risk }: { risk: number }) {
  const color = risk < 36 ? 'var(--success)' : risk < 70 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="risk-track">
      <div className="risk-fill" style={{ width: `${risk}%`, background: color }} />
    </div>
  );
}

function ProposalCard({
  proposal,
  open,
  onToggle,
  reduced,
  enableMagnetic,
  mobile,
}: {
  proposal: Proposal;
  open: boolean;
  onToggle: () => void;
  reduced: boolean;
  enableMagnetic: boolean;
  mobile: boolean;
}) {
  const typed = useTypewriter(proposal.summary, open);
  const [countdown, setCountdown] = useState(proposal.vetoTime || 0);
  const score = useScramble(`${proposal.risk}`, 400, open ? 1 : 0);

  useEffect(() => {
    if (!open || !proposal.vetoTime) return;
    const id = window.setInterval(() => setCountdown((v) => Math.max(v - 1, 0)), 60000);
    return () => window.clearInterval(id);
  }, [open, proposal.vetoTime]);

  const h = Math.floor(countdown / 60);
  const m = countdown % 60;
  const strip = proposal.state === 'active' ? 'var(--warning)' : proposal.state === 'voted' ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="hud-card interactive trace" onMouseMove={cardGlow} style={{ borderLeft: `4px solid ${strip}` }}>
      <div className="proposal-grid">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge neutral">{proposal.source}</span>
            <span className={`badge ${proposal.state === 'active' ? 'warning' : proposal.state === 'voted' ? 'success' : 'danger'}`}>{proposal.state}</span>
          </div>
          <h3 className="proposal-title">{proposal.title}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {proposal.signals.map((signal) => (
              <span key={signal} className="badge warning">{signal}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: mobile ? 'left' : 'right' }}>
          <div className="mono" style={{ fontSize: 56, lineHeight: 1, fontWeight: 500, color: proposal.risk > 70 ? 'var(--danger)' : proposal.risk > 35 ? 'var(--warning)' : 'var(--success)' }}>
            {score}
          </div>
          <div className="label" style={{ marginTop: 4 }}>RISK SCORE</div>
          <div style={{ marginTop: 8 }}><RiskBar risk={proposal.risk} /></div>
          <button className="btn-ghost" onClick={onToggle} style={{ marginTop: 12 }}>Analyze</button>
        </div>
      </div>

      <div className="expand-wrap" style={{ maxHeight: open ? 320 : 0 }}>
        <div className="expand-inner">
          <p className="type-summary">{reduced ? proposal.summary : typed}</p>
          <div style={{ marginTop: 12 }}>
            <span className={`badge ${proposal.recommendation === 'FOR' ? 'success' : proposal.recommendation === 'AGAINST' ? 'danger' : 'warning'}`}>
              {proposal.recommendation}
            </span>
          </div>
          <div style={{ marginTop: 10 }}><RiskBar risk={proposal.confidence} /></div>
          {proposal.vetoTime && (
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              <Clock3 size={16} strokeWidth={1.5} />
              <span className="mono">Veto closes in {`${h}h ${m.toString().padStart(2, '0')}m`}</span>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MagneticButton className="btn-primary" enable={enableMagnetic && !mobile}>Queue Vote</MagneticButton>
            <button className="btn-danger"><Ban size={16} strokeWidth={1.5} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />Veto</button>
            <button className="btn-ghost" disabled={Boolean(proposal.vetoTime)}>Execute</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function cardGlow(event: React.MouseEvent<HTMLElement>) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  el.style.setProperty('--card-x', `${x}%`);
  el.style.setProperty('--card-y', `${y}%`);
}

export default function HomePage() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<View>('landing');
  const [copied, setCopied] = useState('');
  const [reduced, setReduced] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const [feed, setFeed] = useState(feedSeed.slice(0, 6));
  const [feedNew, setFeedNew] = useState<string>('');
  const [review, setReview] = useState<ReviewItem[]>([
    { id: 'r1', type: 'BLOCK', text: 'Uniswap approval request exceeds allowance policy cap.', risk: 91, state: 'idle' },
    { id: 'r2', type: 'REVIEW_REQUIRED', text: 'Nouns proposal has treasury concentration warning.', risk: 67, state: 'idle' },
    { id: 'r3', type: 'REPAY', text: 'Aave position crossed health threshold 1.2.', risk: 88, state: 'idle' },
  ]);

  const [proposalTab, setProposalTab] = useState<'all' | 'active' | 'vetoed' | 'voted'>('all');
  const [proposalOpen, setProposalOpen] = useState('');
  const [proposalQuery, setProposalQuery] = useState('');

  const [kind, setKind] = useState<'APPROVAL' | 'LEND' | 'OTHER'>('APPROVAL');
  const [target, setTarget] = useState('0x742d35Cc6634C0532925a3b8D4C9C8f3a1bE4c2');
  const [calldata, setCalldata] = useState('0x3a8f92b4e1d0c6f8a2b5e9d3c7f1a4b8e2d6c0f9');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [step, setStep] = useState(0);
  const [consensus, setConsensus] = useState<'BLOCKED' | 'REVIEW' | 'SAFE'>('BLOCKED');
  const [resultKey, setResultKey] = useState(0);

  const [bubbleOpen, setBubbleOpen] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // ── Spatial Atlas state ────────────────────────────────
  const [spatialTab, setSpatialTab] = useState<'governance' | 'evolution'>('governance');
  const [spaces, setSpaces] = useState<SpatialMemory[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'low' | 'med' | 'high'>('all');
  const [recFilter, setRecFilter] = useState<'all' | 'FOR' | 'AGAINST' | 'ABSTAIN'>('all');
  const [atlas, setAtlas] = useState<AppSpatialMemory[]>([]);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  async function handleSeedTest() {
    setSeedStatus('Seeding…');
    const res = await seedTestApp();
    if (res.ok) {
      setSeedStatus(`✓ Seeded “${res.data?.title}” — generating scene…`);
      // poll atlas after a short delay so the processing entry appears
      setTimeout(() => { loadEvolutionAtlas(); setSeedStatus(null); }, 3000);
    } else {
      setSeedStatus(`✗ ${res.error}`);
      setTimeout(() => setSeedStatus(null), 4000);
    }
  }

  const loadGovernanceSpaces = useCallback(async () => {
    setSpacesLoading(true);
    const res = await getSpatialAtlas();
    if (res.ok) { setSpaces(res.data.spaces); setSpacesError(null); }
    else setSpacesError(res.error);
    setSpacesLoading(false);
  }, []);

  const loadEvolutionAtlas = useCallback(async () => {
    setAtlasLoading(true);
    const res = await getAppEvolutionAtlas();
    if (res.ok) { setAtlas(res.data.atlas); setAtlasError(null); }
    else setAtlasError(res.error);
    setAtlasLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'spatial' && spaces.length === 0 && !spacesLoading) loadGovernanceSpaces();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === 'spatial' && spatialTab === 'evolution' && atlas.length === 0 && !atlasLoading) loadEvolutionAtlas();
  }, [view, spatialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const spatialFiltered = spaces.filter((s) => {
    if (s.status !== 'complete') return true;
    const sevOk = severityFilter === 'all' || spatialMaxSeverity(s) === severityFilter;
    const recOk = recFilter === 'all' || s.voteRecommendation === recFilter;
    return sevOk && recOk;
  });

  const [navHover, setNavHover] = useState('');
  const navRef = useRef<HTMLDivElement | null>(null);
  const navButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorX, setIndicatorX] = useState(0);

  const [statKey, setStatKey] = useState<Record<string, number>>({ a: 0, b: 0, c: 0, d: 0, e: 0, hf: 0, cr: 0, lp: 0 });
  const [headlineKey, setHeadlineKey] = useState(0);

  const appView = connected ? view : 'landing';

  const heading = useScramble('AgentSafe', 1000, headlineKey);
  const statA = useScramble('14', 400, statKey.a);
  const statB = useScramble('7', 400, statKey.b);
  const statC = useScramble('3', 400, statKey.c);
  const statD = useScramble('1,204', 400, statKey.d);
  const statE = useScramble('847', 400, statKey.e);
  const hf = useScramble('1.42', 400, statKey.hf);
  const cr = useScramble('14,200 USDC', 400, statKey.cr);
  const lp = useScramble('$1,840', 400, statKey.lp);

  const consensusText = useScramble(consensus, 600, resultKey);

  const proposals = useMemo(() => {
    return proposalSeed.filter((p) => {
      const tabMatch = proposalTab === 'all' ? true : proposalTab === 'active' ? p.state === 'active' : proposalTab === 'vetoed' ? p.state === 'vetoed' : p.state === 'voted';
      const queryMatch = proposalQuery ? p.title.toLowerCase().includes(proposalQuery.toLowerCase()) : true;
      return tabMatch && queryMatch;
    });
  }, [proposalQuery, proposalTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqHover = window.matchMedia('(hover: hover)');
    const sync = () => {
      setReduced(mqReduce.matches);
      setHoverCapable(mqHover.matches);
      setMobile(window.innerWidth < 768);
    };
    sync();
    window.addEventListener('resize', sync);
    mqReduce.addEventListener('change', sync);
    mqHover.addEventListener('change', sync);
    return () => {
      window.removeEventListener('resize', sync);
      mqReduce.removeEventListener('change', sync);
      mqHover.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(''), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (!connected) return;
    function down(event: MouseEvent) {
      if (!bubbleRef.current) return;
      if (!bubbleRef.current.contains(event.target as Node)) setBubbleOpen(false);
    }
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [connected]);

  useEffect(() => {
    setHeadlineKey((k) => k + 1);
  }, [appView]);

  useEffect(() => {
    const key = appView;
    if (key === 'landing') return;
    const next = window.setInterval(() => {
      setFeed((prev) => {
        const pick = feedSeed[Math.floor(Math.random() * feedSeed.length)];
        const id = `${pick.id}-${Date.now()}`;
        const entry: FeedItem = { ...pick, id };
        setFeedNew(id);
        window.setTimeout(() => setFeedNew(''), 400);
        return [entry, ...prev].slice(0, 6);
      });
    }, 4000);
    return () => window.clearInterval(next);
  }, [appView]);

  useEffect(() => {
    const active = navItems.find((i) => i.key === view)?.key;
    if (!active) return;
    const btn = navButtons.current[active];
    const wrap = navRef.current;
    if (!btn || !wrap) return;
    setIndicatorX(btn.offsetLeft + btn.offsetWidth / 2);
  }, [view, mobile]);

  useEffect(() => {
    if (reduced || mobile) return;
    let raf = 0;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { x: target.x, y: target.y };

    const onMove = (event: MouseEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
    };

    const loop = () => {
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      document.documentElement.style.setProperty('--mouse-x', `${current.x}px`);
      document.documentElement.style.setProperty('--mouse-y', `${current.y}px`);
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced, mobile]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (reduced || mobile) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const enabled = appView !== 'landing' || !connected;
    if (!enabled) return;

    const particles: Particle[] = [];
    const total = 200;

    let width = 0;
    let height = 0;
    let raf = 0;

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const clusters = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];

    const signal = { active: false, start: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, duration: 800 };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clusters[0] = { x: width * 0.28, y: height * 0.52 };
      clusters[1] = { x: width * 0.72, y: height * 0.28 };
      clusters[2] = { x: width * 0.55, y: height * 0.72 };
    }

    function init() {
      particles.length = 0;
      for (let i = 0; i < total; i += 1) {
        const cluster = (i % 3) as 0 | 1 | 2;
        const c = clusters[cluster];
        particles.push({
          x: c.x + (Math.random() - 0.5) * 180,
          y: c.y + (Math.random() - 0.5) * 180,
          vx: 0,
          vy: 0,
          radius: 1.5 + Math.random() * 1.5,
          opacity: 0.3 + Math.random() * 0.5,
          cluster,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    const onMove = (event: MouseEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    };

    const onResize = () => {
      resize();
      init();
    };

    resize();
    init();

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', onResize);

    const intensity = appView === 'landing' ? 1 : appView === 'dashboard' ? 0.7 : appView === 'stats' ? 0.5 : appView === 'approval' ? 0.6 : 0.55;

    function draw(now: number) {
      const clusterColors = [cssValue('--cluster-approval'), cssValue('--cluster-governance'), cssValue('--cluster-liquidation')];
      const accent = cssValue('--accent');
      const text = cssValue('--text-subtle');
      const blobBase = theme === 'light' ? 0.02 : 0.04;
      const pointScale = theme === 'light' ? 0.5 : 1;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < clusters.length; i += 1) {
        const cx = clusters[i].x + Math.sin(now * 0.0001 + i) * 30;
        const cy = clusters[i].y + Math.cos(now * 0.0001 + i * 2) * 30;
        const d = Math.hypot(mouse.x - cx, mouse.y - cy);
        const boost = d < 300 ? 0.04 : 0;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 200);
        gradient.addColorStop(0, alpha(clusterColors[i], (blobBase + boost) * intensity));
        gradient.addColorStop(1, alpha(clusterColors[i], 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, 200, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const c = clusters[p.cluster];

        p.x += Math.cos(p.phase + now * 0.0003) * 0.8 + (c.x - p.x) * 0.002;
        p.y += Math.sin(p.phase + now * 0.0004) * 0.8 + (c.y - p.y) * 0.002;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance < 180) {
          const force = ((180 - distance) / 180) * 2;
          p.vx += (dx / distance) * force;
          p.vy += (dy / distance) * force;
        }

        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = alpha(clusterColors[p.cluster], p.opacity * pointScale * intensity);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          if (a.cluster !== b.cluster) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 80) continue;
          const opacity = (1 - d / 80) * 0.15 * intensity;
          ctx.strokeStyle = alpha(clusterColors[a.cluster], opacity);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      if (analysisRunning && now % 4000 < 16 && !signal.active) {
        const from = particles[Math.floor(Math.random() * particles.length)];
        const toCandidates = particles.filter((p) => p.cluster !== from.cluster);
        const to = toCandidates[Math.floor(Math.random() * toCandidates.length)];
        signal.active = true;
        signal.start = now;
        signal.from = { x: from.x, y: from.y };
        signal.to = { x: to.x, y: to.y };
      }

      if (signal.active) {
        const progress = Math.min(1, (now - signal.start) / signal.duration);
        const x = signal.from.x + (signal.to.x - signal.from.x) * progress;
        const y = signal.from.y + (signal.to.y - signal.from.y) * progress;

        ctx.strokeStyle = alpha(accent, 0.7 * intensity);
        ctx.lineWidth = 1;
        ctx.shadowBlur = 4;
        ctx.shadowColor = alpha(accent, 0.5);
        ctx.beginPath();
        ctx.moveTo(signal.from.x, signal.from.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = alpha(accent, 0.95);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        if (progress >= 1) signal.active = false;
      }

      if (feed.length === 0) {
        const y = ((now / 3000) % 1) * height;
        ctx.fillStyle = alpha(text, 0.2 * intensity);
        ctx.fillRect(0, y, width, 1);
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, [appView, connected, reduced, mobile, theme, analysisRunning, feed.length]);

  function copy(value: string, key: string) {
    void navigator.clipboard.writeText(value);
    setCopied(key);
  }

  function connect() {
    setConnected(true);
    setView('dashboard');
  }

  function dismissReview(id: string) {
    setReview((prev) => prev.map((item) => (item.id === id ? { ...item, state: 'flyout' } : item)));
    window.setTimeout(() => setReview((prev) => prev.filter((item) => item.id !== id)), 280);
  }

  function signReview(id: string) {
    setReview((prev) => prev.map((item) => (item.id === id ? { ...item, state: 'signed' } : item)));
    window.setTimeout(() => setReview((prev) => prev.filter((item) => item.id !== id)), 280);
  }

  function analyzeApproval() {
    setAnalyzing(true);
    setAnalyzed(false);
    setStep(0);
    setAnalysisRunning(true);
    setConsensus(kind === 'APPROVAL' ? 'BLOCKED' : kind === 'LEND' ? 'REVIEW' : 'SAFE');

    window.setTimeout(() => {
      setAnalyzing(false);
      let s = 0;
      const id = window.setInterval(() => {
        s += 1;
        setStep(s);
        if (s === 3) {
          window.clearInterval(id);
          setAnalyzed(true);
          setResultKey((k) => k + 1);
          setAnalysisRunning(false);
        }
      }, 400);
    }, 600);
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        @property --trace-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        :root {
          --bg: #08080A;
          --surface: #0F0F12;
          --surface-2: #161619;
          --surface-3: #1E1E23;
          --border: #242428;
          --text: #F5F5F3;
          --text-muted: #9A9A96;
          --text-subtle: #5A5A58;
          --accent: #FF775C;
          --accent-dim: #CC5F47;
          --accent-bright: #FF9580;
          --accent-glow: rgba(255,119,92,0.20);
          --accent-glow-lg: rgba(255,119,92,0.08);
          --danger: #EF4444;
          --danger-muted: rgba(239,68,68,0.12);
          --success: #22C55E;
          --success-muted: rgba(34,197,94,0.12);
          --warning: #F59E0B;
          --warning-muted: rgba(245,158,11,0.12);
          --cluster-approval: #FF775C;
          --cluster-governance: #A8A8FF;
          --cluster-liquidation: #4ADE80;
          --white: #FFFFFF;
          --mouse-x: 50vw;
          --mouse-y: 50vh;
        }

        html[data-theme='light'] {
          --bg: #F9F8F5;
          --surface: #FFFFFF;
          --surface-2: #F2F1EE;
          --surface-3: #E8E7E3;
          --border: #DDDBD6;
          --text: #0A0A08;
          --text-muted: #504E49;
          --text-subtle: #9E9C96;
          --accent: #E8603D;
          --accent-dim: #C44F2E;
          --accent-bright: #FF775C;
          --accent-glow: rgba(232,96,61,0.18);
          --accent-glow-lg: rgba(232,96,61,0.07);
          --cluster-approval: #E8603D;
          --cluster-governance: #8B8BCF;
          --cluster-liquidation: #3FAF66;
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; }

        .canvas-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

        .app { min-height: 100vh; position: relative; z-index: 2; color: var(--text); }

        .topbar {
          position: fixed;
          left: 0;
          right: 0;
          top: 0;
          height: 52px;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          pointer-events: none;
        }

        .topbar-inner {
          width: 100%;
          max-width: 1320px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          pointer-events: auto;
        }

        .wordmark { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; }

        .hero-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          text-align: center;
        }

        .hero-title {
          margin: 0;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 80px;
          letter-spacing: -0.03em;
          line-height: 0.95;
        }

        .hero-line {
          width: 0;
          height: 1px;
          background: var(--accent);
          margin: 10px auto 0;
          animation: draw-line 600ms ease forwards;
          animation-delay: 1000ms;
        }

        @keyframes draw-line { to { width: 180px; } }

        .hero-sub {
          margin-top: 18px;
          font-family: 'Syne', sans-serif;
          font-weight: 600;
          font-size: 24px;
          color: var(--text-muted);
          opacity: 0;
          animation: fade-up 400ms ease forwards;
          animation-delay: 1100ms;
        }

        .feature-row {
          margin-top: 28px;
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .micro-badge {
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: 99px;
          padding: 6px 10px;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
        }

        .micro-dot { width: 6px; height: 6px; border-radius: 99px; animation: dot-pulse 1.8s ease-out infinite; }
        .micro-dot.approval { background: var(--cluster-approval); }
        .micro-dot.governance { background: var(--cluster-governance); }
        .micro-dot.liquidation { background: var(--cluster-liquidation); }

        @keyframes dot-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }

        .btn-primary, .btn-ghost, .btn-danger, .icon-btn {
          border-radius: 8px;
          border: 1px solid transparent;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, opacity 120ms ease;
        }

        .btn-primary {
          height: 52px;
          padding: 0 20px;
          background: var(--accent);
          color: var(--white);
          font-size: 15px;
          font-weight: 500;
          position: relative;
          overflow: visible;
        }

        .btn-primary.cta::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: inherit;
          border: 1px solid var(--accent-glow);
          opacity: 0;
          transform: scale(0.9);
          transition: transform 300ms ease, opacity 300ms ease;
          pointer-events: none;
        }

        .btn-primary.cta:hover::after { opacity: 1; transform: scale(1); }

        .btn-primary:hover { background: var(--accent-dim); }
        .btn-primary:active { transform: scale(0.96); }
        .btn-primary:disabled, .btn-ghost:disabled, .btn-danger:disabled { opacity: 0.35; cursor: not-allowed; }

        .btn-ghost {
          height: 36px;
          padding: 0 14px;
          background: transparent;
          color: var(--text);
          border-color: var(--border);
          font-size: 13px;
        }

        .btn-ghost:hover { background: var(--surface-3); border-color: var(--text-muted); }

        .btn-danger {
          height: 36px;
          padding: 0 14px;
          background: var(--danger-muted);
          color: var(--danger);
          border-color: var(--danger);
          font-size: 13px;
        }

        .icon-btn {
          width: 36px;
          height: 36px;
          border-color: var(--border);
          background: var(--surface);
          color: var(--text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .chip-wallet {
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: 8px;
          padding: 6px 10px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: var(--text-muted);
        }

        .copy-icon { opacity: 0; transition: opacity 120ms ease; }
        .chip-wallet:hover .copy-icon { opacity: 1; }

        .main-wrap { max-width: 1320px; margin: 0 auto; padding: 72px 20px 120px; }

        .lane-layout {
          display: grid;
          grid-template-columns: 30% 40% 30%;
          gap: 20px;
        }

        .hud-card {
          position: relative;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: color-mix(in srgb, var(--surface) 70%, transparent);
          backdrop-filter: blur(12px);
          padding: 16px;
          overflow: hidden;
        }

        .hud-card > * { position: relative; z-index: 2; }

        .hud-card.interactive::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(280px circle at var(--card-x, 50%) var(--card-y, 50%), var(--accent-glow), transparent 70%);
          opacity: 0;
          transition: opacity 200ms ease;
          z-index: 1;
          pointer-events: none;
        }

        .hud-card.interactive:hover::before { opacity: 1; }

        .hud-card.trace::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(from var(--trace-angle), var(--accent), transparent 60%, var(--accent));
          opacity: 0;
          transition: opacity 300ms ease;
          z-index: 0;
          -webkit-mask: linear-gradient(var(--white) 0 0) content-box, linear-gradient(var(--white) 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        .hud-card.trace:hover::after {
          opacity: 1;
          animation: trace-spin 1000ms linear forwards;
        }

        @keyframes trace-spin {
          from { --trace-angle: 0deg; }
          to { --trace-angle: 360deg; }
        }

        .reveal { opacity: 0; transform: translateY(12px); animation: fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        @keyframes fade-up {
          to { opacity: 1; transform: translateY(0); }
        }

        .agent-card { transition: transform 120ms ease, border-color 120ms ease; }
        .agent-card:hover { transform: scale(1.01); }

        .pulse-ring {
          width: 10px;
          height: 10px;
          border-radius: 99px;
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .pulse-ring .dot { width: 10px; height: 10px; border-radius: 99px; background: var(--accent); z-index: 2; }
        .pulse-ring .ring {
          position: absolute;
          inset: 0;
          border: 1px solid var(--accent);
          border-radius: 99px;
          z-index: 1;
          animation: ring 1.8s ease-out infinite;
        }

        .pulse-ring .ring.b { animation-delay: 0.6s; }

        @keyframes ring {
          from { transform: scale(1); opacity: 0.6; }
          to { transform: scale(2.2); opacity: 0; }
        }

        .radar {
          width: 200px;
          height: 200px;
          margin: 0 auto;
          position: relative;
        }

        .radar circle.track { stroke: var(--accent); opacity: 0.3; }
        .radar circle.sweep {
          stroke: var(--accent);
          stroke-dasharray: 130 260;
          animation: radar-spin 3000ms linear infinite;
          transform-origin: center;
        }

        .radar.fast circle.sweep { animation-duration: 1000ms; stroke: var(--accent-bright); }

        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .ticker {
          margin-top: 20px;
          min-height: 244px;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: color-mix(in srgb, var(--surface) 72%, transparent);
        }

        .tick-row {
          height: 40px;
          display: grid;
          grid-template-columns: 18px 1fr auto;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }

        .tick-row.new { animation: tick-in 240ms cubic-bezier(0.16,1,0.3,1), tick-flash 240ms ease; }

        @keyframes tick-in {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes tick-flash {
          from { background: var(--accent-glow-lg); }
          to { background: transparent; }
        }

        .scan-text {
          min-height: 200px;
          display: grid;
          place-items: center;
          color: var(--text-subtle);
          animation: scan-pulse 2000ms ease-in-out infinite;
        }

        @keyframes scan-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        .pill-row { margin-top: 18px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

        .stat-pill {
          border: 1px solid var(--border);
          border-radius: 99px;
          background: var(--surface-2);
          padding: 12px 20px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform 120ms ease, border-color 120ms ease;
        }

        .stat-pill:hover { transform: scale(1.03); border-color: var(--accent); }

        .badge {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .badge.success { color: var(--success); background: var(--success-muted); border-color: var(--success); }
        .badge.warning { color: var(--warning); background: var(--warning-muted); border-color: var(--warning); }
        .badge.danger { color: var(--danger); background: var(--danger-muted); border-color: var(--danger); }
        .badge.neutral { color: var(--text-muted); background: var(--surface-3); }

        .queue-card {
          transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease, max-height 280ms ease;
          max-height: 200px;
          opacity: 1;
          transform: translateX(0);
        }

        .queue-card.flyout { transform: translateX(100px); opacity: 0; }
        .queue-card.signed { max-height: 0; opacity: 0; transform: scaleY(0.8); padding-top: 0; padding-bottom: 0; margin: 0; border-width: 0; }

        .risk-track { height: 4px; border-radius: 4px; background: var(--surface-3); overflow: hidden; margin-top: 8px; }
        .risk-fill { height: 4px; width: 0; transition: width 500ms ease-out; }

        .empty-queue {
          min-height: 260px;
          display: grid;
          place-items: center;
          text-align: center;
          color: var(--text-muted);
        }

        .rot-slow { animation: rot 6000ms linear infinite; }
        @keyframes rot { to { transform: rotate(360deg); } }

        .analysis-shell {
          max-width: 640px;
          margin: 0 auto;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface) 75%, transparent);
          backdrop-filter: blur(16px);
          padding: 20px;
        }

        .input, .textarea {
          width: 100%;
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--text);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 15px;
        }

        .input:focus, .textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-glow); }

        .kind-row { display: flex; gap: 8px; flex-wrap: wrap; }

        .kind-pill {
          border: 1px solid var(--border);
          border-radius: 99px;
          padding: 8px 12px;
          background: var(--surface-2);
          color: var(--text-muted);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .kind-pill.active { background: var(--accent); color: var(--white); border-color: var(--accent); }
        .kind-pill:active { transform: scale(0.96); }

        .timeline { margin-top: 14px; display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 10px; }
        .tl-node { text-align: center; }
        .tl-circle {
          width: 48px;
          height: 48px;
          border-radius: 99px;
          border: 1px solid var(--border);
          background: var(--surface-3);
          margin: 0 auto;
          display: grid;
          place-items: center;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .tl-circle.done { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 24%, var(--surface-2)); }
        .tl-line { width: 100px; height: 2px; background: var(--border); overflow: hidden; border-radius: 99px; }
        .tl-line > span { display: block; width: 100%; height: 2px; background: var(--accent); transform-origin: left; transform: scaleX(0); transition: transform 400ms ease; }
        .tl-line.done > span { transform: scaleX(1); }

        .consensus-word {
          margin: 18px 0 6px;
          text-align: center;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 64px;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .proposal-grid { display: grid; grid-template-columns: 65% 35%; gap: 14px; }
        .proposal-title { margin: 10px 0 0; font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 600; line-height: 1.2; }
        .expand-wrap { overflow: hidden; transition: max-height 320ms cubic-bezier(0.16,1,0.3,1); }
        .expand-inner { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px; }
        .type-summary { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); font-style: italic; min-height: 48px; }

        .gauge-row { display: grid; grid-template-columns: 1fr 1px 1fr 1px 1fr; gap: 14px; align-items: center; }
        .divider-v { width: 1px; height: 100%; background: var(--border); }

        .alert-card.critical { animation: shake 400ms ease 1; }
        @keyframes shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
          100% { transform: translateX(0); }
        }

        .bubble-nav {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          z-index: 100;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 85%, transparent);
          backdrop-filter: blur(20px);
          border-radius: 99px;
          padding: 8px;
          display: flex;
          gap: 6px;
          width: auto;
        }

        .bubble-btn {
          width: 48px;
          height: 48px;
          border-radius: 99px;
          border: 0;
          background: transparent;
          color: var(--text-subtle);
          display: grid;
          place-items: center;
          position: relative;
          transition: transform 120ms ease, background 120ms ease, color 120ms ease;
        }

        .bubble-btn:hover { transform: scale(1.1); background: var(--surface-3); color: var(--text); }
        .bubble-btn.active { color: var(--accent); background: var(--accent-glow-lg); }

        .bubble-label {
          position: absolute;
          bottom: 54px;
          left: 50%;
          transform: translate(-50%, 8px);
          opacity: 0;
          pointer-events: none;
          font-size: 11px;
          color: var(--text-subtle);
          white-space: nowrap;
          transition: transform 200ms ease, opacity 200ms ease;
        }

        .bubble-btn:hover .bubble-label,
        .bubble-btn.active .bubble-label { transform: translate(-50%, 0); opacity: 1; }

        .nav-indicator {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 99px;
          background: var(--accent);
          bottom: 4px;
          transform: translateX(-50%);
          transition: left 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .swarm-bubble {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 200;
        }

        .swarm-btn {
          width: 56px;
          max-width: 56px;
          height: 56px;
          border-radius: 99px;
          border: 0;
          background: var(--accent);
          color: var(--white);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          padding: 0 18px;
          transition: max-width 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .swarm-btn:hover { max-width: 220px; }
        .swarm-btn-label { opacity: 0; transition: opacity 120ms ease; white-space: nowrap; font-size: 13px; }
        .swarm-btn:hover .swarm-btn-label { opacity: 1; }

        .swarm-panel {
          margin-top: 10px;
          width: 280px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface) 82%, transparent);
          backdrop-filter: blur(20px);
          padding: 12px;
          animation: fade-up 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .mono { font-family: 'JetBrains Mono', monospace; }
        .label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-subtle); }

        .table-row { border-bottom: 1px solid var(--border); padding: 10px 0; }
        .table-main { display: grid; grid-template-columns: 90px 1fr 110px 90px 90px; gap: 8px; align-items: center; font-size: 13px; }
        .table-expand { overflow: hidden; transition: max-height 240ms ease; color: var(--text-muted); font-size: 13px; }

        @media (max-width: 1023px) {
          .lane-layout { grid-template-columns: 1fr; }
          .proposal-grid { grid-template-columns: 1fr; }
          .gauge-row { grid-template-columns: 1fr; }
          .divider-v { display: none; }
        }

        @media (max-width: 767px) {
          .topbar-inner .center-network { display: none; }
          .hero-title { font-size: 56px; }
          .bubble-nav { width: 90vw; justify-content: space-between; }
          .main-wrap { padding: 64px 12px 116px; }
          .swarm-bubble { right: 16px; bottom: 86px; }
          .table-main { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .reveal,
          .btn-primary,
          .hud-card,
          .swarm-btn,
          .bubble-btn,
          .tick-row,
          .hero-line,
          .hero-sub,
          .radar circle.sweep,
          .alert-card.critical,
          .pulse-ring .ring { animation: none !important; transition: none !important; }
        }
      `}</style>

      <canvas ref={canvasRef} className="canvas-bg" />

      <div className="app">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="wordmark">AgentSafe</div>
            <div className="center-network" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
              <Globe size={12} strokeWidth={1.5} />
              <span className="pulse-ring" style={{ width: 8, height: 8 }}>
                <span className="dot" style={{ width: 8, height: 8, background: 'var(--success)' }} />
                <span className="ring" style={{ borderColor: 'var(--success)' }} />
                <span className="ring b" style={{ borderColor: 'var(--success)' }} />
              </span>
              Base Mainnet
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {connected && (
                <button className="chip-wallet" onClick={() => copy(walletAddress, 'wallet')}>
                  {`${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`}
                  {copied === 'wallet' ? <CheckCircle2 size={14} strokeWidth={1.5} className="copy-icon" style={{ opacity: 1, color: 'var(--success)' }} /> : <Copy size={14} strokeWidth={1.5} className="copy-icon" />}
                </button>
              )}
              {connected && (
                <button className="icon-btn" onClick={() => { setConnected(false); setView('landing'); }}>
                  <LogOut size={18} strokeWidth={1.5} />
                </button>
              )}
              <button className="icon-btn" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
                {theme === 'dark' ? <Sun size={20} strokeWidth={1.5} /> : <Moon size={20} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
        </header>

        {appView === 'landing' ? (
          <section className="hero-wrap">
            <div>
              <h1 className="hero-title">{heading}</h1>
              <div className="hero-line" />
              <div className="hero-sub">Your wallet&apos;s immune system.</div>

              <div className="feature-row">
                <span className="micro-badge"><span className="micro-dot approval" /><ShieldAlert size={14} strokeWidth={1.5} /> APPROVAL GUARD</span>
                <span className="micro-badge"><span className="micro-dot governance" /><Vote size={14} strokeWidth={1.5} /> GOVERNANCE SAFE</span>
                <span className="micro-badge"><span className="micro-dot liquidation" /><Activity size={14} strokeWidth={1.5} /> LIQUIDATION PREVENTION</span>
              </div>

              <div style={{ marginTop: 48 }}>
                <MagneticButton className="btn-primary cta" enable={hoverCapable && !mobile && !reduced} onClick={connect} style={{ width: 240 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Wallet size={18} strokeWidth={1.5} />Connect Wallet</span>
                </MagneticButton>
              </div>

              <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-subtle)', fontSize: 11 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect width="10" height="10" fill="currentColor" /></svg>
                <span className="mono">Built on Base</span>
              </div>
            </div>
          </section>
        ) : (
          <main className="main-wrap">
            {view === 'dashboard' && (
              <section className="lane-layout">
                <div style={{ display: 'grid', gap: 14 }}>
                  {[
                    { name: 'Sentinel', color: 'var(--cluster-approval)', icon: ShieldAlert, text: 'Monitoring approvals and spender contracts.', last: '2 min ago' },
                    { name: 'Scam Detector', color: 'var(--cluster-governance)', icon: AlertTriangle, text: 'Evaluating governance payloads and risk shifts.', last: '14 min ago' },
                    { name: 'Liquidation Predictor', color: 'var(--cluster-liquidation)', icon: HeartPulse, text: 'Watching health factor and collateral drift.', last: '1h 23m ago' },
                  ].map((agent, i) => {
                    const Icon = agent.icon;
                    return (
                      <Reveal key={agent.name} index={i}>
                        <div className="hud-card interactive trace agent-card" onMouseMove={cardGlow} style={{ borderLeft: `2px solid ${agent.color}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <Icon size={18} strokeWidth={1.5} color={agent.color} />
                              <strong style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18 }}>{agent.name}</strong>
                            </div>
                            <span className="pulse-ring" style={{ '--accent': agent.color } as React.CSSProperties}>
                              <span className="dot" style={{ background: agent.color }} />
                              <span className="ring" style={{ borderColor: agent.color }} />
                              <span className="ring b" style={{ borderColor: agent.color }} />
                            </span>
                          </div>
                          <p style={{ margin: '10px 0 4px', fontSize: 13, color: 'var(--text-muted)' }}>{agent.text}</p>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Last action: {agent.last}</div>
                          <svg width="100%" height="40" viewBox="0 0 240 40" style={{ marginTop: 10 }}>
                            <path d="M0 30 L40 22 L80 26 L120 18 L160 20 L200 12 L240 16" fill="none" stroke={agent.color} strokeWidth="1.5" />
                          </svg>
                          <div style={{ textAlign: 'right' }}><button className="btn-ghost">Details</button></div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>

                <div>
                  <Reveal index={3}>
                    <div className={`radar ${analysisRunning ? 'fast' : ''}`}>
                      <svg width="200" height="200" viewBox="0 0 200 200">
                        <circle className="track" cx="100" cy="100" r="90" fill="none" strokeWidth="2" />
                        <circle className="sweep" cx="100" cy="100" r="90" fill="none" strokeWidth="2" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 14, letterSpacing: '0.15em', color: 'var(--accent)', fontWeight: 700 }}>ACTIVE</div>
                          <div className="mono" style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>3 AGENTS</div>
                        </div>
                      </div>
                    </div>
                  </Reveal>

                  <Reveal index={4}>
                    <div className="ticker">
                      {feed.length ? (
                        feed.map((row) => {
                          const color = row.icon === 'danger' ? 'var(--danger)' : row.icon === 'success' ? 'var(--success)' : row.icon === 'warning' ? 'var(--warning)' : 'var(--accent)';
                          const Icon = row.icon === 'danger' ? XCircle : row.icon === 'success' ? CheckCircle2 : ArrowRightLeft;
                          return (
                            <div key={row.id} className={`tick-row ${feedNew === row.id ? 'new' : ''}`}>
                              <Icon size={14} strokeWidth={1.5} color={color} />
                              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.text}</span>
                              <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{row.time}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="scan-text">SCANNING...</div>
                      )}
                    </div>
                  </Reveal>

                  <Reveal index={5}>
                    <div className="pill-row">
                      {[
                        { id: 'a', label: 'Approvals Blocked', value: statA, icon: ShieldAlert, color: 'var(--danger)' },
                        { id: 'b', label: 'Proposals', value: statB, icon: Vote, color: 'var(--cluster-governance)' },
                        { id: 'c', label: 'Saved', value: statC, icon: Activity, color: 'var(--success)' },
                      ].map((pill) => {
                        const Icon = pill.icon;
                        return (
                          <div
                            key={pill.id}
                            className="stat-pill"
                            onMouseEnter={() => setStatKey((prev) => ({ ...prev, [pill.id]: prev[pill.id] + 1 }))}
                          >
                            <Icon size={16} strokeWidth={1.5} color={pill.color} />
                            <span className="mono" style={{ fontSize: 18 }}>{pill.value}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{pill.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Reveal>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 8 }}>REVIEW QUEUE</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {review.length ? (
                      review.map((item, idx) => (
                        <Reveal key={item.id} index={idx + 6}>
                          <div className={`hud-card interactive queue-card ${item.state === 'flyout' ? 'flyout' : ''} ${item.state === 'signed' ? 'signed' : ''}`} onMouseMove={cardGlow}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className={`badge ${item.type === 'BLOCK' ? 'danger' : item.type === 'REPAY' ? 'success' : 'warning'}`}>{item.type}</span>
                              <span className="mono" style={{ fontSize: 28, color: item.risk > 70 ? 'var(--danger)' : item.risk > 35 ? 'var(--warning)' : 'var(--success)' }}>{item.risk}</span>
                            </div>
                            <p style={{ margin: '8px 0', fontSize: 13 }}>{item.text}</p>
                            <RiskBar risk={item.risk} />
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                              <MagneticButton className="btn-primary" enable={hoverCapable && !mobile && !reduced} style={{ height: 36, flex: 1 }} onClick={() => signReview(item.id)}>
                                Review & Sign
                              </MagneticButton>
                              <button className="btn-ghost" onClick={() => dismissReview(item.id)}>Dismiss</button>
                            </div>
                          </div>
                        </Reveal>
                      ))
                    ) : (
                      <div className="empty-queue">
                        <div>
                          <CheckCircle2 className="rot-slow" size={36} strokeWidth={1.5} color="var(--success)" />
                          <div style={{ marginTop: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 20 }}>All protected</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {view === 'approval' && (
              <section>
                <div style={{ textAlign: 'center', marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={28} strokeWidth={1.5} color="var(--accent)" />
                  <h2 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 32, color: 'var(--accent)' }}>APPROVAL GUARD</h2>
                </div>

                <div className="analysis-shell">
                  <div className="label">Target Address</div>
                  <input className="input mono" value={target} onChange={(event) => setTarget(event.target.value)} />
                  <div style={{ marginTop: 6, color: 'var(--text-subtle)', fontSize: 11 }}>Resolving...</div>

                  <div className="label" style={{ marginTop: 12 }}>Transaction Kind</div>
                  <div className="kind-row">
                    {(['APPROVAL', 'LEND', 'OTHER'] as const).map((k) => (
                      <button key={k} className={`kind-pill ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>{k}</button>
                    ))}
                  </div>

                  <div className="label" style={{ marginTop: 12 }}>Calldata</div>
                  <textarea className="textarea mono" rows={4} value={calldata} onChange={(event) => setCalldata(event.target.value)} />

                  <MagneticButton
                    className="btn-primary"
                    style={{ width: '100%', marginTop: 14 }}
                    enable={hoverCapable && !mobile && !reduced}
                    onClick={analyzeApproval}
                  >
                    ANALYZE
                  </MagneticButton>
                </div>

                <div className="expand-wrap" style={{ maxHeight: analyzing || analyzed ? 800 : 0, marginTop: 14 }}>
                  <div className="analysis-shell" style={{ marginTop: 14 }}>
                    {analyzing && (
                      <div>
                        <div className="risk-track"><div className="risk-fill" style={{ width: '100%', background: 'var(--accent)' }} /></div>
                        <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>Running multi-agent analysis...</div>
                      </div>
                    )}

                    {analyzed && (
                      <>
                        <div className="risk-track"><div className="risk-fill" style={{ width: '100%', background: consensus === 'BLOCKED' ? 'var(--danger)' : consensus === 'REVIEW' ? 'var(--warning)' : 'var(--success)' }} /></div>

                        <div className="timeline">
                          {[
                            { icon: ShieldAlert, name: 'Sentinel' },
                            { icon: AlertTriangle, name: 'Scam Detector' },
                            { icon: Activity, name: 'Liquidation Predictor' },
                          ].flatMap((n, i) => {
                            const Icon = n.icon;
                            const done = step > i;
                            const lineDone = step > i + 1;
                            const out: React.ReactNode[] = [
                              <div key={`${n.name}-n`} className="tl-node">
                                <div className={`tl-circle ${done ? 'done' : ''}`}>
                                  <Icon size={18} strokeWidth={1.5} color={done ? 'var(--accent)' : 'var(--text-subtle)'} />
                                </div>
                                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{n.name}</div>
                              </div>,
                            ];
                            if (i < 2) out.push(<div key={`${n.name}-l`} className={`tl-line ${lineDone ? 'done' : ''}`}><span /></div>);
                            return out;
                          })}
                        </div>

                        <div className="consensus-word" style={{ color: consensus === 'BLOCKED' ? 'var(--danger)' : consensus === 'REVIEW' ? 'var(--warning)' : 'var(--success)' }}>
                          {consensusText}
                        </div>
                        <p style={{ marginTop: 0, textAlign: 'center', color: 'var(--text-muted)' }}>
                          {consensus === 'BLOCKED'
                            ? 'Approval Guard proposes BLOCK and REVOKE intent.'
                            : consensus === 'REVIEW'
                              ? 'Policy conflict detected. Human review required.'
                              : 'No high-risk patterns detected. Safe to execute.'}
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <MagneticButton className="btn-primary" enable={hoverCapable && !mobile && !reduced} style={{ height: 44 }}>
                            <Play size={16} strokeWidth={1.5} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />Sign & Execute
                          </MagneticButton>
                          <button className="btn-ghost">Dismiss</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {view === 'governance' && (
              <section>
                <div className="hud-card" style={{ borderRadius: 16 }}>
                  <input className="input" placeholder="Search proposals" value={proposalQuery} onChange={(event) => setProposalQuery(event.target.value)} style={{ height: 52, borderRadius: 16 }} />
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['all', 'active', 'vetoed', 'voted'] as const).map((tab) => (
                      <button key={tab} className={`kind-pill ${proposalTab === tab ? 'active' : ''}`} onClick={() => setProposalTab(tab)}>
                        {tab.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
                  {proposals.map((proposal, idx) => (
                    <Reveal key={proposal.id} index={idx}>
                      <ProposalCard
                        proposal={proposal}
                        open={proposalOpen === proposal.id}
                        onToggle={() => setProposalOpen((prev) => (prev === proposal.id ? '' : proposal.id))}
                        reduced={reduced}
                        enableMagnetic={hoverCapable && !mobile && !reduced}
                        mobile={mobile}
                      />
                    </Reveal>
                  ))}
                </div>
              </section>
            )}

            {view === 'liquidation' && (
              <section>
                <div className="hud-card">
                  <div className="gauge-row">
                    <div style={{ textAlign: 'center' }} onMouseEnter={() => setStatKey((prev) => ({ ...prev, hf: prev.hf + 1 }))}>
                      <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
                        <circle cx="100" cy="100" r="88" fill="none" stroke="var(--surface-3)" strokeWidth="8" />
                        <circle
                          cx="100"
                          cy="100"
                          r="88"
                          fill="none"
                          stroke={1.42 < 1.2 ? 'var(--danger)' : 1.42 < 1.5 ? 'var(--warning)' : 'var(--success)'}
                          strokeWidth="8"
                          strokeDasharray={553}
                          strokeDashoffset={553 * (1 - 1.42 / 3)}
                          strokeLinecap="round"
                          transform="rotate(-90 100 100)"
                          style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
                        />
                        <text x="100" y="104" textAnchor="middle" className="mono" style={{ fill: 'var(--text)', fontSize: 36, fontWeight: 500 }}>{hf}</text>
                      </svg>
                      <div className="label">HEALTH FACTOR</div>
                    </div>
                    <div className="divider-v" />
                    <div onMouseEnter={() => setStatKey((prev) => ({ ...prev, cr: prev.cr + 1 }))}>
                      <div className="label">COLLATERAL RATIO</div>
                      <div className="mono" style={{ fontSize: 36, fontWeight: 500, marginTop: 10 }}>{cr}</div>
                    </div>
                    <div className="divider-v" />
                    <div onMouseEnter={() => setStatKey((prev) => ({ ...prev, lp: prev.lp + 1 }))}>
                      <div className="label">LIQUIDATION PRICE</div>
                      <div className="mono" style={{ fontSize: 36, fontWeight: 500, marginTop: 10 }}>{lp}</div>
                      <div style={{ color: 'var(--text-subtle)', fontSize: 12 }}>Current: $2,340</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                  {[
                    { id: 'l1', critical: true, text: 'Aave health factor dropped to 0.98. Immediate action required.', action: 'REPAY 0.5 ETH' },
                    { id: 'l2', critical: false, text: 'Compound collateral ratio near warning threshold.', action: 'ADD_COLLATERAL 2,400 USDC' },
                    { id: 'l3', critical: false, text: 'MakerDAO vault stable; monitor liquidation distance.', action: 'MONITOR' },
                  ].map((alert) => (
                    <div key={alert.id} className={`hud-card interactive alert-card ${alert.critical ? 'critical' : ''}`} onMouseMove={cardGlow} style={{ borderLeft: `${alert.critical ? 3 : 1}px solid ${alert.critical ? 'var(--danger)' : 'var(--border)'}`, background: alert.critical ? 'var(--danger-muted)' : undefined }}>
                      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '24px 1fr auto', alignItems: 'center', gap: 12 }}>
                        <HeartPulse size={24} strokeWidth={1.5} color={alert.critical ? 'var(--danger)' : 'var(--warning)'} />
                        <div>
                          {alert.critical && <span className="badge danger" style={{ animation: 'scan-pulse 1200ms ease-in-out infinite' }}>CRITICAL</span>}
                          <div style={{ marginTop: 6 }}>{alert.text}</div>
                          <span className="badge neutral" style={{ marginTop: 8 }}>{alert.action}</span>
                        </div>
                        <MagneticButton className="btn-primary" enable={hoverCapable && !mobile && !reduced}>Execute Protection</MagneticButton>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {view === 'stats' && (
              <section>
                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1px 1fr', gap: 20, alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                  <div onMouseEnter={() => setStatKey((prev) => ({ ...prev, d: prev.d + 1 }))}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 80, lineHeight: 1 }}>{statD}</div>
                    <div className="label">SWARM RUNS</div>
                  </div>
                  {!mobile && <div className="divider-v" style={{ height: 80 }} />}
                  <div onMouseEnter={() => setStatKey((prev) => ({ ...prev, e: prev.e + 1 }))}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 80, lineHeight: 1 }}>{statE}</div>
                    <div className="label">ACTIONS PROPOSED</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
                  {['Sentinel', 'Scam Detector', 'Liquidation Predictor'].map((name) => (
                    <div key={name} className="hud-card interactive" onMouseMove={cardGlow}>
                      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 18 }}>{name}</div>
                      <div style={{ height: 150, marginTop: 8 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={areaData}>
                            <defs>
                              <linearGradient id={`grad-${name}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="t" axisLine={{ stroke: 'var(--border)' }} tickLine={false} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)' }} />
                            <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#grad-${name})`} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hud-card" style={{ marginTop: 14 }}>
                  {[{
                    id: 's1',
                    block: '24681359',
                    hash: '0x3a8f92b4e1d0c6f8a2b5e9d3c7f1a4b8e2d6c0f9',
                    kind: 'APPROVAL',
                    outcome: 'BLOCK',
                    time: '8 min ago',
                    details: 'Sentinel and Scam Detector reached block consensus with 0.94 confidence.',
                  }, {
                    id: 's2',
                    block: '24681211',
                    hash: '0x6d2ca2b7f1806c4eea5603f5a1c7734b0c2e3a1fbc8398e70a46f2a0c2de7130',
                    kind: 'GOV_VOTE',
                    outcome: 'VETO',
                    time: '37 min ago',
                    details: 'Human veto executed before countdown close due to treasury risk drift.',
                  }].map((row) => (
                    <StatsRow key={row.id} row={row} onCopy={copy} copied={copied === row.id} />
                  ))}
                </div>
              </section>
            )}
            {view === 'spatial' && (
              <section className="space-y-6">
                {/* Header */}
                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-transparent to-cyan-500/15 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/80">Blockade Labs × AgentSafe</p>
                  <h2 className="mt-2 text-3xl font-semibold text-white">Spatial Atlas</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300">
                    360° spatial environments for governance proposals and the agent&apos;s own creative evolution.
                    Each environment maps domains to spatial zones with multi-agent markers.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <AtlasStat label="Governance Spaces" value={spacesLoading ? '…' : String(spaces.length)} />
                    <AtlasStat label="Complete" value={spacesLoading ? '…' : String(spaces.filter(s => s.status === 'complete').length)} />
                    <AtlasStat label="App Scenes" value={atlasLoading ? '…' : String(atlas.length)} />
                    <AtlasStat label="Apps Complete" value={atlasLoading ? '…' : String(atlas.filter(a => a.status_spatial === 'complete').length)} />
                  </div>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  <button
                    onClick={() => setSpatialTab('governance')}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                      spatialTab === 'governance'
                        ? 'bg-violet-500/20 text-violet-200 border border-violet-400/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Governance Proposals
                  </button>
                  <button
                    onClick={() => setSpatialTab('evolution')}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                      spatialTab === 'evolution'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    App Evolution Atlas
                  </button>
                </div>

                {/* ── GOVERNANCE TAB ── */}
                {spatialTab === 'governance' && (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200">
                          <option value="all">All Severities</option>
                          <option value="high">High</option>
                          <option value="med">Medium</option>
                          <option value="low">Low</option>
                        </select>
                        <select value={recFilter} onChange={(e) => setRecFilter(e.target.value as typeof recFilter)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200">
                          <option value="all">All Recommendations</option>
                          <option value="FOR">FOR</option>
                          <option value="AGAINST">AGAINST</option>
                          <option value="ABSTAIN">ABSTAIN</option>
                        </select>
                        <button onClick={loadGovernanceSpaces} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white">Refresh</button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Showing {spatialFiltered.length} of {spaces.length} environments</p>
                    </div>
                    {spacesError && (
                      <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-rose-200">
                        {spacesError}
                        <button onClick={loadGovernanceSpaces} className="ml-3 underline hover:text-white">Retry</button>
                      </div>
                    )}
                    {spacesLoading && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300 animate-pulse">Loading spatial environments…</div>}
                    {!spacesLoading && spatialFiltered.length === 0 && !spacesError && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">No spatial environments yet. Generate one from the Governance view.</div>
                    )}
                    {!spacesLoading && spatialFiltered.length > 0 && (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {spatialFiltered.map((space) => (
                          <SpaceCard key={space.proposalId} space={space} recColor={spatialRecColor} recBg={spatialRecBg} sevBadge={spatialSevBadge} maxSeverity={spatialMaxSeverity} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ── EVOLUTION TAB ── */}
                {spatialTab === 'evolution' && (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                      <p className="text-sm text-slate-300">Every Base mini-app the agent has deployed — visualised as a Blockade Labs 360° environment.</p>
                      <div className="ml-4 shrink-0 flex gap-2">
                        <button onClick={handleSeedTest} className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/20 font-medium">
                          ⚡ Seed Test App
                        </button>
                        <button onClick={loadEvolutionAtlas} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white">Refresh</button>
                      </div>
                    </div>
                    {seedStatus && (
                      <div className={`rounded-xl border px-4 py-2 text-sm ${
                        seedStatus.startsWith('✓') ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                        : seedStatus.startsWith('✗') ? 'border-red-400/30 bg-red-500/10 text-rose-200'
                        : 'border-amber-400/30 bg-amber-500/10 text-amber-200 animate-pulse'
                      }`}>
                        {seedStatus}
                      </div>
                    )}
                    {atlasError && (
                      <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-rose-200">
                        {atlasError}
                        <button onClick={loadEvolutionAtlas} className="ml-3 underline hover:text-white">Retry</button>
                      </div>
                    )}
                    {atlasLoading && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300 animate-pulse">Loading evolution atlas…</div>}
                    {!atlasLoading && atlas.length === 0 && !atlasError && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">No app scenes yet. Deploy an app — a 360° scene will be auto-generated.</div>
                    )}
                    {!atlasLoading && atlas.length > 0 && (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {atlas.map((mem) => (
                          <AppSceneCard key={mem.appId} mem={mem} sevBadge={spatialSevBadge} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </main>
        )}

        {connected && (
          <>
            <div className="bubble-nav" ref={navRef}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.key;
                const hovered = navHover === item.key;
                return (
                  <button
                    key={item.key}
                    ref={(el) => {
                      navButtons.current[item.key] = el;
                    }}
                    className={`bubble-btn ${active ? 'active' : ''}`}
                    onMouseEnter={() => setNavHover(item.key)}
                    onMouseLeave={() => setNavHover('')}
                    onClick={() => setView(item.key as View)}
                  >
                    <Icon size={20} strokeWidth={1.5} />
                    <span className="bubble-label">{active || hovered ? item.label : ''}</span>
                  </button>
                );
              })}
              <span className="nav-indicator" style={{ left: indicatorX }} />
            </div>

            <div className="swarm-bubble" ref={bubbleRef}>
              <button className="swarm-btn" onClick={() => setBubbleOpen((prev) => !prev)}>
                <span className="pulse-ring">
                  <span className="dot" />
                  <span className="ring" />
                  <span className="ring b" />
                </span>
                <Bot size={20} strokeWidth={1.5} />
                <span className="swarm-btn-label">3 Agents Active</span>
              </button>

              {bubbleOpen && (
                <div className="swarm-panel">
                  {[
                    { icon: ShieldAlert, text: 'Sentinel blocked dangerous approval intent', time: '2 min ago' },
                    { icon: Vote, text: 'Governance Safe scored proposal risk at 67', time: '14 min ago' },
                    { icon: Activity, text: 'Liquidation Predictor queued repay 0.847 ETH', time: '1h 23m ago' },
                  ].map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <div key={entry.text} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, marginBottom: 10 }}>
                        <Icon size={16} strokeWidth={1.5} color="var(--accent)" />
                        <div>
                          <div style={{ fontSize: 13 }}>{entry.text}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{entry.time}</div>
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn-ghost" onClick={() => setView('dashboard')} style={{ width: '100%' }}>
                    View All Activity
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Spatial Atlas pure helpers ────────────────────────

function spatialSevBadge(sev: string): string {
  if (sev === 'high') return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
  if (sev === 'med') return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
}
function spatialMaxSeverity(mem: SpatialMemory): 'low' | 'med' | 'high' {
  if (mem.agentMarkers.some((m: AgentMarker) => m.severity === 'high')) return 'high';
  if (mem.agentMarkers.some((m: AgentMarker) => m.severity === 'med')) return 'med';
  return 'low';
}
function spatialRecColor(rec: string): string {
  if (rec === 'FOR') return 'text-emerald-300';
  if (rec === 'AGAINST') return 'text-rose-300';
  return 'text-amber-300';
}
function spatialRecBg(rec: string): string {
  if (rec === 'FOR') return 'border-emerald-400/30 bg-emerald-400/10';
  if (rec === 'AGAINST') return 'border-rose-400/30 bg-rose-400/10';
  return 'border-amber-400/30 bg-amber-400/10';
}

// ─── AtlasStat ───────────────────────────────────────────
function AtlasStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

// ─── SpaceCard ───────────────────────────────────────────
function SpaceCard({ space, recColor, recBg, sevBadge, maxSeverity }: {
  space: SpatialMemory;
  recColor: (r: string) => string;
  recBg: (r: string) => string;
  sevBadge: (s: string) => string;
  maxSeverity: (m: SpatialMemory) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (space.status === 'processing' || space.status === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 animate-pulse">
        <p className="text-xs uppercase tracking-wide text-amber-300">Processing…</p>
        <p className="mt-1 text-sm text-slate-300 font-mono truncate">{space.proposalId.slice(0, 16)}…</p>
      </div>
    );
  }
  if (space.status === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-xs uppercase tracking-wide text-rose-300">Generation Failed</p>
        <p className="mt-1 text-sm text-slate-300 font-mono truncate">{space.proposalId.slice(0, 16)}…</p>
        {space.errorMessage && <p className="mt-1 text-xs text-rose-400">{space.errorMessage}</p>}
      </div>
    );
  }
  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition hover:border-white/25 hover:bg-white/[0.05]">
      {space.thumbUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-black/50">
          <img src={space.thumbUrl} alt={space.proposalId.slice(0, 12)} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${recBg(space.voteRecommendation)} ${recColor(space.voteRecommendation)}`}>{space.voteRecommendation}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${sevBadge(maxSeverity(space))}`}>{maxSeverity(space).toUpperCase()}</span>
          </div>
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-slate-400 font-mono truncate">{space.proposalId.slice(0, 24)}…</p>
          <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">Scene: {space.sceneHash.slice(0, 18)}…</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Confidence:</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-300" style={{ width: `${space.confidence}%` }} />
          </div>
          <span className="text-xs text-slate-300">{space.confidence}%</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {space.agentMarkers.map((m: AgentMarker, i: number) => (
            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] border ${sevBadge(m.severity)}`} title={`${m.agentName} in ${m.zone}: ${m.rationale}`}>{m.agentName}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {space.detectedZones.map((z: DetectedZone, i: number) => (
            <span key={i} className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-300" title={z.meaning}>{z.zone}</span>
          ))}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-cyan-300 hover:text-cyan-200 transition">{expanded ? 'Hide Details' : 'Show Details'}</button>
        {expanded && (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs text-slate-300 italic">{space.spatialSummary}</p>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Agent Markers</p>
              {space.agentMarkers.map((m: AgentMarker, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs mb-1">
                  <span className={`shrink-0 rounded px-1 py-0.5 border ${sevBadge(m.severity)}`}>{m.severity.toUpperCase()}</span>
                  <span className="text-slate-300"><strong>{m.agentName}</strong> @ {m.zone} — {m.rationale}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Detected Zones</p>
              {space.detectedZones.map((z: DetectedZone, i: number) => (
                <div key={i} className="text-xs text-slate-300 mb-1"><strong>{z.zone}</strong> ({z.riskDomain}) — {z.meaning}</div>
              ))}
            </div>
            {space.fileUrl && (
              <a href={space.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-violet-400/35 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20">Enter Proposal Space ↗</a>
            )}
            <div className="text-[10px] text-slate-500 flex gap-3">
              <span>Created: {new Date(space.createdAt).toLocaleString()}</span>
              <span>Visited: {new Date(space.visitedAt).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── AppSceneCard ────────────────────────────────────────
function AppSceneCard({ mem, sevBadge }: { mem: AppSpatialMemory; sevBadge: (s: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const maxSev = mem.agentMarkers.some((m: AppSpatialMarker) => m.severity === 'high') ? 'high'
    : mem.agentMarkers.some((m: AppSpatialMarker) => m.severity === 'med') ? 'med' : 'low';
  const statusColor = mem.status === 'SUPPORTED' || mem.status === 'HANDED_TO_USER'
    ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
    : mem.status === 'DROPPED' ? 'text-rose-300 border-rose-400/30 bg-rose-400/10'
    : 'text-amber-300 border-amber-400/30 bg-amber-400/10';
  if (mem.status_spatial === 'processing' || mem.status_spatial === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 animate-pulse">
        <p className="text-xs uppercase tracking-wide text-amber-300">Generating Scene…</p>
        <p className="mt-1 text-sm text-slate-300 truncate">{mem.title || mem.appId.slice(0, 20)}</p>
      </div>
    );
  }
  if (mem.status_spatial === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-xs uppercase tracking-wide text-rose-300">Scene Failed</p>
        <p className="mt-1 text-sm text-slate-300 truncate">{mem.title || mem.appId.slice(0, 20)}</p>
        {mem.errorMessage && <p className="mt-1 text-xs text-rose-400">{mem.errorMessage}</p>}
      </div>
    );
  }
  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition hover:border-white/25 hover:bg-white/[0.05]">
      {mem.thumbUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-black/50">
          <img src={mem.thumbUrl} alt={mem.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusColor}`}>{mem.status}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${sevBadge(maxSev)}`}>{maxSev.toUpperCase()}</span>
          </div>
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-white truncate">{mem.title || mem.appId.slice(0, 20)}</p>
          <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">Scene: {mem.sceneHash.slice(0, 18)}…</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {mem.trendTags.slice(0, 5).map((t, i) => (
            <span key={i} className="rounded border border-cyan-400/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">{t}</span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          {([{ label: 'Users', val: String(mem.metrics.users) }, { label: 'Revenue', val: `$${mem.metrics.revenueUsd}` }, { label: 'Impressions', val: String(mem.metrics.impressions) }]).map(({ label, val }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {mem.agentMarkers.map((m: AppSpatialMarker, i: number) => (
            <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] border ${sevBadge(m.severity)}`} title={`${m.agentName} @ ${m.zone}: ${m.rationale}`}>{m.agentName}</span>
          ))}
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-cyan-300 hover:text-cyan-200 transition">{expanded ? 'Hide Details' : 'Show Details'}</button>
        {expanded && (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs text-slate-300 italic">{mem.spatialSummary}</p>
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2">
              <p className="text-[10px] uppercase tracking-wide text-cyan-400 mb-1">Evolution Note</p>
              <p className="text-xs text-cyan-200">{mem.evolutionNote}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Spatial Zones</p>
              {mem.detectedZones.map((z: AppSpatialZone, i: number) => (
                <div key={i} className="text-xs text-slate-300 mb-1"><strong>{z.zone}</strong> ({z.domain}) — {z.meaning}</div>
              ))}
            </div>
            {mem.fileUrl && (
              <a href={mem.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20">Enter App Space ↗</a>
            )}
            <p className="text-[10px] text-slate-500">Created: {new Date(mem.createdAt).toLocaleString()}</p>
          </div>
        )}
      </div>
    </article>
  );
}

function StatsRow({
  row,
  copied,
  onCopy,
}: {
  row: { id: string; block: string; hash: string; kind: string; outcome: string; time: string; details: string };
  copied: boolean;
  onCopy: (v: string, k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="table-row">
      <button style={{ width: '100%', border: 0, background: 'transparent', color: 'inherit', padding: 0 }} onClick={() => setOpen((v) => !v)}>
        <div className="table-main">
          <span className="mono">{row.block}</span>
          <span className="chip-wallet" style={{ width: '100%', justifyContent: 'space-between' }} onClick={(e) => { e.stopPropagation(); onCopy(row.hash, row.id); }}>
            <span>{`${row.hash.slice(0, 12)}...${row.hash.slice(-6)}`}</span>
            {copied ? <CheckCircle2 size={14} strokeWidth={1.5} color="var(--success)" /> : <Copy size={14} strokeWidth={1.5} />}
          </span>
          <span className="mono">{row.kind}</span>
          <span className={`badge ${row.outcome === 'BLOCK' ? 'danger' : row.outcome === 'VETO' ? 'warning' : 'success'}`}>{row.outcome}</span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>{row.time}</span>
        </div>
      </button>
      <div className="table-expand" style={{ maxHeight: open ? 72 : 0 }}>
        <div style={{ paddingTop: 8 }}>{row.details}</div>
      </div>
    </div>
  );
}
