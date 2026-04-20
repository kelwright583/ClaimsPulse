import { redirect } from 'next/navigation';

export default function LegacySlaMatrixRedirect() {
  redirect('/settings/tat-matrix');
}
