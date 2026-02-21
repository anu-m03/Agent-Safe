'use client';

import Link from 'next/link';
import { ArrowLeft, TrendingUp, Percent, DollarSign, Layers } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@/components/ConnectButton';

const mockPnLData = {
  totalDeposited: 1000.0,
  currentValue: 1087.5,
  netPnL: 87.5,
  netPnLPercent: 8.75,
};

const mockYieldStats = {
  apy: '12.4%',
  dailyYield: '$0.34',
  yieldToAppAgent: '70%',
  yieldRetainedByUser: '30%',
};

const mockPosition = {
  pool: 'ETH/USDC 0.3%',
  yourLiquidity: '$1,087.50',
  range: '$1,800 - $2,200',
  inRange: true,
};

export default function UniswapDashboardPage() {
  const { isConnected } = useAccount();

  return (
    <main className="min-h-screen bg-[var(--bg-primary,#09090b)] text-white">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-[#ff6d00]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to Dashboard
        </Link>

        {/* Header */}
        <header className="rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-6 shadow-xl">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Uniswap Yield Dashboard
          </h1>
          <p className="mt-2 text-base text-gray-400">
            Seed funding powering your autonomous app agent
          </p>
        </header>

        {/* Wallet check */}
        {!isConnected ? (
          <section className="rounded-xl border border-gray-800 bg-safe-card p-8 shadow-xl">
            <p className="mb-4 text-gray-400">Connect your wallet to view yield and position data.</p>
            <ConnectButton prominent />
          </section>
        ) : (
          <>
            {/* Profit and Loss */}
            <section>
              <h2 className="mb-4 font-bold text-xl font-semibold text-white">
                Profit and Loss
              </h2>
              <div className="rounded-xl border border-gray-800 bg-safe-card p-6 shadow-xl">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500">Total Deposited</p>
                    <p className="mt-1 font-mono text-lg font-medium text-white">
                      ${mockPnLData.totalDeposited.toFixed(2)} USDC
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500">Current Value</p>
                    <p className="mt-1 font-mono text-lg font-medium text-white">
                      ${mockPnLData.currentValue.toFixed(2)} USDC
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500">Net P&L</p>
                    <p className="mt-1 font-mono text-lg font-medium text-white">
                      ${mockPnLData.netPnL.toFixed(2)} USDC
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500">Net P&L %</p>
                    <p
                      className={`mt-1 font-mono text-lg font-medium ${
                        mockPnLData.netPnL >= 0 ? 'text-safe-green' : 'text-safe-red'
                      }`}
                    >
                      {mockPnLData.netPnL >= 0 ? '+' : ''}
                      {mockPnLData.netPnLPercent.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {mockPnLData.netPnL >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-safe-green" strokeWidth={1.5} />
                  ) : (
                    <TrendingUp className="h-5 w-5 rotate-180 text-safe-red" strokeWidth={1.5} />
                  )}
                  <span
                    className={
                      mockPnLData.netPnL >= 0 ? 'text-safe-green' : 'text-safe-red'
                    }
                  >
                    {mockPnLData.netPnL >= 0 ? 'Positive' : 'Negative'} P&L
                  </span>
                </div>
              </div>
            </section>

            {/* Yield Stats */}
            <section>
              <h2 className="mb-4 font-bold text-xl font-semibold text-white">
                Yield Stats
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-800 bg-safe-card p-5 shadow-xl">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Percent className="h-4 w-4" strokeWidth={1.5} />
                    <span className="text-xs uppercase tracking-wider">APY</span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#ff6d00]">
                    {mockYieldStats.apy}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-safe-card p-5 shadow-xl">
                  <div className="flex items-center gap-2 text-gray-500">
                    <DollarSign className="h-4 w-4" strokeWidth={1.5} />
                    <span className="text-xs uppercase tracking-wider">Daily yield</span>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-semibold text-white">
                    {mockYieldStats.dailyYield}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-safe-card p-5 shadow-xl">
                  <p className="text-xs uppercase tracking-wider text-gray-500">
                    Yield allocated to App Agent
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-[#ff6d00]">
                    {mockYieldStats.yieldToAppAgent}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-safe-card p-5 shadow-xl">
                  <p className="text-xs uppercase tracking-wider text-gray-500">
                    Yield retained by user
                  </p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-safe-green">
                    {mockYieldStats.yieldRetainedByUser}
                  </p>
                </div>
              </div>
            </section>

            {/* Position Overview */}
            <section>
              <h2 className="mb-4 font-bold text-xl font-semibold text-white">
                Position Overview
              </h2>
              <div className="rounded-xl border border-gray-800 bg-safe-card p-6 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Pool</p>
                      <p className="mt-1 font-mono text-base font-medium text-white">
                        {mockPosition.pool}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">
                        Your liquidity
                      </p>
                      <p className="mt-1 font-mono text-base font-medium text-white">
                        {mockPosition.yourLiquidity}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Range</p>
                      <p className="mt-1 font-mono text-base font-medium text-white">
                        {mockPosition.range}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">In range</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          mockPosition.inRange
                            ? 'bg-safe-green/20 text-safe-green'
                            : 'bg-safe-red/20 text-safe-red'
                        }`}
                      >
                        {mockPosition.inRange ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Layers className="h-5 w-5" strokeWidth={1.5} />
                    <span className="text-sm">Position active</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
