import { supabase } from '@/lib/supabase';

export async function fetchSoldOutDateIds(fromDate: string, toDate: string) {
  const { data, error } = await supabase.rpc('get_sold_out_dates', {
    p_from: fromDate,
    p_to: toDate,
  });
  if (error) throw error;
  // devuelve array de 'YYYY-MM-DD'
  return (data ?? []) as string[];
}
