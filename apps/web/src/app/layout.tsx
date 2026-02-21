import './globals.css';
import { Providers } from '@/components/Providers';
import type { Metadata } from 'next';
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google';

const syne = Syne({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-syne' });
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-dm' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jet' });

export const metadata: Metadata = {
  title: 'AgentSafe | Autonomous Web3 Safety + App Builder on Base',
  description:
    'AgentSafe helps teams design, evaluate, and deploy autonomous Web3 apps with policy controls, governance safety checks, and execution telemetry on Base.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[syne.variable, dmSans.variable, jetbrains.variable].join(' ')}>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
