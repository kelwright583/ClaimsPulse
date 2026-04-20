import { redirect } from 'next/navigation';

export default function LegacySlaRedirect() {
  redirect('/claims/tat');
}
