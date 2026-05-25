import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { Vehicle, vehicleDisplayName } from '@/components/utils/vehicle';
import { isModifiable } from '@/components/utils/reservationModification';
import { nightsBetween, normalizeBirthDate, isoBirthToDisplay } from '@/components/utils/dates';
import { formatCents } from '@/components/utils/money';

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  pricing_type: 'per_night' | 'per_stay' | string;
};

type VehicleSnapshot = {
  place_index: number;
  vehicle_id: number | null;
  brand: string;
  model: string;
  plate: string;
  alias: string | null;
  length_m: number | null;
};

type Reservation = {
  id: number;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  num_places: number;
  nightly_amount_cents: number;
  total_amount_cents: number;
  vehicle_id: number | null;
  vehicles_snapshot: VehicleSnapshot[] | null;
};

type GuestDraft = {
  full_name: string;
  doc_type: 'dni' | 'nie' | 'passport';
  doc_number: string;
  doc_support_number: string;
  nationality: string;
  birth_date: string;
  gender: 'm' | 'f' | 'other' | '';
  country_of_residence: string;
  city_of_residence: string;
  phone: string;
  email: string;
};

type SnapshotVehicleDraft = {
  brand: string;
  model: string;
  plate: string;
  alias: string;
};

type NewVehicleForm = { brand: string; model: string; plate: string; alias: string };

type PlaceEditState = {
  vehicleId: number | null;
  snapshotVehicle: SnapshotVehicleDraft;
  numGuests: number;
  numPets: number;
  electricidad: boolean;
  guests: GuestDraft[];
};

function emptyGuest(): GuestDraft {
  return {
    full_name: '', doc_type: 'dni', doc_number: '', doc_support_number: '',
    nationality: '', birth_date: '', gender: '', country_of_residence: '',
    city_of_residence: '', phone: '', email: '',
  };
}

export default function EditReservationScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [endDate, setEndDate] = useState('');
  const [placeStates, setPlaceStates] = useState<PlaceEditState[]>([]);
  const [activePlaza, setActivePlaza] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [newVehicleForm, setNewVehicleForm] = useState<NewVehicleForm>({ brand: '', model: '', plate: '', alias: '' });
  const [savingVehicle, setSavingVehicle] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!reservationId || !session?.user?.id) return;
    const load = async () => {
      setLoading(true);
      const uid = session.user.id;
      const rid = Number(reservationId);

      const [resRes, extrasRes, extLinesRes, travelersRes, vehiclesRes] = await Promise.all([
        supabase.from('reservations')
          .select('id,user_id,start_date,end_date,status,num_places,nightly_amount_cents,total_amount_cents,vehicle_id,vehicles_snapshot')
          .eq('id', rid).eq('user_id', uid).maybeSingle(),
        supabase.from('extras')
          .select('id,code,name_es,unit_amount_cents,pricing_type')
          .eq('is_active', true),
        supabase.from('reservation_extras')
          .select('extra_id,quantity,place_index')
          .eq('reservation_id', rid),
        supabase.from('travelers')
          .select('full_name,doc_type,doc_number,doc_support_number,nationality,birth_date,gender,country_of_residence,city_of_residence,phone,email,place_index,is_main_traveler')
          .eq('reservation_id', rid)
          .order('place_index').order('is_main_traveler', { ascending: false }),
        supabase.from('vehicles')
          .select('*').eq('user_id', uid).order('created_at', { ascending: true }),
      ]);

      const r = resRes.data as Reservation | null;
      if (!r) {
        setLoading(false);
        Alert.alert('No encontrada', 'No se pudo cargar la reserva.');
        router.back();
        return;
      }

      const allExtras = (extrasRes.data ?? []) as Extra[];
      const extLines = (extLinesRes.data ?? []) as { extra_id: number; quantity: number; place_index: number | null }[];
      const travelerRows = (travelersRes.data ?? []) as any[];
      const vList = (vehiclesRes.data ?? []) as Vehicle[];

      setReservation(r);
      setEndDate(r.end_date);
      setExtras(allExtras);
      setVehicles(vList);

      const numPlaces = r.num_places ?? 1;
      const snapshot: VehicleSnapshot[] = (r.vehicles_snapshot as VehicleSnapshot[] | null) ?? [];

      const states: PlaceEditState[] = Array.from({ length: numPlaces }, (_, i) => {
        const snap = snapshot.find(s => s.place_index === i);
        const vehicleId = snap?.vehicle_id ?? (i === 0 ? r.vehicle_id : null);

        const placeExtras = extLines.filter(e => (e.place_index ?? 0) === i);
        const numPets = placeExtras.find(e => allExtras.find(x => x.id === e.extra_id)?.code === 'PET')?.quantity ?? 0;
        const hasPower = (placeExtras.find(e => allExtras.find(x => x.id === e.extra_id)?.code === 'POWER')?.quantity ?? 0) > 0;

        const placeTravelers = travelerRows
          .filter(t => (t.place_index ?? 0) === i)
          .map(t => ({
            full_name: t.full_name ?? '',
            doc_type: (t.doc_type ?? 'dni') as 'dni' | 'nie' | 'passport',
            doc_number: t.doc_number ?? '',
            doc_support_number: t.doc_support_number ?? '',
            nationality: t.nationality ?? '',
            birth_date: isoBirthToDisplay(t.birth_date),
            gender: (t.gender ?? '') as 'm' | 'f' | 'other' | '',
            country_of_residence: t.country_of_residence ?? '',
            city_of_residence: t.city_of_residence ?? '',
            phone: t.phone ?? '',
            email: t.email ?? '',
          } as GuestDraft));

        const snapshotVehicle: SnapshotVehicleDraft = {
          brand: snap?.brand ?? '',
          model: snap?.model ?? '',
          plate: snap?.plate ?? '',
          alias: snap?.alias ?? '',
        };

        return {
          vehicleId,
          snapshotVehicle,
          numGuests: placeTravelers.length || 1,
          numPets,
          electricidad: hasPower,
          guests: placeTravelers.length > 0 ? placeTravelers : [emptyGuest()],
        };
      });

      setPlaceStates(states);
      setLoading(false);
    };

    void load();
  }, [reservationId, session?.user?.id, router]);

  const petExtra = extras.find(e => e.code === 'PET') ?? null;
  const powerExtra = extras.find(e => e.code === 'POWER') ?? null;
  const personExtra = extras.find(e => e.code === 'PERSON') ?? null;

  const nights = useMemo(
    () => nightsBetween(reservation?.start_date, endDate),
    [reservation?.start_date, endDate],
  );

  const newTotal = useMemo(() => {
    if (!reservation) return 0;
    return placeStates.reduce((acc, ps) => {
      let total = nights * reservation.nightly_amount_cents;
      if (ps.numPets > 0 && petExtra) {
        total += petExtra.pricing_type === 'per_stay'
          ? ps.numPets * petExtra.unit_amount_cents
          : ps.numPets * nights * petExtra.unit_amount_cents;
      }
      if (ps.electricidad && powerExtra) {
        total += powerExtra.pricing_type === 'per_stay'
          ? powerExtra.unit_amount_cents
          : nights * powerExtra.unit_amount_cents;
      }
      const extraPersons = Math.max(0, ps.numGuests - 2);
      if (extraPersons > 0 && personExtra) {
        total += personExtra.pricing_type === 'per_stay'
          ? extraPersons * personExtra.unit_amount_cents
          : extraPersons * nights * personExtra.unit_amount_cents;
      }
      return acc + total;
    }, 0);
  }, [placeStates, nights, extras, reservation]);

  const delta = reservation ? newTotal - reservation.total_amount_cents : 0;

  const updatePlace = <K extends keyof PlaceEditState>(idx: number, key: K, val: PlaceEditState[K]) =>
    setPlaceStates(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));

  const updateSnapshotVehicle = (plazaIdx: number, key: keyof SnapshotVehicleDraft, val: string) =>
    setPlaceStates(prev => prev.map((s, i) =>
      i !== plazaIdx ? s : { ...s, snapshotVehicle: { ...s.snapshotVehicle, [key]: val } }
    ));

  const saveNewVehicle = async () => {
    const { brand, model, plate, alias } = newVehicleForm;
    if (!brand.trim() || !model.trim() || !plate.trim()) {
      Alert.alert('Faltan campos', 'Marca, modelo y matrícula son obligatorios.');
      return;
    }
    setSavingVehicle(true);
    const { data, error } = await supabase.from('vehicles').insert({
      user_id: session?.user?.id,
      brand: brand.trim(),
      model: model.trim(),
      plate: plate.trim().toUpperCase(),
      alias: alias.trim() || null,
      length_m: null,
    }).select().single();
    setSavingVehicle(false);
    if (error) { Alert.alert('Error', error.message); return; }
    const newV = data as Vehicle;
    setVehicles(prev => [...prev, newV]);
    updatePlace(0, 'vehicleId', newV.id);
    setShowNewVehicleForm(false);
    setNewVehicleForm({ brand: '', model: '', plate: '', alias: '' });
  };

  const updateGuest = (plazaIdx: number, guestIdx: number, key: keyof GuestDraft, val: string) =>
    setPlaceStates(prev => prev.map((s, i) => {
      if (i !== plazaIdx) return s;
      const guests = s.guests.map((g, gi) => gi === guestIdx ? { ...g, [key]: val } : g);
      return { ...s, guests };
    }));

  const changeNumGuests = (plazaIdx: number, d: number) =>
    setPlaceStates(prev => prev.map((s, i) => {
      if (i !== plazaIdx) return s;
      const next = Math.max(1, Math.min(6, s.numGuests + d));
      let guests = [...s.guests];
      if (next > s.numGuests) guests.push(emptyGuest());
      else if (next < s.numGuests) guests = guests.slice(0, next);
      return { ...s, numGuests: next, guests };
    }));

  const buildExtrasPayload = () =>
    placeStates.flatMap((ps, placeIndex) => {
      const rows: any[] = [];
      if (ps.numPets > 0 && petExtra) {
        const lineTotal = petExtra.pricing_type === 'per_stay'
          ? ps.numPets * petExtra.unit_amount_cents
          : ps.numPets * nights * petExtra.unit_amount_cents;
        rows.push({ extra_id: petExtra.id, quantity: ps.numPets, place_index: placeIndex, pricing_type: petExtra.pricing_type, unit_amount_cents: petExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      if (ps.electricidad && powerExtra) {
        const lineTotal = powerExtra.pricing_type === 'per_stay'
          ? powerExtra.unit_amount_cents
          : nights * powerExtra.unit_amount_cents;
        rows.push({ extra_id: powerExtra.id, quantity: 1, place_index: placeIndex, pricing_type: powerExtra.pricing_type, unit_amount_cents: powerExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      const extraPersons = Math.max(0, ps.numGuests - 2);
      if (extraPersons > 0 && personExtra) {
        const lineTotal = personExtra.pricing_type === 'per_stay'
          ? extraPersons * personExtra.unit_amount_cents
          : extraPersons * nights * personExtra.unit_amount_cents;
        rows.push({ extra_id: personExtra.id, quantity: extraPersons, place_index: placeIndex, pricing_type: personExtra.pricing_type, unit_amount_cents: personExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      return rows;
    });

  const buildVehiclesSnapshot = () =>
    placeStates.map((ps, i) => {
      if (i === 0) {
        const v = vehicles.find(vv => vv.id === ps.vehicleId);
        if (v) return { place_index: i, vehicle_id: v.id, brand: v.brand, model: v.model, plate: v.plate, alias: v.alias ?? null, length_m: v.length_m ?? null };
        const existing = (reservation?.vehicles_snapshot as VehicleSnapshot[] | null)?.find(s => s.place_index === i);
        return existing ?? { place_index: i, vehicle_id: null, brand: '', model: '', plate: '', alias: null, length_m: null };
      }
      const sv = ps.snapshotVehicle;
      return {
        place_index: i,
        vehicle_id: null,
        brand: sv.brand.trim(),
        model: sv.model.trim(),
        plate: sv.plate.trim().toUpperCase(),
        alias: sv.alias.trim() || null,
        length_m: null,
      };
    });

  const buildTravelerRows = (resId: number) =>
    placeStates.flatMap((ps, placeIndex) =>
      ps.guests
        .filter(g => g.full_name?.trim())
        .map((g, guestIndex) => ({
          reservation_id: resId,
          full_name: g.full_name,
          doc_type: g.doc_type || null,
          doc_number: g.doc_number || null,
          doc_support_number: g.doc_support_number || null,
          nationality: g.nationality || null,
          birth_date: g.birth_date ? normalizeBirthDate(g.birth_date) : null,
          gender: g.gender || null,
          country_of_residence: g.country_of_residence || null,
          city_of_residence: g.city_of_residence || null,
          phone: g.phone || null,
          email: g.email || null,
          place_index: placeIndex,
          is_main_traveler: placeIndex === 0 && guestIndex === 0,
        }))
    );

  const applyTravelersAndSnapshot = async (resId: number) => {
    const snapshot = buildVehiclesSnapshot();
    const rows = buildTravelerRows(resId);
    await supabase.from('reservations').update({ vehicles_snapshot: snapshot }).eq('id', resId);
    await supabase.from('travelers').delete().eq('reservation_id', resId);
    if (rows.length > 0) await supabase.from('travelers').insert(rows);
  };

  const submit = async () => {
    if (!reservation) return;
    if (nights <= 0) {
      Alert.alert('Fechas inválidas', 'La fecha de salida debe ser posterior a la de entrada.');
      return;
    }

    setSubmitting(true);
    try {
      const flatExtras = buildExtrasPayload();
      const firstVehicleId = placeStates[0]?.vehicleId ?? null;
      const redirectBase = Linking.createURL('/stripe-redirect');

      const body: Record<string, unknown> = {
        reservation_id: reservation.id,
        end_date: endDate,
        extras: flatExtras.map(e => ({ extra_id: e.extra_id, quantity: e.quantity, place_index: e.place_index })),
        return_url: redirectBase,
      };
      if (firstVehicleId != null && firstVehicleId !== reservation.vehicle_id) {
        body.vehicle_id = firstVehicleId;
      }

      const { data, error } = await supabase.functions.invoke('modify-reservation', { body });
      if (error) {
        Alert.alert('Error', error.message ?? 'No se pudo modificar.');
        return;
      }

      const mode = data?.mode as 'free' | 'refunded' | 'checkout';

      if (mode === 'checkout' && data?.url) {
        const pendingKey = `pending_modify_travelers_${reservation.id}`;
        await AsyncStorage.setItem(pendingKey, JSON.stringify({
          travelers: buildTravelerRows(reservation.id),
          snapshot: buildVehiclesSnapshot(),
        }));

        const result = await WebBrowser.openAuthSessionAsync(String(data.url), redirectBase);

        if (result.type === 'success') {
          const stored = await AsyncStorage.getItem(pendingKey);
          await AsyncStorage.removeItem(pendingKey);
          if (stored) {
            const { travelers, snapshot } = JSON.parse(stored);
            await supabase.from('reservations').update({ vehicles_snapshot: snapshot }).eq('id', reservation.id);
            await supabase.from('travelers').delete().eq('reservation_id', reservation.id);
            if (travelers.length > 0) await supabase.from('travelers').insert(travelers);
          }
          router.replace('/(main)/qr' as any);
          setTimeout(() => router.push(`/(main)/qr/${reservation.id}` as any), 0);
        } else {
          await AsyncStorage.removeItem(pendingKey);
          Alert.alert('Pago no completado', 'Puedes intentarlo de nuevo.');
        }
        return;
      }

      // delta = 0 o delta < 0: aplicar viajeros y snapshot directamente
      await applyTravelersAndSnapshot(reservation.id);

      const goToReservation = () => {
        router.replace('/(main)/qr' as any);
        setTimeout(() => router.push(`/(main)/qr/${reservation.id}` as any), 0);
      };

      if (mode === 'refunded') {
        Alert.alert(
          'Cambios aplicados',
          `Hemos iniciado un reembolso de ${formatCents(Number(data?.refund_amount_cents ?? 0))} en tu método de pago.\n\nTu banco lo reflejará en 5-10 días laborables.`,
          [{ text: 'OK', onPress: goToReservation }],
        );
      } else {
        Alert.alert('Cambios aplicados', 'Tu reserva se ha actualizado.', [
          { text: 'OK', onPress: goToReservation },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo modificar.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return <RequireAuthCard />;
  if (loading || !reservation) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const canModify = isModifiable(reservation.start_date, reservation.status);
  if (!canModify) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>No editable</Text>
        <Text style={styles.subtle}>Esta reserva ya no se puede modificar.</Text>
        <Pressable onPress={() => router.back()} style={[styles.actionBtn, styles.cancelBtn, { marginTop: 16 }]}>
          <Text style={styles.cancelBtnText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const s = placeStates[activePlaza];
  if (!s) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.title}>Modificar reserva</Text>
        <Text style={styles.subtle}>#{reservation.id} · entrada {dayjs(reservation.start_date).format('DD/MM/YYYY')}</Text>
      </View>

      {placeStates.length > 1 && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingVertical: 8, flexWrap: 'wrap' }}>
          {placeStates.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => { setActivePlaza(i); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: activePlaza === i ? '#111' : '#E5E7EB',
              }}
            >
              <Text style={{ color: activePlaza === i ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>
                Plaza {i + 1}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>

        {/* ── ESTANCIA ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Estancia</Text>
          <Text style={styles.helper}>La entrada queda fija. Ajusta la fecha de salida.</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Entrada</Text>
            <Text style={styles.rowValue}>{dayjs(reservation.start_date).format('DD/MM/YYYY')}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Salida</Text>
            <Text style={styles.rowValue}>{dayjs(endDate).format('DD/MM/YYYY')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <Text style={styles.rowLabel}>Noches</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => { if (nights > 1) setEndDate(dayjs(endDate).subtract(1, 'day').format('YYYY-MM-DD')); }}
                style={[styles.stepBtn, nights <= 1 && { opacity: 0.4 }]}
              >
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={{ fontSize: 18, fontWeight: '700', minWidth: 28, textAlign: 'center' }}>{nights}</Text>
              <Pressable
                onPress={() => setEndDate(dayjs(endDate).add(1, 'day').format('YYYY-MM-DD'))}
                style={styles.stepBtn}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── VEHÍCULO ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚐 Vehículo{placeStates.length > 1 ? ` — Plaza ${activePlaza + 1}` : ''}</Text>

          {activePlaza === 0 ? (
            <>
              {vehicles.map(v => {
                const sel = s.vehicleId === v.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => { updatePlace(0, 'vehicleId', v.id); setShowNewVehicleForm(false); }}
                    style={{
                      borderRadius: 12, padding: 14, marginBottom: 8,
                      backgroundColor: sel ? '#111' : '#fff',
                      borderWidth: 1.5, borderColor: sel ? '#111' : '#E5E7EB',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontSize: 20 }}>🚐</Text>
                      <View>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: sel ? '#fff' : '#111' }}>{vehicleDisplayName(v)}</Text>
                        <Text style={{ color: sel ? '#ccc' : '#888', fontSize: 12 }}>{v.plate}</Text>
                      </View>
                    </View>
                    {sel && <Text style={{ color: '#fff', fontSize: 18 }}>✓</Text>}
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setShowNewVehicleForm(v => !v)}
                style={{ marginTop: 4, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: '#1A73E8', borderStyle: 'dashed' }}
              >
                <Text style={{ color: '#1A73E8', fontWeight: '700', fontSize: 13 }}>
                  {showNewVehicleForm ? 'Cancelar' : '+ Añadir nuevo vehículo'}
                </Text>
              </Pressable>

              {showNewVehicleForm && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>Marca *</Text>
                  <TextInput value={newVehicleForm.brand} onChangeText={v => setNewVehicleForm(f => ({ ...f, brand: v }))} placeholder="Ej: Volkswagen" autoCapitalize="words" style={styles.input} />
                  <Text style={styles.fieldLabel}>Modelo *</Text>
                  <TextInput value={newVehicleForm.model} onChangeText={v => setNewVehicleForm(f => ({ ...f, model: v }))} placeholder="Ej: California" autoCapitalize="words" style={styles.input} />
                  <Text style={styles.fieldLabel}>Matrícula *</Text>
                  <TextInput value={newVehicleForm.plate} onChangeText={v => setNewVehicleForm(f => ({ ...f, plate: v }))} placeholder="Ej: 1234 ABC" autoCapitalize="characters" autoCorrect={false} style={styles.input} />
                  <Text style={styles.fieldLabel}>Alias (opcional)</Text>
                  <TextInput value={newVehicleForm.alias} onChangeText={v => setNewVehicleForm(f => ({ ...f, alias: v }))} placeholder="Ej: La furgo" style={styles.input} />
                  <Pressable
                    onPress={saveNewVehicle}
                    disabled={savingVehicle}
                    style={[styles.actionBtn, styles.confirmBtn, { marginTop: 8 }, savingVehicle && { opacity: 0.6 }]}
                  >
                    <Text style={styles.confirmBtnText}>{savingVehicle ? 'Guardando…' : 'Guardar y seleccionar'}</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.helper}>Datos del vehículo acompañante (no se guarda en tu lista)</Text>
              <Text style={styles.fieldLabel}>Marca</Text>
              <TextInput value={s.snapshotVehicle.brand} onChangeText={v => updateSnapshotVehicle(activePlaza, 'brand', v)} placeholder="Ej: Hymer" autoCapitalize="words" style={styles.input} />
              <Text style={styles.fieldLabel}>Modelo</Text>
              <TextInput value={s.snapshotVehicle.model} onChangeText={v => updateSnapshotVehicle(activePlaza, 'model', v)} placeholder="Ej: B-ML 580" autoCapitalize="words" style={styles.input} />
              <Text style={styles.fieldLabel}>Matrícula</Text>
              <TextInput value={s.snapshotVehicle.plate} onChangeText={v => updateSnapshotVehicle(activePlaza, 'plate', v)} placeholder="Ej: 5678 XYZ" autoCapitalize="characters" autoCorrect={false} style={styles.input} />
              <Text style={styles.fieldLabel}>Alias (opcional)</Text>
              <TextInput value={s.snapshotVehicle.alias} onChangeText={v => updateSnapshotVehicle(activePlaza, 'alias', v)} placeholder="Ej: Moto de los García" style={styles.input} />
            </>
          )}
        </View>

        {/* ── HUÉSPEDES ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Huéspedes{placeStates.length > 1 ? ` — Plaza ${activePlaza + 1}` : ''}</Text>

          <CounterRow
            label="Viajeros"
            subtitle={personExtra ? `Extra a partir del 3º: ${formatCents(personExtra.unit_amount_cents)} / viajero / ${personExtra.pricing_type === 'per_stay' ? 'estancia' : 'noche'}` : 'Mín. 1, máx. 6.'}
            value={s.numGuests}
            min={1}
            max={6}
            onDecrement={() => changeNumGuests(activePlaza, -1)}
            onIncrement={() => changeNumGuests(activePlaza, +1)}
          />

          <View style={styles.divider} />

          <CounterRow
            label="Mascotas"
            subtitle={petExtra ? `Suplemento: ${formatCents(petExtra.unit_amount_cents)} / mascota / ${petExtra.pricing_type === 'per_stay' ? 'estancia' : 'noche'}` : undefined}
            value={s.numPets}
            min={0}
            onDecrement={() => updatePlace(activePlaza, 'numPets', Math.max(0, s.numPets - 1))}
            onIncrement={() => updatePlace(activePlaza, 'numPets', s.numPets + 1)}
          />

          <View style={styles.divider} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '500' }}>Electricidad</Text>
              {powerExtra && (
                <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  Suplemento: {formatCents(powerExtra.unit_amount_cents)} / {powerExtra.pricing_type === 'per_stay' ? 'estancia' : 'noche'}
                </Text>
              )}
            </View>
            <Switch
              value={s.electricidad}
              onValueChange={v => updatePlace(activePlaza, 'electricidad', v)}
              trackColor={{ true: '#1A73E8', false: '#E5E7EB' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── DATOS DE VIAJEROS ── */}
        <Text style={styles.sectionLabel}>
          Datos de los viajeros{placeStates.length > 1 ? ` — Plaza ${activePlaza + 1}` : ''}
        </Text>

        {s.guests.map((g, gi) => (
          <View key={gi} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#111' }} />
              <Text style={{ fontWeight: '700', fontSize: 14 }}>
                {activePlaza === 0 && gi === 0 ? 'Titular — ' : ''}Viajero {gi + 1}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Nombre completo *</Text>
            <TextInput value={g.full_name} onChangeText={v => updateGuest(activePlaza, gi, 'full_name', v)} placeholder="Nombre y apellidos" autoCapitalize="words" style={styles.input} />

            <Text style={styles.fieldLabel}>Tipo de documento *</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {(['dni', 'nie', 'passport'] as const).map(type => (
                <Pressable
                  key={type}
                  onPress={() => updateGuest(activePlaza, gi, 'doc_type', type)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: g.doc_type === type ? '#1A73E8' : '#E5E7EB',
                    backgroundColor: g.doc_type === type ? '#EAF1FE' : '#fff',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '600', fontSize: 11, color: g.doc_type === type ? '#1A73E8' : '#555' }}>
                    {type === 'passport' ? 'Pasaporte' : type.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Nº documento *</Text>
            <TextInput value={g.doc_number} onChangeText={v => updateGuest(activePlaza, gi, 'doc_number', v)} placeholder={g.doc_type === 'passport' ? 'Nº pasaporte' : 'DNI / NIE'} autoCapitalize="characters" autoCorrect={false} style={styles.input} />

            <Text style={styles.fieldLabel}>Nº soporte (opcional)</Text>
            <TextInput value={g.doc_support_number} onChangeText={v => updateGuest(activePlaza, gi, 'doc_support_number', v)} placeholder="Nº en el reverso del documento" autoCapitalize="characters" autoCorrect={false} style={styles.input} />

            <Text style={styles.fieldLabel}>Fecha de nacimiento (DD/MM/AAAA)</Text>
            <TextInput value={g.birth_date} onChangeText={v => updateGuest(activePlaza, gi, 'birth_date', v)} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" style={styles.input} />

            <Text style={styles.fieldLabel}>Género</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {([['m', 'Hombre'], ['f', 'Mujer'], ['other', 'Otro']] as const).map(([val, label]) => (
                <Pressable
                  key={val}
                  onPress={() => updateGuest(activePlaza, gi, 'gender', val)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: g.gender === val ? '#1A73E8' : '#E5E7EB',
                    backgroundColor: g.gender === val ? '#EAF1FE' : '#fff',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '600', fontSize: 11, color: g.gender === val ? '#1A73E8' : '#555' }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Nacionalidad</Text>
            <TextInput value={g.nationality} onChangeText={v => updateGuest(activePlaza, gi, 'nationality', v)} placeholder="ES" autoCapitalize="characters" autoCorrect={false} style={styles.input} />

            <Text style={styles.fieldLabel}>País de residencia</Text>
            <TextInput value={g.country_of_residence} onChangeText={v => updateGuest(activePlaza, gi, 'country_of_residence', v)} placeholder="España" autoCapitalize="words" style={styles.input} />

            <Text style={styles.fieldLabel}>Localidad</Text>
            <TextInput value={g.city_of_residence} onChangeText={v => updateGuest(activePlaza, gi, 'city_of_residence', v)} placeholder="Ciudad o municipio" autoCapitalize="words" style={styles.input} />

            <Text style={styles.fieldLabel}>Teléfono</Text>
            <TextInput value={g.phone} onChangeText={v => updateGuest(activePlaza, gi, 'phone', v)} placeholder="+34 600 000 000" keyboardType="phone-pad" style={styles.input} />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput value={g.email} onChangeText={v => updateGuest(activePlaza, gi, 'email', v)} placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
          </View>
        ))}

        {/* ── DESGLOSE DE PRECIOS ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Desglose de precios</Text>
          <Text style={styles.helper}>{nights} noche{nights !== 1 ? 's' : ''} · {reservation.num_places} plaza{reservation.num_places !== 1 ? 's' : ''}</Text>

          {placeStates.map((ps, i) => {
            const placeBase = nights * reservation.nightly_amount_cents;
            const placePets = ps.numPets > 0 && petExtra
              ? (petExtra.pricing_type === 'per_stay' ? ps.numPets * petExtra.unit_amount_cents : ps.numPets * nights * petExtra.unit_amount_cents)
              : 0;
            const placePower = ps.electricidad && powerExtra
              ? (powerExtra.pricing_type === 'per_stay' ? powerExtra.unit_amount_cents : nights * powerExtra.unit_amount_cents)
              : 0;
            const extraPersons = Math.max(0, ps.numGuests - 2);
            const placePerson = extraPersons > 0 && personExtra
              ? (personExtra.pricing_type === 'per_stay' ? extraPersons * personExtra.unit_amount_cents : extraPersons * nights * personExtra.unit_amount_cents)
              : 0;
            const placeTotal = placeBase + placePets + placePower + placePerson;

            return (
              <View key={i} style={{ marginBottom: 12 }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: '#1A73E8', marginBottom: 4 }}>Plaza {i + 1}</Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{nights}n × {formatCents(reservation.nightly_amount_cents)}</Text>
                  <Text style={styles.rowValue}>{formatCents(placeBase)}</Text>
                </View>
                {placePets > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Mascotas ({ps.numPets})</Text>
                    <Text style={styles.rowValue}>{formatCents(placePets)}</Text>
                  </View>
                )}
                {placePower > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Electricidad</Text>
                    <Text style={styles.rowValue}>{formatCents(placePower)}</Text>
                  </View>
                )}
                {placePerson > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Viajeros extra ({extraPersons})</Text>
                    <Text style={styles.rowValue}>{formatCents(placePerson)}</Text>
                  </View>
                )}
                <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#F0F0F0', marginTop: 4, paddingTop: 4 }]}>
                  <Text style={{ color: '#444', fontWeight: '600' }}>Subtotal plaza {i + 1}</Text>
                  <Text style={{ fontWeight: '700' }}>{formatCents(placeTotal)}</Text>
                </View>
              </View>
            );
          })}

          <View style={{ borderTopWidth: 1.5, borderTopColor: '#E5E7EB', paddingTop: 12, marginTop: 4 }}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Total original</Text>
              <Text style={styles.rowValue}>{formatCents(reservation.total_amount_cents)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontWeight: '700', color: '#111' }]}>Total nuevo</Text>
              <Text style={[styles.rowValue, { fontWeight: '800' }]}>{formatCents(newTotal)}</Text>
            </View>
          </View>

          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, delta > 0 && { color: '#1A73E8' }, delta < 0 && { color: '#c0392b' }]}>
              {delta > 0 ? 'A pagar ahora' : delta < 0 ? 'Se reembolsará' : 'Sin coste adicional'}
            </Text>
            <Text style={[styles.totalValue, delta > 0 && { color: '#1A73E8' }, delta < 0 && { color: '#c0392b' }]}>
              {delta === 0 ? '—' : (delta > 0 ? '+' : '−') + formatCents(Math.abs(delta))}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={submit}
          disabled={submitting}
          style={[styles.actionBtn, styles.confirmBtn, submitting && { opacity: 0.6 }]}
        >
          <Text style={styles.confirmBtnText}>
            {submitting ? 'Procesando…' : delta > 0 ? 'Pagar y aplicar' : delta < 0 ? 'Confirmar y reembolsar' : 'Aplicar cambios'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterRow({ label, subtitle, value, min, max, onDecrement, onIncrement }: {
  label: string; subtitle?: string; value: number; min: number; max?: number;
  onDecrement: () => void; onIncrement: () => void;
}) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500' }}>{label}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable onPress={onDecrement} disabled={atMin} style={styles.stepBtn}>
          <Text style={[styles.stepText, { color: atMin ? '#CCC' : '#111' }]}>−</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>{value}</Text>
        <Pressable onPress={onIncrement} disabled={atMax} style={styles.stepBtn}>
          <Text style={[styles.stepText, { color: atMax ? '#CCC' : '#111' }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  backBtn: { marginBottom: 8 },
  backText: { color: '#007AFF', fontWeight: '700', fontSize: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#111' },
  subtle: { color: '#666', marginTop: 4, marginBottom: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: {
    backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  helper: { fontSize: 13, color: '#888', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#F3F3F3', marginVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: '#eee' },
  totalLabel: { fontSize: 16, fontWeight: '800' },
  totalValue: { fontSize: 16, fontWeight: '800' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F4F8', justifyContent: 'center', alignItems: 'center' },
  stepText: { fontSize: 18, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, backgroundColor: '#fff', marginBottom: 4,
  },
  actionBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  confirmBtn: { backgroundColor: '#1A73E8' },
  confirmBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
  cancelBtn: { backgroundColor: 'white', borderWidth: 2, borderColor: '#888' },
  cancelBtnText: { color: '#333', fontWeight: '700', fontSize: 15 },
});
