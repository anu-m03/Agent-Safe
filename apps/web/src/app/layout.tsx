'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import './globals.css';
import { Providers } from '@/components/Providers';
import { ConnectButton } from '@/components/ConnectButton';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  return (
    <html lang="en">
      <head>
        <title>AgentSafe – AI-Protected Smart Wallet</title>
        <meta name="description" content="ERC-4337 smart wallet on Base powered by SwarmGuard and GovernanceSafe." />
      </head>
      <body className="min-h-screen bg-safe-dark text-gray-200 antialiased">
        <Providers>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-safe-dark/90 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">AgentSafe</p>
                <h1 className="text-lg font-semibold text-white">Control Center</h1>
              </div>
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <MobileNavLink href="/dashboard" active={isActive('/dashboard')}>Dashboard</MobileNavLink>
              <MobileNavLink href="/defense" active={isActive('/defense')}>Defense</MobileNavLink>
              <MobileNavLink href="/governance" active={isActive('/governance')}>Governance</MobileNavLink>
              <MobileNavLink href="/policy" active={isActive('/policy')}>Policy</MobileNavLink>
              <MobileNavLink href="/integrations" active={isActive('/integrations')}>Integrations</MobileNavLink>
            </nav>
          </header>

          {/* Sidebar */}
          <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/10 bg-safe-dark/80 p-6 backdrop-blur lg:block">
            {/* Logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-sm font-bold text-cyan-200 shadow-[0_0_30px_rgba(56,189,248,0.15)]">
                AS
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">AgentSafe</h1>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">SwarmGuard</p>
              </div>
            </div>

            {/* Primary Nav */}
            <nav className="flex flex-col gap-1">
              <NavLink href="/dashboard" active={isActive('/dashboard')}>Dashboard</NavLink>
              <NavLink href="/defense" active={isActive('/defense')}>Defense</NavLink>
              <NavLink href="/governance" active={isActive('/governance')}>Governance</NavLink>
              <NavLink href="/policy" active={isActive('/policy')}>Policy</NavLink>
              <NavLink href="/integrations" active={isActive('/integrations')}>Integrations</NavLink>

              <div className="my-3 border-t border-white/10" />

              {/* Secondary Nav */}
              <NavLink href="/swarm" active={isActive('/swarm')}>Swarm Feed</NavLink>
              <NavLink href="/transactions" active={isActive('/transactions')}>Transactions</NavLink>
              <NavLink href="/policies" active={isActive('/policies')}>Settings</NavLink>
            </nav>

            {/* Wallet + Status */}
            <div className="absolute bottom-6 left-6 right-6 space-y-3">
              <ConnectButton />
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-lg shadow-emerald-400/50" />
                  <span className="text-xs font-medium text-emerald-200">System Online</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:bg-gradient-to-br lg:from-safe-dark lg:via-safe-dark lg:to-slate-950/80 lg:p-8">
            <div className="animate-fadeIn mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
        </Providers>
      </body>
    </html>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`
        group relative overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
        ${
          active
            ? 'bg-gradient-to-r from-cyan-400/20 to-indigo-400/20 text-white shadow-md'
            : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
        }
      `}
    >
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-r bg-gradient-to-b from-cyan-300 to-indigo-300" />
      )}

      {/* Hover effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 to-indigo-500/0 opacity-0 transition-opacity duration-300 group-hover:from-cyan-500/5 group-hover:to-indigo-500/5 group-hover:opacity-100" />

      <span className="relative z-10">{children}</span>
    </Link>
  );
}

function MobileNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap transition ${
        active
          ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'
          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'
      }`}
    >
      {children}
    </Link>
  );
}
