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
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

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

type PlaceStatus = 'free' | 'partial' | 'occupied' | 'maintenance';
type ViewMode = 'day' | 'week';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminMapaPlazas() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [maintenanceBlocks, setMaintenanceBlocks] = useState<
    MaintenanceBlock[]
  >([]);

  // Selector fecha — solo día o semana
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');
  const [filterWeek, setFilterWeek] = useState(
    dayjs().startOf('isoWeek').format('YYYY-MM-DD'),
  );

  // Modal gestión plaza
  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<PlaceStatus>('free');
  // Fechas como YYYY-MM-DD internamente
  const [blockFrom, setBlockFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [blockTo, setBlockTo] = useState(
    dayjs().add(7, 'day').format('YYYY-MM-DD'),
  );
  // Android: mostrar picker uno a la vez
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, maintenanceRes, ownersRes] =
      await Promise.all([
        supabase.from('places').select('*').order('id'),
        supabase
          .from('reservations')
          .select(
            'id,place_id,place_ids,num_places,start_date,end_date,payment_status,full_name,total_amount_cents,user_id',
          )
          .eq('payment_status', 'paid'),
        supabase.from('maintenance_blocks').select('*'),
        supabase.from('owners').select('user_id'),
      ]);

    const ownerIds = new Set((ownersRes.data ?? []).map((o: any) => o.user_id));
    const allReservations = (
      (reservationsRes.data ?? []) as Reservation[]
    ).filter((r) => !ownerIds.has(r.user_id));

    setPlaces(placesRes.data ?? []);
    setReservations(allReservations);
    setMaintenanceBlocks((maintenanceRes.data ?? []) as MaintenanceBlock[]);
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

  const periodStart = viewMode === 'day' ? dayjs(filterDate) : weekStart;
  const periodEnd =
    viewMode === 'day' ? dayjs(filterDate).endOf('day') : weekEnd;

  const shift = (n: number) => {
    if (viewMode === 'day') {
      const next = dayjs(filterDate).add(n, 'day');
      setFilterDate(next.format('YYYY-MM-DD'));
      setFilterInput(next.format('DD/MM/YYYY'));
      setFilterError('');
    } else {
      setFilterWeek(
        dayjs(filterWeek)
          .add(n, 'week')
          .startOf('isoWeek')
          .format('YYYY-MM-DD'),
      );
    }
  };

  const handleFilterInput = (text: string) => {
    setFilterInput(text);
    setFilterError('');
    const parsed = dayjs(text, 'DD/MM/YYYY', true);
    if (parsed.isValid()) setFilterDate(parsed.format('YYYY-MM-DD'));
    else if (text.length === 10)
      setFilterError('Formato inválido. Usa DD/MM/YYYY');
  };

  const isToday = () => {
    if (viewMode === 'day') return filterDate === dayjs().format('YYYY-MM-DD');
    return filterWeek === dayjs().startOf('isoWeek').format('YYYY-MM-DD');
  };

  const goToToday = () => {
    setFilterDate(dayjs().format('YYYY-MM-DD'));
    setFilterInput(dayjs().format('DD/MM/YYYY'));
    setFilterWeek(dayjs().startOf('isoWeek').format('YYYY-MM-DD'));
    setFilterError('');
  };

  const periodLabel = () => {
    if (viewMode === 'day') return filterInput;
    return `${weekStart.format('DD/MM')} — ${weekEnd.format('DD/MM/YYYY')}`;
  };

  // ── Estado plazas según período elegido ────────────────────────────────────
  const blocksInPeriod = useMemo(() => {
    return maintenanceBlocks.filter((b) => {
      const s = dayjs(b.starts_on);
      const e = dayjs(b.ends_on).endOf('day');
      return (
        s.isBefore(periodEnd.add(1, 'day')) &&
        e.isAfter(periodStart.subtract(1, 'day'))
      );
    });
  }, [maintenanceBlocks, periodStart, periodEnd]);

  const reservationsInPeriod = useMemo(() => {
    return reservations.filter((r) => {
      const s = dayjs(r.start_date);
      const e = dayjs(r.end_date).endOf('day');
      return (
        s.isBefore(periodEnd.add(1, 'day')) &&
        e.isAfter(periodStart.subtract(1, 'day'))
      );
    });
  }, [reservations, periodStart, periodEnd]);

  // ✅ Usa place_ids array con fallback a place_id legacy
  const getPlaceStatus = useCallback(
    (placeId: number): PlaceStatus => {
      const block = blocksInPeriod.find((b) => b.place_id === placeId);
      if (block)
        return block.block_type === 'occupied' ? 'occupied' : 'maintenance';

      const isOccupied = reservationsInPeriod.some((r) => {
        const ids = r.place_ids ?? [];
        if (ids.length > 0) return ids.includes(placeId);
        return r.place_id === placeId;
      });

      return isOccupied ? 'occupied' : 'free';
    },
    [blocksInPeriod, reservationsInPeriod],
  );

  // ── Contadores ─────────────────────────────────────────────────────────────
  const totalPlaces = places.length;
  const occupiedCount = useMemo(
    () => places.filter((p) => getPlaceStatus(p.id) === 'occupied').length,
    [places, getPlaceStatus],
  );
  const maintCount = useMemo(
    () => places.filter((p) => getPlaceStatus(p.id) === 'maintenance').length,
    [places, getPlaceStatus],
  );
  const freeCount = totalPlaces - occupiedCount - maintCount;

  // ── Reservas del período (para lista) ─────────────────────────────────────
  // solo las que NO son de mantenimiento (reservas reales)
  const reservasList = useMemo(
    () =>
      reservationsInPeriod
        .slice()
        .sort(
          (a, b) =>
            dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf(),
        ),
    [reservationsInPeriod],
  );

  // ── Modal ──────────────────────────────────────────────────────────────────
  const openPlaceModal = (placeId: number) => {
    setSelectedPlace(placeId);
    setNewStatus(getPlaceStatus(placeId));
    setBlockFrom(dayjs().format('YYYY-MM-DD'));
    setBlockTo(dayjs().add(7, 'day').format('YYYY-MM-DD'));
    setShowFromPicker(false);
    setShowToPicker(false);
    setBlockReason('');
    setModalVisible(true);
  };

  const handleSavePlaceStatus = async () => {
    if (!selectedPlace) return;
    setSaving(true);

    try {
      if (newStatus === 'free') {
        // Eliminar bloques activos en el período para esta plaza
        const activeBlocks = blocksInPeriod.filter(
          (b) => b.place_id === selectedPlace,
        );
        for (const b of activeBlocks) {
          await supabase.from('maintenance_blocks').delete().eq('id', b.id);
        }
      } else if (newStatus === 'maintenance' || newStatus === 'occupied') {
        const from = dayjs(blockFrom, 'YYYY-MM-DD', true);
        const to = dayjs(blockTo, 'YYYY-MM-DD', true);

        if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
          Alert.alert(
            'Fechas inválidas',
            'La fecha de fin debe ser posterior al inicio.',
          );
          setSaving(false);
          return;
        }

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

        if (newStatus === 'maintenance') {
          const futureRes = reservations.filter((r) => {
            const inThisPlace =
              (r.place_ids ?? []).includes(selectedPlace) ||
              r.place_id === selectedPlace;
            return inThisPlace && dayjs(r.end_date).isAfter(dayjs());
          });

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
                .update({ place_id: newPlace, place_ids: [newPlace] })
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

  const selectedPlaceStatus = selectedPlace
    ? getPlaceStatus(selectedPlace)
    : 'free';
  const needsBlockFields =
    newStatus === 'maintenance' || newStatus === 'occupied';

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>Mapa de plazas</Text>

        {/* Toggle Día / Semana */}
        <View style={styles.toggleRow}>
          {(['day', 'week'] as ViewMode[]).map((m) => (
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
                {m === 'day' ? 'Día' : 'Semana'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Selector fecha */}
        <View style={styles.card}>
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
          {!isToday() && (
            <Pressable onPress={goToToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Volver a hoy</Text>
            </Pressable>
          )}
        </View>

        {/* Leyenda / resumen */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBadge, { backgroundColor: '#4CAF50' }]}>
            <Text style={styles.summaryNum}>{freeCount}</Text>
            <Text style={styles.summaryLabel}>Libres</Text>
          </View>
          <View style={[styles.summaryBadge, { backgroundColor: '#f44336' }]}>
            <Text style={styles.summaryNum}>{occupiedCount}</Text>
            <Text style={styles.summaryLabel}>Ocupadas</Text>
          </View>
          {maintCount > 0 && (
            <View style={[styles.summaryBadge, { backgroundColor: '#FF9800' }]}>
              <Text style={styles.summaryNum}>{maintCount}</Text>
              <Text style={styles.summaryLabel}>Mant.</Text>
            </View>
          )}
          <View style={[styles.summaryBadge, { backgroundColor: '#9C27B0' }]}>
            <Text style={styles.summaryNum}>
              {totalPlaces > 0
                ? `${Math.round((occupiedCount / totalPlaces) * 100)}%`
                : '0%'}
            </Text>
            <Text style={styles.summaryLabel}>Ocupación</Text>
          </View>
        </View>

        {/* Grid plazas */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            🅿️ Estado de plazas — {periodLabel()}
          </Text>
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
                    : status === 'partial'
                      ? '#FFC107'
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
            <Text style={styles.legendItem}>🟡 Parcial</Text>
            <Text style={styles.legendItem}>🔴 Ocupada</Text>
            <Text style={styles.legendItem}>🟠 Mantenimiento</Text>
          </View>
        </View>

        {/* Lista reservas del período */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            📋 Reservas del período ({reservasList.length})
          </Text>
          {reservasList.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay reservas en este período.
            </Text>
          ) : (
            reservasList.map((r) => {
              const plazas =
                (r.place_ids ?? []).length > 0
                  ? (r.place_ids ?? []).map((id) => `#${id}`).join(', ')
                  : r.place_id
                    ? `#${r.place_id}`
                    : '—';
              return (
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
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </Text>
                    <Text style={styles.reservationPlaza}>
                      Plaza(s): {plazas}
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
              );
            })
          )}
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

            {needsBlockFields && (
              <View style={styles.blockFields}>
                <Text style={styles.modalSectionLabel}>
                  Período del bloqueo
                </Text>
                <View style={styles.blockDatesRow}>
                  {/* ── Desde ── */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Desde</Text>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={dayjs(blockFrom).toDate()}
                        mode="date"
                        display="compact"
                        onChange={(_: DateTimePickerEvent, date?: Date) => {
                          if (date)
                            setBlockFrom(dayjs(date).format('YYYY-MM-DD'));
                        }}
                        style={{ alignSelf: 'flex-start' }}
                      />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => setShowFromPicker(true)}
                          style={styles.datePickerBtn}
                        >
                          <Text style={styles.datePickerText}>
                            {dayjs(blockFrom).format('DD/MM/YYYY')}
                          </Text>
                        </Pressable>
                        {showFromPicker && (
                          <DateTimePicker
                            value={dayjs(blockFrom).toDate()}
                            mode="date"
                            display="default"
                            onChange={(_: DateTimePickerEvent, date?: Date) => {
                              setShowFromPicker(false);
                              if (date)
                                setBlockFrom(dayjs(date).format('YYYY-MM-DD'));
                            }}
                          />
                        )}
                      </>
                    )}
                  </View>

                  <Text style={styles.blockDatesSep}>→</Text>

                  {/* ── Hasta ── */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Hasta</Text>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={dayjs(blockTo).toDate()}
                        mode="date"
                        display="compact"
                        minimumDate={dayjs(blockFrom).toDate()}
                        onChange={(_: DateTimePickerEvent, date?: Date) => {
                          if (date)
                            setBlockTo(dayjs(date).format('YYYY-MM-DD'));
                        }}
                        style={{ alignSelf: 'flex-start' }}
                      />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => setShowToPicker(true)}
                          style={styles.datePickerBtn}
                        >
                          <Text style={styles.datePickerText}>
                            {dayjs(blockTo).format('DD/MM/YYYY')}
                          </Text>
                        </Pressable>
                        {showToPicker && (
                          <DateTimePicker
                            value={dayjs(blockTo).toDate()}
                            mode="date"
                            display="default"
                            minimumDate={dayjs(blockFrom).toDate()}
                            onChange={(_: DateTimePickerEvent, date?: Date) => {
                              setShowToPicker(false);
                              if (date)
                                setBlockTo(dayjs(date).format('YYYY-MM-DD'));
                            }}
                          />
                        )}
                      </>
                    )}
                  </View>
                </View>
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
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#888', marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#aaa', marginTop: 4 },

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

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryBadge: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryNum: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

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
  placeCellInner: {
    flex: 1,
    width: '100%',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCellText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 13,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { fontSize: 13, color: '#555' },

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
  reservationPlaza: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
    fontWeight: '600',
  },
  reservationAmount: { fontSize: 14, fontWeight: '800', color: '#333' },
  chevron: { fontSize: 20, color: '#ccc', fontWeight: '700' },

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
    paddingVertical: Platform.select({ ios: 10, android: 10 }),
    alignItems: 'center',
  },
  datePickerText: {
    fontSize: 14,
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
