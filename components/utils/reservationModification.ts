import dayjs from 'dayjs';
import { nightsBetween } from './dates';

export type ExtraLine = {
  extra_id: number;
  quantity: number;
  unit_amount_cents: number;
  pricing_type: 'per_night' | 'per_stay' | string;
};

export type ReservationDraft = {
  start_date: string;
  end_date: string;
  num_places: number;
  nightly_amount_cents: number;
  extras: ExtraLine[];
  vehicle_id: number | null;
};

export function computeExtraLineCents(line: ExtraLine, nights: number): number {
  if (line.quantity <= 0) return 0;
  const factor = line.pricing_type === 'per_stay' ? 1 : nights;
  return line.unit_amount_cents * line.quantity * factor;
}

export function computeReservationTotalCents(d: ReservationDraft): number {
  const nights = nightsBetween(d.start_date, d.end_date);
  if (nights <= 0) return 0;
  const base = d.nightly_amount_cents * nights * d.num_places;
  const extras = d.extras.reduce(
    (sum, line) => sum + computeExtraLineCents(line, nights),
    0,
  );
  return base + extras;
}

export function computeDeltaCents(
  original: ReservationDraft,
  next: ReservationDraft,
): number {
  return (
    computeReservationTotalCents(next) - computeReservationTotalCents(original)
  );
}

export function isModifiable(
  startDateISO: string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!startDateISO || !status) return false;
  if (status !== 'confirmed' && status !== 'pending') return false;
  return dayjs(startDateISO).isAfter(dayjs());
}

export function isCancellable(
  startDateISO: string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!startDateISO || !status) return false;
  if (status !== 'confirmed' && status !== 'pending') return false;
  return dayjs(startDateISO).isAfter(dayjs());
}
