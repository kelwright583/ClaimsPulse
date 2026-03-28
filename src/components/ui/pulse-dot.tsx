interface PulseDotProps {
  acknowledged?: boolean;
  size?: number;
  className?: string;
}

export function PulseDot({ acknowledged = false, size = 8, className = '' }: PulseDotProps) {
  return (
    <span
      className={`pulse-dot${acknowledged ? ' acknowledged' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-label={acknowledged ? 'Acknowledged' : 'SLA breach'}
    />
  );
}
