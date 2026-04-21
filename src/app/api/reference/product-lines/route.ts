import { NextRequest, NextResponse } from 'next/server';
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
 * product values from premium_records, with alias display names applied where
 * available. Also includes any aliases with active=false so admins can see
 * retired aliases.
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

    // Distinct product values from premium_records
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

    // Union and deduplicate raw values from data
    const allRawValues = Array.from(new Set([...fromClaims, ...fromPremium])).sort();

    // Fetch all aliases (including inactive ones)
    const aliases = await prisma.productLineAlias.findMany();
    const aliasMap = new Map<string, { displayName: string; active: boolean }>(
      aliases.map(a => [a.rawValue, { displayName: a.displayName, active: a.active }])
    );

    // Build result: raw values from data sources with alias applied
    const resultMap = new Map<string, ProductLineOption>();
    for (const raw of allRawValues) {
      const alias = aliasMap.get(raw);
      resultMap.set(raw, {
        rawValue: raw,
        displayName: alias ? alias.displayName : raw,
        active: alias ? alias.active : true,
      });
    }

    // Also include any aliases whose rawValue doesn't appear in data (retired aliases)
    for (const [rawValue, { displayName, active }] of aliasMap.entries()) {
      if (!resultMap.has(rawValue)) {
        resultMap.set(rawValue, { rawValue, displayName, active });
      }
    }

    const result = Array.from(resultMap.values()).sort((a, b) =>
      a.rawValue.localeCompare(b.rawValue)
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/reference/product-lines
 *
 * Upserts a ProductLineAlias row. Role-gated to HEAD_OF_CLAIMS or SENIOR_MANAGEMENT.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['HEAD_OF_CLAIMS', 'SENIOR_MANAGEMENT'].includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as {
      rawValue: string;
      displayName: string;
      active?: boolean;
      notes?: string;
    };

    const { rawValue, displayName, active, notes } = body;

    if (!rawValue || !displayName) {
      return NextResponse.json({ error: 'rawValue and displayName are required' }, { status: 400 });
    }

    const alias = await prisma.productLineAlias.upsert({
      where: { rawValue },
      update: {
        displayName,
        active: active ?? true,
        notes: notes ?? null,
        setBy: ctx.userId,
      },
      create: {
        rawValue,
        displayName,
        active: active ?? true,
        notes: notes ?? null,
        setBy: ctx.userId,
      },
    });

    return NextResponse.json({ id: alias.id });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
