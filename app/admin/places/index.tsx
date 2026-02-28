import React, { useState, useCallback } from 'react';
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
import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';

type Place = {
  id: number;
  name: string;
  is_active: boolean;
};

type Reservation = {
  id: number;
  place_id: number | null;
  start_date: string;
  end_date: string;
  payment_status: string;
  status: string;
  full_name: string | null;
  total_amount_cents: number | null;
  user_id: string;
};

type MaintenanceBlock = {
  id: number;
  place_id: number;
  starts_on: string;
  ends_on: string;
  reason: string | null;
};

function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}

function formatDate(d: string) {
  return dayjs(d).format('DD/MM/YYYY');
}

type ViewMode = 'day' | 'month';

export default function AdminPlacesIndex() {
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [maintenanceBlocks, setMaintenanceBlocks] = useState<
    MaintenanceBlock[]
  >([]);
  const [viewMode, setViewMode] = useState<ViewMode>('day');

  // Vista día
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');

  // Vista mes
  const [filterMonth, setFilterMonth] = useState(dayjs().format('YYYY-MM'));

  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, maintenanceRes, ownersRes] =
      await Promise.all([
        supabase.from('places').select('*').order('id'),
        supabase
          .from('reservations')
          .select(
            'id,place_id,start_date,end_date,payment_status,status,full_name,total_amount_cents,user_id',
          ),
        supabase.from('maintenance_blocks').select('*'),
        supabase.from('owners').select('user_id'),
      ]);

    const ownerIds = new Set((ownersRes.data ?? []).map((o: any) => o.user_id));
    const filteredReservations = (reservationsRes.data ?? []).filter(
      (r: any) => !ownerIds.has(r.user_id),
    ) as Reservation[];

    setPlaces(placesRes.data ?? []);
    setReservations(filteredReservations);
    setMaintenanceBlocks(maintenanceRes.data ?? []);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  // ── Helpers fecha día ──
  const handleFilterInput = (text: string) => {
    setFilterInput(text);
    setFilterError('');
    const parsed = dayjs(text, 'DD/MM/YYYY', true);
    if (parsed.isValid()) setFilterDate(parsed.format('YYYY-MM-DD'));
    else if (text.length === 10)
      setFilterError('Formato inválido. Usa DD/MM/YYYY');
  };

  const setToday = () => {
    setFilterDate(dayjs().format('YYYY-MM-DD'));
    setFilterInput(dayjs().format('DD/MM/YYYY'));
    setFilterError('');
  };

  const shiftDay = (days: number) => {
    const next = dayjs(filterDate).add(days, 'day');
    setFilterDate(next.format('YYYY-MM-DD'));
    setFilterInput(next.format('DD/MM/YYYY'));
    setFilterError('');
  };

  // ── Helpers fecha mes ──
  const shiftMonth = (months: number) => {
    setFilterMonth(dayjs(filterMonth).add(months, 'month').format('YYYY-MM'));
  };

  const isCurrentMonth = filterMonth === dayjs().format('YYYY-MM');
  const monthLabel = dayjs(filterMonth).format('MMMM YYYY');
  const monthStart = dayjs(filterMonth).startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs(filterMonth).endOf('month').format('YYYY-MM-DD');

  // ── Cálculos vista DÍA ──
  const isInDay = (r: Reservation) => {
    const start = dayjs(r.start_date);
    const end = dayjs(r.end_date).endOf('day');
    const date = dayjs(filterDate);
    return (
      date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
    );
  };

  const activeReservationsDay = reservations.filter(
    (r) => r.payment_status === 'paid' && isInDay(r),
  );
  const pendingReservationsDay = reservations.filter(
    (r) =>
      (r.payment_status === 'pending' || r.payment_status === 'unpaid') &&
      isInDay(r),
  );
  const activeMaintenanceDay = maintenanceBlocks.filter((m) => {
    const start = dayjs(m.starts_on);
    const end = dayjs(m.ends_on).endOf('day');
    const date = dayjs(filterDate);
    return (
      date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
    );
  });

  const checkInsDay = reservations.filter(
    (r) => r.start_date === filterDate && r.payment_status === 'paid',
  );
  const checkOutsDay = reservations.filter(
    (r) => r.end_date === filterDate && r.payment_status === 'paid',
  );

  const dailyRevenue = activeReservationsDay.reduce(
    (sum, r) => sum + (r.total_amount_cents ?? 0),
    0,
  );

  // ── Cálculos vista MES ──
  const isInMonth = (r: Reservation) => {
    const rStart = dayjs(r.start_date);
    const rEnd = dayjs(r.end_date);
    const mStart = dayjs(monthStart);
    const mEnd = dayjs(monthEnd);
    // Se solapa con el mes si empieza antes del fin del mes Y termina después del inicio
    return (
      rStart.isBefore(mEnd.add(1, 'day')) &&
      rEnd.isAfter(mStart.subtract(1, 'day'))
    );
  };

  const activeReservationsMonth = reservations.filter(
    (r) => r.payment_status === 'paid' && isInMonth(r),
  );
  const pendingReservationsMonth = reservations.filter(
    (r) =>
      (r.payment_status === 'pending' || r.payment_status === 'unpaid') &&
      isInMonth(r),
  );
  const checkInsMonth = reservations.filter(
    (r) =>
      r.payment_status === 'paid' &&
      dayjs(r.start_date).format('YYYY-MM') === filterMonth,
  );
  const checkOutsMonth = reservations.filter(
    (r) =>
      r.payment_status === 'paid' &&
      dayjs(r.end_date).format('YYYY-MM') === filterMonth,
  );

  const monthlyRevenue = activeReservationsMonth.reduce(
    (sum, r) => sum + (r.total_amount_cents ?? 0),
    0,
  );

  // Grid de plazas: siempre usa el día de hoy
  const today = dayjs().format('YYYY-MM-DD');
  const isInToday = (r: Reservation) => {
    const start = dayjs(r.start_date);
    const end = dayjs(r.end_date).endOf('day');
    const date = dayjs(today);
    return (
      date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
    );
  };
  const activeReservationsToday = reservations.filter(
    (r) => r.payment_status === 'paid' && isInToday(r),
  );
  const activeMaintenanceToday = maintenanceBlocks.filter((m) => {
    const start = dayjs(m.starts_on);
    const end = dayjs(m.ends_on).endOf('day');
    const date = dayjs(today);
    return (
      date.isAfter(start.subtract(1, 'day')) && date.isBefore(end.add(1, 'day'))
    );
  });

  // ── Datos según modo activo ──
  const activeReservations =
    viewMode === 'day' ? activeReservationsDay : activeReservationsMonth;
  const pendingReservations =
    viewMode === 'day' ? pendingReservationsDay : pendingReservationsMonth;
  const activeMaintenance = viewMode === 'day' ? activeMaintenanceDay : [];
  const checkIns = viewMode === 'day' ? checkInsDay : checkInsMonth;
  const checkOuts = viewMode === 'day' ? checkOutsDay : checkOutsMonth;
  const revenue = viewMode === 'day' ? dailyRevenue : monthlyRevenue;

  const totalPlaces = places.length;
  const activePlaces = places.filter((p) => p.is_active).length;
  const occupiedCount = activeReservations.length;
  const maintenanceCount = viewMode === 'day' ? activeMaintenanceDay.length : 0;
  const freeCount = Math.max(
    0,
    activePlaces - occupiedCount - maintenanceCount,
  );
  const occupancyPct =
    activePlaces > 0 ? Math.round((occupiedCount / activePlaces) * 100) : 0;

  const isToday = filterDate === dayjs().format('YYYY-MM-DD');

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Dashboard</Text>

        {/* Toggle vista */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setViewMode('day')}
            style={[
              styles.toggleBtn,
              viewMode === 'day' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === 'day' && styles.toggleTextActive,
              ]}
            >
              Por día
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('month')}
            style={[
              styles.toggleBtn,
              viewMode === 'month' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                viewMode === 'month' && styles.toggleTextActive,
              ]}
            >
              Por mes
            </Text>
          </Pressable>
        </View>

        {/* Selector de fecha - DÍA */}
        {viewMode === 'day' && (
          <View style={styles.dateCard}>
            <Text style={styles.dateLabel}>Fecha de consulta</Text>
            <View style={styles.dateRow}>
              <Pressable onPress={() => shiftDay(-1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <TextInput
                value={filterInput}
                onChangeText={handleFilterInput}
                style={styles.dateInput}
                placeholder="DD/MM/YYYY"
                keyboardType="numeric"
                maxLength={10}
              />
              <Pressable onPress={() => shiftDay(1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>
            {filterError ? (
              <Text style={styles.dateError}>{filterError}</Text>
            ) : null}
            {!isToday && (
              <Pressable onPress={setToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Volver a hoy</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Selector de fecha - MES */}
        {viewMode === 'month' && (
          <View style={styles.dateCard}>
            <Text style={styles.dateLabel}>Mes de consulta</Text>
            <View style={styles.dateRow}>
              <Pressable onPress={() => shiftMonth(-1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <View style={styles.monthLabel}>
                <Text style={styles.monthLabelText}>{monthLabel}</Text>
              </View>
              <Pressable onPress={() => shiftMonth(1)} style={styles.arrowBtn}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>
            {!isCurrentMonth && (
              <Pressable
                onPress={() => setFilterMonth(dayjs().format('YYYY-MM'))}
                style={styles.todayBtn}
              >
                <Text style={styles.todayBtnText}>Volver al mes actual</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderLeftColor: '#f44336' }]}>
            <Text style={styles.kpiValue}>{occupiedCount}</Text>
            <Text style={styles.kpiLabel}>
              {viewMode === 'day' ? 'Ocupadas' : 'Reservas activas'}
            </Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#4CAF50' }]}>
            <Text style={styles.kpiValue}>{freeCount}</Text>
            <Text style={styles.kpiLabel}>Libres hoy</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#FF9800' }]}>
            <Text style={styles.kpiValue}>{maintenanceCount}</Text>
            <Text style={styles.kpiLabel}>Mantenimiento</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#9C27B0' }]}>
            <Text style={styles.kpiValue}>{occupancyPct}%</Text>
            <Text style={styles.kpiLabel}>Ocupación</Text>
          </View>
        </View>

        {/* Barra de ocupación */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {viewMode === 'day' ? 'Ocupación del parking' : 'Reservas del mes'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {viewMode === 'day'
              ? `${occupiedCount} de ${activePlaces} plazas activas`
              : `${occupiedCount} reservas pagadas en ${monthLabel}`}
          </Text>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${occupancyPct}%` as any,
                  backgroundColor:
                    occupancyPct > 80
                      ? '#f44336'
                      : occupancyPct > 50
                        ? '#FF9800'
                        : '#4CAF50',
                },
              ]}
            />
          </View>
          <View style={styles.progressLegend}>
            <Text style={styles.legendItem}>🟢 Libres: {freeCount}</Text>
            <Text style={styles.legendItem}>🔴 Ocupadas: {occupiedCount}</Text>
            {maintenanceCount > 0 && (
              <Text style={styles.legendItem}>
                🟠 Mantenimiento: {maintenanceCount}
              </Text>
            )}
            {totalPlaces - activePlaces > 0 && (
              <Text style={styles.legendItem}>
                ⚫ Inactivas: {totalPlaces - activePlaces}
              </Text>
            )}
          </View>
        </View>

        {/* Ingresos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {viewMode === 'day'
              ? '💰 Ingresos del período'
              : '💰 Ingresos del mes'}
          </Text>
          <Text style={styles.revenueText}>{formatEuro(revenue)}</Text>
          <Text style={styles.cardSubtitle}>
            {viewMode === 'day'
              ? 'Total de reservas pagadas activas en esta fecha'
              : `Total de reservas pagadas en ${monthLabel}`}
          </Text>
        </View>

        {/* Entradas y salidas */}
        <View style={styles.rowCards}>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardTitle}>📥 Entradas</Text>
            <Text style={styles.bigNumber}>{checkIns.length}</Text>
            <Text style={styles.cardSubtitle}>
              {viewMode === 'day' ? 'hoy' : `en ${monthLabel}`}
            </Text>
          </View>
          <View style={[styles.card, styles.halfCard]}>
            <Text style={styles.cardTitle}>📤 Salidas</Text>
            <Text style={styles.bigNumber}>{checkOuts.length}</Text>
            <Text style={styles.cardSubtitle}>
              {viewMode === 'day' ? 'hoy' : `en ${monthLabel}`}
            </Text>
          </View>
        </View>

        {/* Reservas activas */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            ✅ Reservas {viewMode === 'day' ? 'activas' : 'del mes'} (
            {activeReservations.length})
          </Text>
          {activeReservations.length === 0 ? (
            <Text style={styles.emptyText}>
              {viewMode === 'day'
                ? 'No hay reservas pagadas para esta fecha.'
                : `No hay reservas pagadas en ${monthLabel}.`}
            </Text>
          ) : (
            activeReservations.map((r) => (
              <View key={r.id} style={styles.reservationRow}>
                <View style={styles.reservationInfo}>
                  <Text style={styles.reservationName}>
                    {r.full_name ?? 'Sin nombre'} — #{r.id}
                  </Text>
                  <Text style={styles.reservationDates}>
                    {formatDate(r.start_date)} → {formatDate(r.end_date)}
                  </Text>
                  {r.place_id && (
                    <Text style={styles.reservationPlace}>
                      Plaza {r.place_id}
                    </Text>
                  )}
                </View>
                <Text style={styles.reservationAmount}>
                  {formatEuro(r.total_amount_cents)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Pendientes */}
        {pendingReservations.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              ⏳ Pendientes de pago ({pendingReservations.length})
            </Text>
            {pendingReservations.map((r) => (
              <View key={r.id} style={styles.reservationRow}>
                <View style={styles.reservationInfo}>
                  <Text style={styles.reservationName}>
                    {r.full_name ?? 'Sin nombre'} — #{r.id}
                  </Text>
                  <Text style={styles.reservationDates}>
                    {formatDate(r.start_date)} → {formatDate(r.end_date)}
                  </Text>
                </View>
                <View style={[styles.badge, styles.badgePending]}>
                  <Text style={styles.badgeText}>{r.payment_status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Mantenimientos — solo en vista día */}
        {viewMode === 'day' && activeMaintenance.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              🔧 Mantenimiento ({activeMaintenance.length})
            </Text>
            {activeMaintenance.map((m) => (
              <View key={m.id} style={styles.reservationRow}>
                <View style={styles.reservationInfo}>
                  <Text style={styles.reservationName}>Plaza {m.place_id}</Text>
                  <Text style={styles.reservationDates}>
                    {formatDate(m.starts_on)} → {formatDate(m.ends_on)}
                  </Text>
                  {m.reason && (
                    <Text style={styles.cardSubtitle}>{m.reason}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Grid plazas — siempre muestra estado de HOY */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            🅿️ Estado de plazas hoy ({totalPlaces})
          </Text>
          {viewMode === 'month' && (
            <Text style={styles.cardSubtitle}>Ocupación a día de hoy</Text>
          )}
          <View style={styles.placesGrid}>
            {places.map((place) => {
              const isOccupied = activeReservationsToday.some(
                (r) => r.place_id === place.id,
              );
              const isMaintenance = activeMaintenanceToday.some(
                (m) => m.place_id === place.id,
              );
              const isInactive = !place.is_active;

              let bg = '#4CAF50';
              if (isInactive) bg = '#999';
              else if (isMaintenance) bg = '#FF9800';
              else if (isOccupied) bg = '#f44336';

              return (
                <View
                  key={place.id}
                  style={[styles.placeCell, { backgroundColor: bg }]}
                >
                  <Text style={styles.placeCellText}>{place.id}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.placeLegend}>
            <Text style={styles.legendItem}>🟢 Libre</Text>
            <Text style={styles.legendItem}>🔴 Ocupada</Text>
            <Text style={styles.legendItem}>🟠 Mantenimiento</Text>
            <Text style={styles.legendItem}>⚫ Inactiva</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#007AFF' },

  dateCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
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
    fontSize: 18,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: '#F7F8FB',
  },
  monthLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: '#F7F8FB',
  },
  monthLabelText: {
    fontSize: 18,
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
  kpiLabel: { fontSize: 13, color: '#666', marginTop: 2 },

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
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  cardSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  emptyText: { fontSize: 14, color: '#aaa', marginTop: 4 },

  rowCards: { flexDirection: 'row', gap: 12 },
  halfCard: { flex: 1, marginBottom: 14 },
  bigNumber: { fontSize: 36, fontWeight: '800', color: '#111', marginTop: 4 },
  revenueText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#4CAF50',
    marginTop: 4,
  },

  progressBg: {
    height: 16,
    backgroundColor: '#eee',
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  progressLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  legendItem: { fontSize: 13, color: '#555' },

  reservationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  reservationInfo: { flex: 1, paddingRight: 10 },
  reservationName: { fontSize: 14, fontWeight: '700', color: '#111' },
  reservationDates: { fontSize: 13, color: '#666', marginTop: 2 },
  reservationPlace: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
    fontWeight: '600',
  },
  reservationAmount: { fontSize: 14, fontWeight: '800', color: '#333' },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgePending: { backgroundColor: '#fff3cd' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },

  placesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  placeCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCellText: { color: 'white', fontWeight: '800', fontSize: 13 },
  placeLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
});
