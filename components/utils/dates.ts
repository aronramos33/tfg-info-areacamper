import dayjs from 'dayjs';

export function nightsBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  const sd = dayjs(start, 'YYYY-MM-DD', true);
  const ed = dayjs(end, 'YYYY-MM-DD', true);
  if (!sd.isValid() || !ed.isValid()) return 0;
  return Math.max(0, ed.diff(sd, 'day'));
}

export function normalizeBirthDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function isoBirthToDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
