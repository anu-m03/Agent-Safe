import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const variantStyles = {
  primary: 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20',
  secondary: 'bg-gray-800 hover:bg-gray-700 border border-gray-700',
  danger: 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-500/20',
  success: 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-500/20',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        group relative overflow-hidden rounded-lg font-bold text-white
        shadow-lg transition-all duration-200
        hover:shadow-xl hover:-translate-y-0.5
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      <span className="relative z-10">{children}</span>
      {!disabled && (
        <div className="absolute inset-0 bg-white opacity-0 transition-opacity duration-300 group-hover:opacity-10" />
      )}
    </button>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-all hover:bg-gray-700 hover:text-white"
    >
      {copied ? '✓ Copied' : `📋 ${label}`}
    </button>
  );
}
