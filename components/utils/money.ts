export const NIGHTLY_CENTS = 1500;
export const formatCents = (cents: number, currency = 'EUR') =>
  (cents / 100).toLocaleString('es-ES', { style: 'currency', currency });
