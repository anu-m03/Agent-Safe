'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  success: 'bg-green-900/30 text-safe-green border-green-900/50',
  error: 'bg-red-900/30 text-safe-red border-red-900/50',
  warning: 'bg-yellow-900/30 text-safe-yellow border-yellow-900/50',
  info: 'bg-blue-900/30 text-safe-blue border-blue-900/50',
  default: 'bg-gray-900/30 text-gray-400 border-gray-800',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center justify-center gap-1 rounded-full border font-semibold
        ${variantStyles[variant]}
        ${sizeStyles[size]}
      `}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, live }: { status: string; live?: boolean }) {
  const variant = live
    ? 'success'
    : status === 'disabled' || status === 'stub'
      ? 'warning'
      : 'default';

  return (
    <Badge variant={variant}>
      {live && <span className="h-1.5 w-1.5 rounded-full bg-safe-green animate-pulse" />}
      {status.toUpperCase()}
    </Badge>
  );
}
