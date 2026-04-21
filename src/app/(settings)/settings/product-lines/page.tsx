import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { ProductLinesClient } from '@/components/settings/product-lines-client';

export default async function ProductLinesPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!['HEAD_OF_CLAIMS', 'SENIOR_MANAGEMENT'].includes(ctx.role)) {
    return (
      <div className="bg-white border border-[#E8EEF8] rounded-xl p-8 text-center">
        <p className="text-sm text-[#6B7280]">You do not have permission to manage product lines.</p>
      </div>
    );
  }
  return <ProductLinesClient role={ctx.role} />;
}
