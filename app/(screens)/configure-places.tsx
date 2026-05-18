import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  usePendingReservation,
  TravelerDraft,
  VehicleSelection,
  PlaceConfig,
} from '@/providers/PendingReservationContext';
import {
  Vehicle,
  isValidLengthMeters,
  isValidSpanishPlate,
  normalizePlate,
  parseLengthMeters,
  vehicleDisplayName,
} from '@/components/utils/vehicle';
import { formatCents } from '@/components/utils/money';

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  pricing_type: 'per_night' | string;
};

const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };

type LocalPlaceState = {
  traveler: TravelerDraft;
  selectedVehicleId: number | null;
  showNewVehicleForm: boolean;
  newVehicle: { brand: string; model: string; plate: string; alias: string; length_m: string };
  savingVehicle: boolean;
  extraQuantities: Record<number, number>;
};

function emptyLocal(): LocalPlaceState {
  return {
    traveler: {
      full_name: '',
      doc_type: 'dni',
      doc_number: '',
      doc_support_number: '',
      nationality: 'ES',
      birth_date: '',
      gender: 'm',
      country_of_residence: '',
      city_of_residence: '',
      phone: '',
      email: '',
    },
    selectedVehicleId: null,
    showNewVehicleForm: false,
    newVehicle: { brand: '', model: '', plate: '', alias: '', length_m: '' },
    savingVehicle: false,
    extraQuantities: {},
  };
}

function placeConfigToLocal(cfg: PlaceConfig, vehicles: Vehicle[]): LocalPlaceState {
  const local = emptyLocal();
  local.traveler = { ...cfg.traveler };
  local.extraQuantities = Object.fromEntries(
    cfg.extras.map((e) => [e.extra_id, e.quantity]),
  );
  if (cfg.vehicleSelection?.type === 'saved') {
    local.selectedVehicleId = cfg.vehicleSelection.vehicle.id;
  }
  return local;
}

export default function ConfigurePlacesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { pending, setPending } = usePendingReservation();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [placeStates, setPlaceStates] = useState<LocalPlaceState[]>([]);
  const [saving, setSaving] = useState(false);

  const numPlaces = pending.numPlaces;

  useEffect(() => {
    if (!session?.user?.id) return;
    async function load() {
      const [vehiclesRes, extrasRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('*')
          .eq('user_id', session!.user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('extras')
          .select('id, code, name_es, unit_amount_cents, pricing_type')
          .eq('is_active', true)
          .order('id'),
      ]);

      const vList = (vehiclesRes.data ?? []) as Vehicle[];
      const eList = [...((extrasRes.data ?? []) as Extra[])].sort(
        (a, b) => (EXTRA_ORDER[a.code] ?? 9) - (EXTRA_ORDER[b.code] ?? 9),
      );
      setVehicles(vList);
      setExtras(eList);

      setPlaceStates(
        Array.from({ length: numPlaces }, (_, i) => {
          const existing = pending.placeConfigs[i];
          if (existing) return placeConfigToLocal(existing, vList);
          const local = emptyLocal();
          if (vList.length === 1) local.selectedVehicleId = vList[0].id;
          return local;
        }),
      );

      setLoading(false);
    }
    load();
  }, [session?.user?.id, numPlaces]);

  const setTravelerField = (
    idx: number,
    key: keyof TravelerDraft,
    value: string,
  ) =>
    setPlaceStates((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, traveler: { ...s.traveler, [key]: value } } : s,
      ),
    );

  const setPlaceField = <K extends keyof LocalPlaceState>(
    idx: number,
    key: K,
    value: LocalPlaceState[K],
  ) =>
    setPlaceStates((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)),
    );

  const setNewVehicleField = (
    idx: number,
    key: keyof LocalPlaceState['newVehicle'],
    value: string,
  ) =>
    setPlaceStates((prev) =>
      prev.map((s, i) =>
        i === idx
          ? { ...s, newVehicle: { ...s.newVehicle, [key]: value } }
          : s,
      ),
    );

  const setExtraQty = (placeIdx: number, extraId: number, qty: number) =>
    setPlaceStates((prev) =>
      prev.map((s, i) =>
        i === placeIdx
          ? { ...s, extraQuantities: { ...s.extraQuantities, [extraId]: qty } }
          : s,
      ),
    );

  const saveNewVehicle = async (placeIdx: number) => {
    if (!session?.user?.id) return;
    const nv = placeStates[placeIdx].newVehicle;
    if (!nv.brand.trim()) { Alert.alert('Marca obligatoria'); return; }
    if (!nv.model.trim()) { Alert.alert('Modelo obligatorio'); return; }
    if (!isValidSpanishPlate(nv.plate)) {
      Alert.alert('Matrícula inválida', 'Formato esperado: 1234ABC.');
      return;
    }
    if (!isValidLengthMeters(nv.length_m)) {
      Alert.alert('Longitud inválida', 'Indica un valor entre 0 y 20 metros.');
      return;
    }
    setPlaceField(placeIdx, 'savingVehicle', true);
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        user_id: session.user.id,
        brand: nv.brand.trim(),
        model: nv.model.trim(),
        plate: normalizePlate(nv.plate),
        alias: nv.alias.trim() || null,
        length_m: parseLengthMeters(nv.length_m),
      })
      .select('*')
      .single();
    setPlaceField(placeIdx, 'savingVehicle', false);
    if (error) {
      if ((error as any).code === '23505') {
        Alert.alert('Matrícula duplicada', 'Ya tienes un vehículo con esa matrícula.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }
    const inserted = data as Vehicle;
    setVehicles((prev) => [...prev, inserted]);
    setPlaceStates((prev) =>
      prev.map((s, i) =>
        i === placeIdx
          ? {
              ...s,
              selectedVehicleId: inserted.id,
              showNewVehicleForm: false,
              savingVehicle: false,
              newVehicle: { brand: '', model: '', plate: '', alias: '', length_m: '' },
            }
          : s,
      ),
    );
  };

  const handleContinue = () => {
    for (let i = 0; i < numPlaces; i++) {
      const s = placeStates[i];
      const t = s.traveler;
      if (!t.full_name.trim()) {
        Alert.alert('Datos incompletos', `Plaza ${i + 1}: indica el nombre del viajero.`);
        return;
      }
      if (!t.doc_number.trim()) {
        Alert.alert('Datos incompletos', `Plaza ${i + 1}: indica el número de documento.`);
        return;
      }
      if (!t.birth_date.trim()) {
        Alert.alert('Datos incompletos', `Plaza ${i + 1}: indica la fecha de nacimiento.`);
        return;
      }
      if (!s.selectedVehicleId) {
        Alert.alert('Vehículo requerido', `Plaza ${i + 1}: selecciona un vehículo.`);
        return;
      }
    }

    const placeConfigs = placeStates.map((s) => {
      const vehicle = vehicles.find((v) => v.id === s.selectedVehicleId) ?? null;
      const vehicleSelection: VehicleSelection | null = vehicle
        ? { type: 'saved', vehicle }
        : null;
      return {
        traveler: s.traveler,
        vehicleSelection,
        extras: Object.entries(s.extraQuantities)
          .filter(([, qty]) => qty > 0)
          .map(([extraId, qty]) => ({ extra_id: Number(extraId), quantity: qty })),
      };
    });

    setPending((prev) => ({ ...prev, placeConfigs }));
    router.push('/(screens)/date-picker');
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4 }}>
          Configura tus plazas
        </Text>
        <Text style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
          {numPlaces} plaza{numPlaces !== 1 ? 's' : ''} · Rellena los datos de cada ocupante.
        </Text>

        {placeStates.map((s, idx) => (
          <View key={idx} style={card}>
            <Text style={sectionTitle}>Plaza {idx + 1}</Text>

            {/* ── Datos del viajero ── */}
            <Text style={groupLabel}>Viajero</Text>

            <Text style={fieldLabel}>Nombre completo *</Text>
            <TextInput
              value={s.traveler.full_name}
              onChangeText={(v) => setTravelerField(idx, 'full_name', v)}
              placeholder="Nombre y apellidos"
              autoCapitalize="words"
              style={input}
            />

            <Text style={fieldLabel}>Tipo de documento *</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 }}>
              {(['dni', 'nie', 'passport'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setTravelerField(idx, 'doc_type', type)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                    borderColor: s.traveler.doc_type === type ? '#1A73E8' : '#E5E7EB',
                    backgroundColor: s.traveler.doc_type === type ? '#EAF1FE' : '#fff',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontWeight: '600', fontSize: 12,
                    color: s.traveler.doc_type === type ? '#1A73E8' : '#555',
                  }}>
                    {type.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={fieldLabel}>Número de documento *</Text>
            <TextInput
              value={s.traveler.doc_number}
              onChangeText={(v) => setTravelerField(idx, 'doc_number', v)}
              placeholder={s.traveler.doc_type === 'passport' ? 'Número de pasaporte' : 'DNI / NIE'}
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />

            <Text style={fieldLabel}>Número de soporte</Text>
            <TextInput
              value={s.traveler.doc_support_number}
              onChangeText={(v) => setTravelerField(idx, 'doc_support_number', v)}
              placeholder="Reverso del DNI (opcional)"
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />

            <Text style={fieldLabel}>Nacionalidad *</Text>
            <TextInput
              value={s.traveler.nationality}
              onChangeText={(v) => setTravelerField(idx, 'nationality', v)}
              placeholder="ES"
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />

            <Text style={fieldLabel}>Fecha de nacimiento * (DD/MM/AAAA)</Text>
            <TextInput
              value={s.traveler.birth_date}
              onChangeText={(v) => setTravelerField(idx, 'birth_date', v)}
              placeholder="15/03/1985"
              keyboardType="numbers-and-punctuation"
              style={input}
            />

            <Text style={fieldLabel}>Género *</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 }}>
              {([['m', 'Hombre'], ['f', 'Mujer'], ['other', 'Otro']] as const).map(
                ([val, label]) => (
                  <Pressable
                    key={val}
                    onPress={() => setTravelerField(idx, 'gender', val)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
                      borderColor: s.traveler.gender === val ? '#1A73E8' : '#E5E7EB',
                      backgroundColor: s.traveler.gender === val ? '#EAF1FE' : '#fff',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontWeight: '600', fontSize: 12,
                      color: s.traveler.gender === val ? '#1A73E8' : '#555',
                    }}>
                      {label}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <Text style={fieldLabel}>País de residencia</Text>
            <TextInput
              value={s.traveler.country_of_residence}
              onChangeText={(v) => setTravelerField(idx, 'country_of_residence', v)}
              placeholder="España (opcional)"
              style={input}
            />

            <Text style={fieldLabel}>Localidad de residencia</Text>
            <TextInput
              value={s.traveler.city_of_residence}
              onChangeText={(v) => setTravelerField(idx, 'city_of_residence', v)}
              placeholder="Valencia (opcional)"
              style={input}
            />

            <Text style={fieldLabel}>Teléfono</Text>
            <TextInput
              value={s.traveler.phone}
              onChangeText={(v) => setTravelerField(idx, 'phone', v)}
              placeholder="+34 600 000 000 (opcional)"
              keyboardType="phone-pad"
              style={input}
            />

            <Text style={fieldLabel}>Email</Text>
            <TextInput
              value={s.traveler.email}
              onChangeText={(v) => setTravelerField(idx, 'email', v)}
              placeholder="correo@ejemplo.com (opcional)"
              keyboardType="email-address"
              autoCapitalize="none"
              style={input}
            />

            {/* ── Vehículo ── */}
            <Text style={[groupLabel, { marginTop: 16 }]}>Vehículo *</Text>

            {vehicles.map((v) => {
              const sel = s.selectedVehicleId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setPlaceField(idx, 'selectedVehicleId', v.id)}
                  style={{
                    borderWidth: 2,
                    borderColor: sel ? '#1A73E8' : '#E5E7EB',
                    backgroundColor: sel ? '#EAF1FE' : '#fff',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontWeight: '700', fontSize: 14 }}>
                    {vehicleDisplayName(v)}
                  </Text>
                  <Text style={{ color: '#555', fontSize: 12 }}>
                    {v.brand} {v.model}
                  </Text>
                  <Text style={{ color: '#1A73E8', fontWeight: '700', fontSize: 12, marginTop: 2 }}>
                    {v.plate}
                  </Text>
                </Pressable>
              );
            })}

            {s.showNewVehicleForm ? (
              <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, gap: 8 }}>
                <Text style={{ fontWeight: '700' }}>Nuevo vehículo</Text>
                <TextInput value={s.newVehicle.brand} onChangeText={(v) => setNewVehicleField(idx, 'brand', v)} placeholder="Marca *" style={input} autoCapitalize="words" />
                <TextInput value={s.newVehicle.model} onChangeText={(v) => setNewVehicleField(idx, 'model', v)} placeholder="Modelo *" style={input} />
                <TextInput value={s.newVehicle.plate} onChangeText={(v) => setNewVehicleField(idx, 'plate', v)} placeholder="Matrícula * (1234ABC)" style={input} autoCapitalize="characters" autoCorrect={false} />
                <TextInput value={s.newVehicle.alias} onChangeText={(v) => setNewVehicleField(idx, 'alias', v)} placeholder="Alias (opcional)" style={input} />
                <TextInput value={s.newVehicle.length_m} onChangeText={(v) => setNewVehicleField(idx, 'length_m', v)} placeholder="Longitud en metros (opcional)" style={input} keyboardType="decimal-pad" />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={() => setPlaceField(idx, 'showNewVehicleForm', false)}
                    disabled={s.savingVehicle}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' }}
                  >
                    <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => saveNewVehicle(idx)}
                    disabled={s.savingVehicle}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1A73E8', alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {s.savingVehicle ? 'Guardando…' : 'Guardar y elegir'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setPlaceField(idx, 'showNewVehicleForm', true)}
                style={{
                  paddingVertical: 12, borderRadius: 12, borderWidth: 2,
                  borderColor: '#1A73E8', borderStyle: 'dashed',
                  alignItems: 'center', marginTop: 4,
                }}
              >
                <Text style={{ color: '#1A73E8', fontWeight: '700' }}>+ Añadir vehículo nuevo</Text>
              </Pressable>
            )}

            {/* ── Extras de esta plaza ── */}
            {extras.length > 0 && (
              <>
                <Text style={[groupLabel, { marginTop: 16 }]}>Extras</Text>
                {extras.map((extra) => {
                  const qty = s.extraQuantities[extra.id] ?? 0;
                  const isPower = extra.code === 'POWER';
                  return (
                    <View
                      key={extra.id}
                      style={{
                        flexDirection: 'row', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: 12,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ fontSize: 15, fontWeight: '500' }}>{extra.name_es}</Text>
                        <Text style={{ color: '#666', fontSize: 12 }}>
                          {formatCents(extra.unit_amount_cents)} / noche
                        </Text>
                      </View>
                      {isPower ? (
                        <Pressable
                          onPress={() => setExtraQty(idx, extra.id, qty === 1 ? 0 : 1)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 8,
                            paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
                            backgroundColor: '#F2F4F8',
                          }}
                        >
                          <View
                            style={{
                              width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                              borderColor: qty === 1 ? '#1A73E8' : '#999',
                              backgroundColor: qty === 1 ? '#1A73E8' : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {qty === 1 && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
                          </View>
                          <Text style={{ fontWeight: '600' }}>{qty === 1 ? 'Sí' : 'No'}</Text>
                        </Pressable>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          <Pressable onPress={() => setExtraQty(idx, extra.id, Math.max(0, qty - 1))} style={smallBtn}>
                            <Text style={{ fontSize: 18, fontWeight: '800' }}>−</Text>
                          </Pressable>
                          <Text style={{ minWidth: 18, textAlign: 'center' }}>{qty}</Text>
                          <Pressable onPress={() => setExtraQty(idx, extra.id, Math.min(4, qty + 1))} style={smallBtn}>
                            <Text style={{ fontSize: 18, fontWeight: '800' }}>+</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        ))}

        <Pressable
          onPress={handleContinue}
          disabled={saving}
          style={{
            backgroundColor: '#111', paddingVertical: 16, borderRadius: 14,
            alignItems: 'center', opacity: saving ? 0.7 : 1, marginTop: 8,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            Siguiente paso →
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const card = {
  backgroundColor: '#fff',
  padding: 16,
  borderRadius: 16,
  marginBottom: 16,
  elevation: 2,
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
};
const sectionTitle = { fontSize: 17, fontWeight: '700' as const, marginBottom: 12 };
const groupLabel = { fontSize: 13, fontWeight: '700' as const, color: '#444', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 0.5 };
const fieldLabel = { fontSize: 13, color: '#666', marginTop: 10, marginBottom: 2 };
const input = {
  backgroundColor: '#F2F4F8',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
};
const smallBtn = {
  width: 34, height: 34, borderRadius: 10,
  backgroundColor: '#F2F4F8',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
