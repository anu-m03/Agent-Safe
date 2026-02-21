'use client';

import { useEffect, useState } from 'react';

export const DEMO_MODE_STORAGE_KEY = 'agentsafe.demoMode';
const DEMO_MODE_EVENT = 'agentsafe:demo-mode-change';

function readDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(DEMO_MODE_STORAGE_KEY);
  if (stored == null) return true;
  return stored === 'true';
}

export function setDemoMode(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(DEMO_MODE_EVENT, { detail: enabled }));
}

export function useDemoMode() {
  const [demoMode, setDemoModeState] = useState(false);

  useEffect(() => {
    setDemoModeState(readDemoMode());

    const onChange = () => setDemoModeState(readDemoMode());
    window.addEventListener(DEMO_MODE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(DEMO_MODE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    demoMode,
    setDemoMode: (enabled: boolean) => setDemoMode(enabled),
  };
}
