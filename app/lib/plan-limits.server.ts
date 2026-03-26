import prisma from "../db.server";

export const PLAN_LIMITS = {
  free: {
    submissionsPerMonth: 50,
    keywords: 3,
    competitors: 1,
    indexChecksPerDay: 10,
    scansPerDay: 1,
    aiMentionChecksPerMonth: 5,
  },
  starter: {
    submissionsPerMonth: 500,
    keywords: 10,
    competitors: 3,
    indexChecksPerDay: 100,
    scansPerDay: 2,
    aiMentionChecksPerMonth: 50,
  },
  growth: {
    submissionsPerMonth: 2000,
    keywords: 50,
    competitors: 10,
    indexChecksPerDay: 500,
    scansPerDay: 4,
    aiMentionChecksPerMonth: 200,
  },
  pro: {
    submissionsPerMonth: Infinity,
    keywords: 200,
    competitors: 25,
    indexChecksPerDay: 2000,
    scansPerDay: 12,
    aiMentionChecksPerMonth: 1000,
  },
} as const;

type PlanName = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[(plan as PlanName) || "free"] || PLAN_LIMITS.free;
}

export async function checkSubmissionLimit(
  storeId: string,
  plan: string
): Promise<{ allowed: boolean; current: number; max: number }> {
  const limits = getPlanLimits(plan);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const current = await prisma.urlSubmission.count({
    where: { storeId, submittedAt: { gte: startOfMonth } },
  });

  return {
    allowed: current < limits.submissionsPerMonth,
    current,
    max: limits.submissionsPerMonth,
  };
}

export async function checkKeywordLimit(
  storeId: string,
  plan: string
): Promise<{ allowed: boolean; current: number; max: number }> {
  const limits = getPlanLimits(plan);
  const current = await prisma.visibilityQuery.count({ where: { storeId } });
  return { allowed: current < limits.keywords, current, max: limits.keywords };
}

export async function checkAIMentionLimit(
  storeId: string,
  plan: string,
): Promise<{ allowed: boolean; current: number; max: number }> {
  const limits = getPlanLimits(plan);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const current = await prisma.aIMentionResult.count({
    where: { storeId, checkedAt: { gte: startOfMonth } },
  });

  return {
    allowed: current < limits.aiMentionChecksPerMonth,
    current,
    max: limits.aiMentionChecksPerMonth,
  };
}

export async function checkCompetitorLimit(
  storeId: string,
  plan: string
): Promise<{ allowed: boolean; current: number; max: number }> {
  const limits = getPlanLimits(plan);
  const current = await prisma.competitor.count({ where: { storeId } });
  return {
    allowed: current < limits.competitors,
    current,
    max: limits.competitors,
  };
}
