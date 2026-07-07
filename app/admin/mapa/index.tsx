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
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { AppAlert } from '../../../components/AppAlert';
import ParkingMapPicker from '../../../components/ParkingMapPicker';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

dayjs.extend(isoWeek);

// ─── Types ─────────────────
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

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterInput, setFilterInput] = useState(dayjs().format('DD/MM/YYYY'));
  const [filterError, setFilterError] = useState('');
  const [filterWeek, setFilterWeek] = useState(
    dayjs().startOf('isoWeek').format('YYYY-MM-DD'),
  );
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

  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState<PlaceStatus>('free');
  const [blockFrom, setBlockFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [blockTo, setBlockTo] = useState(
    dayjs().add(7, 'day').format('YYYY-MM-DD'),
  );
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const [placesRes, reservationsRes, maintenanceRes] = await Promise.all([
      supabase.from('places').select('*').order('id'),
      supabase
        .from('reservations')
        .select(
          'id,place_ids,num_places,start_date,end_date,payment_status,full_name,total_amount_cents',
        )
        .eq('payment_status', 'paid'),
      supabase.from('maintenance_blocks').select('*'),
    ]);

    setPlaces(placesRes.data ?? []);
    setReservations((reservationsRes.data ?? []) as Reservation[]);
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
      return !s.isAfter(periodEnd) && !e.isBefore(periodStart);
    });
  }, [maintenanceBlocks, periodStart, periodEnd]);

  const reservationsInPeriod = useMemo(() => {
    return reservations.filter((r) => {
      const s = dayjs(r.start_date);
      const e = dayjs(r.end_date).endOf('day');
      return !s.isAfter(periodEnd) && !e.isBefore(periodStart);
    });
  }, [reservations, periodStart, periodEnd]);

  const getPlaceStatus = useCallback(
    (placeId: number): PlaceStatus => {
      const block = blocksInPeriod.find((b) => b.place_id === placeId);
      if (block)
        return block.block_type === 'occupied' ? 'occupied' : 'maintenance';

      const isOccupied = reservationsInPeriod.some((r) =>
        (r.place_ids ?? []).includes(placeId),
      );

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

  const occupiedForMap = new Set(
    places.filter((p) => getPlaceStatus(p.id) === 'occupied').map((p) => p.id),
  );
  const maintenanceForMap = new Set(
    places
      .filter((p) => getPlaceStatus(p.id) === 'maintenance')
      .map((p) => p.id),
  );

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
          AppAlert.alert(
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
            const inThisPlace = (r.place_ids ?? []).includes(selectedPlace);
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
                .update({ place_ids: [newPlace] })
                .eq('id', r.id);
              reasigned++;
            }
          }

          if (reasigned > 0) {
            AppAlert.alert(
              'Plaza en mantenimiento',
              `${reasigned} reserva(s) reasignada(s) automáticamente.`,
            );
          }
        }
      }

      setModalVisible(false);
      await load();
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
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
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
              <Pressable onPress={() => setShowDatePicker(true)} style={styles.periodLabelBox}>
                <Text style={styles.periodLabelText}>{filterInput}</Text>
              </Pressable>
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

        {/* Leyenda / resumen */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBadge, { backgroundColor: colors.confirmedBg }]}>
            <Text style={[styles.summaryNum, { color: colors.confirmedText }]}>{freeCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.confirmedText }]}>Libres</Text>
          </View>
          <View style={[styles.summaryBadge, { backgroundColor: colors.cancelledBg }]}>
            <Text style={[styles.summaryNum, { color: colors.cancelledText }]}>{occupiedCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.cancelledText }]}>Ocupadas</Text>
          </View>
          {maintCount > 0 && (
            <View style={[styles.summaryBadge, { backgroundColor: colors.warningContainer }]}>
              <Text style={[styles.summaryNum, { color: colors.warningText }]}>{maintCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.warningText }]}>Mant.</Text>
            </View>
          )}
          <View style={[styles.summaryBadge, { backgroundColor: colors.modifiedBg }]}>
            <Text style={[styles.summaryNum, { color: colors.modifiedText }]}>
              {totalPlaces > 0
                ? `${Math.round((occupiedCount / totalPlaces) * 100)}%`
                : '0%'}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.modifiedText }]}>Ocupación</Text>
          </View>
        </View>

        {/* Mapa de plazas */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Estado de plazas — {periodLabel()}
          </Text>
          <Text style={styles.cardSubtitle}>
            Toca una plaza para cambiar su estado
          </Text>
          <ParkingMapPicker
            places={places}
            occupiedIds={occupiedForMap}
            maintenanceIds={maintenanceForMap}
            selectedIds={[]}
            onToggle={openPlaceModal}
            blockOccupied={false}
          />
        </View>

        {/* Lista reservas del período */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Reservas del período ({reservasList.length})
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
                  : '—';
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/admin/places/${r.id}`)}
                  style={({ pressed }) => [
                    styles.reservationRow,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48 },
  pageTitle: { ...typography.headlineLg, marginBottom: 16 },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    padding: 4,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.surfaceContainerLow,
    ...shadow.sm,
  },
  toggleText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  toggleTextActive: { color: colors.secondary },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: 14,
    ...shadow.sm,
  },
  cardTitle: { ...typography.titleMd, marginBottom: 4 },
  cardSubtitle: { ...typography.bodyMd, marginBottom: 10 },
  emptyText: { ...typography.bodyMd, marginTop: 4 },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 22, color: colors.secondary, fontFamily: 'PlusJakartaSans_700Bold' },
  dateInput: {
    flex: 1,
    textAlign: 'center',
    ...typography.titleMd,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: colors.inputSurface,
  },
  periodLabelBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    backgroundColor: colors.inputSurface,
  },
  periodLabelText: { ...typography.titleMd },
  dateError: { color: colors.error, fontSize: 12, marginTop: 6 },
  pickerBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  pickerCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: 34,
    paddingTop: 8,
  },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.outline, alignSelf: 'center', marginBottom: 8 },
  todayBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
  },
  todayBtnText: { color: colors.secondary, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryBadge: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryNum: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
  },
  summaryLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },

  reservationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingHorizontal: 4,
  },
  reservationName: { ...typography.titleSm },
  reservationDates: { ...typography.bodyMd, marginTop: 2 },
  reservationPlaza: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold',
  },
  reservationAmount: { ...typography.titleSm },
  chevron: { fontSize: 20, color: colors.onSurfaceVariant, fontFamily: 'PlusJakartaSans_700Bold' },

  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  modalBox: {
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    padding: spacing['2xl'],
    width: '100%',
    maxWidth: 380,
    ...shadow.md,
  },
  modalTitle: { ...typography.headlineMd, marginBottom: 6 },
  modalCurrentBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  modalCurrentText: { ...typography.labelLg },
  modalSectionLabel: { ...typography.labelMd, marginBottom: 8 },

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
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  radioLabel: { ...typography.bodyLg },

  blockFields: { marginTop: 14 },
  blockDatesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  blockDatesSep: { ...typography.titleMd, color: colors.onSurfaceVariant, paddingBottom: 10 },
  fieldLabel: { ...typography.labelMd, marginBottom: 4 },
  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  reasignHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.warning,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 18,
  },
  datePickerBtn: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 10 }),
    alignItems: 'center',
  },
  datePickerText: { ...typography.titleSm },

  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancel: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
  },
  btnCancelText: { ...typography.titleSm },
  btnSave: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  btnSaveText: { ...typography.titleSm, color: colors.onPrimary },
});
