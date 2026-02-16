interface StatusCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
}

const colorMap = {
  green: 'border-green-900/50 text-safe-green',
  red: 'border-red-900/50 text-safe-red',
  yellow: 'border-yellow-900/50 text-safe-yellow',
  blue: 'border-blue-900/50 text-safe-blue',
};

export function StatusCard({ title, value, subtitle, color }: StatusCardProps) {
  return (
    <div className={`rounded-xl border ${colorMap[color]} bg-safe-card p-5`}>
      <p className="text-xs uppercase tracking-wider text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[color].split(' ')[1]}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}
