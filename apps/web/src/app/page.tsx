'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSpatialAtlas, getAppEvolutionAtlas, seedTestApp } from '@/services/backendClient';
import type { AppSpatialMemory, AppSpatialMarker, AppSpatialZone } from '@/services/backendClient';
import type { SpatialMemory, AgentMarker, DetectedZone } from '@agent-safe/shared';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  DollarSign,
  Download,
  Eye,
  FlaskConical,
  Gauge,
  Globe,
  HandCoins,
  Lightbulb,
  Loader2,
  LogOut,
  Moon,
  Radio,
  Rocket,
  Rss,
  ScanLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  Vault,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google';
import { createConfig, WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { http } from 'viem';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Highlight, themes } from 'prism-react-renderer';

const syne = Syne({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-syne' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jet' });

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'AgentSafe' }),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id' }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const SCRAMBLE_CHARS = '0123456789ABCDEF@#$%';

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
type Tab = 'agent' | 'stats' | 'settings';
type Verdict = 'DEPLOYED' | 'BLOCKED' | 'REJECTED' | null;
type ToastTone = 'accent' | 'pass' | 'block' | 'warning';

type Toast = {
  id: string;
  text: string;
  tone: ToastTone;
  ttl: number;
  persistent?: boolean;
};

type BudgetData = {
  treasuryUsd?: number;
  dailyBurnUsd?: number;
  perAppCapUsd?: number;
  totalSpentUsd?: number;
  runwayDays?: number;
};

type AppRow = {
  id?: string;
  ideaId?: string;
  status?: string;
  templateId?: string;
  title?: string;
  idea?: {
    title?: string;
    description?: string;
    templateId?: string;
  };
  metrics?: {
    users?: number;
    revenueUsd?: number;
    impressions?: number;
    revenue?: number;
  };
  deployedAt?: string;
};

type RunResponse = {
  appId?: string;
  status?: 'DEPLOYED' | 'BUDGET_BLOCKED' | 'REJECTED' | string;
  idea?: {
    title?: string;
    description?: string;
    templateId?: string;
    capabilities?: string[];
  };
  budgetRemaining?: number;
  pipelineLogs?: string[];
};

type PipelineResponse = {
  success?: boolean;
  verdict?: 'PASS' | 'BLOCK' | string;
  idea?: {
    title?: string;
    description?: string;
    templateId?: string;
    capabilities?: string[];
  };
  safety?: {
    verdict?: 'PASS' | 'BLOCK' | string;
    riskScore?: number;
    reason?: string;
  };
  deployAllowed?: boolean;
  error?: string;
  generatedDapp?: {
    frontendLength?: number;
    smartContractLength?: number;
    structureNote?: string;
    name?: string;
  };
};

type CycleEntry = {
  id: string;
  timestamp: string;
  intent: string;
  status: 'DEPLOYED' | 'BLOCKED' | 'REJECTED';
  risk: number;
  budgetUsed: number;
  title: string;
  reason?: string;
  logs: string[];
  description?: string;
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
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const payload = await res.text().catch(() => '');
    throw new Error(payload || `${res.status}`);
  }
  return res.json();
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = () => setMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function useScramble(target: string, duration: number, trigger: number) {
  const [text, setText] = useState(target);
  useEffect(() => {
    if (!target) {
      setText('');
      return;
    }
    const total = Math.max(1, Math.floor(duration / 30));
    const step = target.length / total;
    let progress = 0;
    const id = window.setInterval(() => {
      setText(
        target
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < progress) return target[index];
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join(''),
      );
      progress += step;
      if (progress >= target.length) {
        window.clearInterval(id);
        setText(target);
      }
    }, 30);
    return () => window.clearInterval(id);
  }, [target, duration, trigger]);
  return text;
}

function useCountUp(target: number, duration: number, trigger: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setValue(from + (target - from) * eased);
      if (ratio < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, trigger]);
  return value;
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function LandingBarsCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const mouse = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let frame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    const loop = (t: number) => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = 3;
      const gap = 2;
      const count = Math.ceil(canvas.width / (barWidth + gap));
      for (let i = 0; i < count; i += 1) {
        const x = i * (barWidth + gap);
        const baseHeight =
          20 +
          Math.sin(i * 0.15 + t * 0.0008) * 15 +
          Math.sin(i * 0.042 + t * 0.0005) * 35 +
          Math.sin(i * 0.38) * 10;

        const dx = x - mouse.current.x;
        const dy = canvas.height - mouse.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const bloom = Math.max(0, (220 - dist) / 220) * 90;
        const finalHeight = Math.max(4, baseHeight + bloom);

        const near180 = dist < 180;
        const near80 = dist < 80;

        let color = 'rgba(255,255,255,0.055)';
        if (document.documentElement.getAttribute('data-theme') === 'light') {
          color = 'rgba(0,0,0,0.055)';
        }
        if (near180) color = 'rgba(255,109,0,0.22)';
        if (near80) color = 'rgba(255,109,0,0.42)';

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
        ctx.fillStyle = color;
        ctx.fillRect(x, canvas.height - finalHeight, barWidth, finalHeight);
      }

      if (frame % 2 === 0) {
        const grid = 4;
        for (let y = 0; y < canvas.height; y += grid) {
          for (let x = 0; x < canvas.width; x += grid) {
            const dx = x - mouse.current.x;
            const dy = y - mouse.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let opacity = 0.007;
            if (dist < 200) opacity += (1 - dist / 200) * 0.022;
            ctx.fillStyle = dist < 200 ? `rgba(255,109,0,${opacity})` : `rgba(255,255,255,${opacity})`;
            if (document.documentElement.getAttribute('data-theme') === 'light' && dist >= 200) {
              ctx.fillStyle = `rgba(0,0,0,${opacity})`;
            }
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, [active]);

  return <canvas ref={ref} className="bars-canvas" aria-hidden />;
}

type CurvePoint = { x: number; y: number; phase: number };
type Curve = { p0: CurvePoint; p1: CurvePoint; c0: CurvePoint; c1: CurvePoint; highlight: boolean };

function FlowLinesCanvas({ active, runPulse }: { active: boolean; runPulse: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const mouse = useRef({ x: -1000, y: -1000 });
  const curves = useRef<Curve[]>([]);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const curveCount = window.innerWidth < 768 ? 6 : 12;
    const arr: Curve[] = [];
    for (let i = 0; i < curveCount; i += 1) {
      arr.push({
        p0: { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, phase: Math.random() * Math.PI * 2 },
        p1: { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, phase: Math.random() * Math.PI * 2 },
        c0: { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, phase: Math.random() * Math.PI * 2 },
        c1: { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, phase: Math.random() * Math.PI * 2 },
        highlight: i < 2,
      });
    }
    curves.current = arr;

    let raf = 0;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    const started = performance.now();

    const loop = (t: number) => {
      const pulseElapsed = t - started;
      const pulseRaw = runPulse > 0 ? Math.max(0, 1 - Math.max(0, pulseElapsed - 2000) / 3000) : 0;
      const boost = runPulse > 0 ? 1 + pulseRaw * 1.2 : 1;
      const speed = runPulse > 0 && pulseElapsed < 2000 ? 1.5 : 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      curves.current.forEach((curve) => {
        [curve.p0, curve.p1, curve.c0, curve.c1].forEach((p) => {
          p.x += Math.sin(t * 0.00018 * speed + p.phase) * 0.4;
          p.y += Math.cos(t * 0.00022 * speed + p.phase) * 0.3;
        });

        [curve.c0, curve.c1].forEach((cp) => {
          const dx = mouse.current.x - cp.x;
          const dy = mouse.current.y - cp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            cp.x += dx * 0.008;
            cp.y += dy * 0.008;
          }
        });

        const baseOpacity = curve.highlight ? 0.055 : 0.028;
        const lightFactor = document.documentElement.getAttribute('data-theme') === 'light' ? 0.5 : 1;
        ctx.strokeStyle = `rgba(255,109,0,${baseOpacity * boost * lightFactor})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(curve.p0.x, curve.p0.y);
        ctx.bezierCurveTo(curve.c0.x, curve.c0.y, curve.c1.x, curve.c1.y, curve.p1.x, curve.p1.y);
        ctx.stroke();
      });

      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, [active, runPulse]);

  return <canvas ref={ref} className="flow-canvas" aria-hidden />;
}

function SparkBurst({ x, y, tone = 'accent' }: { x: number; y: number; tone?: 'accent' | 'pass' }) {
  return (
    <div className="spark-burst" style={{ left: x, top: y }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className={classNames('spark', tone === 'pass' && 'spark-pass')} style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  );
}

function AppShellInternal() {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState<Theme>('dark');
  const [demoMode, setDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [visionText, setVisionText] = useState('');
  const [showConnectors, setShowConnectors] = useState(false);
  const [connectorError, setConnectorError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runPulse, setRunPulse] = useState(0);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [outputVisible, setOutputVisible] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [pipelineStates, setPipelineStates] = useState<Array<'pending' | 'active' | 'complete' | 'failed'>>(['pending', 'pending', 'pending', 'pending', 'pending']);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [cycleLog, setCycleLog] = useState<CycleEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [focusVision, setFocusVision] = useState(false);
  const [prox, setProx] = useState(0);
  const [healthBannerDismissed, setHealthBannerDismissed] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [sparks, setSparks] = useState<Array<{ id: string; x: number; y: number; tone?: 'accent' | 'pass' }>>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [runTrigger, setRunTrigger] = useState(0);
  const [wordmarkTrigger, setWordmarkTrigger] = useState(1);

  const [pipelineResult, setPipelineResult] = useState<PipelineResponse | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);

  const INDUSTRY_OPTIONS = ['DeFi', 'NFT', 'Gaming', 'Social', 'DAO / Governance', 'Infrastructure', 'RWA', 'Payments', 'Identity', 'Analytics'];
  const [interestedIndustries, setInterestedIndustries] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const s = window.localStorage.getItem('agentsafe-interested-industries');
      if (s) return JSON.parse(s) as string[];
    } catch {}
    return [];
  });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const runInterval = useRef<number | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const qc = useQueryClient();

  const walletAddress = demoMode ? '0x0000000000000000000000000000000000000001' : address || '';
  const onApp = Boolean(walletAddress) && (isConnected || demoMode);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: string }>('/health'),
    refetchInterval: 30_000,
  });

  const budgetQuery = useQuery({
    queryKey: ['budget', walletAddress],
    queryFn: () => api<BudgetData>('/api/app-agent/budget'),
    enabled: Boolean(walletAddress),
  });

  const appsQuery = useQuery({
    queryKey: ['apps', walletAddress],
    queryFn: () => api<{ apps: AppRow[] }>('/api/app-agent/apps'),
    enabled: Boolean(walletAddress),
    refetchInterval: 15_000,
  });

  const addToast = useCallback((text: string, tone: ToastTone, ttl = 3500, persistent = false) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, tone, ttl, persistent }]);
    if (!persistent) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('agentsafe-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('agentsafe-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('agentsafe-interested-industries', JSON.stringify(interestedIndustries));
    } catch {}
  }, [interestedIndustries]);

  const toggleIndustry = (industry: string) => {
    setInterestedIndustries((prev) =>
      prev.includes(industry) ? prev.filter((i) => i !== industry) : [...prev, industry],
    );
  };

  useEffect(() => {
    if (isConnected && address) {
      api('/api/app-agent/init', {
        method: 'POST',
        body: JSON.stringify({ walletAddress: address }),
      }).catch(() => {});
      addToast('Wallet connected', 'pass', 2500);
      setShowConnectors(false);
    }
  }, [isConnected, address, addToast]);

  useEffect(() => {
    if (!isConnected && !demoMode) {
      setVisionText('');
      setCycleLog([]);
      setOutputVisible(false);
      setPipelineVisible(false);
    }
  }, [isConnected, demoMode]);

  useEffect(() => {
    if (demoMode) {
      api('/api/app-agent/init', {
        method: 'POST',
        body: JSON.stringify({ walletAddress: '0x0000000000000000000000000000000000000001' }),
      }).catch(() => {});
      addToast('Demo mode - using test wallet', 'warning');
    }
  }, [demoMode, addToast]);

  useEffect(() => {
    if (healthQuery.isError) {
      addToast('Backend offline - start :4000', 'block', 0, true);
    }
  }, [healthQuery.isError, addToast]);

  useEffect(() => {
    return () => {
      if (runInterval.current) window.clearInterval(runInterval.current);
    };
  }, []);

  const wordmark = useScramble('AgentSafe', 1000, wordmarkTrigger);
  const resultWord = useScramble(verdict || '', 800, runTrigger);

  const countRuns = useCountUp(cycleLog.length, 700, runTrigger + cycleLog.length);
  const deployedCount = useCountUp(cycleLog.filter((c) => c.status === 'DEPLOYED').length, 700, runTrigger + 2);
  const totalBudgetUsed = cycleLog.reduce((sum, c) => sum + c.budgetUsed, 0);
  const budgetCount = useCountUp(totalBudgetUsed, 800, runTrigger + 3);

  const onThemeToggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const onDisconnect = () => {
    disconnect();
    setDemoMode(false);
    setVisionText('');
    setCycleLog([]);
    setOutputVisible(false);
    setPipelineVisible(false);
    setRunResult(null);
    setPipelineResult(null);
  };

  const onTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, 500);
    setVisionText(value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.max(160, e.target.scrollHeight)}px`;
  };

  const runMutation = useMutation({
    mutationFn: async (intent: string) => {
      const [pipeline, runCycle] = await Promise.all([
        fetch('/api/app-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIntent: intent }),
        }).then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || `${res.status}`);
          return json as PipelineResponse;
        }),
        api<RunResponse>('/api/app-agent/run-cycle', {
          method: 'POST',
          body: JSON.stringify({ walletAddress, intent }),
        }),
      ]);
      return { pipeline, runCycle };
    },
    onError: (err: Error) => {
      addToast(`/api/app-agent failed: ${err.message}`, 'block', 5000);
      setIsRunning(false);
      if (runInterval.current) window.clearInterval(runInterval.current);
    },
    onSuccess: ({ pipeline, runCycle }) => {
      setPipelineResult(pipeline);
      setRunResult(runCycle);

      const status = runCycle.status;
      const nextStates: Array<'pending' | 'active' | 'complete' | 'failed'> = ['complete', 'complete', 'complete', 'complete', 'complete'];
      let finalVerdict: Verdict = 'DEPLOYED';
      if (status === 'BUDGET_BLOCKED') {
        nextStates[3] = 'failed';
        nextStates[4] = 'pending';
        finalVerdict = 'BLOCKED';
      }
      if (status === 'REJECTED') {
        nextStates[2] = 'failed';
        nextStates[3] = 'pending';
        nextStates[4] = 'pending';
        finalVerdict = 'REJECTED';
      }

      setPipelineStates(nextStates);
      setPipelineStage(5);
      setVerdict(finalVerdict);
      setRunTrigger((v) => v + 1);
      setIsRunning(false);
      setOutputVisible(true);

      const safetyRisk = pipeline?.safety?.riskScore || 0;
      const budgetBefore = budgetQuery.data?.treasuryUsd || 0;
      const budgetAfter = runCycle.budgetRemaining || budgetBefore;
      const budgetUsed = Math.max(0, budgetBefore - budgetAfter);
      setPipelineLogs(runCycle.pipelineLogs || []);

      const entry: CycleEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        intent: visionText,
        status: finalVerdict,
        risk: safetyRisk,
        budgetUsed,
        title: runCycle.idea?.title || pipeline.idea?.title || 'Untitled app',
        reason: pipeline.safety?.reason,
        logs: runCycle.pipelineLogs || [],
        description: pipeline.idea?.description || runCycle.idea?.description,
      };
      setCycleLog((prev) => [entry, ...prev]);

      if (runInterval.current) {
        window.clearInterval(runInterval.current);
        runInterval.current = null;
      }

      if (pipeline.safety?.verdict === 'PASS') addToast(`Safety passed - risk ${safetyRisk}/100`, 'pass');
      if (pipeline.safety?.verdict === 'BLOCK') addToast(`Safety blocked - ${pipeline.safety?.reason || 'unknown reason'}`, 'block', 5000);
      if (finalVerdict === 'DEPLOYED') addToast('App deployed - incubating', 'pass', 5000);
      if (finalVerdict !== 'DEPLOYED') addToast(`Cycle blocked - ${pipeline.safety?.reason || finalVerdict}`, 'block', 5000);

      qc.invalidateQueries({ queryKey: ['budget', walletAddress] });
      qc.invalidateQueries({ queryKey: ['apps', walletAddress] });
    },
  });

  const startRun = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!visionText.trim() || isRunning || (!isConnected && !demoMode)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const id = `${Date.now()}`;
    setSparks((prev) => [...prev, { id, x, y, tone: 'accent' }]);
    window.setTimeout(() => setSparks((prev) => prev.filter((s) => s.id !== id)), 450);

    setRunPulse(Date.now());
    setPipelineVisible(true);
    setOutputVisible(false);
    setVerdict(null);
    setPipelineLogs([]);
    setPipelineStage(1);
    setPipelineStates(['active', 'pending', 'pending', 'pending', 'pending']);
    setIsRunning(true);

    const stageNames = ['TRENDS', 'IDEA', 'SAFETY', 'BUDGET', 'DEPLOY'];
    runInterval.current = window.setInterval(() => {
      setPipelineStage((prev) => {
        const next = Math.min(5, prev + 1);
        setPipelineStates((old) => old.map((s, i) => {
          if (i < next - 1) return 'complete';
          if (i === next - 1 && next <= 5) return 'active';
          return 'pending';
        }));
        const name = stageNames[Math.min(next - 1, stageNames.length - 1)];
        addToast(`${name}...`, 'accent', 2000);
        return next;
      });
    }, 1800);

    runMutation.mutate(visionText.trim());
  };

  const stageIcons = [Rss, Lightbulb, ScanLine, Gauge, Rocket];
  const stageNames = ['TRENDS', 'IDEA', 'SAFETY', 'BUDGET', 'DEPLOY'];

  const outputIdea = runResult?.idea || pipelineResult?.idea;
  const codeString =
    pipelineResult?.generatedDapp?.structureNote
      ? `// ${pipelineResult.generatedDapp.name || 'generated-app'}\n${pipelineResult.generatedDapp.structureNote}\n// frontend length: ${pipelineResult.generatedDapp.frontendLength || 0}\n// contract length: ${pipelineResult.generatedDapp.smartContractLength || 0}`
      : '';

  const budget = budgetQuery.data || {};
  const perCap = budget.perAppCapUsd || 1;
  const usedCycle = Math.max(0, perCap - (runResult?.budgetRemaining || perCap));
  const usedPct = Math.min(100, (usedCycle / perCap) * 100);

  const onCopyCode = async () => {
    if (!codeString) return;
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    addToast('Copied', 'accent', 2000);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const onCopyWallet = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setWalletCopied(true);
    window.setTimeout(() => setWalletCopied(false), 1500);
  };

  const handleConnector = async (connector: (typeof connectors)[number]) => {
    setConnectorError('');
    try {
      connect({ connector });
    } catch (err) {
      setConnectorError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const onPanelMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!panelRef.current || reducedMotion) return;
    const rect = panelRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const d = Math.min(x, y, rect.width - x, rect.height - y);
    const next = Math.max(0, Math.min(1, (100 - d) / 100));
    setProx(next);
  };

  const onPanelLeave = () => setProx(0);

  useEffect(() => {
    if (isMobile || reducedMotion) return;
    const magnets = Array.from(document.querySelectorAll<HTMLElement>('.magnet, .magnet-small'));
    const handleMove = (e: MouseEvent) => {
      magnets.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const small = node.classList.contains('magnet-small');
        const radius = small ? 50 : node.classList.contains('cta-btn') ? 90 : 120;
        const factor = small ? 0.2 : node.classList.contains('cta-btn') ? 0.28 : 0.25;
        if (dist <= radius) {
          node.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
        } else {
          node.style.transform = 'translate(0px, 0px)';
        }
      });
    };
    const reset = () => {
      magnets.forEach((node) => {
        node.style.transform = 'translate(0px, 0px)';
      });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseout', reset);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseout', reset);
      reset();
    };
  }, [isMobile, reducedMotion]);

  useEffect(() => {
    const glareNodes = Array.from(document.querySelectorAll<HTMLElement>('.glare, .output-card'));
    const cleanups: Array<() => void> = [];
    glareNodes.forEach((node) => {
      const onMove = (e: MouseEvent) => {
        const rect = node.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        node.style.setProperty('--gx', `${x}%`);
        node.style.setProperty('--gy', `${y}%`);
      };
      node.addEventListener('mousemove', onMove);
      cleanups.push(() => node.removeEventListener('mousemove', onMove));
    });
    return () => cleanups.forEach((fn) => fn());
  }, [outputVisible, activeTab]);

  useEffect(() => {
    if (isMobile || reducedMotion) return;
    const tiltNodes = Array.from(document.querySelectorAll<HTMLElement>('.tilt'));
    const cleanups: Array<() => void> = [];
    tiltNodes.forEach((node) => {
      const onMove = (e: MouseEvent) => {
        const rect = node.getBoundingClientRect();
        const xPct = (e.clientX - rect.left) / rect.width;
        const yPct = (e.clientY - rect.top) / rect.height;
        const rx = (0.5 - yPct) * 8;
        const ry = (xPct - 0.5) * 8;
        node.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      };
      const onLeave = () => {
        node.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg)';
      };
      node.addEventListener('mousemove', onMove);
      node.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        node.removeEventListener('mousemove', onMove);
        node.removeEventListener('mouseleave', onLeave);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [appsQuery.data?.apps?.length, isMobile, reducedMotion]);

  const passCount = cycleLog.filter((c) => c.status === 'DEPLOYED').length;
  const blockCount = cycleLog.length - passCount;
  const passPct = cycleLog.length ? (passCount / cycleLog.length) * 100 : 0;

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    cycleLog.forEach((entry) => {
      const first = entry.intent.split(':')[0].trim();
      const key = ['DeFi', 'NFT', 'Analytics', 'Social', 'Mini-game'].includes(first) ? first : 'Other';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [cycleLog]);

  const pieColors: Record<string, string> = {
    DeFi: 'var(--accent)',
    NFT: 'var(--pass)',
    Analytics: 'var(--warning)',
    Social: 'var(--social)',
    'Mini-game': 'var(--mini)',
    Other: 'var(--text-subtle)',
  };

  const startDemo = () => {
    setDemoMode(true);
    setShowConnectors(false);
  };

  const isOffline = healthQuery.isError;
  const healthState = healthQuery.data?.status === 'ok' ? 'ok' : healthQuery.data?.status === 'degraded' ? 'degraded' : 'offline';

  const runDisabled = !visionText.trim() || isRunning || (!isConnected && !demoMode);

  return (
    <div className={classNames(syne.variable, dmSans.variable, jetbrains.variable, 'app-root')}>
      {!onApp && !reducedMotion && !isMobile ? <LandingBarsCanvas active /> : null}
      {onApp && !reducedMotion ? <FlowLinesCanvas active runPulse={runPulse} /> : null}

      <header className="top-bar">
        <div className="brand-small">AgentSafe</div>
        {onApp ? (
          <div className="net-pill">
            <Globe size={12} strokeWidth={1.5} />
            <span className={classNames('live-dot', healthState === 'degraded' && 'live-dot-warning', healthState === 'offline' && 'live-dot-block')} />
            <span>Base Mainnet</span>
          </div>
        ) : null}
        <div className="top-actions">
          {onApp ? (
            demoMode ? (
              <>
                <span className="demo-badge">DEMO</span>
                {!isConnected ? (
                  <button className="ghost-btn" onClick={() => setShowConnectors((v) => !v)}>
                    Connect Wallet
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button className="wallet-chip" onClick={onCopyWallet}>
                  <span>{walletAddress ? truncateAddress(walletAddress) : 'No wallet'}</span>
                  {walletCopied ? <CheckCircle2 size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
                </button>
                <button className="icon-ghost" onClick={onDisconnect} aria-label="Disconnect">
                  <LogOut size={16} strokeWidth={1.5} />
                </button>
              </>
            )
          ) : null}
          <button className="icon-ghost" onClick={onThemeToggle} aria-label="Theme">
            {theme === 'dark' ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </header>

      {onApp && isOffline && !healthBannerDismissed ? (
        <div className="offline-banner">
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span>Backend offline - start the Express server on port 4000</span>
          <button className="icon-ghost" onClick={() => setHealthBannerDismissed(true)}>
            <XCircle size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}

      {!onApp ? (
        <>
          <main className="landing-main">
            <section className="landing-text">
              <h1 className={classNames('wordmark', wordmark === 'AgentSafe' && 'wordmark-ready')}>{wordmark}</h1>
              <h2 className="tagline split">
                <span>Autonomous apps.</span>
                <span>Built from your vision.</span>
              </h2>
              <p className="desc">Connect your wallet. Describe your idea. Watch it deploy itself on Base.</p>

              <div className="feature-pills">
                <div className="pill-row"><Sparkles size={14} strokeWidth={1.5} /><span>Trend-aware idea generation</span></div>
                <div className="pill-row"><ShieldCheck size={14} strokeWidth={1.5} /><span>Autonomous safety pipeline</span></div>
                <div className="pill-row"><Rocket size={14} strokeWidth={1.5} /><span>Deploys to Base automatically</span></div>
              </div>

              <div className="connect-wrap">
                <button className="cta-btn magnet" onClick={() => setShowConnectors((v) => !v)} disabled={isPending}>
                  {isPending ? <Loader2 className="spin" size={18} strokeWidth={1.5} /> : <Wallet size={18} strokeWidth={1.5} />}
                  <span>{isPending ? 'Connecting...' : 'Connect Wallet'}</span>
                </button>

                <div className={classNames('connector-list', showConnectors && 'connector-list-open')}>
                  {connectors.slice(0, 3).map((connector, i) => (
                    <button key={connector.uid} className="connector-item" onClick={() => handleConnector(connector)} style={{ animationDelay: `${i * 60}ms` }}>
                      <span className="connector-icon" aria-hidden>
                        {connector.name.includes('Coinbase') ? (
                          <svg className="wallet-svg coinbase" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" fill="currentColor" />
                            <path d="M15.6 9.5a4 4 0 1 0 0 5h-2.2a2 2 0 1 1 0-5h2.2Z" fill="var(--surface)" />
                          </svg>
                        ) : connector.name.includes('WalletConnect') ? (
                          <svg className="wallet-svg wc" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M7.3 9.2a6.6 6.6 0 0 1 9.4 0l.3.3.3-.3a7 7 0 0 0-10 0l.3.3Z" fill="currentColor" />
                            <path d="M9 10.9a4.2 4.2 0 0 1 6 0l.3.3.3-.3a4.6 4.6 0 0 0-6.6 0l.3.3Z" fill="currentColor" />
                            <path d="m12 13.3 1.1 1.1L12 15.5l-1.1-1.1L12 13.3Z" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg className="wallet-svg metamask" width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path d="M3 12.2 12 3l9 9.2-9 5.3-9-5.3Z" fill="currentColor" />
                            <path d="m3 13.8 9 7.2 9-7.2-9 5.3-9-5.3Z" fill="currentColor" opacity="0.82" />
                          </svg>
                        )}
                      </span>
                      <span>{connector.name.includes('Injected') ? 'MetaMask' : connector.name}</span>
                    </button>
                  ))}
                  {connectorError ? <div className="connector-error">{connectorError}</div> : null}
                </div>

                <button className="demo-link" onClick={startDemo}>
                  Try Demo <ArrowRight size={12} strokeWidth={1.5} />
                </button>
              </div>
            </section>
          </main>

          <footer className="landing-bottom">
            <div className="subtle-line"><span className="base-box" />Built on Base</div>
            <div className="subtle-line">Powered by Claude + Uniswap</div>
          </footer>
        </>
      ) : (
        <main className="app-main">
          {activeTab === 'agent' ? (
            <section className="agent-col">
              <div className="center-head">
                <h2 className={classNames('vision-title', focusVision && 'vision-title-blur')}>What outcome do you want to see?</h2>
                <p>Describe the app you want to exist in the world.</p>
              </div>

              <div
                ref={panelRef}
                className="panel vision-panel"
                onMouseMove={onPanelMove}
                onMouseLeave={onPanelLeave}
                style={{ '--prox': prox } as React.CSSProperties}
              >
                <textarea
                  ref={textareaRef}
                  className="vision-input"
                  value={visionText}
                  onChange={onTextareaInput}
                  onFocus={() => setFocusVision(true)}
                  onBlur={() => setFocusVision(false)}
                  placeholder="xyz"
                />

                <div className={classNames('char-count', visionText.length > 490 && 'char-danger', visionText.length > 400 && visionText.length <= 490 && 'char-warning')}>
                  {visionText.length}/500
                </div>
              </div>

              <button className="run-btn magnet" disabled={runDisabled} onClick={startRun}>
                {isRunning ? <Loader2 className="spin" size={18} strokeWidth={1.5} /> : <Rocket size={18} strokeWidth={1.5} />}
                <span>{isRunning ? 'Running pipeline...' : 'Run Agent Cycle'}</span>
                {sparks.map((spark) => (
                  <SparkBurst key={spark.id} x={spark.x} y={spark.y} tone={spark.tone} />
                ))}
              </button>

              <section className={classNames('panel pipeline-panel', pipelineVisible && 'panel-show')}>
                <div className="panel-head">
                  <span>PIPELINE</span>
                  <span className="mono-accent">{pipelineStage} / 5</span>
                </div>

                <div className="stage-row">
                  {stageNames.map((name, idx) => {
                    const Icon = stageIcons[idx];
                    const state = pipelineStates[idx];
                    return (
                      <div key={name} className="stage-item">
                        <div className={classNames('stage-node', `stage-${state}`, state === 'active' && 'electric')}>
                          {state === 'complete' ? (
                            <CheckCircle2 size={16} strokeWidth={1.5} />
                          ) : state === 'failed' ? (
                            <XCircle size={16} strokeWidth={1.5} />
                          ) : state === 'active' ? (
                            <Loader2 className="spin" size={16} strokeWidth={1.5} />
                          ) : (
                            <Icon size={16} strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="stage-name">{name}</div>
                        <div className="stage-log">{pipelineLogs[idx] || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className={classNames('panel output-panel', outputVisible && 'panel-show')}>
                <div className={classNames('result-word', verdict === 'DEPLOYED' && 'result-pass', verdict === 'BLOCKED' && 'result-block', verdict === 'REJECTED' && 'result-warning')}>
                  {resultWord}
                </div>

                <div className="output-grid">
                  <article className="output-card glare">
                    <header><Lightbulb size={14} strokeWidth={1.5} />VISION UNDERSTOOD</header>
                    <p>{outputIdea?.description || 'No description returned from pipeline.'}</p>
                  </article>

                  <article className="output-card glare">
                    <header><Sparkles size={14} strokeWidth={1.5} />GENERATED IDEA</header>
                    <h4>{outputIdea?.title || 'No title'}</h4>
                    <div className="template-badge">{outputIdea?.templateId || 'template: none'}</div>
                    <p>{outputIdea?.description || 'No idea details were generated.'}</p>
                    <div className="chip-wrap">
                      {(outputIdea?.capabilities || []).slice(0, 6).map((cap) => (
                        <span key={cap} className="cap-chip">{cap}</span>
                      ))}
                    </div>
                  </article>

                  <article className="output-card glare">
                    <header><ScanLine size={14} strokeWidth={1.5} />SAFETY CHECK</header>
                    {(pipelineResult?.safety?.verdict || 'BLOCK') === 'PASS' ? (
                      <>
                        <div className="safety-pass"><ShieldCheck size={16} strokeWidth={1.5} />PASS</div>
                        <div className="mono-line">Risk Score: {Math.round(pipelineResult?.safety?.riskScore || 0)}</div>
                        <div className="check-lines">
                          {(runResult?.pipelineLogs || ['Capability allowlist verified', 'Static policy checks complete', 'Budget envelope validated', 'Simulation passed', 'No governance dependency']).slice(0, 5).map((line) => (
                            <div key={line}><CheckCircle2 size={14} strokeWidth={1.5} /><span>{line}</span></div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="safety-block"><ShieldAlert size={16} strokeWidth={1.5} />BLOCKED</div>
                        <p>{pipelineResult?.safety?.reason || pipelineResult?.error || 'Safety policy blocked this cycle.'}</p>
                      </>
                    )}
                  </article>

                  <article className="output-card glare">
                    <header><Gauge size={14} strokeWidth={1.5} />BUDGET GOVERNOR</header>
                    <div className="gauge-track"><div className="gauge-fill" style={{ width: `${usedPct}%` }} /></div>
                    <div className="gauge-labels">
                      <span>${usedCycle.toFixed(2)} used</span>
                      <span>${Math.max(0, perCap - usedCycle).toFixed(2)} remaining</span>
                    </div>
                    <div className="runway-line">
                      <span className={classNames('runway', (budget.runwayDays || 0) > 14 && 'runway-pass', (budget.runwayDays || 0) < 7 && 'runway-block', (budget.runwayDays || 0) >= 7 && (budget.runwayDays || 0) <= 14 && 'runway-warning')}>Runway {Math.round(budget.runwayDays || 0)}d</span>
                      <span>at ${Math.round(budget.dailyBurnUsd || 0)}/day</span>
                    </div>
                    <div className="mono-line"><Vault size={13} strokeWidth={1.5} />Treasury ${(budget.treasuryUsd || 0).toFixed(2)}</div>
                  </article>
                </div>

                {codeString ? (
                  <div className="code-wrap">
                    <button className="code-head" onClick={() => setCodeExpanded((v) => !v)}>
                      <span><Code2 size={14} strokeWidth={1.5} />GENERATED CODE</span>
                      <span className="head-right">
                        <span className="template-badge">{codeString.length} chars</span>
                        <ChevronDown size={14} strokeWidth={1.5} className={classNames(codeExpanded && 'rot')} />
                      </span>
                    </button>
                    <div className={classNames('code-panel', codeExpanded && 'code-panel-open')}>
                      <div className="code-actions">
                        <button className="icon-ghost" onClick={onCopyCode}>{copied ? <CheckCircle2 size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}</button>
                        <button
                          className="icon-ghost"
                          onClick={() => {
                            const blob = new Blob([codeString], { type: 'text/plain;charset=utf-8' });
                            const href = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = href;
                            a.download = 'app.jsx';
                            a.click();
                            URL.revokeObjectURL(href);
                          }}
                        >
                          <Download size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                      <div className="code-scroll">
                        <Highlight code={codeString} language="jsx" theme={theme === 'dark' ? themes.nightOwl : themes.github}>
                          {({ className, style, tokens, getLineProps, getTokenProps }) => (
                            <pre className={className} style={style}>
                              {tokens.map((line, i) => (
                                <div key={i} {...getLineProps({ line })}>
                                  {line.map((token, key) => (
                                    <span key={key} {...getTokenProps({ token })} />
                                  ))}
                                </div>
                              ))}
                            </pre>
                          )}
                        </Highlight>
                      </div>
                      {verdict === 'DEPLOYED' ? <p className="sim-note">Simulated - would deploy to Base if all checks pass.</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="code-empty">Code generation skipped - safety check failed.</p>
                )}
              </section>

              {appsQuery.data?.apps?.length ? (
                <section className="cycle-section">
                  <h3>INCUBATING APPS</h3>
                  <div className={classNames('apps-grid', appsQuery.data.apps.length > 4 && 'apps-grid-list')}>
                    {appsQuery.data.apps.map((app, idx) => {
                      const users = app.metrics?.users || 0;
                      const revenue = app.metrics?.revenueUsd || app.metrics?.revenue || 0;
                      const impressions = app.metrics?.impressions || 0;
                      const day = app.deployedAt ? Math.max(1, Math.floor((Date.now() - new Date(app.deployedAt).getTime()) / (1000 * 60 * 60 * 24))) : idx + 1;
                      const status = app.status || 'INCUBATING';

                      return (
                        <article key={app.id || `${idx}`} className="app-card tilt">
                          <div className={classNames('top-strip', status.includes('INCUBATING') && 'strip-pass', status.includes('HANDED') && 'strip-accent', status.includes('DROP') && 'strip-block')} />
                          <div className="app-head">
                            <h4>{app.idea?.title || app.title || 'Untitled App'}</h4>
                            <span className="template-badge">{status}</span>
                          </div>
                          <p className="mono-time">Day {day} of 14</p>

                          {status.includes('INCUBATING') ? (
                            <div className="metric-stack">
                              <div>
                                <div className="metric-label">{users} / 50 users</div>
                                <div className="metric-track"><div className="metric-fill" style={{ width: `${Math.min(100, (users / 50) * 100)}%` }} /></div>
                              </div>
                              <div>
                                <div className="metric-label">${revenue} / $10</div>
                                <div className="metric-track"><div className="metric-fill warning" style={{ width: `${Math.min(100, (revenue / 10) * 100)}%` }} /></div>
                              </div>
                              <div>
                                <div className="metric-label">{impressions} / 500 impressions</div>
                                <div className="metric-track"><div className="metric-fill block" style={{ width: `${Math.min(100, (impressions / 500) * 100)}%` }} /></div>
                              </div>
                            </div>
                          ) : status.includes('HANDED') ? (
                            <div className="handoff"><HandCoins size={16} strokeWidth={1.5} />Handed back</div>
                          ) : (
                            <div className="drop"><XCircle size={16} strokeWidth={1.5} />De-supported</div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {activeTab === 'stats' ? (
            <section className="stats-col">
              <div className="stats-hero">
                <div><span className="hero-label">Total Runs</span><strong>{Math.round(countRuns)}</strong></div>
                <div><span className="hero-label">Deployed</span><strong>{Math.round(deployedCount)}</strong></div>
                <div><span className="hero-label">Budget Used</span><strong>${budgetCount.toFixed(2)}</strong></div>
              </div>

              <div className="pass-block">
                <div className="pass-fill" style={{ width: `${passPct}%` }} />
              </div>
              <div className="pass-legend"><span>{passCount} PASS</span><span>{blockCount} BLOCK</span></div>

              <div className="charts-grid">
                <div className="panel glare">
                  <h4>Budget per cycle</h4>
                  {cycleLog.length > 1 ? (
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={cycleLog.map((c, i) => ({ index: i + 1, budgetUsed: c.budgetUsed }))}>
                          <XAxis dataKey="index" tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip cursor={false} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          <Bar dataKey="budgetUsed" fill="var(--accent)" radius={6} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="chart-empty">Run more cycles to see data.</div>
                  )}
                </div>

                <div className="panel glare">
                  <h4>Category breakdown</h4>
                  {categoryBreakdown.length > 1 ? (
                    <>
                      <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={230}>
                          <PieChart>
                            <Pie data={categoryBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                              {categoryBreakdown.map((d) => (
                                <Cell key={d.name} fill={pieColors[d.name] || 'var(--text-subtle)'} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="legend-row">
                        {categoryBreakdown.map((d) => (
                          <span key={d.name} className="legend-pill">{d.name}: {d.value}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="chart-empty">Run more cycles to see data.</div>
                  )}
                </div>
              </div>

              <div className="panel budget-row">
                <div><span>Treasury</span><strong>${Math.round(budget.treasuryUsd || 0)}</strong></div>
                <div><span>Runway</span><strong>{Math.round(budget.runwayDays || 0)}d</strong></div>
                <div><span>Daily Burn</span><strong>${Math.round(budget.dailyBurnUsd || 0)}</strong></div>
                <div className="runway-track"><div className="runway-fill" style={{ width: `${Math.min(100, ((budget.runwayDays || 0) / 30) * 100)}%` }} /></div>
              </div>

              <div className="panel">
                <h4>Apps</h4>
                <div className="apps-table">
                  <div className="table-head"><span>App Name</span><span>Template</span><span>Status</span><span>Users</span><span>Revenue</span><span>Days</span></div>
                  {(appsQuery.data?.apps || []).map((app, idx) => (
                    <div className="table-row" key={app.id || idx}>
                      <span>{app.idea?.title || app.title || 'Untitled'}</span>
                      <span>{app.idea?.templateId || app.templateId || '-'}</span>
                      <span>{app.status || '-'}</span>
                      <span>{app.metrics?.users || 0}</span>
                      <span>${app.metrics?.revenueUsd || app.metrics?.revenue || 0}</span>
                      <span>{app.deployedAt ? Math.max(1, Math.floor((Date.now() - new Date(app.deployedAt).getTime()) / (1000 * 60 * 60 * 24))) : idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'settings' ? (
            <section className="stats-col">
              <div className="panel settings-panel">
                <h4>Settings</h4>
                <p>Wallet: {demoMode ? 'Demo wallet' : walletAddress ? truncateAddress(walletAddress) : 'Not connected'}</p>
                <div className="settings-actions">
                  <button className="ghost-btn" onClick={onThemeToggle}>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</button>
                  <button className="ghost-btn" onClick={() => { setDemoMode(false); onDisconnect(); }}>Reset Session</button>
                </div>
                <div className="mt-6">
                  <h5 className="mb-3 text-sm font-semibold text-white">Industries / domains you&apos;re interested in</h5>
                  <p className="mb-3 text-xs text-gray-500">Select the areas you want the agent to focus on when generating ideas.</p>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRY_OPTIONS.map((industry) => (
                      <button
                        key={industry}
                        type="button"
                        onClick={() => toggleIndustry(industry)}
                        className={classNames(
                          'rounded-full border px-3 py-1.5 text-sm transition-colors',
                          interestedIndustries.includes(industry)
                            ? 'border-[#ff6d00] bg-[#ff6d00]/20 text-[#ff6d00]'
                            : 'border-gray-600 bg-gray-800/50 text-gray-400 hover:border-gray-500 hover:text-gray-300',
                        )}
                      >
                        {industry}
                      </button>
                    ))}
                  </div>
                  {interestedIndustries.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      {interestedIndustries.length} selected: {interestedIndustries.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </main>
      )}

      {onApp ? (
        <>
          <div className="bubble-nav">
            {[
              { key: 'agent' as const, label: 'Agent', icon: Sparkles },
              { key: 'stats' as const, label: 'Stats', icon: BarChart3 },
              { key: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} className={classNames('bubble-tab', active && 'bubble-tab-active')} onClick={() => setActiveTab(tab.key)}>
                  <Icon size={16} strokeWidth={1.5} />
                  {active ? <span className="bubble-label">{tab.label}</span> : null}
                  {active ? <span className="bubble-dot" /> : null}
                </button>
              );
            })}
          </div>

          <div className={classNames('agent-bubble', bubbleOpen && 'agent-bubble-open')}>
            <button className="agent-fab" onClick={() => setBubbleOpen((v) => !v)}>
              <span className="ring" />
              <span className="ring ring-delay" />
              <Sparkles size={20} strokeWidth={1.5} />
            </button>
            <div className="agent-info-pill">{cycleLog.length} runs · ${totalBudgetUsed.toFixed(2)} used</div>
            <div className="agent-panel">
              <div className="agent-last">
                {(cycleLog || []).slice(0, 3).map((c) => (
                  <div key={c.id} className="agent-row">
                    <span>{c.status}</span>
                    <span>${c.budgetUsed.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button className="cta-btn" onClick={() => { setActiveTab('agent'); textareaRef.current?.focus(); setBubbleOpen(false); }}>
                Run New Cycle
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={classNames('toast', `toast-${toast.tone}`)}>
            <div>{toast.text}</div>
            {toast.persistent ? (
              <button className="icon-ghost" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>
                <XCircle size={14} strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <style jsx global>{`
        :root {
          --bg: #09090b;
          --surface: #0f0f12;
          --surface-2: #161619;
          --surface-3: #1e1e23;
          --border: #27272c;
          --border-muted: #1c1c21;
          --text: #f5f5f3;
          --text-muted: #9b9b98;
          --text-subtle: #5a5a57;
          --accent: #ff6d00;
          --accent-dim: #cc5700;
          --accent-bright: #ff8c33;
          --accent-glow: rgba(255, 109, 0, 0.22);
          --accent-glow-sm: rgba(255, 109, 0, 0.12);
          --accent-glow-xs: rgba(255, 109, 0, 0.06);
          --pass: #22c55e;
          --pass-muted: rgba(34, 197, 94, 0.12);
          --block: #ef4444;
          --block-muted: rgba(239, 68, 68, 0.12);
          --warning: #f59e0b;
          --warning-muted: rgba(245, 158, 11, 0.12);
          --base-blue: #0052ff;
          --wallet-blue: #3b99fc;
          --wallet-fox: #f6851b;
          --social: #60a5fa;
          --mini: #818cf8;
        }

        html[data-theme='light'] {
          --bg: #fafaf8;
          --surface: #ffffff;
          --surface-2: #f3f3f0;
          --surface-3: #eaeae6;
          --border: #e0e0dc;
          --border-muted: #ebebeb;
          --text: #0c0c0a;
          --text-muted: #525250;
          --text-subtle: #a0a09c;
          --accent: #e55c00;
          --accent-dim: #c24a00;
          --accent-bright: #ff6d00;
          --accent-glow: rgba(229, 92, 0, 0.18);
          --accent-glow-sm: rgba(229, 92, 0, 0.1);
          --accent-glow-xs: rgba(229, 92, 0, 0.05);
          --pass: #16a34a;
          --pass-muted: rgba(22, 163, 74, 0.1);
          --block: #dc2626;
          --block-muted: rgba(220, 38, 38, 0.08);
          --warning: #d97706;
          --warning-muted: rgba(217, 119, 6, 0.08);
          --base-blue: #0052ff;
          --wallet-blue: #3b99fc;
          --wallet-fox: #f6851b;
          --social: #60a5fa;
          --mini: #818cf8;
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--font-dm); }
        button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }

        .app-root { min-height: 100vh; position: relative; background: var(--bg); color: var(--text); overflow-x: hidden; }
        .bars-canvas, .flow-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 0; }

        .top-bar {
          height: 56px; position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 24px;
        }
        .brand-small { font-family: var(--font-syne); font-weight: 700; font-size: 15px; }
        .top-actions { justify-self: end; display: flex; gap: 8px; align-items: center; }
        .net-pill { justify-self: center; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
        .live-dot { width: 6px; height: 6px; border-radius: 99px; background: var(--pass); animation: pulse-dot 2s infinite; }
        .live-dot-warning { background: var(--warning); }
        .live-dot-block { background: var(--block); }
        @keyframes pulse-dot { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:1} }

        .icon-ghost, .ghost-btn {
          height: 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2);
          display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px;
          transition: transform 150ms ease, background-color 150ms ease;
        }
        .icon-ghost { width: 34px; padding: 0; }
        .icon-ghost:hover, .ghost-btn:hover { background: var(--surface-3); }

        .wallet-chip { height: 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); padding: 0 10px; font-family: var(--font-jet); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
        .demo-badge { background: var(--warning-muted); border: 1px solid var(--warning); color: var(--warning); border-radius: 8px; padding: 5px 8px; font-family: var(--font-jet); font-size: 11px; }

        .offline-banner {
          position: fixed; top: 56px; left: 0; right: 0; height: 40px; z-index: 45;
          background: var(--block-muted); border-bottom: 1px solid var(--block);
          display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--block); font-size: 13px;
          animation: slide-down 200ms ease;
        }
        @keyframes slide-down { from { transform: translateY(-40px); } to { transform: translateY(0); } }

        .landing-main { position: relative; z-index: 10; min-height: 100vh; display: flex; align-items: center; }
        .landing-text { width: min(520px, 100%); margin-left: clamp(24px, 7vw, 72px); }

        .wordmark { font-family: var(--font-syne); font-weight: 800; font-size: clamp(48px, 7vw, 76px); letter-spacing: -0.025em; line-height: 1; margin: 0; position: relative; display: inline-block; }
        .wordmark::after { content: ''; position: absolute; left: 0; bottom: -6px; height: 2px; width: 0%; background: var(--accent); transition: width 650ms ease; }
        .wordmark-ready::after { width: 100%; }

        .tagline { margin-top: 16px; font-family: var(--font-syne); font-size: clamp(28px, 4vw, 38px); font-weight: 700; letter-spacing: -0.01em; display: grid; gap: 4px; }
        .split span { opacity: 0; transform: translateY(18px); animation: split-up 380ms ease forwards; }
        .split span:nth-child(1) { animation-delay: 1200ms; }
        .split span:nth-child(2) { animation-delay: 1260ms; }
        @keyframes split-up { to { opacity: 1; transform: translateY(0); } }

        .desc { margin-top: 20px; font-size: 17px; color: var(--text-muted); opacity: 0; animation: fade-in 300ms ease 1650ms forwards; }
        @keyframes fade-in { to { opacity: 1; } }

        .feature-pills { margin-top: 24px; display: grid; gap: 10px; }
        .pill-row {
          width: fit-content; display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 80%, transparent);
          border-radius: 99px; padding: 8px 16px; font-size: 14px; color: var(--text-muted); backdrop-filter: blur(8px); opacity: 0; transform: translateY(12px); animation: pill-up 280ms ease forwards;
        }
        .pill-row:nth-child(1) { animation-delay: 1800ms; color: var(--text-muted); }
        .pill-row:nth-child(2) { animation-delay: 1890ms; }
        .pill-row:nth-child(3) { animation-delay: 1980ms; }
        .pill-row:nth-child(1) svg, .pill-row:nth-child(3) svg { color: var(--accent); }
        .pill-row:nth-child(2) svg { color: var(--pass); }
        @keyframes pill-up { to { opacity: 1; transform: translateY(0); } }

        .connect-wrap { margin-top: 32px; width: min(280px, 100%); }
        .cta-btn {
          position: relative;
          width: 100%; height: 52px; border-radius: 10px; background: var(--accent); color: #fff;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          font-family: var(--font-syne); font-size: 15px; font-weight: 600;
          transition: transform 120ms ease, background-color 250ms ease, box-shadow 250ms ease;
        }
        .cta-btn:hover { background: var(--accent-dim); box-shadow: 0 0 0 8px var(--accent-glow); }
        .cta-btn:active { transform: scale(0.96); }
        .cta-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

        .connector-list { margin-top: 8px; max-height: 0; opacity: 0; overflow: hidden; border: 1px solid transparent; border-radius: 10px; background: var(--surface); transition: max-height 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 280ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        .connector-list-open { max-height: 260px; opacity: 1; border-color: var(--border); padding: 8px; }
        .connector-item { width: 100%; border-radius: 8px; display: flex; align-items: center; gap: 10px; padding: 12px; font-size: 14px; color: var(--text); }
        .connector-item:hover { background: var(--surface-3); }
        .connector-icon { width: 18px; text-align: center; color: var(--accent); display: inline-flex; align-items: center; justify-content: center; }
        .wallet-svg { display: block; }
        .wallet-svg.coinbase, .wallet-svg.wc { color: var(--wallet-blue); }
        .wallet-svg.metamask { color: var(--wallet-fox); }
        .connector-error { margin-top: 8px; color: var(--block); font-size: 12px; animation: shake 300ms linear 1; }
        @keyframes shake { 0%{transform:translateX(0)} 25%{transform:translateX(-4px)} 50%{transform:translateX(4px)} 75%{transform:translateX(-2px)} 100%{transform:translateX(0)} }

        .demo-link { margin-top: 14px; color: var(--accent); font-size: 13px; display: inline-flex; gap: 6px; align-items: center; }
        .demo-link:hover { text-decoration: underline; }

        .landing-bottom {
          position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; height: 48px; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .subtle-line { font-size: 11px; color: var(--text-subtle); display: inline-flex; align-items: center; gap: 8px; }
        .base-box { width: 16px; height: 16px; background: var(--base-blue); display: inline-block; }

        .app-main { position: relative; z-index: 10; padding: 80px 16px 140px; }
        .agent-col { width: min(720px, 100%); margin: 0 auto; display: grid; gap: 16px; }
        .stats-col { width: min(860px, 100%); margin: 0 auto; display: grid; gap: 16px; padding-bottom: 120px; }
        .center-head { text-align: center; display: grid; gap: 8px; margin-bottom: 4px; }
        .vision-title { font-family: var(--font-syne); font-size: clamp(26px, 4vw, 30px); margin: 0; transition: filter 280ms ease, opacity 280ms ease; }
        .vision-title-blur { filter: blur(0.8px); opacity: 0.45; }
        .center-head p { margin: 0; color: var(--text-muted); font-size: 16px; }

        .panel {
          background: color-mix(in srgb, var(--surface) 72%, transparent);
          border: 1px solid var(--border);
          border-radius: 16px;
          backdrop-filter: blur(16px);
        }

        .vision-panel {
          padding: 24px;
          border-top: 3px solid var(--accent);
          border-color: color-mix(in srgb, var(--border) calc(100% - (var(--prox, 0) * 60%)), var(--accent));
          box-shadow: 0 0 0 calc(var(--prox, 0) * 4px) rgba(255, 109, 0, calc(var(--prox, 0) * 0.08));
          transition: box-shadow 180ms ease;
        }

        .vision-input {
          width: 100%; min-height: 160px; resize: none; border: 0; outline: none; border-radius: 10px;
          background: var(--surface-2); color: var(--text); padding: 16px; font-size: 16px; line-height: 1.7; font-family: var(--font-dm);
        }
        .vision-input::placeholder { color: var(--text-subtle); font-style: italic; font-size: 15px; }

        .quick-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .quick-row > span { color: var(--text-subtle); font-size: 11px; }
        .category-pill {
          border: 1px solid var(--border); border-radius: 99px; padding: 6px 12px; font-size: 12px; color: var(--text-muted); background: var(--surface-3);
          transition: background-color 150ms ease, color 150ms ease;
        }
        .category-pill:hover { background: var(--accent); color: #fff; }

        .char-count { margin-top: 10px; text-align: right; font-family: var(--font-jet); font-size: 11px; color: var(--text-subtle); }
        .char-warning { color: var(--warning); }
        .char-danger { color: var(--block); }

        .run-btn {
          width: 100%; height: 56px; border-radius: 12px; background: var(--accent); color: #fff;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px; font-family: var(--font-syne); font-size: 16px; font-weight: 600;
          transition: transform 120ms ease, background-color 250ms ease, box-shadow 250ms ease;
          position: relative; overflow: hidden;
        }
        .run-btn:hover:not(:disabled) { background: var(--accent-dim); box-shadow: 0 0 0 10px var(--accent-glow); }
        .run-btn:active:not(:disabled) { transform: scale(0.96); }
        .run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .spark-burst { position: absolute; width: 0; height: 0; pointer-events: none; }
        .spark {
          position: absolute; width: 3px; height: 3px; border-radius: 99px; background: var(--accent);
          animation: scatter 400ms ease-out forwards;
          transform: rotate(calc(var(--i) * 45deg)) translateX(0px);
        }
        .spark-pass { background: var(--pass); }
        @keyframes scatter {
          from { opacity: 1; transform: rotate(calc(var(--i) * 45deg)) translateX(0px); }
          to { opacity: 0; transform: rotate(calc(var(--i) * 45deg)) translateX(18px); }
        }

        .pipeline-panel, .output-panel { max-height: 0; opacity: 0; overflow: hidden; padding: 0 20px; transition: max-height 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease, padding 280ms ease; }
        .panel-show { max-height: 2200px; opacity: 1; padding: 20px; }

        .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .panel-head span:first-child { font-size: 10px; letter-spacing: 0.1em; color: var(--text-subtle); font-weight: 500; }
        .mono-accent { color: var(--accent); font-family: var(--font-jet); font-size: 11px; }

        .stage-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .stage-item { text-align: center; position: relative; }
        .stage-node { width: 44px; height: 44px; border-radius: 99px; margin: 0 auto; display: grid; place-items: center; border: 1px solid var(--border); background: var(--surface-3); color: var(--text-subtle); }
        .stage-pending { background: var(--surface-3); color: var(--text-subtle); }
        .stage-active { border: 1.5px solid var(--accent); color: var(--accent); }
        .stage-complete { background: var(--pass-muted); color: var(--pass); border-color: color-mix(in srgb, var(--pass) 50%, var(--border)); }
        .stage-failed { background: var(--block-muted); color: var(--block); border-color: color-mix(in srgb, var(--block) 50%, var(--border)); }
        .electric { position: relative; background: linear-gradient(var(--surface-2), var(--surface-2)) padding-box, conic-gradient(from var(--angle), var(--accent), transparent 40%, var(--accent)) border-box; border: 1.5px solid transparent; animation: spin-angle 1.4s linear infinite; }
        @property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes spin-angle { to { --angle: 360deg; } }

        .stage-name { margin-top: 8px; font-size: 10px; letter-spacing: 0.08em; color: var(--text-subtle); }
        .stage-log { margin-top: 4px; font-size: 11px; font-family: var(--font-jet); color: var(--text-muted); min-height: 14px; }

        .result-word { text-align: center; font-family: var(--font-syne); font-size: clamp(46px, 8vw, 60px); font-weight: 800; padding: 32px 0; position: relative; }
        .result-word::after { content: ''; position: absolute; left: 50%; transform: translateX(-50%); bottom: 22px; height: 2px; width: 0%; transition: width 500ms ease; background: currentColor; }
        .result-pass { color: var(--pass); }
        .result-block { color: var(--block); }
        .result-warning { color: var(--warning); }
        .result-pass::after, .result-block::after, .result-warning::after { width: 60%; }

        .output-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .output-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 18px; position: relative; overflow: hidden; }
        .output-card::before, .panel.glare::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 200ms ease;
          background: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255, 255, 255, 0.07) 0%, transparent 65%);
        }
        .output-card:hover::before, .panel.glare:hover::before { opacity: 1; }

        .output-card header { font-size: 10px; letter-spacing: 0.1em; color: var(--text-subtle); display: inline-flex; align-items: center; gap: 6px; }
        .output-card h4 { margin: 12px 0 6px; font-family: var(--font-syne); font-size: 18px; }
        .output-card p { margin: 8px 0 0; font-size: 14px; color: var(--text-muted); }

        .template-badge { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 6px; background: var(--surface-3); font-size: 11px; font-family: var(--font-jet); color: var(--text-muted); }
        .chip-wrap { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
        .cap-chip { border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 11px; background: var(--surface-3); color: var(--text-muted); }

        .safety-pass { margin-top: 8px; color: var(--pass); font-family: var(--font-syne); font-size: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
        .safety-block { margin-top: 8px; color: var(--block); font-family: var(--font-syne); font-size: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
        .mono-line { margin-top: 8px; font-family: var(--font-jet); font-size: 14px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 5px; }
        .check-lines { margin-top: 8px; display: grid; gap: 6px; }
        .check-lines div { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }

        .gauge-track { margin-top: 10px; height: 12px; border-radius: 6px; background: var(--surface-3); overflow: hidden; }
        .gauge-fill { height: 100%; background: var(--accent); transition: width 600ms ease-out; }
        .gauge-labels { margin-top: 6px; display: flex; justify-content: space-between; font-family: var(--font-jet); color: var(--text-subtle); font-size: 11px; }
        .runway-line { margin-top: 8px; display: flex; justify-content: space-between; color: var(--text-subtle); font-size: 11px; }
        .runway { font-family: var(--font-syne); font-size: 20px; color: var(--text); }
        .runway-pass { color: var(--pass); }
        .runway-warning { color: var(--warning); }
        .runway-block { color: var(--block); }

        .code-wrap { margin-top: 16px; }
        .code-head { width: 100%; display: flex; justify-content: space-between; align-items: center; color: var(--text-subtle); font-size: 10px; letter-spacing: 0.1em; }
        .code-head span { display: inline-flex; align-items: center; gap: 6px; }
        .head-right { gap: 10px; }
        .rot { transform: rotate(180deg); transition: transform 240ms ease; }
        .code-panel { border: 1px solid var(--border); border-radius: 12px; margin-top: 8px; max-height: 0; overflow: hidden; transition: max-height 240ms ease; background: var(--surface-2); }
        .code-panel-open { max-height: 480px; }
        .code-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 8px 0; }
        .code-scroll { max-height: 360px; overflow: auto; padding: 0 14px 10px; }
        .code-scroll pre { margin: 0; font-family: var(--font-jet) !important; font-size: 12px; }
        .sim-note { margin: 0; padding: 0 14px 12px; font-size: 11px; color: var(--text-subtle); font-style: italic; }
        .code-empty { margin-top: 14px; color: var(--text-subtle); font-size: 12px; font-style: italic; }

        .cycle-section h3 {
          margin: 8px 0 10px;
          font-family: var(--font-syne); font-size: 14px; font-weight: 600;
          padding-left: 12px; border-left: 2px solid var(--accent);
        }
        .cycle-list { max-height: 280px; overflow: auto; display: grid; gap: 8px; }
        .empty-state { border: 1px dashed var(--border); border-radius: 8px; display: grid; place-items: center; gap: 12px; padding: 32px; color: var(--text-muted); }
        .cycle-item {
          border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); padding: 12px 16px; display: grid; grid-template-columns: auto 1fr auto; gap: 12px;
          cursor: pointer; transition: background-color 150ms ease;
          animation: list-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cycle-item:hover { background: var(--surface-3); }
        @keyframes list-in { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }

        .status-dot { margin-top: 4px; width: 8px; height: 8px; border-radius: 99px; background: var(--text-subtle); }
        .status-pass { background: var(--pass); }
        .status-block { background: var(--block); }
        .status-warning { background: var(--warning); }

        .cycle-main { min-width: 0; }
        .mono-time { font-family: var(--font-jet); font-size: 11px; color: var(--text-subtle); }
        .cycle-text { font-size: 13px; color: var(--text-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cycle-title { font-size: 13px; color: var(--text); margin-top: 2px; }
        .cycle-right { text-align: right; display: grid; gap: 4px; }

        .cycle-expand { grid-column: 1 / -1; max-height: 0; overflow: hidden; transition: max-height 240ms ease; }
        .cycle-expand-open { max-height: 180px; }
        .cycle-expand p { margin: 6px 0 0; font-size: 12px; color: var(--text-muted); }

        .apps-grid { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(280px, 1fr); gap: 12px; overflow-x: auto; }
        .apps-grid-list { grid-auto-flow: row; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); overflow: visible; }
        .app-card {
          position: relative; min-width: 280px; border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--surface) 72%, transparent); backdrop-filter: blur(12px); padding: 20px; overflow: hidden;
          transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .app-card:hover { transform: translateY(-2px); }
        .top-strip { position: absolute; left: 0; top: 0; right: 0; height: 3px; background: var(--border); }
        .strip-pass { background: var(--pass); }
        .strip-accent { background: var(--accent); }
        .strip-block { background: var(--block); }
        .app-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
        .app-head h4 { margin: 0; font-size: 16px; font-family: var(--font-syne); }
        .metric-stack { margin-top: 12px; display: grid; gap: 10px; }
        .metric-label { font-family: var(--font-jet); font-size: 11px; color: var(--text-subtle); margin-bottom: 4px; }
        .metric-track { height: 4px; border-radius: 6px; background: var(--surface-3); overflow: hidden; }
        .metric-fill { height: 100%; background: var(--pass); transition: width 500ms ease-out; }
        .metric-fill.warning { background: var(--warning); }
        .metric-fill.block { background: var(--block); }
        .handoff { margin-top: 12px; color: var(--pass); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
        .drop { margin-top: 12px; color: var(--block); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }

        .stats-hero { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
        .stats-hero > div { padding: 20px; border-right: 1px solid var(--border); }
        .stats-hero > div:last-child { border-right: 0; }
        .hero-label { display: block; color: var(--text-subtle); font-size: 12px; margin-bottom: 4px; }
        .stats-hero strong { font-family: var(--font-syne); font-size: clamp(36px, 6vw, 52px); line-height: 1; }

        .pass-block { width: 100%; height: 10px; border-radius: 6px; background: var(--block-muted); overflow: hidden; }
        .pass-fill { height: 100%; background: var(--pass); transition: width 600ms ease-out; }
        .pass-legend { display: flex; justify-content: space-between; font-family: var(--font-jet); font-size: 12px; color: var(--text-subtle); }

        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .chart-wrap { height: 230px; }
        .chart-empty { min-height: 230px; display: grid; place-items: center; color: var(--text-subtle); font-size: 13px; font-style: italic; }
        .legend-row { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
        .legend-pill { border: 1px solid var(--border); border-radius: 99px; padding: 4px 8px; font-size: 11px; color: var(--text-muted); }

        .budget-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 20px; }
        .budget-row span { display: block; color: var(--text-subtle); font-size: 12px; }
        .budget-row strong { font-family: var(--font-jet); font-size: 28px; }
        .runway-track { grid-column: 1 / -1; height: 8px; border-radius: 6px; background: var(--surface-3); overflow: hidden; }
        .runway-fill { height: 100%; background: var(--accent); transition: width 500ms ease-out; }

        .apps-table { margin-top: 8px; display: grid; gap: 2px; }
        .table-head, .table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr; gap: 8px; padding: 10px 6px; font-size: 13px; }
        .table-head { color: var(--text-subtle); font-family: var(--font-jet); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--border); }
        .table-row { border-radius: 8px; }
        .table-row:hover { background: var(--surface-3); }

        .settings-panel { padding: 20px; display: grid; gap: 12px; }
        .settings-actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .bubble-nav {
          position: fixed; left: 50%; transform: translateX(-50%); bottom: 24px; z-index: 100;
          padding: 10px; border-radius: 99px; border: 1px solid var(--border); backdrop-filter: blur(20px);
          background: color-mix(in srgb, var(--surface) 85%, transparent);
          display: inline-flex; gap: 6px;
        }
        .bubble-tab { position: relative; width: 86px; height: 44px; border-radius: 99px; display: grid; place-items: center; color: var(--text-muted); transition: transform 150ms ease, background-color 150ms ease; }
        .bubble-tab:hover { transform: scale(1.1); background: var(--surface-3); }
        .bubble-tab-active { color: var(--accent); background: var(--accent-glow-xs); }
        .bubble-label {
          position: absolute; top: -18px; font-size: 11px; color: var(--text-subtle); opacity: 0;
          animation: bubble-label 200ms ease forwards;
        }
        @keyframes bubble-label { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .bubble-dot { position: absolute; bottom: 4px; width: 4px; height: 4px; border-radius: 99px; background: var(--accent); }

        .agent-bubble { position: fixed; right: 24px; bottom: 96px; z-index: 200; }
        .agent-fab { width: 56px; height: 56px; border-radius: 99px; background: var(--accent); color: #fff; position: relative; display: grid; place-items: center; }
        .ring { position: absolute; inset: 0; border-radius: 99px; border: 1.5px solid var(--accent); animation: pulse-ring 1.8s ease-out infinite; }
        .ring-delay { animation-delay: 0.6s; }
        @keyframes pulse-ring { from { transform: scale(1); opacity: 0.5; } to { transform: scale(2.2); opacity: 0; } }

        .agent-info-pill {
          position: absolute; right: 64px; top: 8px; white-space: nowrap; max-width: 0; overflow: hidden;
          transition: max-width 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
          border-radius: 999px; background: var(--surface); border: 1px solid var(--border); padding: 8px 12px; font-size: 12px; color: var(--text-muted);
        }
        .agent-bubble:hover .agent-info-pill { max-width: 200px; }

        .agent-panel {
          position: absolute; right: 0; bottom: 66px; width: 300px; background: color-mix(in srgb, var(--surface) 90%, transparent); border: 1px solid var(--border); border-radius: 14px; backdrop-filter: blur(20px);
          padding: 16px; display: grid; gap: 10px; opacity: 0; transform: scale(0.9); pointer-events: none;
          transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease;
        }
        .agent-bubble-open .agent-panel { opacity: 1; transform: scale(1); pointer-events: auto; }
        .agent-last { display: grid; gap: 6px; }
        .agent-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); }

        .toast-stack { position: fixed; top: 20px; right: 20px; z-index: 300; display: grid; gap: 10px; width: min(360px, calc(100vw - 40px)); }
        .toast {
          border: 1px solid var(--border); border-left-width: 4px; border-radius: 10px; background: var(--surface-2);
          padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px;
          animation: toast-in 220ms ease;
        }
        .toast-accent { border-left-color: var(--accent); }
        .toast-pass { border-left-color: var(--pass); }
        .toast-block { border-left-color: var(--block); }
        .toast-warning { border-left-color: var(--warning); }
        @keyframes toast-in { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }

        @media (max-width: 1023px) {
          .landing-text { margin-inline: 32px; }
          .charts-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 767px) {
          .bars-canvas, .flow-canvas { display: none; }
          .top-bar { grid-template-columns: 1fr auto; padding: 0 14px; }
          .net-pill { display: none; }
          .landing-text { margin-inline: 24px; width: calc(100% - 48px); }
          .landing-bottom { padding: 0 14px; }
          .landing-bottom .subtle-line:last-child { display: none; }
          .output-grid { grid-template-columns: 1fr; }
          .stage-row { grid-template-columns: repeat(5, minmax(52px, 1fr)); overflow-x: auto; }
          .bubble-nav { width: 88vw; justify-content: space-between; }
          .bubble-tab { width: 30%; }
          .agent-bubble { right: 16px; bottom: 102px; }
          .stats-hero { grid-template-columns: 1fr; }
          .stats-hero > div { border-right: 0; border-bottom: 1px solid var(--border); }
          .stats-hero > div:last-child { border-bottom: 0; }
          .budget-row { grid-template-columns: 1fr; }
          .table-head, .table-row { grid-template-columns: 2fr 1fr 1fr; }
          .table-head span:nth-child(n+4), .table-row span:nth-child(n+4) { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bars-canvas, .flow-canvas, .ring, .ring-delay, .magnet, .magnet-small, .tilt, .spark-burst { display: none !important; }
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
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
    </div>
  );
}

export default function Page() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppShellInternal />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
