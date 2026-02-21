'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppEvolutionAtlas, seedTestApp, triggerAppSpace } from '@/services/backendClient';
import type { AppSpatialMemory, AppSpatialMarker, AppSpatialZone } from '@/services/backendClient';
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
  Vote,
  Wallet,
  XCircle,
  Activity,
} from 'lucide-react';
import { createConfig, WagmiProvider, useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import { http } from 'viem';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';

// queryClient and wagmiConfig are created lazily inside the Page component
// (see bottom of file) to prevent module-level WebSocket init from
// interfering with Next.js HMR subscriptions.

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
type Tab = 'agent' | 'stats' | 'settings' | 'spatial';
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

type FeedItem = { id: string; icon: string; text: string; time: string };
type Proposal = {
  id: string;
  title: string;
  source: string;
  state: string;
  risk: number;
  signals: string[];
  summary: string;
  recommendation: string;
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
  const [wcModal, setWcModal] = useState<{ uri: string; label: string } | null>(null);
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
  const [outcomeFlash, setOutcomeFlash] = useState<'pass' | 'block' | null>(null);

  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [memeDeployResult, setMemeDeployResult] = useState<{ txHash: string; tokenAddress: string | null; blockNumber: number; appId?: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const s = window.localStorage.getItem('agentsafe-meme-deploy');
      if (s) return JSON.parse(s);
    } catch {}
    return null;
  });
  const [memeInteractResult, setMemeInteractResult] = useState<{
    txHash: string;
    blockNumber: number;
    transferAmount: string;
    feePercent: string;
    feeAmount: string;
    netAmount: string;
    recipient: string;
    feeRecipient: string;
    simulated?: boolean;
    tokenName?: string;
    tokenSymbol?: string;
    totalSupply?: string;
    balances: {
      signer: { address: string; balance: string };
      recipient: { address: string; balance: string };
      agentTreasury: { address: string; balance: string };
    };
    message: string;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const s = window.localStorage.getItem('agentsafe-meme-interact');
      if (s) return JSON.parse(s);
    } catch {}
    return null;
  });

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
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const qc = useQueryClient();

  const SUPPORTED_CHAIN_IDS = [base.id, baseSepolia.id] as number[];
  const onSupportedChain = !isConnected || demoMode || SUPPORTED_CHAIN_IDS.includes(chainId);
  const chainLabel = chainId === base.id ? 'Base Mainnet'
    : chainId === baseSepolia.id ? 'Base Sepolia'
    : 'Unsupported Network';
  const chainPillClass = !isConnected || demoMode ? ''
    : chainId === base.id ? ''
    : chainId === baseSepolia.id ? 'net-pill-testnet'
    : 'net-pill-wrong';

  // Deduplicate connectors: normalise "Injected" → "MetaMask", then keep first per name.
  const uniqueConnectors = useMemo(() => {
    const seen = new Set<string>();
    return connectors.filter((c) => {
      const label = c.name === 'Injected' ? 'MetaMask' : c.name;
      if (seen.has(label.toLowerCase())) return false;
      seen.add(label.toLowerCase());
      return true;
    });
  }, [connectors]);

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

  const appEvolutionQuery = useQuery({
    queryKey: ['appEvolutionAtlas'],
    queryFn: async () => {
      const result = await getAppEvolutionAtlas();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: onApp,
    refetchInterval: 60_000,
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

  useEffect(() => {
    try {
      if (memeDeployResult) window.localStorage.setItem('agentsafe-meme-deploy', JSON.stringify(memeDeployResult));
      else window.localStorage.removeItem('agentsafe-meme-deploy');
    } catch {}
  }, [memeDeployResult]);

  useEffect(() => {
    try {
      if (memeInteractResult) window.localStorage.setItem('agentsafe-meme-interact', JSON.stringify(memeInteractResult));
      else window.localStorage.removeItem('agentsafe-meme-interact');
    } catch {}
  }, [memeInteractResult]);

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
  };

  const onTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, 500);
    setVisionText(value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.max(160, e.target.scrollHeight)}px`;
    if (panelRef.current) {
      panelRef.current.style.setProperty('--fill-pct', `${(value.length / 500) * 100}%`);
    }
  };

  const runMutation = useMutation({
    mutationFn: async (intent: string) => {
      return api<RunResponse>('/api/app-agent/run-cycle', {
        method: 'POST',
        body: JSON.stringify({ walletAddress, intent }),
      });
    },
    onError: (err: Error) => {
      addToast(`Run cycle failed: ${err.message}`, 'block', 5000);
      setIsRunning(false);
      if (runInterval.current) window.clearInterval(runInterval.current);
    },
    onSuccess: (runCycle) => {
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

      // Derive safety info from backend pipeline logs
      const safetyLog = (runCycle.pipelineLogs as Array<{ step?: string; ok?: boolean; reason?: string }> || []).find(
        (l) => l.step === 'runAppSafetyPipeline',
      );
      const safetyPassed = safetyLog ? safetyLog.ok : finalVerdict === 'DEPLOYED';
      const safetyReason = safetyLog?.reason;

      setPipelineStates(nextStates);
      setPipelineStage(5);
      setVerdict(finalVerdict);
      setRunTrigger((v) => v + 1);
      setIsRunning(false);
      setOutputVisible(true);
      setOutcomeFlash(finalVerdict === 'DEPLOYED' ? 'pass' : 'block');
      window.setTimeout(() => setOutcomeFlash(null), 700);

      const budgetBefore = budgetQuery.data?.treasuryUsd || 0;
      const budgetAfter = runCycle.budgetRemaining || budgetBefore;
      const budgetUsed = Math.max(0, budgetBefore - budgetAfter);
      setPipelineLogs(runCycle.pipelineLogs || []);

      const entry: CycleEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        intent: visionText,
        status: finalVerdict,
        risk: safetyPassed ? 0 : 75,
        budgetUsed,
        title: runCycle.idea?.title || 'Untitled app',
        reason: safetyReason,
        logs: runCycle.pipelineLogs || [],
        description: runCycle.idea?.description,
      };
      setCycleLog((prev) => [entry, ...prev]);

      if (runInterval.current) {
        window.clearInterval(runInterval.current);
        runInterval.current = null;
      }

      if (safetyPassed) addToast('Safety passed', 'pass');
      else addToast(`Safety blocked - ${safetyReason || 'unknown reason'}`, 'block', 5000);
      if (finalVerdict === 'DEPLOYED') addToast('App deployed - incubating', 'pass', 5000);
      if (finalVerdict !== 'DEPLOYED') addToast(`Cycle blocked - ${safetyReason || finalVerdict}`, 'block', 5000);

      qc.invalidateQueries({ queryKey: ['budget', walletAddress] });
      qc.invalidateQueries({ queryKey: ['apps', walletAddress] });
    },
  });

  const memeDemoMutation = useMutation({
    mutationFn: async () =>
      api<{ ok: boolean; message?: string; app?: AppRow; appId?: string; txHash?: string; tokenAddress?: string | null; blockNumber?: number }>('/api/app-agent/demo-meme-deploy', {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
      }),
    onSuccess: (payload) => {
      addToast(payload.message || 'Meme token deployed on-chain!', 'pass', 5000);
      if (payload.txHash) {
        setMemeDeployResult({
          txHash: payload.txHash,
          tokenAddress: payload.tokenAddress ?? null,
          blockNumber: payload.blockNumber ?? 0,
          appId: payload.appId ?? undefined,
        });
      }
      setMemeInteractResult(null);
      qc.invalidateQueries({ queryKey: ['apps', walletAddress] });
      // Trigger spatial generation explicitly + refetch atlas after generation completes
      if (payload.appId) {
        triggerAppSpace(payload.appId).catch(() => {});
        // Blockade Labs takes ~15-30s; poll atlas a few times
        const delays = [5_000, 15_000, 30_000, 60_000];
        delays.forEach((ms) => {
          window.setTimeout(() => qc.invalidateQueries({ queryKey: ['appEvolutionAtlas'] }), ms);
        });
      }
      qc.invalidateQueries({ queryKey: ['appEvolutionAtlas'] });
    },
    onError: (err: Error) => {
      addToast(`Demo deploy failed: ${err.message}`, 'block', 4500);
    },
  });

  const memeInteractMutation = useMutation({
    mutationFn: async () => {
      if (!memeDeployResult?.tokenAddress) throw new Error('No deployed token to interact with');
      return api<{
        ok: boolean;
        simulated?: boolean;
        txHash: string;
        blockNumber: number;
        transferAmount: string;
        feePercent: string;
        feeAmount: string;
        netAmount: string;
        recipient: string;
        feeRecipient: string;
        tokenName?: string;
        tokenSymbol?: string;
        totalSupply?: string;
        balances: {
          signer: { address: string; balance: string };
          recipient: { address: string; balance: string };
          agentTreasury: { address: string; balance: string };
        };
        message: string;
      }>('/api/app-agent/demo-meme-interact', {
        method: 'POST',
        body: JSON.stringify({
          tokenAddress: memeDeployResult.tokenAddress,
          recipientAddress: walletAddress || undefined,
        }),
      });
    },
    onSuccess: (payload) => {
      addToast(payload.message || 'Transfer complete!', 'pass', 5000);
      setMemeInteractResult(payload);
      qc.invalidateQueries({ queryKey: ['apps', walletAddress] });
    },
    onError: (err: Error) => {
      addToast(`Interact failed: ${err.message}`, 'block', 4500);
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

  const outputIdea = runResult?.idea;
  const codeString = '';

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
    const isWC = connector.id === 'walletConnect' || connector.name.toLowerCase().includes('walletconnect');
    if (isWC) {
      // Intercept the display_uri before connecting so we can show a QR code
      const emitter = (connector as any).emitter;
      const onMsg = ({ type, data }: { type: string; data?: unknown }) => {
        if (type === 'display_uri' && typeof data === 'string') {
          setWcModal({ uri: data, label: connector.name });
          emitter?.off('message', onMsg);
        }
      };
      emitter?.on('message', onMsg);
      try {
        connect({ connector });
      } catch (err) {
        emitter?.off('message', onMsg);
        setConnectorError(err instanceof Error ? err.message : 'Connection failed');
      }
      return;
    }
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
  const memeDeployDisabled = isRunning || memeDemoMutation.isPending || (!isConnected && !demoMode);

  return (
    <div className={classNames('app-root', outcomeFlash && `outcome-flash outcome-flash-${outcomeFlash}`)}>
      {/* ── WalletConnect QR Modal ───────────────────────────────── */}
      {wcModal ? (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setWcModal(null)}
        >
          <div
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '28px 32px', maxWidth: 360, width: '92vw',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                <path d="M7.3 9.2a6.6 6.6 0 0 1 9.4 0l.3.3.3-.3a7 7 0 0 0-10 0l.3.3Z" fill="currentColor" />
                <path d="M9 10.9a4.2 4.2 0 0 1 6 0l.3.3.3-.3a4.6 4.6 0 0 0-6.6 0l.3.3Z" fill="currentColor" />
                <path d="m12 13.3 1.1 1.1L12 15.5l-1.1-1.1L12 13.3Z" fill="currentColor" />
              </svg>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Scan with any wallet</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0, alignSelf: 'flex-start', lineHeight: 1.6 }}>
              Open any WalletConnect-compatible wallet and scan this code. MetaMask Mobile, Rainbow, Uniswap Wallet, Trust, Phantom, and 400+ others are supported.
            </p>
            <div style={{
              padding: 16, background: '#ffffff', borderRadius: 14,
              display: 'inline-flex',
            }}>
              <QRCodeSVG
                value={wcModal.uri}
                size={240}
                level="Q"
                marginSize={0}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button
                style={{
                  flex: 1, fontSize: 12, padding: '8px 12px',
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: 'transparent', color: 'var(--text-subtle)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                onClick={() => { void navigator.clipboard.writeText(wcModal.uri); }}
              >
                Copy URI
              </button>
              <button
                style={{
                  flex: 1, fontSize: 12, padding: '8px 12px',
                  border: '1px solid var(--border)', borderRadius: 10,
                  background: 'transparent', color: 'var(--danger)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
                onClick={() => setWcModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!onApp && !reducedMotion && !isMobile ? <LandingBarsCanvas active /> : null}
      {onApp && !reducedMotion ? <FlowLinesCanvas active runPulse={runPulse} /> : null}

      <header className="top-bar">
        <div className="brand-small">AgentSafe Lab</div>
        {onApp ? (
          <div className={classNames('net-pill', chainPillClass)}>
            <Globe size={12} strokeWidth={1.5} />
            <span className={classNames('live-dot', healthState === 'degraded' && 'live-dot-warning', healthState === 'offline' && 'live-dot-block')} />
            <span>{demoMode ? 'Base Mainnet' : chainLabel}</span>
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

      <div className={classNames('neural-thread', isRunning && 'active')} aria-hidden />

      {onApp && isOffline && !healthBannerDismissed ? (
        <div className="offline-banner">
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span>Backend offline - start the Express server on port 4000</span>
          <button className="icon-ghost" onClick={() => setHealthBannerDismissed(true)}>
            <XCircle size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}

      {onApp && isConnected && !demoMode && !onSupportedChain ? (
        <div className="offline-banner" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 35%, transparent)' }}>
          <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>{chainLabel}</strong> is not supported. Switch to Base to use AgentSafe.
          </span>
          <button
            className="ghost-btn"
            style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: base.id })}
          >
            {isSwitching ? 'Switching…' : 'Base Mainnet'}
          </button>
          <button
            className="ghost-btn"
            style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
            disabled={isSwitching}
            onClick={() => switchChain({ chainId: baseSepolia.id })}
          >
            {isSwitching ? 'Switching…' : 'Base Sepolia'}
          </button>
        </div>
      ) : null}

      {!onApp ? (
        <>
          <main className="landing-main">
            <section className="landing-text">
              <h1 className={classNames('wordmark', wordmark === 'AgentSafe' && 'wordmark-ready')}>{wordmark}</h1>
              <h2 className="tagline split">
                <span>Describe the outcome.</span>
                <span>The agent builds the app.</span>
              </h2>
              <p className="desc">A production-minded build loop for Base. Prompt, evaluate risk, and ship with guardrails.</p>

              <div className="feature-pills">
                <div className="pill-row"><Sparkles size={14} strokeWidth={1.5} /><span>Agent-driven product ideation</span></div>
                <div className="pill-row"><ShieldCheck size={14} strokeWidth={1.5} /><span>Safety and policy checks before deploy</span></div>
                <div className="pill-row"><Rocket size={14} strokeWidth={1.5} /><span>Structured output: verdict, budget, generated code</span></div>
              </div>

              <div className="connect-wrap">
                <button className="cta-btn magnet" onClick={() => setShowConnectors((v) => !v)} disabled={isPending}>
                  {isPending ? <Loader2 className="spin" size={18} strokeWidth={1.5} /> : <Wallet size={18} strokeWidth={1.5} />}
                  <span>{isPending ? 'Connecting...' : 'Connect wallet'}</span>
                </button>

                <div className={classNames('connector-list', showConnectors && 'connector-list-open')}>
                  {uniqueConnectors.map((connector, i) => {
                    const label = connector.name === 'Injected' ? 'MetaMask' : connector.name;
                    const isWC = connector.id === 'walletConnect' || connector.name.toLowerCase().includes('walletconnect');
                    return (
                      <button key={connector.uid} className="connector-item" onClick={() => handleConnector(connector)} style={{ animationDelay: `${i * 60}ms` }}>
                        <span className="connector-icon" aria-hidden>
                          {label.includes('Coinbase') ? (
                            <svg className="wallet-svg coinbase" width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" fill="currentColor" />
                              <path d="M15.6 9.5a4 4 0 1 0 0 5h-2.2a2 2 0 1 1 0-5h2.2Z" fill="var(--surface)" />
                            </svg>
                          ) : isWC ? (
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
                        <span>{label}</span>
                        {isWC ? <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-subtle)', opacity: 0.7 }}>QR</span> : null}
                      </button>
                    );
                  })}
                  {connectorError ? <div className="connector-error">{connectorError}</div> : null}
                </div>

                <button className="demo-link" onClick={startDemo}>
                  Open demo workspace <ArrowRight size={12} strokeWidth={1.5} />
                </button>
              </div>
            </section>
          </main>

          <footer className="landing-bottom">
            <div className="subtle-line"><span className="base-box" />Built on Base</div>
            <div className="subtle-line">Powered by Gemini + Uniswap</div>
          </footer>
        </>
      ) : (
        <main className="app-main">
          {activeTab === 'agent' ? (
            <section className="agent-layout">
              <div className="input-col">
              <div className="center-head">
                <h2 className={classNames('vision-title', focusVision && 'vision-title-blur')}>What should the agent build?</h2>
                <p>Describe a concrete user outcome. The agent will generate, evaluate, and validate a deploy candidate.</p>
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
                  aria-describedby="vision-char-count"
                  placeholder="Example: Build a Base mini-app that helps NFT communities launch weekly quests with onchain rewards and anti-sybil scoring."
                />

                <div
                  id="vision-char-count"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className={classNames('char-count', visionText.length > 490 && 'char-danger', visionText.length > 400 && visionText.length <= 490 && 'char-warning')}
                >
                  {visionText.length}/500 · {Math.max(0, 500 - visionText.length)} left
                </div>
              </div>

              <button
                className="run-btn magnet"
                disabled={memeDeployDisabled}
                onClick={() => memeDemoMutation.mutate()}
                style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--pass) 45%, transparent), color-mix(in srgb, var(--pass) 20%, transparent))' }}
              >
                {memeDemoMutation.isPending ? <Loader2 className="spin" size={18} strokeWidth={1.5} /> : <Rocket size={18} strokeWidth={1.5} />}
                <span>{memeDemoMutation.isPending ? 'Deploying...' : 'Deploy'}</span>
              </button>

              {!outputVisible && !pipelineVisible ? (
                <div className="empty-slot">
                  <div className="empty-icon"><Bot size={32} strokeWidth={1} /></div>
                  <p className="empty-title">Start with an outcome</p>
                  <p className="empty-hint">Describe what users should get, then run your first build cycle.</p>
                </div>
              ) : null}
              </div>{/* end input-col */}

              <div className="live-col">

              {memeDeployResult ? (
                <div
                  className="panel panel-show"
                  style={{
                    padding: '18px 20px',
                    marginBottom: 16,
                    background: 'color-mix(in srgb, var(--pass) 6%, var(--surface))',
                    border: '1px solid color-mix(in srgb, var(--pass) 25%, transparent)',
                    borderRadius: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: 'var(--pass)' }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Transaction Confirmed</span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontWeight: 500, minWidth: 70 }}>Tx Hash</span>
                      <a
                        href={`https://sepolia.basescan.org/tx/${memeDeployResult.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'underline', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}
                      >
                        {memeDeployResult.txHash}
                      </a>
                    </div>

                    {memeDeployResult.tokenAddress ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 500, minWidth: 70 }}>Token</span>
                        <a
                          href={`https://sepolia.basescan.org/token/${memeDeployResult.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'underline', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}
                        >
                          {memeDeployResult.tokenAddress}
                        </a>
                      </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontWeight: 500, minWidth: 70 }}>Block</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{memeDeployResult.blockNumber}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontWeight: 500, minWidth: 70 }}>Chain</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>Base Sepolia (84532)</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                    <a
                      href={`https://sepolia.basescan.org/tx/${memeDeployResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost-btn"
                      style={{ fontSize: 11, padding: '5px 14px', textDecoration: 'none' }}
                    >
                      View on BaseScan
                    </a>
                    {memeDeployResult.tokenAddress ? (
                      <button
                        className="ghost-btn"
                        disabled={memeInteractMutation.isPending}
                        onClick={() => memeInteractMutation.mutate()}
                        style={{ fontSize: 11, padding: '5px 14px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', cursor: 'pointer' }}
                      >
                        {memeInteractMutation.isPending ? (
                          <><Loader2 className="spin" size={12} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Loading...</>
                        ) : (
                          <><HandCoins size={12} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Fee Demo</>
                        )}
                      </button>
                    ) : null}
                    {memeDeployResult.appId ? (
                      <button
                        className="ghost-btn"
                        onClick={() => {
                          triggerAppSpace(memeDeployResult.appId!).then(() => {
                            addToast('Spatial scene generation started — check the Atlas tab in ~30s', 'pass', 5000);
                            [5_000, 15_000, 30_000, 60_000].forEach((ms) => {
                              window.setTimeout(() => qc.invalidateQueries({ queryKey: ['appEvolutionAtlas'] }), ms);
                            });
                          }).catch(() => {
                            addToast('Spatial generation failed', 'block', 3000);
                          });
                        }}
                        style={{ fontSize: 11, padding: '5px 14px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', cursor: 'pointer' }}
                      >
                        <Globe size={12} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Generate Scene
                      </button>
                    ) : null}
                  </div>

                  {/* Skybox preview from Blockade Labs */}
                  {(() => {
                    const atlas: AppSpatialMemory[] = appEvolutionQuery.data?.atlas ?? [];
                    const scene = memeDeployResult.appId ? atlas.find((m) => m.appId === memeDeployResult.appId) : undefined;
                    if (!scene) return null;
                    if (scene.status_spatial === 'pending' || scene.status_spatial === 'processing') {
                      return (
                        <div style={{ borderRadius: 10, overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                          <Loader2 size={14} strokeWidth={1.5} className="spin" style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Generating 360° spatial scene…</span>
                        </div>
                      );
                    }
                    if (scene.thumbUrl || scene.fileUrl) {
                      return (
                        <div style={{ borderRadius: 10, overflow: 'hidden', position: 'relative', marginTop: 2 }}>
                          <img
                            src={scene.thumbUrl || scene.fileUrl}
                            alt={scene.title || 'Spatial scene'}
                            style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, display: 'block' }}
                          />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 50%)', borderRadius: 10 }} />
                          <div style={{ position: 'absolute', bottom: 8, left: 10, right: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                              <Globe size={11} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                              {scene.title || 'Spatial Memory'}
                            </span>
                            {scene.fileUrl && (
                              <a href={scene.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#fff', textDecoration: 'underline', textShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                                Open 360° ↗
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : null}

              {/* Fee split result card */}
              {memeInteractResult ? (
                <div
                  className="panel panel-show"
                  style={{
                    padding: '18px 20px',
                    marginBottom: 16,
                    background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                    borderRadius: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HandCoins size={16} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                      {memeInteractResult.simulated ? 'Fee Mechanism Demo' : 'Fee Split Transfer'}
                    </span>
                    <span style={{ fontSize: 10, background: 'color-mix(in srgb, var(--accent) 20%, transparent)', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                      {memeInteractResult.feePercent} fee
                    </span>
                    {memeInteractResult.simulated ? (
                      <span style={{ fontSize: 9, background: 'color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent)', color: 'var(--warning, #f59e0b)', padding: '2px 8px', borderRadius: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Simulated
                      </span>
                    ) : null}
                  </div>

                  {/* Amount breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 2 }}>Sent</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{Number(memeInteractResult.transferAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>BAGENT</div>
                    </div>
                    <div style={{ background: 'color-mix(in srgb, var(--pass) 10%, transparent)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--pass)', marginBottom: 2 }}>Recipient Gets</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pass)' }}>{Number(memeInteractResult.netAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>BAGENT</div>
                    </div>
                    <div style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 2 }}>Agent Fee</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{Number(memeInteractResult.feeAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>BAGENT</div>
                    </div>
                  </div>

                  {/* Balances / token info */}
                  {memeInteractResult.simulated ? (
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>Token Info (On-Chain)</div>
                      {memeInteractResult.totalSupply ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total Supply</span>
                          <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{Number(memeInteractResult.totalSupply).toLocaleString()} {memeInteractResult.tokenSymbol || 'BAGENT'}</span>
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Fee Recipient</span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>{memeInteractResult.feeRecipient.slice(0, 10)}…</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>Balances After Transfer</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Deployer (Signer)</span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{Number(memeInteractResult.balances.signer.balance).toLocaleString()} BAGENT</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Recipient</span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{Number(memeInteractResult.balances.recipient.balance).toLocaleString()} BAGENT</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Agent Treasury</span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent)' }}>{Number(memeInteractResult.balances.agentTreasury.balance).toLocaleString()} BAGENT</span>
                      </div>
                    </div>
                  )}

                  {/* Message */}
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)', paddingTop: 8, fontStyle: 'italic' }}>
                    {memeInteractResult.message}
                  </div>

                  {!memeInteractResult.simulated ? (
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 500, minWidth: 60 }}>Tx Hash</span>
                        <a
                          href={`https://sepolia.basescan.org/tx/${memeInteractResult.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'underline', fontFamily: 'var(--font-mono, monospace)', fontSize: 10, wordBreak: 'break-all' }}
                        >
                          {memeInteractResult.txHash}
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <section className={classNames('panel pipeline-panel', pipelineVisible && 'panel-show')}>
                <div className="panel-head">
                  <span>PIPELINE</span>
                  <span className="mono-accent">{pipelineStage} / 5</span>
                </div>

                <div className="stage-row" role="group" aria-label="Pipeline stages">
                  <div className="stage-connector-bg" aria-hidden />
                  <div className="stage-connector-fill" aria-hidden style={{ width: `${Math.min(100, ((pipelineStage - 1) / 4) * 80)}%` }} />
                  {stageNames.map((name, idx) => {
                    const Icon = stageIcons[idx];
                    const state = pipelineStates[idx];
                    return (
                      <div key={name} className="stage-item">
                        <div
                          className={classNames('stage-node', `stage-${state}`, state === 'active' && 'electric')}
                          role="status"
                          aria-label={`Stage ${name}: ${state}`}
                        >
                          {state === 'active' ? <span className="stage-pulse" aria-hidden /> : null}
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
                  <article className="output-card glare" role="region" aria-label="Vision understood">
                    <header><Lightbulb size={14} strokeWidth={1.5} />INTENT SUMMARY</header>
                    <p>{outputIdea?.description || 'No intent summary returned from the pipeline.'}</p>
                  </article>

                  <article className="output-card glare" role="region" aria-label="Generated idea">
                    <header><Sparkles size={14} strokeWidth={1.5} />PROPOSED APP</header>
                    <h4>{outputIdea?.title || 'No title'}</h4>
                    <div className="template-badge">{outputIdea?.templateId || 'template: none'}</div>
                    <p>{outputIdea?.description || 'No proposal details were generated.'}</p>
                    <div className="chip-wrap">
                      {(outputIdea?.capabilities || []).slice(0, 6).map((cap) => (
                        <span key={cap} className="cap-chip">{cap}</span>
                      ))}
                    </div>
                  </article>

                  <article className={classNames('output-card glare', verdict === 'DEPLOYED' ? 'card-pass' : 'card-block')} role="region" aria-label="Safety check result">
                    <header><ScanLine size={14} strokeWidth={1.5} />SAFETY CHECK</header>
                    {verdict === 'DEPLOYED' ? (
                      <>
                        <div className="safety-pass"><ShieldCheck size={16} strokeWidth={1.5} />PASS</div>
                        <div className="mono-line">Risk Score: 0</div>
                        <div className="check-lines">
                          {(runResult?.pipelineLogs || ['Capability allowlist verified', 'Static policy checks complete', 'Budget envelope validated', 'Simulation passed', 'No governance dependency']).slice(0, 5).map((line) => (
                            <div key={typeof line === 'string' ? line : JSON.stringify(line)}><CheckCircle2 size={14} strokeWidth={1.5} /><span>{typeof line === 'string' ? line : (line as Record<string, unknown>).step as string}</span></div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="safety-block"><ShieldAlert size={16} strokeWidth={1.5} />BLOCKED</div>
                        <p>{cycleLog[0]?.reason || 'Safety policy blocked this cycle.'}</p>
                      </>
                    )}
                  </article>

                  <article className="output-card glare" role="region" aria-label="Budget governor">
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
                    <div className={classNames('code-panel code-viewer', codeExpanded && 'code-panel-open')} role="region" aria-label="Generated app code">
                      <div className="code-title-bar">
                        <span className="code-dot code-dot-r" />
                        <span className="code-dot code-dot-y" />
                        <span className="code-dot code-dot-g" />
                        <span style={{ flex: 1, marginLeft: 8, fontSize: 11, color: 'var(--text-subtle)' }}>
                          {runResult?.idea?.title || 'generated-app'}
                        </span>
                        <span className="code-lang-badge">JSX</span>
                        <button className="icon-ghost" style={{ width: 28, height: 28, marginLeft: 6 }} onClick={onCopyCode} aria-label="Copy code to clipboard">
                          {copied ? <CheckCircle2 size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
                        </button>
                        <button
                          className="icon-ghost"
                          style={{ width: 28, height: 28, marginLeft: 4 }}
                          aria-label="Download code"
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
                          <Download size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                      <div className="code-body" tabIndex={0}>
                        {codeString.split('\n').map((line, i) => (
                          <div key={i} className="code-line">
                            <span className="line-num">{String(i + 1).padStart(3, ' ')}</span>
                            <span className={classNames(
                              'line-content',
                              line.trimStart().startsWith('//') && 'tok-comment'
                            )}>{line || '\u00a0'}</span>
                          </div>
                        ))}
                      </div>
                      {verdict === 'DEPLOYED' ? <p className="sim-note">Simulated - would deploy to Base if all checks pass.</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="code-empty">Code generation skipped because safety checks did not pass.</p>
                )}
              </section>

              </div>
            </section>
          ) : null}

          {activeTab === 'stats' ? (
            <section className="stats-col">
              {/* Real deployed apps count + cycle count */}
              {(() => {
                const realApps = appsQuery.data?.apps ?? [];
                const appCount = realApps.length;
                const sceneCount = (appEvolutionQuery.data?.atlas ?? []).length;
                const hasOnChain = Boolean(memeDeployResult);
                const totalDeploys = Math.max(appCount, cycleLog.filter((c) => c.status === 'DEPLOYED').length + (hasOnChain ? 1 : 0));
                return (
                  <>
                    <div className="focal-stat">
                      <div className="focal-number">{totalDeploys}</div>
                      <div className={classNames('focal-delta', totalDeploys === 0 && 'neg')}>
                        {totalDeploys > 0 ? `${totalDeploys} app${totalDeploys > 1 ? 's' : ''} deployed on-chain` : 'No apps deployed yet'}
                      </div>
                    </div>

                    <div className="stats-hero">
                      <div><span className="hero-label">On-Chain Apps</span><strong>{appCount}</strong></div>
                      <div><span className="hero-label">Spatial Scenes</span><strong>{sceneCount}</strong></div>
                      <div><span className="hero-label">Build Cycles</span><strong>{cycleLog.length}</strong></div>
                    </div>
                  </>
                );
              })()}

              {/* Deployed token info */}
              {memeDeployResult ? (
                <div className="panel glare" style={{ marginBottom: 16 }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <Rocket size={15} strokeWidth={1.5} style={{ color: 'var(--pass)' }} />
                    Deployed Token
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0 6px' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Token Address</div>
                      <a
                        href={`https://sepolia.basescan.org/token/${memeDeployResult.tokenAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}
                      >
                        {memeDeployResult.tokenAddress ?? 'N/A'}
                      </a>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Block</div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{memeDeployResult.blockNumber}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Chain</div>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>Base Sepolia (84532)</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Fee Mechanism</div>
                      <span style={{ fontSize: 12, color: 'var(--pass)' }}>3% Agent Treasury</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {cycleLog.length > 0 ? (
                <>
                  <div className="pass-block">
                    <div className="pass-fill" style={{ width: `${passPct}%` }} />
                  </div>
                  <div className="pass-legend"><span>{passCount} PASS</span><span>{blockCount} BLOCK</span></div>
                </>
              ) : null}

              {cycleLog.length === 0 && !memeDeployResult ? (
                <div className="empty-slot">
                  <div className="empty-icon"><BarChart3 size={32} strokeWidth={1} /></div>
                  <p className="empty-title">No activity yet</p>
                  <p className="empty-hint">Deploy a meme token or run a build cycle to populate analytics.</p>
                </div>
              ) : null}

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

              {/* On-Chain Revenue from Meme Token */}
              {memeInteractResult ? (
                <div className="panel glare" style={{ marginBottom: 0 }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HandCoins size={15} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                    On-Chain Revenue (BAGENT)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, margin: '14px 0 8px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{Number(memeInteractResult.feeAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Agent Fee Revenue</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--pass)' }}>{Number(memeInteractResult.netAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Recipient Received</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{Number(memeInteractResult.transferAmount).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Total Transferred</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Fee: {memeInteractResult.feePercent}</span>
                    <span>Treasury: {Number(memeInteractResult.balances.agentTreasury.balance).toLocaleString()} BAGENT</span>
                  </div>
                </div>
              ) : memeDeployResult ? (
                <div className="panel glare" style={{ marginBottom: 0, opacity: 0.7 }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HandCoins size={15} strokeWidth={1.5} />
                    On-Chain Revenue (BAGENT)
                  </h4>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', padding: '12px 0 4px' }}>
                    Token deployed with 3% fee mechanism. Use the &quot;Fee Demo&quot; button on the Agent tab to see the fee split in action.
                  </div>
                </div>
              ) : null}

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

          {activeTab === 'spatial' ? (
            <section className="stats-col">
              {/* ── Spatial Memory via Blockade Labs ── */}
              <div className="panel glare" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={16} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                    <h4 style={{ margin: 0 }}>Spatial Memory</h4>
                  </div>
                  <span className="badge neutral" style={{ fontSize: 10 }}>Blockade Labs</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 16, lineHeight: 1.6 }}>
                  Each deployed app is encoded into a persistent 360° skybox — the agent's spatial long-term memory. Zones and agent markers are projected into the scene to surface risk, intent drift, and decision context at a glance.
                </p>
                {/* Top-level stats */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { label: 'App Scenes', value: appEvolutionQuery.data ? String(appEvolutionQuery.data.count ?? 0) : '—' },
                    { label: 'Total Markers', value: (() => {
                      const appMarkers = (appEvolutionQuery.data?.atlas ?? []).reduce((s: number, m: any) => s + (m.agentMarkers?.length ?? 0), 0);
                      return appMarkers > 0 ? String(appMarkers) : '—';
                    })() },
                  ].map(({ label, value }) => (
                    <AtlasStat key={label} label={label} value={value} />
                  ))}
                </div>
              </div>

              {/* App Evolution Atlas */}
              <div className="panel glare">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Rocket size={14} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                    App Evolution Atlas
                  </h4>
                  {appEvolutionQuery.isFetching && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" style={{ color: 'var(--text-subtle)' }} />}
                </div>
                {appEvolutionQuery.isError ? (
                  <p style={{ fontSize: 12, color: 'var(--danger)' }}>Failed to load app atlas.</p>
                ) : appEvolutionQuery.isLoading ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[0,1].map(i => <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] h-40 animate-pulse" />)}
                  </div>
                ) : (() => {
                  const atlas: any[] = appEvolutionQuery.data?.atlas ?? [];
                  return atlas.length === 0 ? (
                    <div className="empty-slot">
                      <div className="empty-icon"><Sparkles size={28} strokeWidth={1} /></div>
                      <p className="empty-title">No app scenes yet</p>
                      <p className="empty-hint">Deploy a meme token and the agent will generate a Blockade Labs scene encoding its spatial memory.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {atlas.map((mem: AppSpatialMemory) => (
                        <AppSceneCard key={mem.appId} mem={mem} sevBadge={spatialSevBadge} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </section>
          ) : null}

          {activeTab === 'settings' ? (
            <section className="stats-col">
              <div className="panel settings-panel">
                <h4>Workspace Controls</h4>
                <p>Wallet: {demoMode ? 'Demo wallet' : walletAddress ? truncateAddress(walletAddress) : 'Not connected'}</p>
                <div className="settings-actions">
                  <button className="ghost-btn" onClick={onThemeToggle}>{theme === 'dark' ? 'Use light theme' : 'Use dark theme'}</button>
                  <button className="ghost-btn" onClick={() => { setDemoMode(false); onDisconnect(); }}>Reset workspace</button>
                </div>
                <div className="mt-6">
                  <h5 className="mb-3 text-sm font-semibold text-white">Preferred industries</h5>
                  <p className="mb-3 text-xs text-gray-500">Guide idea generation toward the markets you want this workspace to prioritize.</p>
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
          <div className={classNames('bubble-nav', isRunning && 'is-running')} role="navigation" aria-label="App navigation">
              {[
              { key: 'agent' as const, label: 'Build', icon: Sparkles },
              { key: 'stats' as const, label: 'Metrics', icon: BarChart3 },
              { key: 'spatial' as const, label: 'Atlas', icon: Globe },
              { key: 'settings' as const, label: 'Controls', icon: SlidersHorizontal },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} className={classNames('bubble-tab', active && 'bubble-tab-active')} onClick={() => setActiveTab(tab.key)} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} strokeWidth={1.5} />
                  <span className={classNames('bubble-label', active && 'bubble-label-active')}>{tab.label}</span>
                  {active ? <span className="bubble-dot" /> : null}
                </button>
              );
            })}
          </div>

          <div className={classNames('agent-bubble', bubbleOpen && 'agent-bubble-open', isRunning && 'is-running')}>
            <button
              className={classNames('agent-fab', outcomeFlash && `outcome-${outcomeFlash}`)}
              onClick={() => setBubbleOpen((v) => !v)}
              aria-label={
                isRunning ? 'Agent running' :
                verdict === 'DEPLOYED' ? 'Agent — last cycle deployed' :
                verdict === 'BLOCKED' ? 'Agent — last cycle blocked' :
                'Agent status'
              }
            >
              {isRunning ? null : <span className="ring" />}
              {isRunning ? null : <span className="ring ring-delay" />}
              {isRunning
                ? <Loader2 className="spin-slow" size={20} strokeWidth={1.5} />
                : <Sparkles size={20} strokeWidth={1.5} />}
            </button>
            <div className="agent-info-pill">{cycleLog.length} cycles · ${totalBudgetUsed.toFixed(2)} used</div>
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

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={classNames('toast', `toast-${toast.tone}`)} onClick={() => !toast.persistent && setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>
            <div>{toast.text}</div>
            {toast.persistent ? (
              <button className="icon-ghost" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>
                <XCircle size={14} strokeWidth={1.5} />
              </button>
            ) : (
              <div className="toast-timer" style={{ animationDuration: `${toast.ttl}ms` }} />
            )}
          </div>
        ))}
      </div>

      <style jsx global>{`
        :root {
          /* ── Surfaces (darker, glassy base) ───────────────── */
          --bg: #050508;
          --surface: #0c0c10;
          --surface-2: #121218;
          --surface-3: #18181e;
          --surface-4: #1e1e26;

          /* ── Glass tokens (Apple-style blur) ────────────────── */
          --glass-bg: rgba(20, 20, 26, 0.68);
          --glass-bg-light: rgba(255, 255, 255, 0.035);
          --glass-border: rgba(255, 255, 255, 0.07);
          --glass-border-strong: rgba(255, 255, 255, 0.12);
          --glass-shine: rgba(255, 255, 255, 0.045);
          --glass-blur: saturate(180%) blur(28px);

          /* ── Borders ──────────────────────────────────────── */
          --border: rgba(255, 255, 255, 0.07);
          --border-muted: rgba(255, 255, 255, 0.04);
          --border-strong: rgba(255, 255, 255, 0.12);
          --border-accent: rgba(255, 122, 36, 0.45);
          --border-pass: rgba(52, 199, 89, 0.35);
          --border-block: rgba(255, 69, 58, 0.35);

          /* ── Typography (clear hierarchy) ──────────────────── */
          --text: #f2f2f0;
          --text-muted: #9a9a98;
          --text-subtle: #5a5a58;

          /* ── Accent (orange) ──────────────────────────────── */
          --accent: #ff7a24;
          --accent-dim: #d96618;
          --accent-bright: #ff9542;
          --accent-glow: rgba(255, 122, 36, 0.22);
          --accent-glow-sm: rgba(255, 122, 36, 0.12);
          --accent-glow-xs: rgba(255, 122, 36, 0.06);

          /* ── Semantic ─────────────────────────────────────── */
          --pass: #34c759;
          --pass-muted: rgba(52, 199, 89, 0.12);
          --block: #ff453a;
          --block-muted: rgba(255, 69, 58, 0.12);
          --warning: #ff9f0a;
          --warning-muted: rgba(255, 159, 10, 0.12);

          /* ── Brand ────────────────────────────────────────── */
          --base-blue: #0052ff;
          --wallet-blue: #3b99fc;
          --wallet-fox: #f6851b;
          --social: #60a5fa;
          --mini: #818cf8;

          /* ── Elevation (softer, glassy) ──────────────────── */
          --shadow-1: 0 1px 3px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04);
          --shadow-2: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
          --shadow-3: 0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
          --shadow-4: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);

          /* ── Motion ───────────────────────────────────────── */
          --dur-instant: 80ms;
          --dur-fast: 150ms;
          --dur-normal: 280ms;
          --dur-slow: 400ms;
          --dur-crawl: 700ms;
          --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);
          --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
          --ease-sharp: cubic-bezier(0.2, 0, 0, 1);

          /* ── Spacing ──────────────────────────────────────── */
          --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
          --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;
          --sp-12: 48px; --sp-16: 64px;

          /* ── Radii ────────────────────────────────────────── */
          --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 20px; --r-pill: 999px;
        }

        html[data-theme='light'] {
          --bg: #f0f0ed;
          --surface: rgba(255, 255, 255, 0.82);
          --surface-2: rgba(248, 248, 246, 0.9);
          --surface-3: rgba(238, 238, 234, 0.95);
          --surface-4: #e2e2dd;
          --glass-bg: rgba(255, 255, 255, 0.68);
          --glass-bg-light: rgba(0, 0, 0, 0.03);
          --glass-border: rgba(0, 0, 0, 0.08);
          --glass-border-strong: rgba(0, 0, 0, 0.14);
          --glass-shine: rgba(255, 255, 255, 0.7);
          --border: rgba(0, 0, 0, 0.09);
          --border-muted: rgba(0, 0, 0, 0.05);
          --border-strong: rgba(0, 0, 0, 0.16);
          --text: #0d0d0b;
          --text-muted: #3a3a38;
          --text-subtle: #7a7a77;
          --accent: #e55c00;
          --accent-dim: #c24a00;
          --accent-bright: #ff6d00;
          --accent-glow: rgba(229, 92, 0, 0.2);
          --accent-glow-sm: rgba(229, 92, 0, 0.11);
          --accent-glow-xs: rgba(229, 92, 0, 0.06);
          --pass: #16a34a;
          --pass-muted: rgba(22, 163, 74, 0.11);
          --block: #dc2626;
          --block-muted: rgba(220, 38, 38, 0.09);
          --warning: #d97706;
          --warning-muted: rgba(217, 119, 6, 0.09);
          --shadow-1: 0 1px 4px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55);
          --shadow-2: 0 4px 18px rgba(0,0,0,0.11), 0 2px 6px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.60);
          --shadow-3: 0 10px 36px rgba(0,0,0,0.13), 0 4px 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.65);
          --shadow-4: 0 24px 70px rgba(0,0,0,0.16), 0 8px 18px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.68);
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--font-dm); font-size: 15px; line-height: 1.55; letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }

        .app-root { min-height: 100vh; position: relative; background: var(--bg); color: var(--text); overflow-x: hidden; }
        .app-root.outcome-flash::after {
          content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 500;
          animation: bg-flash 600ms ease-out 1 forwards;
        }
        .app-root.outcome-flash-pass::after { background: rgba(34, 197, 94, 0.05); }
        .app-root.outcome-flash-block::after { background: rgba(239, 68, 68, 0.05); }
        @keyframes bg-flash { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
        .bars-canvas, .flow-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 0; }

        .top-bar {
          height: 56px; position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 24px;
          background: rgba(12, 12, 16, 0.72);
          backdrop-filter: saturate(180%) blur(24px);
          -webkit-backdrop-filter: saturate(180%) blur(24px);
          border-bottom: 1px solid var(--glass-border);
          box-shadow: 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.25);
        }
        .brand-small {
          font-family: var(--font-syne); font-weight: 700; font-size: 15px;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, var(--text) 35%, var(--text-muted));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .top-actions { justify-self: end; display: flex; gap: 8px; align-items: center; }
        .net-pill {
          justify-self: center; display: flex; align-items: center; gap: 7px; font-size: 12px;
          color: var(--text-muted); background: var(--glass-bg-light);
          border: 1px solid var(--glass-border); border-radius: 99px; padding: 5px 12px;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          letter-spacing: 0.01em;
        }
        .live-dot { width: 6px; height: 6px; border-radius: 99px; background: var(--pass); animation: pulse-dot 2s infinite; }
        .live-dot-warning { background: var(--warning); }
        .live-dot-block { background: var(--block); }
        @keyframes pulse-dot { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:1} }
        .net-pill-testnet { color: var(--warning, #f59e0b); border-color: color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent); }
        .net-pill-wrong   { color: var(--block, #ef4444);   border-color: color-mix(in srgb, var(--block, #ef4444) 35%, transparent); }

        /* Neural thread */
        .neural-thread {
          position: fixed; top: 56px; left: 0; height: 1px; width: 0%;
          background: linear-gradient(90deg, transparent, var(--accent), var(--accent-bright), var(--accent), transparent);
          z-index: 49; opacity: 0; transition: opacity var(--dur-fast) ease;
        }
        .neural-thread.active {
          opacity: 1; animation: thread-sweep 1.8s linear infinite;
        }
        @keyframes thread-sweep {
          0%   { width: 0%;  left: 0%; }
          50%  { width: 40%; left: 30%; }
          100% { width: 0%;  left: 100%; }
        }

        .icon-ghost, .ghost-btn {
          height: 34px; border-radius: 9px;
          border: 1px solid var(--glass-border); background: var(--glass-bg-light);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px;
          transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease;
          box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset;
        }
        .icon-ghost { width: 34px; padding: 0; }
        .icon-ghost:hover, .ghost-btn:hover { background: var(--glass-border); border-color: var(--glass-border-strong); }

        .wallet-chip {
          height: 34px; border-radius: 9px; border: 1px solid var(--glass-border);
          background: var(--glass-bg-light); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          padding: 0 10px; font-family: var(--font-jet); font-size: 12px; display: inline-flex; align-items: center; gap: 6px;
          letter-spacing: 0.02em;
        }
        .demo-badge { background: var(--warning-muted); border: 1px solid rgba(245, 158, 11, 0.35); color: var(--warning); border-radius: 8px; padding: 5px 8px; font-family: var(--font-jet); font-size: 11px; letter-spacing: 0.04em; }

        .offline-banner {
          position: fixed; top: 56px; left: 0; right: 0; height: 40px; z-index: 45;
          background: rgba(239, 68, 68, 0.12);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(239, 68, 68, 0.25);
          display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--block); font-size: 13px;
          animation: slide-down 200ms ease;
        }
        @keyframes slide-down { from { transform: translateY(-40px); } to { transform: translateY(0); } }

        .landing-main { position: relative; z-index: 10; min-height: 100vh; display: flex; align-items: center; }
        .landing-text { width: min(520px, 100%); margin-left: clamp(24px, 7vw, 72px); }

        .wordmark { font-family: var(--font-syne); font-weight: 800; font-size: clamp(52px, 8vw, 80px); letter-spacing: -0.035em; line-height: 1.05; margin: 0; position: relative; display: inline-block; }
        .wordmark::after { content: ''; position: absolute; left: 0; bottom: -8px; height: 3px; width: 0%; background: linear-gradient(90deg, var(--accent), var(--accent-bright)); border-radius: 2px; transition: width 700ms var(--ease-standard); }
        .wordmark-ready::after { width: 100%; }

        .tagline { margin-top: 20px; font-family: var(--font-syne); font-size: clamp(28px, 4vw, 38px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; display: grid; gap: 6px; color: var(--text); }
        .split span { opacity: 0; transform: translateY(18px); animation: split-up 380ms ease forwards; }
        .split span:nth-child(1) { animation-delay: 1200ms; }
        .split span:nth-child(2) { animation-delay: 1260ms; }
        @keyframes split-up { to { opacity: 1; transform: translateY(0); } }

        .desc { margin-top: 24px; font-size: 17px; color: var(--text-muted); line-height: 1.6; letter-spacing: 0.01em; opacity: 0; animation: fade-in 300ms ease 1650ms forwards; }
        @keyframes fade-in { to { opacity: 1; } }

        .feature-pills { margin-top: 24px; display: grid; gap: 10px; }
        .pill-row {
          width: fit-content; display: inline-flex; gap: 8px; align-items: center;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          border-radius: 99px; padding: 9px 17px; font-size: 14px; color: var(--text-muted);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.2);
          opacity: 0; transform: translateY(12px); animation: pill-up 280ms ease forwards;
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
          width: 100%; height: 52px; border-radius: 12px;
          background: linear-gradient(160deg, var(--accent-bright) 0%, var(--accent) 60%, var(--accent-dim) 100%);
          color: #fff;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          font-family: var(--font-syne); font-size: 15px; font-weight: 600; letter-spacing: 0.01em;
          transition: transform 120ms ease, filter 250ms ease, box-shadow 250ms ease;
          box-shadow: 0 2px 14px rgba(255,109,0,0.30), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15);
        }
        .cta-btn:hover { filter: brightness(1.07); box-shadow: 0 4px 24px rgba(255,109,0,0.42), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.15); }
        .cta-btn:active { transform: scale(0.97); filter: brightness(0.95); }
        .cta-btn:disabled { opacity: 0.38; cursor: not-allowed; box-shadow: none; }

        .connector-list {
          margin-top: 8px; max-height: 0; opacity: 0; overflow: hidden; border: 1px solid transparent;
          border-radius: 13px; background: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
          transition: max-height 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .connector-list-open { max-height: 260px; opacity: 1; border-color: var(--glass-border); padding: 8px; box-shadow: var(--shadow-3); }
        .connector-item { width: 100%; border-radius: 9px; display: flex; align-items: center; gap: 10px; padding: 12px; font-size: 14px; color: var(--text); }
        .connector-item:hover { background: var(--glass-bg-light); }
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
          background: var(--glass-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--glass-border);
        }
        .subtle-line { font-size: 11px; color: var(--text-subtle); display: inline-flex; align-items: center; gap: 8px; }
        .base-box { width: 16px; height: 16px; background: var(--base-blue); display: inline-block; }

        .app-main { position: relative; z-index: 10; padding: 80px 16px 140px; max-width: 1600px; margin: 0 auto; }
        .agent-layout { width: 100%; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
        .agent-col { width: min(720px, 100%); margin: 0 auto; display: grid; gap: 16px; }
        .stats-col { width: min(980px, 100%); margin: 0 auto; display: grid; gap: 16px; padding-bottom: 120px; }
        .center-head { text-align: left; display: grid; gap: 8px; margin-bottom: 4px; }
        .vision-title { font-family: var(--font-syne); font-size: clamp(24px, 3.8vw, 29px); margin: 0; letter-spacing: -0.02em; transition: filter 280ms ease, opacity 280ms ease; }
        .vision-title-blur { filter: blur(0.8px); opacity: 0.4; }
        .center-head p { margin: 0; color: var(--text-muted); font-size: 15px; line-height: 1.55; }

        .panel {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 18px;
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          box-shadow: var(--shadow-2);
          position: relative;
        }
        /* Apple-style inner top shine on glass panels */
        .panel::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          background: linear-gradient(180deg, var(--glass-shine) 0%, transparent 40%);
          mask-image: linear-gradient(180deg, black 0%, transparent 100%);
          -webkit-mask-image: linear-gradient(180deg, black 0%, transparent 100%);
          height: 1px; top: 0; background: var(--glass-border-strong); border-radius: 18px 18px 0 0; z-index: 1;
        }

        .vision-panel {
          --fill-pct: 0%;
          padding: 24px;
          position: relative;
          overflow: hidden;
          border-color: color-mix(in srgb, var(--glass-border) calc(100% - (var(--prox, 0) * 80%)), var(--accent));
          box-shadow: var(--shadow-2), 0 0 0 calc(var(--prox, 0) * 5px) rgba(255, 109, 0, calc(var(--prox, 0) * 0.1));
          transition: box-shadow 180ms ease, border-color 180ms ease;
        }
        .vision-panel::before {
          content: ''; position: absolute; top: 0; left: 0;
          height: 3px; width: var(--fill-pct);
          background: var(--accent); transition: width 200ms ease; z-index: 1;
        }
        .vision-panel::after {
          content: ''; position: absolute; left: 0; right: 0;
          height: 2px; background: linear-gradient(90deg, transparent, rgba(255,109,0,0.05), transparent);
          animation: scan 3s linear infinite paused; top: 0; z-index: 0;
        }
        .vision-panel:focus-within::after { animation-play-state: running; }
        @keyframes scan { from { transform: translateY(0); } to { transform: translateY(100%); } }

        .vision-input {
          width: 100%; min-height: 160px; resize: none; border: 0; outline: none; border-radius: 12px;
          background: rgba(0, 0, 0, 0.22); color: var(--text);
          padding: 18px; font-size: 16px; line-height: 1.75; font-family: var(--font-dm);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.04);
          transition: box-shadow 200ms ease;
        }
        .vision-input:focus { box-shadow: inset 0 1px 3px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,109,0,0.28); }
        .vision-input::placeholder { color: var(--text-subtle); font-size: 15px; line-height: 1.6; }
        html[data-theme='light'] .vision-input { background: rgba(0,0,0,0.04); box-shadow: inset 0 1px 3px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.06); }

        .quick-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .quick-row > span { color: var(--text-subtle); font-size: 11px; }
        .category-pill {
          border: 1px solid var(--glass-border); border-radius: 99px; padding: 6px 12px; font-size: 12px;
          color: var(--text-muted); background: var(--glass-bg);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
        }
        .category-pill:hover { background: var(--accent); color: #fff; border-color: transparent; }

        .char-count { margin-top: 10px; text-align: right; font-family: var(--font-jet); font-size: 11px; color: var(--text-subtle); }
        .char-warning { color: var(--warning); }
        .char-danger { color: var(--block); }

        .run-btn {
          width: 100%; height: 56px; border-radius: 14px;
          background: linear-gradient(160deg, var(--accent-bright) 0%, var(--accent) 55%, var(--accent-dim) 100%);
          color: #fff;
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          font-family: var(--font-syne); font-size: 16px; font-weight: 600; letter-spacing: 0.01em;
          transition: transform 120ms ease, filter 250ms ease, box-shadow 250ms ease;
          position: relative; overflow: hidden;
          box-shadow: 0 2px 16px rgba(255,109,0,0.32), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15);
        }
        .run-btn:hover:not(:disabled) { filter: brightness(1.07); box-shadow: 0 4px 28px rgba(255,109,0,0.44), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.15); }
        .run-btn:active:not(:disabled) { transform: scale(0.97); filter: brightness(0.95); }
        .run-btn:disabled { opacity: 0.38; cursor: not-allowed; box-shadow: none; }

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
        .panel-head span:first-child { font-size: 10px; letter-spacing: 0.14em; color: var(--text-subtle); font-weight: 600; text-transform: uppercase; }
        .mono-accent { color: var(--accent); font-family: var(--font-jet); font-size: 11px; letter-spacing: 0.04em; }

        .stage-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; position: relative; }
        .stage-item { text-align: center; position: relative; z-index: 2; }
        .stage-connector-bg {
          position: absolute; top: 22px; left: 10%; right: 10%;
          height: 1px; background: var(--border); z-index: 0;
        }
        .stage-connector-fill {
          position: absolute; top: 22px; left: 10%;
          height: 1px; background: var(--accent); width: 0%;
          transition: width 400ms ease; z-index: 1;
        }
        .stage-node {
          width: 44px; height: 44px; border-radius: 99px; margin: 0 auto; display: grid; place-items: center;
          border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-subtle); position: relative;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
        }
        .stage-pending { background: var(--glass-bg); color: var(--text-subtle); }
        .stage-active { border: 1.5px solid var(--accent); color: var(--accent); background: rgba(255,109,0,0.08); }
        .stage-complete { background: rgba(34,197,94,0.12); color: var(--pass); border-color: rgba(34,197,94,0.3); }
        .stage-failed { background: rgba(239,68,68,0.12); color: var(--block); border-color: rgba(239,68,68,0.3); animation: node-shake 300ms linear 1; }
        @keyframes node-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px)} 40%{transform:translateX(3px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }
        .stage-pulse {
          position: absolute; inset: -4px; border-radius: 99px;
          border: 1.5px solid var(--accent); animation: stage-pulse 1.2s ease-out infinite;
        }
        @keyframes stage-pulse { from { transform: scale(1); opacity: 0.5; } to { transform: scale(2); opacity: 0; } }
        .electric { position: relative; background: linear-gradient(var(--surface-2), var(--surface-2)) padding-box, conic-gradient(from var(--angle), var(--accent), transparent 40%, var(--accent)) border-box; border: 1.5px solid transparent; animation: spin-angle 1.4s linear infinite; }
        @property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes spin-angle { to { --angle: 360deg; } }

        .stage-name { margin-top: 8px; font-size: 10px; letter-spacing: 0.08em; color: var(--text-subtle); }
        .stage-log { margin-top: 4px; font-size: 11px; font-family: var(--font-jet); color: var(--text-muted); min-height: 14px; }

        .result-word { text-align: center; font-family: var(--font-syne); font-size: clamp(42px, 7.5vw, 58px); font-weight: 800; letter-spacing: -0.03em; padding: 32px 0; position: relative; }
        .result-word::after { content: ''; position: absolute; left: 50%; transform: translateX(-50%); bottom: 22px; height: 2px; width: 0%; transition: width 500ms ease; background: currentColor; border-radius: 2px; }
        .result-pass { color: var(--pass); }
        .result-block { color: var(--block); }
        .result-warning { color: var(--warning); }
        .result-pass::after, .result-block::after, .result-warning::after { width: 60%; }

        .output-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .output-card {
          background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px; padding: 18px;
          border-left-width: 3px;
          position: relative; overflow: hidden;
          box-shadow: var(--shadow-1);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          opacity: 0; transform: translateY(12px);
        }
        .panel-show .output-card {
          animation: card-rise 320ms var(--ease-spring) forwards;
        }
        .panel-show .output-card:nth-child(1) { animation-delay: 40ms; }
        .panel-show .output-card:nth-child(2) { animation-delay: 100ms; }
        .panel-show .output-card:nth-child(3) { animation-delay: 160ms; }
        .panel-show .output-card:nth-child(4) { animation-delay: 220ms; }
        @keyframes card-rise { to { opacity: 1; transform: translateY(0); } }
        .output-card.card-pass { box-shadow: 0 0 0 1px rgba(34,197,94,0.2), 0 4px 28px rgba(34,197,94,0.08); border-color: var(--border-pass); border-left-color: var(--pass); }
        .output-card.card-block { box-shadow: 0 0 0 1px rgba(239,68,68,0.22), 0 4px 28px rgba(239,68,68,0.1); border-color: var(--border-block); border-left-color: var(--block); }
        .output-card::before, .panel.glare::before {
          content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 200ms ease;
          background: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255, 255, 255, 0.07) 0%, transparent 65%);
        }
        .output-card:hover::before, .panel.glare:hover::before { opacity: 1; }

        .output-card header { font-size: 10px; letter-spacing: 0.12em; color: var(--text-subtle); display: inline-flex; align-items: center; gap: 6px; text-transform: uppercase; font-weight: 500; }
        .output-card h4 { margin: 12px 0 6px; font-family: var(--font-syne); font-size: 17px; letter-spacing: -0.01em; }
        .output-card p { margin: 8px 0 0; font-size: 14px; color: var(--text-muted); line-height: 1.6; }

        .template-badge { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 7px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); font-size: 11px; font-family: var(--font-jet); color: var(--text-muted); letter-spacing: 0.03em; }
        .chip-wrap { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
        .cap-chip { border: 1px solid var(--glass-border); border-radius: 7px; padding: 4px 9px; font-size: 11px; background: rgba(255,255,255,0.04); color: var(--text-muted); }

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
        .code-panel {
          border: 1px solid var(--glass-border); border-radius: 14px; margin-top: 8px; max-height: 0; overflow: hidden;
          transition: max-height 240ms ease;
          background: rgba(5,5,8,0.72); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        }
        .code-panel-open { max-height: 480px; }
        /* IDE-style code viewer */
        .code-viewer { background: rgba(5,5,8,0.85); backdrop-filter: blur(12px); border-radius: 12px; overflow: hidden; font-family: var(--font-jet); font-size: 12px; line-height: 1.6; }
        .code-title-bar {
          height: 36px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; padding: 0 14px; gap: 8px;
        }
        .code-dot { width: 10px; height: 10px; border-radius: 99px; }
        .code-dot-r { background: #ff5f56; }
        .code-dot-y { background: #ffbd2e; }
        .code-dot-g { background: #27c93f; }
        .code-lang-badge {
          margin-left: auto; font-family: var(--font-jet); font-size: 10px; color: var(--text-subtle);
          letter-spacing: 0.08em; padding: 3px 8px; border: 1px solid var(--border); border-radius: 4px;
        }
        .code-body { max-height: 360px; overflow-y: auto; padding: 12px 0; }
        .code-body:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
        .code-line { display: grid; grid-template-columns: 40px 1fr; min-height: 20px; }
        .code-line:hover { background: rgba(255,255,255,0.03); }
        .line-num { color: var(--text-subtle); text-align: right; padding-right: 16px; user-select: none; font-size: 11px; }
        .line-content { padding-right: 16px; color: var(--text-muted); white-space: pre-wrap; word-break: break-all; }
        .tok-comment { color: #5a5a57; font-style: italic; }
        .tok-keyword { color: #ff6d00; }
        .code-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 8px 0; }
        .code-scroll { max-height: 360px; overflow: auto; padding: 0 14px 10px; }
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
          border: 1px solid var(--glass-border); border-radius: 12px;
          background: var(--glass-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          padding: 12px 16px; display: grid; grid-template-columns: auto 1fr auto; gap: 12px;
          cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease;
          box-shadow: var(--shadow-1);
          animation: list-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cycle-item:hover { background: var(--glass-bg-light); border-color: var(--glass-border-strong); }
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
          position: relative; min-width: 280px; border: 1px solid var(--glass-border); border-radius: 16px;
          background: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
          padding: 20px 20px 20px 24px; overflow: hidden;
          transition: transform 280ms var(--ease-spring), box-shadow 280ms ease;
          box-shadow: var(--shadow-1);
        }
        .app-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-3); border-color: var(--glass-border-strong); }
        .app-card::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 4px; border-radius: 4px 0 0 4px; background: var(--border);
          transition: background-color 200ms ease;
        }
        .app-card.status-deployed::before { background: var(--pass); }
        .app-card.status-incubating::before { background: var(--accent); }
        .app-card.status-dropped::before { background: var(--block); }
        .app-monogram {
          width: 36px; height: 36px; border-radius: 10px; background: var(--accent-glow);
          display: grid; place-items: center; font-family: var(--font-syne); font-size: 13px; font-weight: 700;
          color: var(--accent); flex-shrink: 0;
        }
        .app-head { display: flex; gap: 12px; align-items: flex-start; }
        .app-head-text { flex: 1; min-width: 0; }
        .app-head-text h4 { margin: 0 0 4px; font-size: 15px; font-family: var(--font-syne); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .app-status-row { display: flex; align-items: center; gap: 6px; }
        .metric-stack { margin-top: 12px; display: grid; gap: 10px; }
        .metric-label { font-family: var(--font-jet); font-size: 11px; color: var(--text-subtle); margin-bottom: 4px; }
        .metric-track { height: 4px; border-radius: 6px; background: var(--surface-3); overflow: hidden; }
        .metric-fill {
          height: 100%; background: var(--pass);
          width: 0%;
          animation: metric-in var(--dur-slow) var(--ease-standard) forwards;
        }
        @keyframes metric-in { to { width: var(--target, 0%); } }
        .metric-fill.warning { background: var(--warning); }
        .metric-fill.block { background: var(--block); }
        .handoff { margin-top: 12px; color: var(--pass); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
        .drop { margin-top: 12px; color: var(--block); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }

        .focal-stat { padding: 40px 24px 32px; border-bottom: 1px solid var(--border); }
        .focal-number { font-family: var(--font-syne); font-size: clamp(64px, 10vw, 96px); font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
        .focal-delta { margin-top: 6px; font-family: var(--font-jet); font-size: 13px; color: var(--pass); }
        .focal-delta.neg { color: var(--text-subtle); }

        .stats-hero { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); background: var(--glass-bg); box-shadow: var(--shadow-1); }
        .stats-hero > div { padding: 20px; border-right: 1px solid var(--glass-border); }
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
          padding: 8px; border-radius: 99px;
          border: 1px solid var(--glass-border-strong);
          backdrop-filter: saturate(200%) blur(32px); -webkit-backdrop-filter: saturate(200%) blur(32px);
          background: rgba(14, 14, 18, 0.78);
          display: inline-flex; gap: 4px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.52), 0 2px 8px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        html[data-theme='light'] .bubble-nav {
          background: rgba(252, 252, 250, 0.82);
          box-shadow: 0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8);
        }
        .bubble-tab { position: relative; width: 86px; height: 44px; border-radius: 99px; display: grid; place-items: center; color: var(--text-muted); transition: transform var(--dur-fast) ease, background-color var(--dur-fast) ease; }
        .bubble-tab:hover { transform: scale(1.08); background: rgba(255,255,255,0.06); }
        .bubble-tab-active { color: var(--accent); background: rgba(255,109,0,0.1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
        .bubble-label { display: none; }
        .bubble-label-active {
          display: block; position: absolute; top: -18px; font-size: 11px; color: var(--text-subtle); opacity: 0;
          animation: bubble-label 200ms ease forwards;
        }
        @keyframes bubble-label { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .bubble-dot { position: absolute; bottom: 4px; width: 4px; height: 4px; border-radius: 99px; background: var(--accent); }

        .agent-bubble { position: fixed; right: 24px; bottom: 96px; z-index: 200; }
        .agent-fab {
          width: 56px; height: 56px; border-radius: 99px; background: var(--accent); color: #fff;
          position: relative; display: grid; place-items: center; box-shadow: var(--shadow-3);
          transition: background-color 300ms ease, box-shadow 300ms ease;
        }
        .agent-fab.outcome-pass { animation: fab-pass 600ms ease-out 1; }
        .agent-fab.outcome-block { animation: fab-block 600ms ease-out 1; }
        @keyframes fab-pass { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); } 100% { box-shadow: 0 0 0 18px rgba(34,197,94,0); } }
        @keyframes fab-block { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); } 100% { box-shadow: 0 0 0 18px rgba(239,68,68,0); } }
        .ring { position: absolute; inset: 0; border-radius: 99px; border: 1.5px solid var(--accent); animation: pulse-ring 1.8s ease-out infinite; }
        .ring-delay { animation-delay: 0.6s; }
        @keyframes pulse-ring { from { transform: scale(1); opacity: 0.5; } to { transform: scale(2.2); opacity: 0; } }
        .spin-slow { animation: spin 3s linear infinite; }

        .agent-info-pill {
          position: absolute; right: 64px; top: 8px; white-space: nowrap; max-width: 0; overflow: hidden;
          transition: max-width 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
          border-radius: 999px; background: var(--glass-bg); border: 1px solid var(--glass-border-strong);
          padding: 8px 12px; font-size: 12px; color: var(--text-muted);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          box-shadow: var(--shadow-2);
        }
        .agent-bubble:hover .agent-info-pill { max-width: 200px; }

        .agent-panel {
          position: absolute; right: 0; bottom: 66px; width: 300px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border-strong); border-radius: 18px;
          backdrop-filter: saturate(200%) blur(36px); -webkit-backdrop-filter: saturate(200%) blur(36px);
          padding: 16px; display: grid; gap: 10px; opacity: 0; transform: scale(0.9) translateY(8px); pointer-events: none;
          transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease;
          box-shadow: var(--shadow-4);
        }
        .agent-bubble-open .agent-panel { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; }
        .agent-last { display: grid; gap: 6px; }
        .agent-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); }

        .toast-stack { position: fixed; top: 20px; right: 20px; z-index: 300; display: grid; gap: 10px; width: min(360px, calc(100vw - 40px)); }
        .toast {
          border: 1px solid var(--glass-border); border-left-width: 3px; border-radius: 13px;
          background: var(--glass-bg);
          backdrop-filter: saturate(180%) blur(28px); -webkit-backdrop-filter: saturate(180%) blur(28px);
          padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px;
          animation: toast-in 220ms ease; position: relative; overflow: hidden; cursor: pointer;
          box-shadow: 0 8px 28px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.07);
          line-height: 1.5;
        }
        .toast-accent { border-left-color: var(--accent); }
        .toast-pass { border-left-color: var(--pass); }
        .toast-block { border-left-color: var(--block); }
        .toast-warning { border-left-color: var(--warning); }
        @keyframes toast-in { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        .toast-timer {
          position: absolute; bottom: 0; left: 0; height: 2px;
          background: currentColor; opacity: 0.3; border-radius: 0 0 10px 10px;
          animation: drain linear forwards; pointer-events: none;
        }
        @keyframes drain { from { width: 100%; } to { width: 0%; } }

        /* Empty states */
        .empty-slot {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; min-height: 200px;
          border: 1px dashed var(--glass-border);
          background: var(--glass-bg);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border-radius: 18px; padding: 40px; text-align: center;
        }
        .empty-icon { color: var(--text-subtle); opacity: 0.45; }
        .empty-title { font-family: var(--font-syne); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--text-muted); margin: 0; }
        .empty-hint { font-size: 14px; color: var(--text-subtle); max-width: 280px; margin: 0; line-height: 1.55; }

        /* Atlas masonry */
        .atlas-masonry { columns: 2; column-gap: 16px; }
        .atlas-masonry > article { break-inside: avoid; margin-bottom: 16px; }

        @media (max-width: 1023px) {
          .landing-text { margin-inline: 32px; }
          .charts-grid { grid-template-columns: 1fr; }
          .input-col, .live-col { display: contents; }
          .center-head { text-align: center; }
        }

        /* Agent layout split-pane (desktop) */
        @media (min-width: 1024px) {
          .agent-layout {
            display: grid; grid-template-columns: 480px 1fr; gap: 0;
            min-height: calc(100vh - 56px); padding-top: 0;
            width: 100%;
            max-width: none;
            margin: 0;
          }
          .input-col {
            position: sticky; top: 56px; height: calc(100vh - 56px);
            overflow-y: auto; padding: 32px 24px 100px 32px;
            border-right: 1px solid var(--glass-border);
            display: flex; flex-direction: column; gap: 16px;
            background: linear-gradient(160deg, rgba(14,14,18,0.6) 0%, transparent 60%);
          }
          html[data-theme='light'] .input-col {
            background: linear-gradient(160deg, rgba(255,255,255,0.35) 0%, transparent 60%);
          }
          .live-col {
            padding: 32px 32px 100px 24px;
            overflow-y: auto; height: calc(100vh - 56px);
            display: flex; flex-direction: column; gap: 16px;
            min-width: 0;
          }
          /* Desktop side-rail nav */
          .bubble-nav {
            left: 0; bottom: 0; top: 56px; transform: none;
            width: 64px; height: auto; border-radius: 0;
            border-right: 1px solid var(--glass-border);
            border-bottom: none; border-left: none; border-top: none;
            flex-direction: column; padding: 20px 8px;
            justify-content: flex-start; gap: 4px;
            background: var(--glass-bg);
            backdrop-filter: saturate(180%) blur(24px); -webkit-backdrop-filter: saturate(180%) blur(24px);
            box-shadow: 1px 0 0 var(--glass-border);
          }
          .bubble-tab { width: 48px; height: 48px; border-radius: 12px; position: relative; }
          .bubble-tab:hover .bubble-label {
            display: block; position: absolute; left: calc(100% + 10px); top: 50%;
            transform: translateY(-50%); background: var(--glass-bg); border: 1px solid var(--glass-border-strong);
            border-radius: 8px; padding: 6px 10px; white-space: nowrap; font-size: 12px;
            pointer-events: none; opacity: 1; animation: none; z-index: 10;
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            box-shadow: var(--shadow-2);
          }
          .app-main { padding-left: 96px; }
          .agent-bubble { bottom: 24px; }
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
          .atlas-masonry { columns: 1; }
          .agent-layout { display: flex; flex-direction: column; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bars-canvas, .flow-canvas, .ring, .ring-delay, .magnet, .magnet-small, .tilt, .spark-burst,
          .neural-thread, .stage-pulse, .toast-timer { display: none !important; }
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
        }
      `}</style>

    </div>
  );
}

// ─── AtlasStat ───────────────────────────────────────────
function spatialSevBadge(sev: string): string {
  if (sev === 'high') return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
  if (sev === 'med') return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
}
function AtlasStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
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
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <span className={`badge ${row.outcome === 'BLOCK' || row.outcome === 'VETO' ? 'danger' : 'neutral'}`}>{row.outcome}</span>
        <div>
          <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-subtle)' }}>
            {row.hash.slice(0, 12)}…{row.hash.slice(-6)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Block {row.block}</div>
        </div>
        <span className="badge neutral">{row.kind}</span>
        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{row.time}</span>
        <button
          className="icon-ghost"
          onClick={(e) => { e.stopPropagation(); onCopy(row.hash, row.id); }}
          title="Copy hash"
        >
          {copied ? <CheckCircle2 size={13} strokeWidth={1.5} style={{ color: 'var(--success)' }} /> : <Copy size={13} strokeWidth={1.5} />}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 8, fontSize: 12, color: 'var(--text-subtle)', borderLeft: '2px solid var(--border)' }}>
          {row.details}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [wagmiConfig] = useState(() =>
    createConfig({
      chains: [base, baseSepolia],
      connectors: [
        injected(),
        coinbaseWallet({ appName: 'AgentSafe' }),
        ...(process.env.NEXT_PUBLIC_WC_PROJECT_ID
          ? [walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID })]
          : []),
      ],
      transports: {
        [base.id]: http(),
        [baseSepolia.id]: http(),
      },
    }),
  );

  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppShellInternal />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
