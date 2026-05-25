import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  usePendingReservation,
  GuestDraft,
  PlaceConfig,
  emptyGuest,
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

type LocalPlaceState = {
  // Plaza 0 (usuario): vehículo guardado en la BD
  selectedVehicleId: number | null;
  showNewVehicleForm: boolean;
  newVehicle: { brand: string; model: string; plate: string; alias: string; length_m: string };
  savingVehicle: boolean;
  // Plaza 1+ (acompañante): vehículo escrito sin guardar en BD
  companionVehicle: { brand: string; model: string; plate: string; alias: string; length_m: string };
  companionVehicleConfirmed: boolean;
  numGuests: number;
  numPets: number;
  electricidad: boolean;
  guests: GuestDraft[];
};

function emptyLocal(): LocalPlaceState {
  return {
    selectedVehicleId: null,
    showNewVehicleForm: false,
    newVehicle: { brand: '', model: '', plate: '', alias: '', length_m: '' },
    savingVehicle: false,
    companionVehicle: { brand: '', model: '', plate: '', alias: '', length_m: '' },
    companionVehicleConfirmed: false,
    numGuests: 1,
    numPets: 0,
    electricidad: false,
    guests: [emptyGuest()],
  };
}

function configToLocal(cfg: PlaceConfig): LocalPlaceState {
  const local = emptyLocal();
  local.numGuests = cfg.numGuests ?? 1;
  local.numPets = cfg.numPets ?? 0;
  local.electricidad = cfg.electricidad ?? false;
  const guestList = cfg.guests ?? [];
  local.guests = guestList.length > 0 ? [...guestList] : [emptyGuest()];
  if (cfg.vehicleSelection?.type === 'saved') {
    local.selectedVehicleId = cfg.vehicleSelection.vehicle.id;
  } else if (cfg.vehicleSelection?.type === 'new') {
    local.companionVehicle = { ...cfg.vehicleSelection.draft };
    local.companionVehicleConfirmed = !!cfg.vehicleSelection.draft.plate.trim();
  }
  return local;
}

export default function ConfigurePlacesScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { pending, setPending } = usePendingReservation();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [petExtra, setPetExtra] = useState<Extra | null>(null);
  const [powerExtra, setPowerExtra] = useState<Extra | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeStates, setPlaceStates] = useState<LocalPlaceState[]>([]);
  const [activePlaza, setActivePlaza] = useState(0);
  const profileApplied = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const numPlaces = pending.numPlaces;

  useEffect(() => {
    if (!session?.user?.id) return;
    async function load() {
      const [vehiclesRes, extrasRes] = await Promise.all([
        supabase.from('vehicles').select('*').eq('user_id', session!.user.id).order('created_at', { ascending: true }),
        supabase.from('extras').select('id,code,name_es,unit_amount_cents,pricing_type').eq('is_active', true),
      ]);

      const vList = (vehiclesRes.data ?? []) as Vehicle[];
      setVehicles(vList);

      const allExtras = (extrasRes.data ?? []) as Extra[];
      setPetExtra(allExtras.find(e => e.code === 'PET') ?? null);
      setPowerExtra(allExtras.find(e => e.code === 'POWER') ?? null);

      const states = Array.from({ length: numPlaces }, (_, i) => {
        const existing = pending.placeConfigs[i];
        const local = existing ? configToLocal(existing) : emptyLocal();
        if (i === 0 && vList.length === 1 && !local.selectedVehicleId) {
          local.selectedVehicleId = vList[0].id;
        }
        return local;
      });

      // Pre-fill plaza 1, acompañante 1 from profile
      if (!profileApplied.current && profile && states[0].guests[0].full_name === '') {
        profileApplied.current = true;
        states[0].guests[0] = {
          ...emptyGuest(),
          full_name: profile.full_name ?? '',
          doc_number: profile.dni ?? '',
        };
      }

      setPlaceStates(states);
      setLoading(false);
    }
    load();
  }, [session?.user?.id, numPlaces]);

  // ── Mutators ──────────────────────────────────────────────────────────────

  const updatePlaza = <K extends keyof LocalPlaceState>(idx: number, key: K, val: LocalPlaceState[K]) =>
    setPlaceStates(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));

  const updateCompanionVehicle = (idx: number, key: keyof LocalPlaceState['companionVehicle'], val: string) =>
    setPlaceStates(prev => prev.map((s, i) => i === idx ? { ...s, companionVehicle: { ...s.companionVehicle, [key]: val } } : s));

  const updateGuest = (plazaIdx: number, guestIdx: number, key: keyof GuestDraft, val: string) =>
    setPlaceStates(prev => prev.map((s, i) => {
      if (i !== plazaIdx) return s;
      const guests = s.guests.map((g, gi) => gi === guestIdx ? { ...g, [key]: val } : g);
      return { ...s, guests };
    }));

  const updateNewVehicleField = (idx: number, key: keyof LocalPlaceState['newVehicle'], val: string) =>
    setPlaceStates(prev => prev.map((s, i) => i === idx ? { ...s, newVehicle: { ...s.newVehicle, [key]: val } } : s));

  const changeNumGuests = (plazaIdx: number, delta: number) => {
    setPlaceStates(prev => prev.map((s, i) => {
      if (i !== plazaIdx) return s;
      const next = Math.max(1, s.numGuests + delta);
      let guests = [...s.guests];
      if (next > s.numGuests) {
        guests.push(emptyGuest());
      } else if (next < s.numGuests) {
        guests = guests.slice(0, next);
      }
      return { ...s, numGuests: next, guests };
    }));
  };

  const addPlaza = () => {
    const newLocal = emptyLocal();
    setPlaceStates(prev => [...prev, newLocal]);
    setPending(prev => ({ ...prev, numPlaces: prev.numPlaces + 1 }));
    setActivePlaza(placeStates.length);
  };

  const removePlaza = (idx: number) => {
    if (placeStates.length <= 1) return;
    Alert.alert('Eliminar plaza', `¿Eliminar la Plaza ${idx + 1}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: () => {
          setPlaceStates(prev => prev.filter((_, i) => i !== idx));
          setPending(prev => ({ ...prev, numPlaces: prev.numPlaces - 1 }));
          setActivePlaza(a => Math.min(a, placeStates.length - 2));
        },
      },
    ]);
  };

  const saveNewVehicle = async (plazaIdx: number) => {
    if (!session?.user?.id) return;
    const nv = placeStates[plazaIdx].newVehicle;
    if (!nv.brand.trim()) { Alert.alert('Marca obligatoria'); return; }
    if (!nv.model.trim()) { Alert.alert('Modelo obligatorio'); return; }
    if (!isValidSpanishPlate(nv.plate)) { Alert.alert('Matrícula inválida', 'Formato esperado: 1234ABC.'); return; }
    if (!isValidLengthMeters(nv.length_m)) { Alert.alert('Longitud inválida', '0 – 20 metros.'); return; }

    updatePlaza(plazaIdx, 'savingVehicle', true);
    const { data, error } = await supabase.from('vehicles').insert({
      user_id: session.user.id,
      brand: nv.brand.trim(),
      model: nv.model.trim(),
      plate: normalizePlate(nv.plate),
      alias: nv.alias.trim() || null,
      length_m: parseLengthMeters(nv.length_m),
    }).select('*').single();

    updatePlaza(plazaIdx, 'savingVehicle', false);
    if (error) {
      Alert.alert('Error', (error as any).code === '23505' ? 'Ya tienes ese vehículo registrado.' : error.message);
      return;
    }
    const inserted = data as Vehicle;
    setVehicles(prev => [...prev, inserted]);
    setPlaceStates(prev => prev.map((s, i) => i === plazaIdx
      ? { ...s, selectedVehicleId: inserted.id, showNewVehicleForm: false, savingVehicle: false, newVehicle: { brand: '', model: '', plate: '', alias: '', length_m: '' } }
      : s));
  };

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });

  const handleNext = () => {
    if (activePlaza < placeStates.length - 1) {
      setActivePlaza(activePlaza + 1);
      scrollToTop();
      return;
    }
    // Last plaza → validate all and continue
    for (let i = 0; i < placeStates.length; i++) {
      const s = placeStates[i];

      // Vehicle validation
      if (i === 0) {
        if (!s.selectedVehicleId) {
          Alert.alert('Vehículo requerido', 'Plaza 1: selecciona tu vehículo.');
          setActivePlaza(0);
          return;
        }
      } else {
        if (!s.companionVehicle.plate.trim()) {
          Alert.alert('Matrícula requerida', `Plaza ${i + 1}: indica la matrícula del vehículo del acompañante.`);
          setActivePlaza(i);
          return;
        }
      }

      // Guest validation
      for (let j = 0; j < s.guests.length; j++) {
        const g = s.guests[j];
        const label = `Plaza ${i + 1}, Viajero ${j + 1}`;

        if (!g.full_name.trim()) {
          Alert.alert('Nombre requerido', `${label}: indica el nombre completo.`);
          setActivePlaza(i); return;
        }
        if (!g.doc_number.trim()) {
          Alert.alert('Documento requerido', `${label}: indica el nº de documento.`);
          setActivePlaza(i); return;
        }
        // Validar fecha DD/MM/AAAA
        if (!g.birth_date.trim()) {
          Alert.alert('Fecha requerida', `${label}: indica la fecha de nacimiento.`);
          setActivePlaza(i); return;
        }
        const dateOk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(g.birth_date.trim());
        if (!dateOk) {
          Alert.alert('Formato de fecha', `${label}: usa el formato DD/MM/AAAA (ej. 15/06/1990).`);
          setActivePlaza(i); return;
        }
        const [dd, mm, yyyy] = g.birth_date.trim().split('/').map(Number);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > new Date().getFullYear()) {
          Alert.alert('Fecha inválida', `${label}: comprueba que la fecha de nacimiento es correcta.`);
          setActivePlaza(i); return;
        }
        // Email básico (si se rellena)
        if (g.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) {
          Alert.alert('Email inválido', `${label}: el email no tiene un formato válido.`);
          setActivePlaza(i); return;
        }
      }
    }

    const placeConfigs: PlaceConfig[] = placeStates.map((s, i) => ({
      vehicleSelection: i === 0
        ? (vehicles.find(v => v.id === s.selectedVehicleId)
            ? { type: 'saved' as const, vehicle: vehicles.find(v => v.id === s.selectedVehicleId)! }
            : null)
        : (s.companionVehicle.plate.trim()
            ? { type: 'new' as const, draft: s.companionVehicle }
            : null),
      numGuests: s.numGuests,
      numPets: s.numPets,
      electricidad: s.electricidad,
      guests: [...s.guests],
    }));

    setPending(prev => ({ ...prev, numPlaces: placeConfigs.length, placeConfigs }));
    router.push('/(screens)/date-picker');
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const s = placeStates[activePlaza];
  if (!s) return null;

  const isLastPlaza = activePlaza === placeStates.length - 1;
  const isMainPlaza = activePlaza === 0;
  const atLimit = s.numGuests >= 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>Configurar tus plazas</Text>
        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Paso 2 de 5</Text>
      </View>

      {/* Plaza tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 8, flexWrap: 'wrap' }}>
        {placeStates.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => { setActivePlaza(i); scrollToTop(); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
              backgroundColor: activePlaza === i ? '#111' : '#E5E7EB',
            }}
          >
            <Text style={{ color: activePlaza === i ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>
              Plaza {i + 1}
            </Text>
            {placeStates.length > 1 && (
              <Pressable onPress={() => removePlaza(i)} hitSlop={8}>
                <Text style={{ color: activePlaza === i ? '#fff' : '#666', fontSize: 13, fontWeight: '700' }}>×</Text>
              </Pressable>
            )}
          </Pressable>
        ))}
        <Pressable
          onPress={addPlaza}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#1A73E8', borderStyle: 'dashed' }}
        >
          <Text style={{ color: '#1A73E8', fontWeight: '600', fontSize: 13 }}>+ Añadir plaza</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

        {/* ── VEHÍCULO ── */}
        <Text style={groupLabel}>Vehículo</Text>

        {isMainPlaza ? (
          // Plaza 0: selección de vehículo guardado del usuario
          <>
            {vehicles.map(v => {
              const sel = s.selectedVehicleId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => updatePlaza(activePlaza, 'selectedVehicleId', v.id)}
                  style={{
                    borderRadius: 12, padding: 14, marginBottom: 8,
                    backgroundColor: sel ? '#111' : '#fff',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 20 }}>🚐</Text>
                    <View>
                      <Text style={{ fontWeight: '700', fontSize: 14, color: sel ? '#fff' : '#111' }}>
                        {vehicleDisplayName(v)}
                      </Text>
                      <Text style={{ color: sel ? '#ccc' : '#888', fontSize: 12 }}>{v.plate}</Text>
                    </View>
                  </View>
                  {sel && <Text style={{ color: '#fff', fontSize: 18 }}>✓</Text>}
                </Pressable>
              );
            })}

            {s.showNewVehicleForm ? (
              <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, gap: 8, marginBottom: 8 }}>
                <Text style={{ fontWeight: '700' }}>Nuevo vehículo</Text>
                <TextInput value={s.newVehicle.brand} onChangeText={v => updateNewVehicleField(activePlaza, 'brand', v)} placeholder="Marca *" style={input} autoCapitalize="words" />
                <TextInput value={s.newVehicle.model} onChangeText={v => updateNewVehicleField(activePlaza, 'model', v)} placeholder="Modelo *" style={input} />
                <TextInput value={s.newVehicle.plate} onChangeText={v => updateNewVehicleField(activePlaza, 'plate', v)} placeholder="Matrícula * (1234ABC)" style={input} autoCapitalize="characters" autoCorrect={false} />
                <TextInput value={s.newVehicle.alias} onChangeText={v => updateNewVehicleField(activePlaza, 'alias', v)} placeholder="Alias (opcional)" style={input} />
                <TextInput value={s.newVehicle.length_m} onChangeText={v => updateNewVehicleField(activePlaza, 'length_m', v)} placeholder="Longitud en metros (opcional)" style={input} keyboardType="decimal-pad" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => updatePlaza(activePlaza, 'showNewVehicleForm', false)} disabled={s.savingVehicle} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={() => saveNewVehicle(activePlaza)} disabled={s.savingVehicle} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1A73E8', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{s.savingVehicle ? 'Guardando…' : 'Guardar y elegir'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => updatePlaza(activePlaza, 'showNewVehicleForm', true)} style={{ paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ color: '#1A73E8', fontWeight: '600' }}>+ Añadir vehículo nuevo</Text>
              </Pressable>
            )}
          </>
        ) : s.companionVehicleConfirmed ? (
          // Plaza 1+: card de vehículo confirmado (igual que saved vehicle en plaza 0)
          <Pressable
            onPress={() => updatePlaza(activePlaza, 'companionVehicleConfirmed', false)}
            style={{
              borderRadius: 12, padding: 14, marginBottom: 16,
              backgroundColor: '#111',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 20 }}>🚐</Text>
              <View>
                <Text style={{ fontWeight: '700', fontSize: 14, color: '#fff' }}>
                  {s.companionVehicle.alias || [s.companionVehicle.brand, s.companionVehicle.model].filter(Boolean).join(' ') || 'Vehículo acompañante'}
                </Text>
                <Text style={{ color: '#ccc', fontSize: 12 }}>{s.companionVehicle.plate}</Text>
              </View>
            </View>
            <Text style={{ color: '#aaa', fontSize: 12 }}>Editar</Text>
          </Pressable>
        ) : (
          // Plaza 1+: formulario libre para el vehículo del acompañante (no se guarda en BD)
          <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, gap: 8, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
              Datos del vehículo del acompañante. No se guardarán en tu perfil.
            </Text>
            <TextInput
              value={s.companionVehicle.brand}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'brand', v)}
              placeholder="Marca (opcional)"
              style={input}
              autoCapitalize="words"
            />
            <TextInput
              value={s.companionVehicle.model}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'model', v)}
              placeholder="Modelo (opcional)"
              style={input}
            />
            <TextInput
              value={s.companionVehicle.plate}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'plate', v)}
              placeholder="Matrícula *"
              style={input}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              value={s.companionVehicle.alias}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'alias', v)}
              placeholder="Alias (opcional)"
              style={input}
            />
            <TextInput
              value={s.companionVehicle.length_m}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'length_m', v)}
              placeholder="Longitud en metros (opcional)"
              style={input}
              keyboardType="decimal-pad"
            />
            <Pressable
              onPress={() => {
                if (!s.companionVehicle.plate.trim()) {
                  Alert.alert('Matrícula requerida', 'Indica la matrícula del vehículo.');
                  return;
                }
                updatePlaza(activePlaza, 'companionVehicleConfirmed', true);
              }}
              style={{ backgroundColor: '#111', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Listo ✓</Text>
            </Pressable>
          </View>
        )}

        {/* ── CONTADORES ── */}
        <Text style={groupLabel}>Huéspedes de esta plaza</Text>
        <View style={card}>
          <CounterRow
            label="Viajeros"
            subtitle="Mín. 1. Se cobra extra a partir del 3º."
            value={s.numGuests}
            min={1}
            onDecrement={() => changeNumGuests(activePlaza, -1)}
            onIncrement={() => changeNumGuests(activePlaza, +1)}
          />
          <View style={divider} />
          <CounterRow
            label="Mascotas"
            subtitle={petExtra ? `Suplemento: ${formatCents(petExtra.unit_amount_cents)} / mascota / noche` : undefined}
            value={s.numPets}
            min={0}
            onDecrement={() => updatePlaza(activePlaza, 'numPets', Math.max(0, s.numPets - 1))}
            onIncrement={() => updatePlaza(activePlaza, 'numPets', s.numPets + 1)}
          />
        </View>

        {/* At-limit warning */}
        {atLimit && (
          <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#F59E0B', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: '#92400E', marginBottom: 4 }}>Plaza al máximo.</Text>
              <Text style={{ color: '#78350F', fontSize: 13 }}>¿Faltan personas por añadir?</Text>
              <Pressable onPress={addPlaza} style={{ marginTop: 10, backgroundColor: '#111', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>+ Añadir plaza</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── DATOS DE LOS VIAJEROS ── */}
        <Text style={[groupLabel, { marginTop: 8 }]}>Datos de los viajeros</Text>
        <Text style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          Necesarios para el registro SES. Mantén esta información actualizada.
        </Text>

        {s.guests.map((g, gi) => {
          const isTitular = activePlaza === 0 && gi === 0;
          return (
            <View key={gi} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#111' }} />
                <Text style={{ fontWeight: '700', fontSize: 14 }}>
                  {isTitular ? 'Titular — ' : ''}Viajero {gi + 1}
                </Text>
              </View>

              {/* Nombre */}
              <Text style={fieldLabel}>Nombre completo *</Text>
              <TextInput
                value={g.full_name}
                onChangeText={v => updateGuest(activePlaza, gi, 'full_name', v)}
                placeholder="Nombre y apellidos"
                autoCapitalize="words"
                style={input}
              />

              {/* Tipo de documento */}
              <Text style={fieldLabel}>Tipo de documento *</Text>
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

              {/* Nº documento */}
              <Text style={fieldLabel}>Nº documento *</Text>
              <TextInput
                value={g.doc_number}
                onChangeText={v => updateGuest(activePlaza, gi, 'doc_number', v)}
                placeholder={g.doc_type === 'passport' ? 'Nº pasaporte' : 'DNI / NIE'}
                autoCapitalize="characters"
                autoCorrect={false}
                style={input}
              />

              {/* Nº soporte */}
              <Text style={fieldLabel}>Nº soporte (opcional)</Text>
              <TextInput
                value={g.doc_support_number}
                onChangeText={v => updateGuest(activePlaza, gi, 'doc_support_number', v)}
                placeholder="Nº en el reverso del documento"
                autoCapitalize="characters"
                autoCorrect={false}
                style={input}
              />

              {/* Fecha de nacimiento */}
              <Text style={fieldLabel}>Fecha de nacimiento * (DD/MM/AAAA)</Text>
              <TextInput
                value={g.birth_date}
                onChangeText={v => updateGuest(activePlaza, gi, 'birth_date', v)}
                placeholder="DD/MM/AAAA"
                keyboardType="numbers-and-punctuation"
                style={input}
              />

              {/* Género */}
              <Text style={fieldLabel}>Género</Text>
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
                    <Text style={{ fontWeight: '600', fontSize: 11, color: g.gender === val ? '#1A73E8' : '#555' }}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Nacionalidad */}
              <Text style={fieldLabel}>Nacionalidad *</Text>
              <TextInput
                value={g.nationality}
                onChangeText={v => updateGuest(activePlaza, gi, 'nationality', v)}
                placeholder="ES"
                autoCapitalize="characters"
                autoCorrect={false}
                style={input}
              />

              {/* País de residencia */}
              <Text style={fieldLabel}>País de residencia</Text>
              <TextInput
                value={g.country_of_residence}
                onChangeText={v => updateGuest(activePlaza, gi, 'country_of_residence', v)}
                placeholder="España"
                autoCapitalize="words"
                style={input}
              />

              {/* Localidad */}
              <Text style={fieldLabel}>Localidad</Text>
              <TextInput
                value={g.city_of_residence}
                onChangeText={v => updateGuest(activePlaza, gi, 'city_of_residence', v)}
                placeholder="Ciudad o municipio"
                autoCapitalize="words"
                style={input}
              />

              {/* Teléfono */}
              <Text style={fieldLabel}>Teléfono</Text>
              <TextInput
                value={g.phone}
                onChangeText={v => updateGuest(activePlaza, gi, 'phone', v)}
                placeholder="+34 600 000 000"
                keyboardType="phone-pad"
                style={input}
              />

              {/* Email */}
              <Text style={fieldLabel}>Email</Text>
              <TextInput
                value={g.email}
                onChangeText={v => updateGuest(activePlaza, gi, 'email', v)}
                placeholder="correo@ejemplo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={input}
              />
            </View>
          );
        })}

        {/* ── ELECTRICIDAD ── */}
        <Text style={groupLabel}>Electricidad</Text>
        <View style={[card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 15 }}>Contratar electricidad</Text>
            {powerExtra && (
              <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                Suplemento: {formatCents(powerExtra.unit_amount_cents)} / noche
              </Text>
            )}
          </View>
          <Switch
            value={s.electricidad}
            onValueChange={v => updatePlaza(activePlaza, 'electricidad', v)}
            trackColor={{ true: '#1A73E8', false: '#E5E7EB' }}
            thumbColor="#fff"
          />
        </View>

        {/* ── BOTÓN ── */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => ({
            backgroundColor: '#111', paddingVertical: 16, borderRadius: 14,
            alignItems: 'center', marginTop: 8, opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {isLastPlaza ? 'Confirmar y elegir fechas →' : 'Siguiente plaza →'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterRow({
  label, subtitle, value, min, onDecrement, onIncrement,
}: {
  label: string; subtitle?: string; value: number; min: number;
  onDecrement: () => void; onIncrement: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '500' }}>{label}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable onPress={onDecrement} disabled={value <= min} style={counterBtn}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: value <= min ? '#CCC' : '#111' }}>−</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>{value}</Text>
        <Pressable onPress={onIncrement} style={counterBtn}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const card = {
  backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16,
  shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
};
const groupLabel = { fontSize: 12, fontWeight: '700' as const, color: '#888', textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8 };
const fieldLabel = { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 };
const input = { backgroundColor: '#F2F4F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };
const divider = { height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 };
const counterBtn = { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F4F8', alignItems: 'center' as const, justifyContent: 'center' as const };
