/**
 * Format a number as ZAR currency: R1,234,567.89
 */
export function formatZAR(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—';
  return `R${value.toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format a date as DD MMM YYYY
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Parse accounting notation: "(1,423.30)" → -1423.30
 */
export function parseAccountingNumber(value: string | null | undefined): number | null {
  if (value == null || value === '' || value === '-') return null;
  const str = String(value).trim();
  const isNegative = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[()R,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}

/**
 * Combine class names (simple utility without clsx dependency)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Truncate a string to a given length
 */
export function truncate(str: string | null | undefined, length: number): string {
  if (!str) return '';
  return str.length > length ? `${str.slice(0, length)}…` : str;
}

/**
 * Get initials from a full name
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
