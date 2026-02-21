'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Bot, Droplets, Grid3X3, Home, Link2, Scale, Shield, Vote } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/defense', label: 'Transaction Defense', icon: Shield },
  { href: '/governance', label: 'Governance Safe', icon: Vote },
  { href: '/liquidation', label: 'Liquidation Watch', icon: Droplets },
  { href: '/policy', label: 'Policy Controls', icon: Scale },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/stats', label: 'Metrics', icon: BarChart2 },
  { href: '/agent/mev', label: 'Agent Detail', icon: Bot },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px]">
        <aside className="glass-sidebar hidden w-[240px] border-r border-[var(--color-border)] px-4 py-6 lg:block">
          <div className="flex items-center gap-2 px-2 py-2">
            <Bot className="h-[18px] w-[18px] text-[var(--color-accent)]" strokeWidth={1.5} />
            <span className="font-semibold text-[13px] tracking-[-0.02em] text-[var(--color-text)]" style={{ fontFamily: 'var(--font-syne)' }}>AgentSafe</span>
          </div>
          <nav className="mt-6 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                  <Icon className="h-[16px] w-[16px]" strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <aside className="glass-sidebar hidden w-12 border-r border-[var(--color-border)] py-6 md:block lg:hidden">
          <nav className="space-y-1 px-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`nav-item justify-center ${active ? 'active' : ''}`} aria-label={item.label}>
                  <Icon className="h-[16px] w-[16px]" strokeWidth={1.5} />
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-12 lg:py-8">{children}</main>
      </div>

      <nav className="glass-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] md:hidden">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-around px-2">
          {[
            { href: '/dashboard', icon: Home, label: 'Overview' },
            { href: '/defense', icon: Shield, label: 'Defense' },
            { href: '/stats', icon: BarChart2, label: 'Metrics' },
            { href: '/governance', icon: Vote, label: 'Governance' },
            { href: '/integrations', icon: Grid3X3, label: 'Integrations' },
          ].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`flex h-10 w-14 items-center justify-center rounded-lg transition-colors ${active ? 'bg-[rgba(255,122,36,0.12)] text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`} aria-label={item.label}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
