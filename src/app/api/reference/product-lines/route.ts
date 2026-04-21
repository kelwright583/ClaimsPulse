import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

export interface ProductLineOption {
  rawValue: string;
  displayName: string;
  active: boolean;
}

/**
 * GET /api/reference/product-lines
 *
 * Returns distinct productLine values from claim_snapshots UNION distinct
 * product values from premium_records (if that table exists).
 *
 * No ProductLineAlias mapping in Prompt 1 — raw values returned as-is.
 */
export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Distinct product lines from claim_snapshots
    const claimsRaw = await prisma.$queryRaw<{ product_line: string | null }[]>`
      SELECT DISTINCT product_line
      FROM claim_snapshots
      WHERE product_line IS NOT NULL AND product_line <> ''
      ORDER BY product_line
    `;

    const fromClaims = claimsRaw
      .map(r => r.product_line!)
      .filter(Boolean);

    // Distinct product values from premium_records (model exists in schema)
    let fromPremium: string[] = [];
    try {
      const premiumRaw = await prisma.$queryRaw<{ product: string | null }[]>`
        SELECT DISTINCT product
        FROM premium_records
        WHERE product IS NOT NULL AND product <> ''
        ORDER BY product
      `;
      fromPremium = premiumRaw.map(r => r.product!).filter(Boolean);
    } catch {
      // Table or column doesn't exist — skip
    }

    // Union and deduplicate
    const allValues = Array.from(new Set([...fromClaims, ...fromPremium])).sort();

    const result: ProductLineOption[] = allValues.map(v => ({
      rawValue: v,
      displayName: v,
      active: true,
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
