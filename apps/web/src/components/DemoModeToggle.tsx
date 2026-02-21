'use client';

import { useDemoMode } from '@/hooks/useDemoMode';

export function DemoModeToggle() {
  const { demoMode, setDemoMode } = useDemoMode();

  return (
    <label
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs"
      title="Read-only mode with prefilled test wallet data for judges."
    >
      <span className="text-[var(--color-muted)]">Demo Mode</span>
      <button
        type="button"
        role="switch"
        aria-checked={demoMode}
        onClick={() => setDemoMode(!demoMode)}
        className={`relative h-5 w-9 rounded-full border transition-colors ${
          demoMode
            ? 'border-[var(--color-accent)] bg-[color:rgb(43_79_255_/_25%)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)]'
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-3.5 w-3.5 rounded-full bg-[var(--color-text)] transition-transform ${
            demoMode ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}
