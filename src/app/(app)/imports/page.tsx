import { getSessionContext } from '@/lib/supabase/auth-helpers';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/types/roles';
import { UploadZone } from '@/components/imports/upload-zone';
import { ImportHistory } from '@/components/imports/import-history';

export default async function ImportsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const canUpload = hasPermission(ctx.role, 'canUploadReports');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#0D2761]">Import Reports</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Upload source Excel reports to refresh the ClaimsPulse dataset.
        </p>
      </div>

      {canUpload ? (
        <UploadZone />
      ) : (
        <div className="rounded-lg border border-[#E8EEF8] bg-white p-6 mb-6">
          <p className="text-sm text-[#6B7280]">
            You do not have permission to upload reports. Contact your Head of Claims or Team Leader.
          </p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-medium text-[#0D2761] mb-4">Import History</h2>
        <ImportHistory />
      </div>
    </div>
  );
}
