'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import './globals.css';

const metadata: Metadata = {
  title: 'AgentSafe – AI-Protected Smart Wallet',
  description:
    'ERC-4337 smart wallet on Base powered by SwarmGuard multi-agent defense and GovernanceSafe voting automation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <html lang="en">
      <head>
        <title>{String(metadata.title)}</title>
        <meta name="description" content={metadata.description ?? ''} />
      </head>
      <body className="min-h-screen bg-safe-dark text-gray-200 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="sticky top-0 h-screen w-64 border-r border-gray-800 bg-safe-dark p-6">
            {/* Logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-blue-500 text-xl shadow-lg shadow-green-500/20">
                🛡️
              </div>
              <h1 className="text-xl font-bold text-white">AgentSafe</h1>
            </div>

            {/* Primary Nav */}
            <nav className="flex flex-col gap-1">
              <NavLink href="/dashboard" active={isActive('/dashboard')}>
                📊 Dashboard
              </NavLink>
              <NavLink href="/defense" active={isActive('/defense')}>
                🛡️ Defense
              </NavLink>
              <NavLink href="/governance" active={isActive('/governance')}>
                🗳️ Governance
              </NavLink>
              <NavLink href="/policy" active={isActive('/policy')}>
                📜 Policy
              </NavLink>
              <NavLink href="/integrations" active={isActive('/integrations')}>
                🔗 Integrations
              </NavLink>

              <div className="my-3 border-t border-gray-800" />

              {/* Secondary Nav */}
              <NavLink href="/swarm" active={isActive('/swarm')}>
                💬 Swarm Feed
              </NavLink>
              <NavLink href="/transactions" active={isActive('/transactions')}>
                📝 Transactions
              </NavLink>
              <NavLink href="/policies" active={isActive('/policies')}>
                ⚙️ Settings
              </NavLink>
            </nav>

            {/* Status Indicator */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="rounded-lg border border-green-900/30 bg-green-900/10 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-safe-green shadow-lg shadow-green-500/50" />
                  <span className="text-xs font-medium text-safe-green">System Online</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto bg-gradient-to-br from-safe-dark via-safe-dark to-gray-900/50 p-8">
            <div className="animate-fadeIn mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
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
        group relative overflow-hidden rounded-lg px-3 py-2.5 text-sm font-medium
        transition-all duration-200
        ${
          active
            ? 'bg-gradient-to-r from-green-900/30 to-blue-900/30 text-white shadow-md'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
        }
      `}
    >
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-r bg-gradient-to-b from-safe-green to-safe-blue" />
      )}

      {/* Hover effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 to-blue-500/0 opacity-0 transition-opacity duration-300 group-hover:from-green-500/5 group-hover:to-blue-500/5 group-hover:opacity-100" />

      <span className="relative z-10">{children}</span>
    </Link>
  );
}
