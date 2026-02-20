'use client';

import { useEffect, useState } from 'react';

export type LayoutMode = 'normal' | 'judge';

const LAYOUT_MODE_STORAGE_KEY = 'agentsafe.layoutMode';
const LAYOUT_MODE_EVENT = 'agentsafe:layout-mode-change';

function readLayoutMode(): LayoutMode {
  if (typeof window === 'undefined') return 'normal';
  const mode = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
  return mode === 'judge' ? 'judge' : 'normal';
}

export function setLayoutMode(mode: LayoutMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(LAYOUT_MODE_EVENT, { detail: mode }));
}

export function useLayoutMode() {
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('normal');

  useEffect(() => {
    setLayoutModeState(readLayoutMode());
    const onChange = () => setLayoutModeState(readLayoutMode());
    window.addEventListener(LAYOUT_MODE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(LAYOUT_MODE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    layoutMode,
    setLayoutMode: (mode: LayoutMode) => setLayoutMode(mode),
    judgeView: layoutMode === 'judge',
  };
}
