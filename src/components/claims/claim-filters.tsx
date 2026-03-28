'use client';

interface ClaimFiltersProps {
  search: string;
  handler: string;
  claimStatus: string;
  isSlaBreach: string;
  handlers: string[];
  statuses: string[];
  onSearch: (v: string) => void;
  onHandler: (v: string) => void;
  onClaimStatus: (v: string) => void;
  onSlaBreach: (v: string) => void;
  onReset: () => void;
}

export function ClaimFilters({
  search,
  handler,
  claimStatus,
  isSlaBreach,
  handlers,
  statuses,
  onSearch,
  onHandler,
  onClaimStatus,
  onSlaBreach,
  onReset,
}: ClaimFiltersProps) {
  const hasActiveFilters = search || handler || claimStatus || isSlaBreach;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative min-w-[220px]">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          placeholder="Search claim ID or insured..."
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] placeholder-[#6B7280] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30"
        />
      </div>

      {/* Handler dropdown */}
      {handlers.length > 0 && (
        <select
          value={handler}
          onChange={e => onHandler(e.target.value)}
          className="px-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30"
        >
          <option value="">All Handlers</option>
          {handlers.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      )}

      {/* Claim Status dropdown */}
      <select
        value={claimStatus}
        onChange={e => onClaimStatus(e.target.value)}
        className="px-3 py-2 text-sm border border-[#E8EEF8] rounded-lg bg-white text-[#0D2761] focus:outline-none focus:border-[#0D2761] focus:ring-1 focus:ring-[#0D2761]/30"
      >
        <option value="">All Statuses</option>
        {statuses.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* SLA Breach toggle */}
      <button
        onClick={() => onSlaBreach(isSlaBreach === 'true' ? '' : 'true')}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
          isSlaBreach === 'true'
            ? 'bg-[#991B1B] border-[#991B1B] text-white'
            : 'bg-white border-[#E8EEF8] text-[#6B7280] hover:border-[#991B1B] hover:text-[#991B1B]'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${isSlaBreach === 'true' ? 'bg-white' : 'bg-[#991B1B]'}`} />
        SLA Breach
      </button>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="px-3 py-2 text-sm text-[#6B7280] hover:text-[#0D2761] transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
