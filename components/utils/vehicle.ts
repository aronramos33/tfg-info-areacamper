export function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase().trim();
}

export function isValidSpanishPlate(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^\d{4}[A-Z]{3}$/.test(normalizePlate(v));
}

export function isValidLengthMeters(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 20;
}

export function parseLengthMeters(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export type Vehicle = {
  id: number;
  user_id: string;
  brand: string;
  model: string;
  plate: string;
  alias: string | null;
  length_m: number | null;
  created_at: string;
};

export function vehicleDisplayName(v: Pick<Vehicle, 'alias' | 'brand' | 'model'>): string {
  if (v.alias && v.alias.trim()) return v.alias.trim();
  return `${v.brand} ${v.model}`.trim();
}
