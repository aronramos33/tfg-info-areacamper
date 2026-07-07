import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isoWeek);

type Place = { id: number; name: string; is_active: boolean };

type Reservation = {
  id: number;
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

type ExtraRow = {
  reservation_id: number;
  line_total_cents: number;
  extras: { code: string; name_es: string } | null;
};

type ExtraRevenue = { code: string; name_es: string; total_cents: number };

type ViewMode = 'day' | 'week' | 'month' | 'year';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const YEAR_SPAN = 2;
const BAR_COLOR_ACTIVE = '#1a5c2a';
const BAR_COLOR_INACTIVE = '#a8d5b0';

function RevenueBarChart({ values, labels, activeIndex, chartWidth, onBarPress }: {
  values: number[]; labels: string[]; activeIndex: number; chartWidth: number;
  onBarPress?: (index: number) => void;
}) {
  const CHART_H = 150;
  const LABEL_H = 18;
  const n = values.length;
  const GAP = n <= 5 ? 8 : 3;
  const barW = Math.max(1, (chartWidth - GAP * (n - 1)) / n);
  const maxVal = Math.max(...values, 1);

  return (
    <Svg width={chartWidth} height={CHART_H + LABEL_H}>
      {values.map((val, i) => {
        const barH = Math.max(3, (val / maxVal) * CHART_H);
        const x = i * (barW + GAP);
        const y = CHART_H - barH;
        const isActive = i === activeIndex;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={barW} height={barH} rx={4} fill={isActive ? BAR_COLOR_ACTIVE : BAR_COLOR_INACTIVE} />
            <SvgText
              x={x + barW / 2}
              y={CHART_H + LABEL_H}
              textAnchor="middle"
              fontSize={9}
              fill={isActive ? '#241a08' : '#7a7a6a'}
              fontWeight={isActive ? '700' : '400'}
            >
              {labels[i]}
            </SvgText>
            {onBarPress && (
              <Rect
                x={x} y={0} width={barW} height={CHART_H + LABEL_H}
                fill="transparent"
                onPress={() => onBarPress(i)}
              />
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

function overlapNightsInPeriod(start: string, end: string, periodStart: dayjs.Dayjs, periodEnd: dayjs.Dayjs) {
  const rStart = dayjs(start).startOf('day');
  const rEndExclusive = dayjs(end).startOf('day');
  const pStart = periodStart.startOf('day');
  const pEndExclusive = periodEnd.startOf('day').add(1, 'day');
  const overlapStart = rStart.isAfter(pStart) ? rStart : pStart;
  const overlapEnd = rEndExclusive.isBefore(pEndExclusive) ? rEndExclusive : pEndExclusive;
  return Math.max(0, overlapEnd.diff(overlapStart, 'day'));
}
const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };
function extraIcon(code: string): React.ReactNode {
  if (code === 'PERSON') return <Ionicons name="people-outline" size={14} color={colors.onSurface} />;
  if (code === 'PET') return <MaterialIcons name="pets" size={14} color={colors.onSurface} />;
  if (code === 'POWER') return <Ionicons name="flash-outline" size={14} color={colors.onSurface} />;
  return null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - spacing.lg * 4;

  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [allExtraRows, setAllExtraRows] = useState<ExtraRow[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');
  const [filterWeek, setFilterWeek] = useState(dayjs().startOf('isoWeek').format('YYYY-MM-DD'));
  const [filterMonth, setFilterMonth] = useState(dayjs().format('YYYY-MM'));
  const [filterYear, setFilterYear] = useState(dayjs().year());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const parsedFilterDate = useMemo(() => {
    const [y, m, d] = filterDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [filterDate]);

  const onPickerChange = (_: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const next = dayjs(date);
      setFilterDate(next.format('YYYY-MM-DD'));
      setFilterInput(next.format('DD/MM/YYYY'));
      setFilterError('');
    }
  };

  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, extrasRes] = await Promise.all([
      supabase.from('places').select('*').order('id'),
      supabase.from('reservations')
        .select('id,place_ids,num_places,start_date,end_date,payment_status,full_name,total_amount_cents,nightly_amount_cents,created_at,user_id')
        .eq('payment_status', 'paid'),
      supabase.from('reservation_extras').select('line_total_cents,reservation_id,extras(code,name_es)'),
    ]);

    const allReservations = (reservationsRes.data ?? []) as Reservation[];
    const rows = ((extrasRes.data ?? []) as any[]).map((row) => ({
      reservation_id: row.reservation_id as number,
      line_total_cents: Number(row.line_total_cents ?? 0),
      extras: row.extras as { code: string; name_es: string } | null,
    }));

    setPlaces(placesRes.data ?? []);
    setReservations(allReservations);
    setAllExtraRows(rows);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { void load(); }, []));

  const weekStart = dayjs(filterWeek);
  const weekEnd = weekStart.endOf('isoWeek');
  const monthStart = dayjs(filterMonth).startOf('month');
  const monthEnd = dayjs(filterMonth).endOf('month');
  const yearStart = dayjs(`${filterYear}-01-01`).startOf('year');
  const yearEnd = dayjs(`${filterYear}-12-31`).endOf('year');

  const periodStart = viewMode === 'day' ? dayjs(filterDate) : viewMode === 'week' ? weekStart : viewMode === 'month' ? monthStart : yearStart;
  const periodEnd = viewMode === 'day' ? dayjs(filterDate).endOf('day') : viewMode === 'week' ? weekEnd : viewMode === 'month' ? monthEnd : yearEnd;

  const shift = (n: number) => {
    if (viewMode === 'day') { const next = dayjs(filterDate).add(n, 'day'); setFilterDate(next.format('YYYY-MM-DD')); setFilterInput(next.format('DD/MM/YYYY')); setFilterError(''); }
    if (viewMode === 'week') setFilterWeek(dayjs(filterWeek).add(n, 'week').startOf('isoWeek').format('YYYY-MM-DD'));
    if (viewMode === 'month') setFilterMonth(dayjs(filterMonth).add(n, 'month').format('YYYY-MM'));
    if (viewMode === 'year') setFilterYear((y) => y + n);
  };

  const handleFilterInput = (text: string) => {
    setFilterInput(text);
    setFilterError('');
    const parsed = dayjs(text, 'DD/MM/YYYY', true);
    if (parsed.isValid()) setFilterDate(parsed.format('YYYY-MM-DD'));
    else if (text.length === 10) setFilterError('Formato inválido. Usa DD/MM/YYYY');
  };

  const isCurrentPeriod = () => {
    if (viewMode === 'day') return filterDate === dayjs().format('YYYY-MM-DD');
    if (viewMode === 'week') return filterWeek === dayjs().startOf('isoWeek').format('YYYY-MM-DD');
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
    if (viewMode === 'week') return `${weekStart.format('DD/MM')} — ${weekEnd.format('DD/MM/YYYY')}`;
    if (viewMode === 'month') return dayjs(filterMonth).format('MMMM YYYY');
    return `${filterYear}`;
  };

  const activeReservations = useMemo(() => {
    return reservations.filter((r) => {
      const rStart = dayjs(r.start_date);
      const rEnd = dayjs(r.end_date).endOf('day');
      return !rStart.isAfter(periodEnd) && !rEnd.isBefore(periodStart);
    });
  }, [reservations, periodStart, periodEnd]);

  const checkIns = useMemo(
    () => reservations.filter((r) => dayjs(r.start_date).isSameOrAfter(periodStart, 'day') && dayjs(r.start_date).isSameOrBefore(periodEnd, 'day')),
    [reservations, periodStart, periodEnd],
  );

  const checkOuts = useMemo(
    () => reservations.filter((r) => dayjs(r.end_date).isSameOrAfter(periodStart, 'day') && dayjs(r.end_date).isSameOrBefore(periodEnd, 'day')),
    [reservations, periodStart, periodEnd],
  );

  const pickUpToday = useMemo(() => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    return reservations.filter((r) => {
      const createdDay = dayjs(r.created_at).format('YYYY-MM-DD');
      return createdDay === todayStr && dayjs(r.start_date).isAfter(dayjs(), 'day');
    });
  }, [reservations]);

  const activePlacesCount = useMemo(() => activeReservations.reduce((sum, r) => sum + (r.num_places ?? 1), 0), [activeReservations]);
  const totalPlaces = places.length;
  const freePlaces = Math.max(0, totalPlaces - activePlacesCount);
  const maintPlaces = 0;
  const occupancyPct = totalPlaces > 0 ? Math.round((activePlacesCount / totalPlaces) * 100) : 0;

  const activeIds = useMemo(() => new Set(activeReservations.map((r) => r.id)), [activeReservations]);

  const staysRevenue = useMemo(
    () => activeReservations.reduce((sum, r) => {
      const n = overlapNightsInPeriod(r.start_date, r.end_date, periodStart, periodEnd);
      return sum + (r.nightly_amount_cents ?? 0) * n * (r.num_places ?? 1);
    }, 0),
    [activeReservations, periodStart, periodEnd],
  );

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
    return Object.values(map).sort((a, b) => (EXTRA_ORDER[a.code] ?? 9) - (EXTRA_ORDER[b.code] ?? 9));
  }, [allExtraRows, activeIds]);

  const extrasTotal = useMemo(() => extrasRevenueByPeriod.reduce((s, e) => s + e.total_cents, 0), [extrasRevenueByPeriod]);
  const totalRevenue = staysRevenue + extrasTotal;

  const monthlyRevenues = useMemo((): number[] => {
    if (viewMode !== 'month') return [];
    const year = dayjs(filterMonth).year();
    return MONTH_LABELS.map((_, i) => {
      const mStart = dayjs(`${year}-${String(i + 1).padStart(2, '0')}-01`).startOf('month');
      const mEnd = mStart.endOf('month');
      const active = reservations.filter((r) => {
        const rEnd = dayjs(r.end_date).endOf('day');
        return !dayjs(r.start_date).isAfter(mEnd) && !rEnd.isBefore(mStart);
      });
      const activeIdSet = new Set(active.map((r) => r.id));
      const stays = active.reduce((sum, r) => {
        const n = overlapNightsInPeriod(r.start_date, r.end_date, mStart, mEnd);
        return sum + (r.nightly_amount_cents ?? 0) * n * (r.num_places ?? 1);
      }, 0);
      const extras = allExtraRows.filter((row) => activeIdSet.has(row.reservation_id)).reduce((sum, row) => sum + row.line_total_cents, 0);
      return stays + extras;
    });
  }, [viewMode, filterMonth, reservations, allExtraRows]);

  const yearlyRevenues = useMemo((): { values: number[]; years: number[] } => {
    if (viewMode !== 'year') return { values: [], years: [] };
    const years = Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => filterYear - YEAR_SPAN + i);
    const values = years.map((y) => {
      const yStart = dayjs(`${y}-01-01`).startOf('year');
      const yEnd = dayjs(`${y}-12-31`).endOf('year');
      const active = reservations.filter((r) => {
        const rEnd = dayjs(r.end_date).endOf('day');
        return !dayjs(r.start_date).isAfter(yEnd) && !rEnd.isBefore(yStart);
      });
      const activeIdSet = new Set(active.map((r) => r.id));
      const stays = active.reduce((sum, r) => {
        const n = overlapNightsInPeriod(r.start_date, r.end_date, yStart, yEnd);
        return sum + (r.nightly_amount_cents ?? 0) * n * (r.num_places ?? 1);
      }, 0);
      const extras = allExtraRows.filter((row) => activeIdSet.has(row.reservation_id)).reduce((sum, row) => sum + row.line_total_cents, 0);
      return stays + extras;
    });
    return { values, years };
  }, [viewMode, filterYear, reservations, allExtraRows]);

  const MAX_PREVIEW = 4;
  const showMoreActive = activeReservations.length >= MAX_PREVIEW;
  const modeLabels: Record<ViewMode, string> = { day: 'Día', week: 'Semana', month: 'Mes', year: 'Año' };

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Dashboard</Text>

        <View style={styles.toggleRow}>
          {(['day', 'week', 'month', 'year'] as ViewMode[]).map((m) => (
            <Pressable key={m} onPress={() => setViewMode(m)} style={[styles.toggleBtn, viewMode === m && styles.toggleBtnActive]}>
              <Text style={[styles.toggleText, viewMode === m && styles.toggleTextActive]}>{modeLabels[m]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.dateLabel}>
            {viewMode === 'day' ? 'Fecha' : viewMode === 'week' ? 'Semana' : viewMode === 'month' ? 'Mes' : 'Año'}
          </Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => shift(-1)} style={styles.arrowBtn}><Text style={styles.arrowText}>‹</Text></Pressable>
            {viewMode === 'day' ? (
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.periodLabelBox}>
                <Text style={styles.periodLabelText}>{filterInput}</Text>
              </Pressable>
            ) : (
              <View style={styles.periodLabelBox}><Text style={styles.periodLabelText}>{periodLabel()}</Text></View>
            )}
            <Pressable onPress={() => shift(1)} style={styles.arrowBtn}><Text style={styles.arrowText}>›</Text></Pressable>
          </View>
          {filterError ? <Text style={styles.dateError}>{filterError}</Text> : null}
          {!isCurrentPeriod() && (
            <Pressable onPress={goToCurrent} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Volver al período actual</Text>
            </Pressable>
          )}
        </View>

        {showDatePicker && Platform.OS === 'ios' && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setShowDatePicker(false)}>
              <View style={styles.pickerCard} onStartShouldSetResponder={() => true}>
                <View style={styles.pickerHandle} />
                <DateTimePicker
                  value={parsedFilterDate}
                  mode="date"
                  display="inline"
                  onChange={onPickerChange}
                  locale="es-ES"
                  accentColor={colors.primary}
                  themeVariant="light"
                />
              </View>
            </Pressable>
          </Modal>
        )}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={parsedFilterDate}
            mode="date"
            display="default"
            onChange={onPickerChange}
            accentColor={colors.primary}
          />
        )}

        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Plazas</Text>
        </View>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderLeftColor: '#c0392b' }]}>
            <Text style={styles.kpiValue}>{activePlacesCount}</Text>
            <Text style={styles.kpiLabel}>Ocupadas</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: colors.confirmedText }]}>
            <Text style={styles.kpiValue}>{freePlaces}</Text>
            <Text style={styles.kpiLabel}>Libres</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: colors.warning }]}>
            <Text style={styles.kpiValue}>{maintPlaces}</Text>
            <Text style={styles.kpiLabel}>Mantenimiento</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: colors.secondary }]}>
            <Text style={styles.kpiValue}>{occupancyPct}%</Text>
            <Text style={styles.kpiLabel}>Ocupación</Text>
          </View>
        </View>

        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Ingresos del período</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.revenueTotal}>{formatEuro(totalRevenue)}</Text>
          <View style={styles.revenueDivider} />
          {(viewMode === 'day' || viewMode === 'week') ? (
            <>
              <View style={styles.revenueRow}>
                <View style={styles.revenueLabelCell}>
                  <Ionicons name="leaf-outline" size={14} color={colors.onSurface} />
                  <Text style={styles.revenueLabel}>Estancias</Text>
                </View>
                <Text style={styles.revenueValue}>{formatEuro(staysRevenue)}</Text>
              </View>
              {extrasRevenueByPeriod.map((e) => (
                <View key={e.code} style={styles.revenueRow}>
                  <View style={styles.revenueLabelCell}>
                    {extraIcon(e.code)}
                    <Text style={styles.revenueLabel}>{e.name_es}</Text>
                  </View>
                  <Text style={styles.revenueValue}>{formatEuro(e.total_cents)}</Text>
                </View>
              ))}
              {extrasRevenueByPeriod.length > 0 && (
                <View style={[styles.revenueRow, styles.revenueTotalRow]}>
                  <Text style={styles.revenueTotalLabel}>Total extras</Text>
                  <Text style={styles.revenueTotalValue}>{formatEuro(extrasTotal)}</Text>
                </View>
              )}
            </>
          ) : (
            <>
              {viewMode === 'month' ? (
                <RevenueBarChart
                  values={monthlyRevenues}
                  labels={MONTH_LABELS}
                  activeIndex={dayjs(filterMonth).month()}
                  chartWidth={chartWidth}
                  onBarPress={(i) => setFilterMonth(`${dayjs(filterMonth).year()}-${String(i + 1).padStart(2, '0')}`)}
                />
              ) : (
                <RevenueBarChart
                  values={yearlyRevenues.values}
                  labels={yearlyRevenues.years.map(String)}
                  activeIndex={YEAR_SPAN}
                  chartWidth={chartWidth}
                  onBarPress={(i) => setFilterYear(filterYear - YEAR_SPAN + i)}
                />
              )}
              <View style={styles.revenueDivider} />
              <View style={styles.revenueRow}>
                <View style={styles.revenueLabelCell}>
                  <Ionicons name="leaf-outline" size={14} color={colors.onSurface} />
                  <Text style={styles.revenueLabel}>Estancias</Text>
                </View>
                <Text style={styles.revenueValue}>{formatEuro(staysRevenue)}</Text>
              </View>
              {extrasRevenueByPeriod.map((e) => (
                <View key={e.code} style={styles.revenueRow}>
                  <View style={styles.revenueLabelCell}>
                    {extraIcon(e.code)}
                    <Text style={styles.revenueLabel}>{e.name_es}</Text>
                  </View>
                  <Text style={styles.revenueValue}>{formatEuro(e.total_cents)}</Text>
                </View>
              ))}
              {extrasRevenueByPeriod.length > 0 && (
                <View style={[styles.revenueRow, styles.revenueTotalRow]}>
                  <Text style={styles.revenueTotalLabel}>Total extras</Text>
                  <Text style={styles.revenueTotalValue}>{formatEuro(extrasTotal)}</Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Movimientos del período</Text>
        </View>
        <View style={styles.rowCards}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.cardTitle}>Entradas</Text>
            <Text style={styles.bigNumber}>{checkIns.length}</Text>
          </View>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.cardTitle}>Salidas</Text>
            <Text style={styles.bigNumber}>{checkOuts.length}</Text>
          </View>
        </View>

        {viewMode === 'day' && (
          <>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionTitle}>PickUp de hoy</Text>
              <Text style={styles.sectionSubtitle}>Reservas hechas hoy para fechas futuras</Text>
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
                    <Text style={styles.pickUpSub}>reserva{pickUpToday.length !== 1 ? 's' : ''} nueva{pickUpToday.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {pickUpToday.map((r) => (
                    <Pressable key={r.id} onPress={() => router.push(`/admin/places/${r.id}`)} style={({ pressed }) => [styles.reservationRow, pressed && { backgroundColor: colors.surfaceContainerHigh }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reservationName}>{r.full_name ?? 'Sin nombre'} — #{r.id}{(r.num_places ?? 1) > 1 ? ` (${r.num_places} plazas)` : ''}</Text>
                        <Text style={styles.reservationDates}>Entrada: {formatDate(r.start_date)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.reservationAmount}>{formatEuro(r.total_amount_cents)}</Text>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          </>
        )}

        <View style={styles.sectionLabel}>
          <Text style={styles.sectionTitle}>Reservas activas</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              {activeReservations.length} reserva{activeReservations.length !== 1 ? 's' : ''}
              {activePlacesCount !== activeReservations.length ? ` · ${activePlacesCount} plazas` : ''}
            </Text>
            {showMoreActive && (
              <Pressable onPress={() => router.push({ pathname: '/admin/places/reservas', params: { filter: 'paid' } })}>
                <Text style={styles.verTodas}>Ver todas →</Text>
              </Pressable>
            )}
          </View>

          {activeReservations.length === 0 ? (
            <Text style={styles.emptyText}>No hay reservas activas en este período.</Text>
          ) : (
            activeReservations.slice(0, MAX_PREVIEW).map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/admin/places/${r.id}`)} style={({ pressed }) => [styles.reservationRow, pressed && { backgroundColor: colors.surfaceContainerHigh }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reservationName}>{r.full_name ?? 'Sin nombre'} — #{r.id}{(r.num_places ?? 1) > 1 ? ` (${r.num_places} plazas)` : ''}</Text>
                  <Text style={styles.reservationDates}>{formatDate(r.start_date)} → {formatDate(r.end_date)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.reservationAmount}>{formatEuro(r.total_amount_cents)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            ))
          )}

          {showMoreActive && (
            <Pressable onPress={() => router.push({ pathname: '/admin/places/reservas', params: { filter: 'paid' } })} style={styles.verMasBtn}>
              <Text style={styles.verMasText}>Ver todas ({activeReservations.length}) →</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48 },
  pageTitle: { ...typography.headlineLg, marginBottom: 16 },

  sectionLabel: { marginBottom: 8, marginTop: 4 },
  sectionTitle: { ...typography.labelSm },
  sectionSubtitle: { ...typography.labelMd, marginTop: 2, fontFamily: 'Inter_400Regular' },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    padding: 4,
    marginBottom: 14,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.sm, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.surfaceContainerLow, ...shadow.sm },
  toggleText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  toggleTextActive: { color: colors.secondary },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: 14,
    ...shadow.sm,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { ...typography.titleMd },
  emptyText: { ...typography.bodyMd, marginTop: 4 },
  verTodas: { ...typography.titleSm, color: colors.secondary },

  dateLabel: { ...typography.labelMd, marginBottom: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowBtn: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 22, color: colors.secondary, fontFamily: 'PlusJakartaSans_700Bold' },
  dateInput: {
    flex: 1, textAlign: 'center', ...typography.titleMd,
    borderWidth: 1, borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: colors.inputSurface,
    color: colors.onSurface,
  },
  periodLabelBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: colors.inputSurface,
  },
  periodLabelText: { ...typography.titleMd, textTransform: 'capitalize' },
  dateError: { ...typography.labelMd, color: colors.error, marginTop: 6 },
  todayBtn: { marginTop: 10, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.surfaceContainerHigh, borderRadius: radii.full },
  todayBtnText: { ...typography.titleSm, color: colors.secondary },

  pickerBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  pickerCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: 34,
    paddingTop: 8,
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.outline, alignSelf: 'center', marginBottom: 8 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: 14,
    borderLeftWidth: 4,
    ...shadow.sm,
  },
  kpiValue: { ...typography.display, fontSize: 28 },
  kpiLabel: { ...typography.bodyMd, marginTop: 2 },

  revenueTotal: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 30, color: colors.confirmedText, marginBottom: 4 },
  revenueDivider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10 },
  revenueRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  revenueLabelCell: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  revenueLabel: { ...typography.bodyMd, color: colors.onSurface },
  revenueValue: { ...typography.titleSm, color: colors.onSurface },
  revenueTotalRow: { borderTopWidth: 1, borderTopColor: colors.outlineVariant, marginTop: 4, paddingTop: 10 },
  revenueTotalLabel: { ...typography.titleSm },
  revenueTotalValue: { ...typography.titleSm },

  rowCards: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  bigNumber: { ...typography.display, fontSize: 36, marginTop: 4 },

  pickUpEmpty: { alignItems: 'center', paddingVertical: 8 },
  pickUpHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  pickUpSub: { ...typography.bodyLg, color: colors.onSurfaceVariant },

  reservationRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.outlineVariant,
    paddingHorizontal: 4,
  },
  reservationName: { ...typography.titleSm },
  reservationDates: { ...typography.bodyMd, marginTop: 2 },
  reservationAmount: { ...typography.titleSm, color: colors.onSurface },
  chevron: { fontSize: 20, color: colors.onSurfaceVariant, fontFamily: 'PlusJakartaSans_700Bold' },
  verMasBtn: { marginTop: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant, alignItems: 'center' },
  verMasText: { ...typography.titleSm, color: colors.secondary },
});
