import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentSafe – AI-Protected Smart Wallet',
  description:
    'ERC-4337 smart wallet on Base powered by SwarmGuard multi-agent defense and GovernanceSafe voting automation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-safe-dark text-gray-200 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r border-gray-800 bg-safe-dark p-6">
            <h1 className="mb-8 text-xl font-bold text-white">🛡️ AgentSafe</h1>
            <nav className="flex flex-col gap-2">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/transactions">Transactions</NavLink>
              <NavLink href="/governance">Governance</NavLink>
              <NavLink href="/swarm">Swarm Feed</NavLink>
              <NavLink href="/policies">Policies</NavLink>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
    >
      {children}
    </a>
  );
}
