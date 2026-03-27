import { ROLE_PERMISSIONS, ROLE_LABELS, type UserRole } from '@/types/roles';

export { ROLE_LABELS };

export function hasPermission(role: UserRole, permission: keyof typeof ROLE_PERMISSIONS): boolean {
  return (ROLE_PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
