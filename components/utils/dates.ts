import dayjs from 'dayjs';

export function nightsBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  const sd = dayjs(start, 'YYYY-MM-DD', true);
  const ed = dayjs(end, 'YYYY-MM-DD', true);
  if (!sd.isValid() || !ed.isValid()) return 0;
  return Math.max(0, ed.diff(sd, 'day'));
}
