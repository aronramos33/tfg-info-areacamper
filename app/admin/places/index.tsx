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
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import DateTimePicker from '@react-native-community/datetimepicker';

dayjs.extend(isoWeek);

// ─── Types ───────────────────────────────────────────────────────────────────
type Place = { id: number; name: string; is_active: boolean };

type Reservation = {
  id: number;
  place_id: number | null;
  start_date: string;
  end_date: string;
  payment_status: string;
  full_name: string | null;
  total_amount_cents: number | null;
  nightly_amount_cents: number | null;
  user_id: string;
};

type MaintenanceBlock = {
  id: number;
  place_id: number;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  block_type: 'maintenance' | 'occupied';
};

type ExtraRevenue = { code: string; name_es: string; total_cents: number };
type ViewMode = 'day' | 'week' | 'month' | 'year';
type PlaceStatus = 'free' | 'occupied' | 'maintenance';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}
function nightsBetween(start: string, end: string) {
  return Math.max(0, dayjs(end).diff(dayjs(start), 'day'));
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminPlacesIndex() {
  const router = useRouter();

  // Data
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [maintenanceBlocks, setMaintenanceBlocks] = useState<
    MaintenanceBlock[]
  >([]);
  const [extrasRevenue, setExtrasRevenue] = useState<ExtraRevenue[]>([]);

  // Vista
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');
  const [filterWeek, setFilterWeek] = useState(
    dayjs().startOf('isoWeek').format('YYYY-MM-DD'),
  );
  const [filterMonth, setFilterMonth] = useState(dayjs().format('YYYY-MM'));
  const [filterYear, setFilterYear] = useState(dayjs().year());

  // Modal plaza
  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<PlaceStatus>('free');
  const [blockFrom, setBlockFrom] = useState(new Date());
  const [blockTo, setBlockTo] = useState(dayjs().add(7, 'day').toDate());
  const [blockReason, setBlockReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, maintenanceRes, ownersRes, extrasRes] =
      await Promise.all([
        supabase.from('places').select('*').order('id'),
        supabase
          .from('reservations')
          .select(
            'id,place_id,start_date,end_date,payment_status,full_name,total_amount_cents,nightly_amount_cents,user_id',
          )
          .eq('payment_status', 'paid'),
        supabase.from('maintenance_blocks').select('*'),
        supabase.from('owners').select('user_id'),
        supabase
          .from('reservation_extras')
          .select('line_total_cents, reservation_id, extras(code, name_es)'),
      ]);

    const ownerIds = new Set((ownersRes.data ?? []).map((o: any) => o.user_id));
    const allReservations = (
      (reservationsRes.data ?? []) as Reservation[]
    ).filter((r) => !ownerIds.has(r.user_id));

    setPlaces(placesRes.data ?? []);
    setReservations(allReservations);
    setMaintenanceBlocks((maintenanceRes.data ?? []) as MaintenanceBlock[]);

    // Desglose extras — solo de reservas pagadas no-owner
    const paidIds = new Set(allReservations.map((r) => r.id));
    const extraMap: Record<string, ExtraRevenue> = {};
    for (const row of (extrasRes.data ?? []) as any[]) {
      if (!paidIds.has(row.reservation_id)) continue;
      const code = row.extras?.code;
      const name = row.extras?.name_es;
      const cents = Number(row.line_total_cents ?? 0);
      if (!code) continue;
      if (!extraMap[code])
        extraMap[code] = { code, name_es: name, total_cents: 0 };
      extraMap[code].total_cents += cents;
    }
    // Orden fijo: PERSON → PET → POWER
    const ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };
    setExtrasRevenue(
      Object.values(extraMap).sort(
        (a, b) => (ORDER[a.code] ?? 9) - (ORDER[b.code] ?? 9),
      ),
    );

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

  // ── Reservas del período ───────────────────────────────────────────────────
  const activeReservations = useMemo(() => {
    const overlaps = (r: Reservation) => {
      const rStart = dayjs(r.start_date);
      const rEnd = dayjs(r.end_date).endOf('day');
      return (
        rStart.isBefore(periodEnd.add(1, 'day')) &&
        rEnd.isAfter(periodStart.subtract(1, 'day'))
      );
    };
    return reservations.filter(overlaps);
  }, [reservations, periodStart, periodEnd]);

  const checkIns = useMemo(
    () =>
      reservations.filter(
        (r) =>
          dayjs(r.start_date).isAfter(periodStart.subtract(1, 'day')) &&
          dayjs(r.start_date).isBefore(periodEnd.add(1, 'day')),
      ),
    [reservations, periodStart, periodEnd],
  );

  const checkOuts = useMemo(
    () =>
      reservations.filter(
        (r) =>
          dayjs(r.end_date).isAfter(periodStart.subtract(1, 'day')) &&
          dayjs(r.end_date).isBefore(periodEnd.add(1, 'day')),
      ),
    [reservations, periodStart, periodEnd],
  );

  // ── Ingresos desglosados ───────────────────────────────────────────────────
  const staysRevenue = useMemo(
    () =>
      activeReservations.reduce((sum, r) => {
        const n = nightsBetween(r.start_date, r.end_date);
        return sum + (r.nightly_amount_cents ?? 0) * n;
      }, 0),
    [activeReservations],
  );

  const extrasTotal = useMemo(
    () => extrasRevenue.reduce((s, e) => s + e.total_cents, 0),
    [extrasRevenue],
  );

  const totalRevenue = staysRevenue + extrasTotal;

  // ── Estado plazas (HOY siempre) ────────────────────────────────────────────
  const today = dayjs();

  const blockActiveToday = (b: MaintenanceBlock) => {
    const s = dayjs(b.starts_on);
    const e = dayjs(b.ends_on).endOf('day');
    return today.isAfter(s.subtract(1, 'ms')) && today.isBefore(e.add(1, 'ms'));
  };

  const reservationActiveToday = (r: Reservation) => {
    const s = dayjs(r.start_date);
    const e = dayjs(r.end_date).endOf('day');
    return today.isAfter(s.subtract(1, 'ms')) && today.isBefore(e.add(1, 'ms'));
  };

  const blocksToday = maintenanceBlocks.filter(blockActiveToday);
  const reservationsToday = reservations.filter(reservationActiveToday);

  const getPlaceStatus = useCallback(
    (placeId: number): PlaceStatus => {
      const block = blocksToday.find((b) => b.place_id === placeId);
      if (block)
        return block.block_type === 'occupied' ? 'occupied' : 'maintenance';
      if (reservationsToday.some((r) => r.place_id === placeId))
        return 'occupied';
      return 'free';
    },
    [blocksToday, reservationsToday],
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalPlaces = places.length;
  const occupiedToday = places.filter(
    (p) => getPlaceStatus(p.id) === 'occupied',
  ).length;
  const maintToday = places.filter(
    (p) => getPlaceStatus(p.id) === 'maintenance',
  ).length;
  const freeToday = totalPlaces - occupiedToday - maintToday;

  // ── Modal ──────────────────────────────────────────────────────────────────
  const openPlaceModal = (placeId: number) => {
    setSelectedPlace(placeId);
    setNewStatus(getPlaceStatus(placeId));
    setBlockFrom(new Date());
    setBlockTo(dayjs().add(7, 'day').toDate());
    setBlockReason('');
    setShowFromPicker(false);
    setShowToPicker(false);
    setModalVisible(true);
  };

  const handleSavePlaceStatus = async () => {
    if (!selectedPlace) return;
    setSaving(true);

    try {
      if (newStatus === 'free') {
        // Eliminar bloques activos de esta plaza
        const activeBlocks = blocksToday.filter(
          (b) => b.place_id === selectedPlace,
        );
        for (const b of activeBlocks) {
          await supabase.from('maintenance_blocks').delete().eq('id', b.id);
        }
      } else if (newStatus === 'maintenance' || newStatus === 'occupied') {
        const from = dayjs(blockFrom);
        const to = dayjs(blockTo);

        if (to.isBefore(from)) {
          Alert.alert(
            'Fechas inválidas',
            'La fecha fin debe ser posterior al inicio.',
          );
          setSaving(false);
          return;
        }

        // Insertar bloque
        const { error: bErr } = await supabase
          .from('maintenance_blocks')
          .insert({
            place_id: selectedPlace,
            starts_on: from.format('YYYY-MM-DD'),
            ends_on: to.format('YYYY-MM-DD'),
            reason: blockReason.trim() || null,
            block_type: newStatus,
          });
        if (bErr) throw bErr;

        // Si es mantenimiento, reasignar todas las reservas futuras de esta plaza
        if (newStatus === 'maintenance') {
          const futureRes = reservations.filter(
            (r) =>
              r.place_id === selectedPlace &&
              dayjs(r.end_date).isAfter(dayjs()),
          );

          let reasigned = 0;
          for (const r of futureRes) {
            const { data: newPlace } = await supabase.rpc(
              'get_first_available_place',
              {
                p_start_date: r.start_date,
                p_end_date: r.end_date,
              },
            );
            if (newPlace && newPlace !== selectedPlace) {
              await supabase
                .from('reservations')
                .update({ place_id: newPlace })
                .eq('id', r.id);
              reasigned++;
            }
          }

          if (reasigned > 0) {
            Alert.alert(
              'Plaza en mantenimiento',
              `${reasigned} reserva(s) reasignada(s) automáticamente.`,
            );
          }
        }
      }

      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ── Constantes UI ──────────────────────────────────────────────────────────
  const MAX_PREVIEW = 5;
  const modeLabels: Record<ViewMode, string> = {
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
    year: 'Año',
  };
  const showMoreActive = activeReservations.length > MAX_PREVIEW;
  const selectedPlaceStatus = selectedPlace
    ? getPlaceStatus(selectedPlace)
    : 'free';

  const extraIcon = (code: string) =>
    code === 'PERSON'
      ? '👥'
      : code === 'PET'
        ? '🐾'
        : code === 'POWER'
          ? '⚡'
          : '•';

  const needsBlockFields =
    newStatus === 'maintenance' || newStatus === 'occupied';

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Dashboard</Text>

        {/* Toggle vistas */}
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

        {/* Selector período */}
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

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          {[
            {
              value: activeReservations.length,
              label: 'Reservas activas',
              color: '#f44336',
            },
            { value: freeToday, label: 'Libres hoy', color: '#4CAF50' },
            { value: maintToday, label: 'Mantenimiento', color: '#FF9800' },
            {
              value: `${totalPlaces > 0 ? Math.round((occupiedToday / totalPlaces) * 100) : 0}%`,
              label: 'Ocupación',
              color: '#9C27B0',
            },
          ].map((kpi, i) => (
            <View
              key={i}
              style={[styles.kpiCard, { borderLeftColor: kpi.color }]}
            >
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {/* Barra ocupación */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🅿️ Ocupación</Text>
          <Text style={styles.cardSubtitle}>
            {freeToday} libres · {occupiedToday} ocupadas · {totalPlaces} total
          </Text>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(occupiedToday / totalPlaces) * 100}%` as any,
                },
              ]}
            />
          </View>
          <View style={styles.legend}>
            <Text style={styles.legendItem}>🟢 Libres: {freeToday}</Text>
            <Text style={styles.legendItem}>🔴 Ocupadas: {occupiedToday}</Text>
            {maintToday > 0 && (
              <Text style={styles.legendItem}>
                🟠 Mantenimiento: {maintToday}
              </Text>
            )}
          </View>
        </View>

        {/* Ingresos desglosados */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Ingresos del período</Text>
          <Text style={styles.revenueTotal}>{formatEuro(totalRevenue)}</Text>

          <View style={styles.revenueDivider} />
          <Text style={styles.revenueBreakdownTitle}>Desglose</Text>

          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>🏕️ Estancias</Text>
            <Text style={styles.revenueValue}>{formatEuro(staysRevenue)}</Text>
          </View>
          {extrasRevenue.map((e) => (
            <View key={e.code} style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>
                {extraIcon(e.code)} {e.name_es}
              </Text>
              <Text style={styles.revenueValue}>
                {formatEuro(e.total_cents)}
              </Text>
            </View>
          ))}
          {extrasRevenue.length > 0 && (
            <View style={[styles.revenueRow, styles.revenueTotalRow]}>
              <Text style={styles.revenueTotalLabel}>Total extras</Text>
              <Text style={styles.revenueTotalValue}>
                {formatEuro(extrasTotal)}
              </Text>
            </View>
          )}
        </View>

        {/* Entradas / Salidas */}
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

        {/* Reservas activas */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>
              ✅ Activas ({activeReservations.length})
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
                <Text style={styles.verTodas}>Ver más →</Text>
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
            <Text style={styles.moreHint}>
              +{activeReservations.length - MAX_PREVIEW} más
            </Text>
          )}
        </View>

        {/* Grid plazas interactivo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🅿️ Estado de plazas hoy</Text>
          <Text style={styles.cardSubtitle}>
            Toca una plaza para cambiar su estado
          </Text>
          <View style={styles.placesGrid}>
            {places.map((place) => {
              const status = getPlaceStatus(place.id);
              const bg =
                status === 'maintenance'
                  ? '#FF9800'
                  : status === 'occupied'
                    ? '#f44336'
                    : '#4CAF50';
              return (
                <Pressable
                  key={place.id}
                  onPress={() => openPlaceModal(place.id)}
                  style={({ pressed }) => [
                    styles.placeCell,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View
                    style={[styles.placeCellInner, { backgroundColor: bg }]}
                  >
                    <Text style={styles.placeCellText}>{place.id}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <Text style={styles.legendItem}>🟢 Libre</Text>
            <Text style={styles.legendItem}>🔴 Ocupada</Text>
            <Text style={styles.legendItem}>🟠 Mantenimiento</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Modal gestión plaza ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={styles.modalBox}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Plaza {selectedPlace}</Text>
            <View style={styles.modalCurrentBadge}>
              <Text style={styles.modalCurrentText}>
                Estado actual:{' '}
                {selectedPlaceStatus === 'occupied'
                  ? '🔴 Ocupada'
                  : selectedPlaceStatus === 'maintenance'
                    ? '🟠 Mantenimiento'
                    : '🟢 Libre'}
              </Text>
            </View>

            {/* Radio selector */}
            <Text style={styles.modalSectionLabel}>Cambiar a:</Text>
            {(
              [
                { value: 'free', label: '🟢 Libre' },
                { value: 'occupied', label: '🔴 Ocupada' },
                { value: 'maintenance', label: '🟠 Mantenimiento' },
              ] as { value: PlaceStatus; label: string }[]
            ).map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setNewStatus(opt.value)}
                style={styles.radioRow}
              >
                <View
                  style={[
                    styles.radioOuter,
                    newStatus === opt.value && styles.radioOuterActive,
                  ]}
                >
                  {newStatus === opt.value && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <Text style={styles.radioLabel}>{opt.label}</Text>
              </Pressable>
            ))}

            {/* Fechas + motivo (ocupada o mantenimiento) */}
            {needsBlockFields && (
              <View style={styles.blockFields}>
                <Text style={styles.modalSectionLabel}>Período</Text>

                <View style={styles.blockDatesRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Desde</Text>
                    <Pressable
                      onPress={() => {
                        setShowFromPicker(true);
                        setShowToPicker(false);
                      }}
                      style={styles.datePickerBtn}
                    >
                      <Text style={styles.datePickerText}>
                        {dayjs(blockFrom).format('DD/MM/YYYY')}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.blockDatesSep}>→</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Hasta</Text>
                    <Pressable
                      onPress={() => {
                        setShowToPicker(true);
                        setShowFromPicker(false);
                      }}
                      style={styles.datePickerBtn}
                    >
                      <Text style={styles.datePickerText}>
                        {dayjs(blockTo).format('DD/MM/YYYY')}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {showFromPicker && (
                  <DateTimePicker
                    value={blockFrom}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowFromPicker(false);
                      if (date) setBlockFrom(date);
                    }}
                  />
                )}
                {showToPicker && (
                  <DateTimePicker
                    value={blockTo}
                    mode="date"
                    display="default"
                    minimumDate={blockFrom}
                    onChange={(_, date) => {
                      setShowToPicker(false);
                      if (date) setBlockTo(date);
                    }}
                  />
                )}

                <Text style={styles.fieldLabel}>Motivo (opcional)</Text>
                <TextInput
                  value={blockReason}
                  onChangeText={setBlockReason}
                  style={styles.input}
                  placeholder={
                    newStatus === 'maintenance'
                      ? 'ej: reparación suelo'
                      : 'ej: uso propio'
                  }
                  autoCapitalize="sentences"
                />
                {newStatus === 'maintenance' && (
                  <Text style={styles.reasignHint}>
                    ⚠️ Las reservas futuras de esta plaza se reasignarán
                    automáticamente.
                  </Text>
                )}
              </View>
            )}

            {/* Botones */}
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.btnCancel}
              >
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleSavePlaceStatus}
                disabled={saving}
                style={[styles.btnSave, saving && { opacity: 0.6 }]}
              >
                <Text style={styles.btnSaveText}>
                  {saving ? 'Guardando…' : 'Confirmar'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 48 },
  pageTitle: { fontSize: 26, fontWeight: '800', marginBottom: 16 },

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
    marginBottom: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#888', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#aaa', marginTop: 4 },
  verTodas: { color: '#007AFF', fontWeight: '700', fontSize: 13 },
  moreHint: { textAlign: 'center', color: '#aaa', fontSize: 12, marginTop: 8 },

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

  progressBg: {
    height: 16,
    borderRadius: 999,
    backgroundColor: '#4CAF50',
    marginTop: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#f44336',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  legendItem: { fontSize: 13, color: '#555' },

  revenueTotal: {
    fontSize: 30,
    fontWeight: '800',
    color: '#4CAF50',
    marginTop: 4,
    marginBottom: 4,
  },
  revenueDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },
  revenueBreakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
  },
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

  rowCards: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  bigNumber: { fontSize: 36, fontWeight: '800', color: '#111', marginTop: 4 },

  reservationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  reservationName: { fontSize: 14, fontWeight: '700', color: '#111' },
  reservationDates: { fontSize: 13, color: '#666', marginTop: 2 },
  reservationAmount: { fontSize: 14, fontWeight: '800', color: '#333' },
  chevron: { fontSize: 20, color: '#ccc', fontWeight: '700' },

  placesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 8,
  },
  placeCell: {
    width: '20%',
    aspectRatio: 1,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCellText: { color: 'white', fontWeight: '800', fontSize: 13 },
  placeCellInner: {
    flex: 1,
    width: '100%',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  modalCurrentBadge: {
    backgroundColor: '#F7F8FB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  modalCurrentText: { fontSize: 13, color: '#555', fontWeight: '600' },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#007AFF' },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  radioLabel: { fontSize: 16, color: '#111', fontWeight: '500' },

  blockFields: { marginTop: 14 },
  blockDatesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  blockDatesSep: {
    fontSize: 16,
    color: '#aaa',
    fontWeight: '700',
    paddingBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    fontSize: 14,
    color: '#111',
  },
  reasignHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
    lineHeight: 18,
  },

  datePickerBtn: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    alignItems: 'center',
  },
  datePickerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },

  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancel: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnCancelText: { fontWeight: '700', color: '#333', fontSize: 15 },
  btnSave: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnSaveText: { fontWeight: '700', color: 'white', fontSize: 15 },
});
