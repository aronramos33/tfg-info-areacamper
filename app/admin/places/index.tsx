import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

dayjs.extend(isoWeek);

// ─── Types ───────────────────────────────────────────────────────────────────
type Place = { id: number; name: string; is_active: boolean };

type Reservation = {
  id: number;
  place_id: number | null;
  place_ids: number[] | null;
  num_places: number | null;
  start_date: string;
  end_date: string;
  payment_status: string;
  full_name: string | null;
  total_amount_cents: number | null;
  nightly_amount_cents: number | null;
  created_at: string;
  user_id: string;
};

// Fila cruda de extras tal como viene de BD
type ExtraRow = {
  reservation_id: number;
  line_total_cents: number;
  extras: { code: string; name_es: string } | null;
};

// Extras ya agrupados para mostrar
type ExtraRevenue = { code: string; name_es: string; total_cents: number };

type ViewMode = 'day' | 'week' | 'month' | 'year';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

function overlapNightsInPeriod(
  start: string,
  end: string,
  periodStart: dayjs.Dayjs,
  periodEnd: dayjs.Dayjs,
) {
  // Tratamos las estancias como intervalo [start, end) (end = día de salida, NO incluye noche)
  const rStart = dayjs(start).startOf('day');
  const rEndExclusive = dayjs(end).startOf('day');

  // El periodo lo convertimos a [periodStart, periodEndExclusive)
  const pStart = periodStart.startOf('day');
  const pEndExclusive = periodEnd.startOf('day').add(1, 'day');

  const overlapStart = rStart.isAfter(pStart) ? rStart : pStart;
  const overlapEnd = rEndExclusive.isBefore(pEndExclusive)
    ? rEndExclusive
    : pEndExclusive;

  return Math.max(0, overlapEnd.diff(overlapStart, 'day'));
}
const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };
const extraIcon = (code: string) =>
  code === 'PERSON'
    ? '👥'
    : code === 'PET'
      ? '🐾'
      : code === 'POWER'
        ? '⚡'
        : '•';

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  // ✅ Guardamos filas crudas de extras para recalcular por período en useMemo
  const [allExtraRows, setAllExtraRows] = useState<ExtraRow[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');
  const [filterWeek, setFilterWeek] = useState(
    dayjs().startOf('isoWeek').format('YYYY-MM-DD'),
  );
  const [filterMonth, setFilterMonth] = useState(dayjs().format('YYYY-MM'));
  const [filterYear, setFilterYear] = useState(dayjs().year());

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, ownersRes, extrasRes] =
      await Promise.all([
        supabase.from('places').select('*').order('id'),
        supabase
          .from('reservations')
          .select(
            'id,place_id,place_ids,num_places,start_date,end_date,payment_status,full_name,total_amount_cents,nightly_amount_cents,created_at,user_id',
          )
          .eq('payment_status', 'paid'),
        supabase.from('owners').select('user_id'),
        supabase
          .from('reservation_extras')
          .select('line_total_cents,reservation_id,extras(code,name_es)'),
      ]);

    const ownerIds = new Set((ownersRes.data ?? []).map((o: any) => o.user_id));
    const allReservations = (
      (reservationsRes.data ?? []) as Reservation[]
    ).filter((r) => !ownerIds.has(r.user_id));

    // IDs válidos para filtrar extras de owners
    const validIds = new Set(allReservations.map((r) => r.id));
    const rows = ((extrasRes.data ?? []) as any[])
      .filter((row) => validIds.has(row.reservation_id))
      .map((row) => ({
        reservation_id: row.reservation_id as number,
        line_total_cents: Number(row.line_total_cents ?? 0),
        extras: row.extras as { code: string; name_es: string } | null,
      }));

    setPlaces(placesRes.data ?? []);
    setReservations(allReservations);
    setAllExtraRows(rows);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  // ── Período ────────────────────────────────────────────────────────────────
  const weekStart = dayjs(filterWeek);
  const weekEnd = weekStart.endOf('isoWeek');
  const monthStart = dayjs(filterMonth).startOf('month');
  const monthEnd = dayjs(filterMonth).endOf('month');
  const yearStart = dayjs(`${filterYear}-01-01`).startOf('year');
  const yearEnd = dayjs(`${filterYear}-12-31`).endOf('year');

  const periodStart =
    viewMode === 'day'
      ? dayjs(filterDate)
      : viewMode === 'week'
        ? weekStart
        : viewMode === 'month'
          ? monthStart
          : yearStart;

  const periodEnd =
    viewMode === 'day'
      ? dayjs(filterDate).endOf('day')
      : viewMode === 'week'
        ? weekEnd
        : viewMode === 'month'
          ? monthEnd
          : yearEnd;

  const shift = (n: number) => {
    if (viewMode === 'day') {
      const next = dayjs(filterDate).add(n, 'day');
      setFilterDate(next.format('YYYY-MM-DD'));
      setFilterInput(next.format('DD/MM/YYYY'));
      setFilterError('');
    }
    if (viewMode === 'week')
      setFilterWeek(
        dayjs(filterWeek)
          .add(n, 'week')
          .startOf('isoWeek')
          .format('YYYY-MM-DD'),
      );
    if (viewMode === 'month')
      setFilterMonth(dayjs(filterMonth).add(n, 'month').format('YYYY-MM'));
    if (viewMode === 'year') setFilterYear((y) => y + n);
  };

  const handleFilterInput = (text: string) => {
    setFilterInput(text);
    setFilterError('');
    const parsed = dayjs(text, 'DD/MM/YYYY', true);
    if (parsed.isValid()) setFilterDate(parsed.format('YYYY-MM-DD'));
    else if (text.length === 10)
      setFilterError('Formato inválido. Usa DD/MM/YYYY');
  };

  const isCurrentPeriod = () => {
    if (viewMode === 'day') return filterDate === dayjs().format('YYYY-MM-DD');
    if (viewMode === 'week')
      return filterWeek === dayjs().startOf('isoWeek').format('YYYY-MM-DD');
    if (viewMode === 'month') return filterMonth === dayjs().format('YYYY-MM');
    return filterYear === dayjs().year();
  };

  const goToCurrent = () => {
    setFilterDate(dayjs().format('YYYY-MM-DD'));
    setFilterInput(dayjs().format('DD/MM/YYYY'));
    setFilterWeek(dayjs().startOf('isoWeek').format('YYYY-MM-DD'));
    setFilterMonth(dayjs().format('YYYY-MM'));
    setFilterYear(dayjs().year());
    setFilterError('');
  };

  const periodLabel = () => {
    if (viewMode === 'day') return filterInput;
    if (viewMode === 'week')
      return `${weekStart.format('DD/MM')} — ${weekEnd.format('DD/MM/YYYY')}`;
    if (viewMode === 'month') return dayjs(filterMonth).format('MMMM YYYY');
    return `${filterYear}`;
  };

  // ── Reservas activas en el período (solapan con él) ───────────────────────
  const activeReservations = useMemo(() => {
    return reservations.filter((r) => {
      const rStart = dayjs(r.start_date);
      const rEnd = dayjs(r.end_date).endOf('day');
      return (
        rStart.isBefore(periodEnd.add(1, 'day')) &&
        rEnd.isAfter(periodStart.subtract(1, 'day'))
      );
    });
  }, [reservations, periodStart, periodEnd]);

  // ── Check-ins del período (start_date cae dentro del período) ─────────────
  const checkIns = useMemo(
    () =>
      reservations.filter(
        (r) =>
          dayjs(r.start_date).isSameOrAfter(periodStart, 'day') &&
          dayjs(r.start_date).isSameOrBefore(periodEnd, 'day'),
      ),
    [reservations, periodStart, periodEnd],
  );

  // ── Check-outs del período (end_date cae dentro del período) ──────────────
  const checkOuts = useMemo(
    () =>
      reservations.filter(
        (r) =>
          dayjs(r.end_date).isSameOrAfter(periodStart, 'day') &&
          dayjs(r.end_date).isSameOrBefore(periodEnd, 'day'),
      ),
    [reservations, periodStart, periodEnd],
  );

  // ── PickUp: reservas creadas HOY para fechas futuras ──────────────────────
  // Siempre es "hoy" independientemente del período seleccionado
  const pickUpToday = useMemo(() => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    return reservations.filter((r) => {
      const createdDay = dayjs(r.created_at).format('YYYY-MM-DD');
      return (
        createdDay === todayStr && dayjs(r.start_date).isAfter(dayjs(), 'day')
      );
    });
  }, [reservations]);

  // ── Plazas activas del período ─────────────────────────────────────────────
  const activePlacesCount = useMemo(
    () => activeReservations.reduce((sum, r) => sum + (r.num_places ?? 1), 0),
    [activeReservations],
  );

  const totalPlaces = places.length;
  // Para mantenimiento necesitaríamos maintenance_blocks, pero el dashboard
  // es simplificado: libre = total - ocupadas (sin bloqueos)
  const freePlaces = Math.max(0, totalPlaces - activePlacesCount);
  const maintPlaces = 0; // Sin maintenance_blocks en este componente
  const occupancyPct =
    totalPlaces > 0 ? Math.round((activePlacesCount / totalPlaces) * 100) : 0;

  // ── Ingresos del período ─────────────────────────────────────────────────
  // ✅ Recalculados sobre activeReservations del período, no sobre todos
  const activeIds = useMemo(
    () => new Set(activeReservations.map((r) => r.id)),
    [activeReservations],
  );

  const staysRevenue = useMemo(
    () =>
      activeReservations.reduce((sum, r) => {
        const n = overlapNightsInPeriod(
          r.start_date,
          r.end_date,
          periodStart,
          periodEnd,
        );
        return sum + (r.nightly_amount_cents ?? 0) * n * (r.num_places ?? 1);
      }, 0),
    [activeReservations, periodStart, periodEnd],
  );

  // ✅ Extras filtrados solo por reservas activas en el período
  const extrasRevenueByPeriod = useMemo((): ExtraRevenue[] => {
    const map: Record<string, ExtraRevenue> = {};
    for (const row of allExtraRows) {
      if (!activeIds.has(row.reservation_id)) continue;
      const code = row.extras?.code;
      const name = row.extras?.name_es ?? '';
      if (!code) continue;
      if (!map[code]) map[code] = { code, name_es: name, total_cents: 0 };
      map[code].total_cents += row.line_total_cents;
    }
    return Object.values(map).sort(
      (a, b) => (EXTRA_ORDER[a.code] ?? 9) - (EXTRA_ORDER[b.code] ?? 9),
    );
  }, [allExtraRows, activeIds]);

  const extrasTotal = useMemo(
    () => extrasRevenueByPeriod.reduce((s, e) => s + e.total_cents, 0),
    [extrasRevenueByPeriod],
  );
  const totalRevenue = staysRevenue + extrasTotal;

  // ── UI ─────────────────────────────────────────────────────────────────────
  const MAX_PREVIEW = 4;
  const showMoreActive = activeReservations.length >= MAX_PREVIEW;
  const modeLabels: Record<ViewMode, string> = {
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
    year: 'Año',
  };

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Dashboard</Text>

        {/* ── Toggle vistas ─────────────────────────────────────────────── */}
        <View style={styles.toggleRow}>
          {(['day', 'week', 'month', 'year'] as ViewMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setViewMode(m)}
              style={[
                styles.toggleBtn,
                viewMode === m && styles.toggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  viewMode === m && styles.toggleTextActive,
                ]}
              >
                {modeLabels[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Selector período ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.dateLabel}>
            {viewMode === 'day'
              ? 'Fecha'
              : viewMode === 'week'
                ? 'Semana'
                : viewMode === 'month'
                  ? 'Mes'
                  : 'Año'}
          </Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => shift(-1)} style={styles.arrowBtn}>
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            {viewMode === 'day' ? (
              <TextInput
                value={filterInput}
                onChangeText={handleFilterInput}
                style={styles.dateInput}
                placeholder="DD/MM/YYYY"
                keyboardType="numeric"
                maxLength={10}
              />
            ) : (
              <View style={styles.periodLabelBox}>
                <Text style={styles.periodLabelText}>{periodLabel()}</Text>
              </View>
            )}
            <Pressable onPress={() => shift(1)} style={styles.arrowBtn}>
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>
          {filterError ? (
            <Text style={styles.dateError}>{filterError}</Text>
          ) : null}
          {!isCurrentPeriod() && (
            <Pressable onPress={goToCurrent} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Volver al período actual</Text>
            </Pressable>
          )}
        </View>

        {/* ── KPIs 1-4: Plazas ─────────────────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Plazas</Text>
        </View>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderLeftColor: '#f44336' }]}>
            <Text style={styles.kpiValue}>{activePlacesCount}</Text>
            <Text style={styles.kpiLabel}>Ocupadas</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#4CAF50' }]}>
            <Text style={styles.kpiValue}>{freePlaces}</Text>
            <Text style={styles.kpiLabel}>Libres</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#FF9800' }]}>
            <Text style={styles.kpiValue}>{maintPlaces}</Text>
            <Text style={styles.kpiLabel}>Mantenimiento</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#9C27B0' }]}>
            <Text style={styles.kpiValue}>{occupancyPct}%</Text>
            <Text style={styles.kpiLabel}>Ocupación</Text>
          </View>
        </View>

        {/* ── KPI 5: Ingresos desglosados ──────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Ingresos del período</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.revenueTotal}>{formatEuro(totalRevenue)}</Text>
          <View style={styles.revenueDivider} />

          {/* Estancias */}
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>🏕️ Estancias</Text>
            <Text style={styles.revenueValue}>{formatEuro(staysRevenue)}</Text>
          </View>

          {/* Cada extra */}
          {extrasRevenueByPeriod.map((e) => (
            <View key={e.code} style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>
                {extraIcon(e.code)} {e.name_es}
              </Text>
              <Text style={styles.revenueValue}>
                {formatEuro(e.total_cents)}
              </Text>
            </View>
          ))}

          {/* Total extras si hay más de uno */}
          {extrasRevenueByPeriod.length > 0 && (
            <View style={[styles.revenueRow, styles.revenueTotalRow]}>
              <Text style={styles.revenueTotalLabel}>Total extras</Text>
              <Text style={styles.revenueTotalValue}>
                {formatEuro(extrasTotal)}
              </Text>
            </View>
          )}
        </View>

        {/* ── KPIs 6-7: Entradas y Salidas ─────────────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Movimientos del período</Text>
        </View>
        <View style={styles.rowCards}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.cardTitle}>📥 Entradas</Text>
            <Text style={styles.bigNumber}>{checkIns.length}</Text>
          </View>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.cardTitle}>📤 Salidas</Text>
            <Text style={styles.bigNumber}>{checkOuts.length}</Text>
          </View>
        </View>

        {/* ── KPI 8: PickUp diario ─────────────────────────────────────── */}
        {viewMode === 'day' && (
          <>
            {/* ── KPI 8: PickUp diario ─────────────────────────────────────── */}
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionTitle}>PickUp de hoy</Text>
              <Text style={styles.sectionSubtitle}>
                Reservas hechas hoy para fechas futuras
              </Text>
            </View>

            <View style={styles.card}>
              {pickUpToday.length === 0 ? (
                <View style={styles.pickUpEmpty}>
                  <Text style={styles.bigNumber}>0</Text>
                  <Text style={styles.emptyText}>Sin reservas nuevas hoy</Text>
                </View>
              ) : (
                <>
                  <View style={styles.pickUpHeader}>
                    <Text style={styles.bigNumber}>{pickUpToday.length}</Text>
                    <Text style={styles.pickUpSub}>
                      reserva{pickUpToday.length !== 1 ? 's' : ''} nueva
                      {pickUpToday.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {pickUpToday.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push(`/admin/places/${r.id}`)}
                      style={({ pressed }) => [
                        styles.reservationRow,
                        pressed && { backgroundColor: '#F7F8FB' },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reservationName}>
                          {r.full_name ?? 'Sin nombre'} — #{r.id}
                          {(r.num_places ?? 1) > 1
                            ? ` (${r.num_places} plazas)`
                            : ''}
                        </Text>
                        <Text style={styles.reservationDates}>
                          Entrada: {formatDate(r.start_date)}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Text style={styles.reservationAmount}>
                          {formatEuro(r.total_amount_cents)}
                        </Text>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          </>
        )}

        {/* ── KPI 9: Reservas activas del período ──────────────────────── */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Reservas activas</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              {activeReservations.length} reserva
              {activeReservations.length !== 1 ? 's' : ''}
              {activePlacesCount !== activeReservations.length
                ? ` · ${activePlacesCount} plazas`
                : ''}
            </Text>
            {showMoreActive && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/admin/places/reservas',
                    params: { filter: 'paid' },
                  })
                }
              >
                <Text style={styles.verTodas}>Ver todas →</Text>
              </Pressable>
            )}
          </View>

          {activeReservations.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay reservas activas en este período.
            </Text>
          ) : (
            activeReservations.slice(0, MAX_PREVIEW).map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/admin/places/${r.id}`)}
                style={({ pressed }) => [
                  styles.reservationRow,
                  pressed && { backgroundColor: '#F7F8FB' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.reservationName}>
                    {r.full_name ?? 'Sin nombre'} — #{r.id}
                    {(r.num_places ?? 1) > 1 ? ` (${r.num_places} plazas)` : ''}
                  </Text>
                  <Text style={styles.reservationDates}>
                    {formatDate(r.start_date)} → {formatDate(r.end_date)}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text style={styles.reservationAmount}>
                    {formatEuro(r.total_amount_cents)}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            ))
          )}

          {showMoreActive && (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/admin/places/reservas',
                  params: { filter: 'paid' },
                })
              }
              style={styles.verMasBtn}
            >
              <Text style={styles.verMasText}>
                Ver todas ({activeReservations.length}) →
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 48 },
  pageTitle: { fontSize: 26, fontWeight: '800', marginBottom: 16 },

  sectionLabel: { marginBottom: 8, marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: { fontSize: 12, color: '#999', marginTop: 2 },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e8eaf0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#007AFF' },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  emptyText: { fontSize: 14, color: '#aaa', marginTop: 4 },
  verTodas: { color: '#007AFF', fontWeight: '700', fontSize: 13 },

  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    marginBottom: 10,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 22, color: '#007AFF', fontWeight: '700' },
  dateInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: '#F7F8FB',
  },
  periodLabelBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: '#F7F8FB',
  },
  periodLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    textTransform: 'capitalize',
  },
  dateError: { color: 'red', fontSize: 12, marginTop: 6 },
  todayBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
  },
  todayBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 13 },

  // KPIs plazas
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  kpiValue: { fontSize: 28, fontWeight: '800', color: '#111' },
  kpiLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  // Ingresos
  revenueTotal: {
    fontSize: 30,
    fontWeight: '800',
    color: '#4CAF50',
    marginBottom: 4,
  },
  revenueDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  revenueLabel: { fontSize: 14, color: '#444' },
  revenueValue: { fontSize: 14, fontWeight: '700', color: '#111' },
  revenueTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 4,
    paddingTop: 10,
  },
  revenueTotalLabel: { fontSize: 14, fontWeight: '800', color: '#111' },
  revenueTotalValue: { fontSize: 14, fontWeight: '800', color: '#111' },

  // Entradas / Salidas
  rowCards: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  bigNumber: { fontSize: 36, fontWeight: '800', color: '#111', marginTop: 4 },

  // PickUp
  pickUpEmpty: { alignItems: 'center', paddingVertical: 8 },
  pickUpHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  pickUpSub: { fontSize: 15, color: '#666', fontWeight: '500' },

  // Lista reservas
  reservationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 4,
  },
  reservationName: { fontSize: 14, fontWeight: '700', color: '#111' },
  reservationDates: { fontSize: 13, color: '#666', marginTop: 2 },
  reservationAmount: { fontSize: 14, fontWeight: '800', color: '#333' },
  chevron: { fontSize: 20, color: '#ccc', fontWeight: '700' },
  verMasBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  verMasText: { color: '#007AFF', fontWeight: '700', fontSize: 14 },
});
