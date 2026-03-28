import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/supabase/auth-helpers';

const ALLOWED_ROLES = ['SENIOR_MANAGEMENT', 'HEAD_OF_CLAIMS'] as const;

interface ClaimsStressInput {
  additionalClaims: number;
  avgClaimValue: number;
  claimType: string;
  timeframe: string;
}

interface GrowthInput {
  newPolicies: number;
  avgPremiumPerPolicy: number;
  productLine: string;
  startingFrom: string;
}

interface ScenarioBody {
  scenarioType: 'claims-stress' | 'growth' | 'combined';
  claimsStress?: ClaimsStressInput;
  growth?: GrowthInput;
}

function monthsUntilYearEnd(startingFrom: string): number {
  const start = new Date(startingFrom);
  const now = new Date();
  const fyEnd = now.getMonth() >= 9
    ? new Date(now.getFullYear() + 1, 8, 30)
    : new Date(now.getFullYear(), 8, 30);
  const months = (fyEnd.getFullYear() - start.getFullYear()) * 12 + (fyEnd.getMonth() - start.getMonth());
  return Math.max(0, months);
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(ALLOWED_ROLES as readonly string[]).includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: ScenarioBody = await request.json();
    const { scenarioType, claimsStress, growth } = body;

    // Get current state
    const latestSnap = await prisma.$queryRaw<{ max_date: Date | null }[]>`
      SELECT MAX(snapshot_date) AS max_date FROM claim_snapshots
    `;
    const snapshotDate = latestSnap[0]?.max_date ?? new Date();

    const [incurredAgg, premiumAgg] = await Promise.all([
      prisma.claimSnapshot.aggregate({ where: { snapshotDate }, _sum: { totalIncurred: true } }),
      prisma.premiumRecord.aggregate({ _sum: { netWp: true } }),
    ]);

    const currentIncurred = incurredAgg._sum.totalIncurred ? Number(incurredAgg._sum.totalIncurred) : 0;
    const currentNwp = premiumAgg._sum.netWp ? Number(premiumAgg._sum.netWp) : 0;
    const currentLossRatio = currentNwp > 0 ? (currentIncurred / currentNwp) * 100 : null;

    // Loss ratio target
    const targetRecord = await prisma.target.findFirst({
      where: { metricType: 'loss_ratio', productLine: null },
      orderBy: { uwYear: 'desc' },
    });
    const lossRatioTarget = targetRecord ? Number(targetRecord.annualTarget) : null;

    let result: Record<string, unknown> = {
      scenarioType,
      baseline: {
        currentIncurred,
        currentNwp,
        currentLossRatio,
        lossRatioTarget,
      },
    };

    if (scenarioType === 'claims-stress' || (scenarioType === 'combined' && claimsStress)) {
      const cs = claimsStress!;
      const additionalIncurred = cs.additionalClaims * cs.avgClaimValue;
      const newTotalIncurred = currentIncurred + additionalIncurred;
      const newLossRatio = currentNwp > 0 ? (newTotalIncurred / currentNwp) * 100 : null;

      // Budget burn: estimate months until budget exhausted
      const now = new Date();
      const fyStart = now.getMonth() >= 9 ? new Date(now.getFullYear(), 9, 1) : new Date(now.getFullYear() - 1, 9, 1);
      const monthsElapsed = Math.max(1, (now.getFullYear() - fyStart.getFullYear()) * 12 + (now.getMonth() - fyStart.getMonth()) + 1);
      const monthlyBurnRate = currentIncurred / monthsElapsed;
      const budget = lossRatioTarget && currentNwp ? (lossRatioTarget / 100) * currentNwp : null;
      const remainingBudget = budget ? budget - newTotalIncurred : null;
      const monthsToExhaustion = remainingBudget && monthlyBurnRate > 0 ? remainingBudget / monthlyBurnRate : null;

      let breachDate: string | null = null;
      if (monthsToExhaustion !== null && monthsToExhaustion > 0) {
        const bd = new Date(now);
        bd.setMonth(bd.getMonth() + Math.floor(monthsToExhaustion));
        breachDate = bd.toISOString().split('T')[0];
      } else if (remainingBudget !== null && remainingBudget < 0) {
        breachDate = now.toISOString().split('T')[0]; // already breached
      }

      result = {
        ...result,
        claimsStressImpact: {
          additionalClaims: cs.additionalClaims,
          avgClaimValue: cs.avgClaimValue,
          additionalIncurred,
          newTotalIncurred,
          newLossRatio,
          lossRatioChange: currentLossRatio !== null && newLossRatio !== null ? newLossRatio - currentLossRatio : null,
          budget,
          remainingBudget,
          breachDate,
          status: newLossRatio !== null && lossRatioTarget !== null
            ? newLossRatio > lossRatioTarget ? 'over-budget' : 'within-budget'
            : null,
        },
      };
    }

    if (scenarioType === 'growth' || (scenarioType === 'combined' && growth)) {
      const g = growth!;
      const monthsRemaining = monthsUntilYearEnd(g.startingFrom);
      const additionalNwpMonthly = g.newPolicies * g.avgPremiumPerPolicy;
      const additionalNwpYe = additionalNwpMonthly * monthsRemaining;
      const newTotalNwp = currentNwp + additionalNwpYe;

      const expectedAdditionalClaims = currentLossRatio !== null
        ? additionalNwpYe * (currentLossRatio / 100)
        : 0;

      const baseIncurred = result.claimsStressImpact
        ? (result.claimsStressImpact as Record<string, unknown>).newTotalIncurred as number
        : currentIncurred;
      const newTotalIncurred = baseIncurred + expectedAdditionalClaims;
      const newLossRatio = newTotalNwp > 0 ? (newTotalIncurred / newTotalNwp) * 100 : null;

      result = {
        ...result,
        growthImpact: {
          newPolicies: g.newPolicies,
          avgPremiumPerPolicy: g.avgPremiumPerPolicy,
          productLine: g.productLine,
          startingFrom: g.startingFrom,
          monthsRemaining,
          additionalNwpMonthly,
          additionalNwpYe,
          newTotalNwp,
          expectedAdditionalClaims,
          newTotalIncurred,
          newLossRatio,
          lossRatioChange: currentLossRatio !== null && newLossRatio !== null ? newLossRatio - currentLossRatio : null,
          status: newLossRatio !== null && lossRatioTarget !== null
            ? newLossRatio > lossRatioTarget ? 'over-target' : 'within-target'
            : null,
        },
      };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Export endpoint — not yet implemented
  void request;
  return NextResponse.json({ message: 'PDF export not yet implemented' }, { status: 501 });
}
