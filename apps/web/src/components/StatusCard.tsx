'use client';

import { useEffect, useState } from 'react';

interface StatusCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
  delay?: number;
}

const colorMap = {
  green: {
    border: 'border-green-900/50',
    text: 'text-safe-green',
    glow: 'shadow-green-500/20',
    gradient: 'from-green-500/10 to-transparent',
  },
  red: {
    border: 'border-red-900/50',
    text: 'text-safe-red',
    glow: 'shadow-red-500/20',
    gradient: 'from-red-500/10 to-transparent',
  },
  yellow: {
    border: 'border-yellow-900/50',
    text: 'text-safe-yellow',
    glow: 'shadow-yellow-500/20',
    gradient: 'from-yellow-500/10 to-transparent',
  },
  blue: {
    border: 'border-blue-900/50',
    text: 'text-safe-blue',
    glow: 'shadow-blue-500/20',
    gradient: 'from-blue-500/10 to-transparent',
  },
};

export function StatusCard({ title, value, subtitle, color, delay = 0 }: StatusCardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const colors = colorMap[color];

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl border ${colors.border} bg-safe-card p-5
        transition-all duration-300
        hover:scale-105 hover:shadow-xl ${colors.glow}
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
      
      {/* Content */}
      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
        <p className={`mt-2 text-3xl font-bold ${colors.text} transition-transform duration-300 group-hover:scale-110`}>
          {value}
        </p>
        <p className="mt-2 text-xs text-gray-400">{subtitle}</p>
      </div>

      {/* Shine effect */}
      <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-white opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-5" />
    </div>
  );
}
