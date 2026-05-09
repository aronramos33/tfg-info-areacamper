import dayjs from 'dayjs';

export type RefundTier = 'full' | 'half' | 'none';

export const REFUND_PERCENT: Record<RefundTier, number> = {
  full: 100,
  half: 50,
  none: 0,
};

export function computeRefundTier(
  startDateISO: string,
  nowISO?: string,
): RefundTier {
  const start = dayjs(startDateISO);
  const now = nowISO ? dayjs(nowISO) : dayjs();
  const hoursUntilStart = start.diff(now, 'hour', true);
  if (hoursUntilStart < 24) return 'none';
  const daysUntilStart = hoursUntilStart / 24;
  if (daysUntilStart <= 7) return 'half';
  return 'full';
}

export function computeRefundAmountCents(
  totalCents: number,
  tier: RefundTier,
): number {
  if (tier === 'full') return totalCents;
  if (tier === 'half') return Math.floor(totalCents / 2);
  return 0;
}

export function describeRefundPolicy(tier: RefundTier): string {
  if (tier === 'full') return 'Reembolso íntegro (100%)';
  if (tier === 'half') return 'Reembolso parcial (50%)';
  return 'Sin reembolso';
}
