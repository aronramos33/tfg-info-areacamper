import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
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
import { validateDoc } from '@/components/utils/validation';
import {
  Vehicle,
  isValidSpanishPlate,
  normalizePlate,
  vehicleDisplayName,
} from '@/components/utils/vehicle';
import { formatCents } from '@/components/utils/money';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import StepProgress from '@/components/StepProgress';
import { AppAlert } from '@/components/AppAlert';

const PHONE_PREFIXES = [
  { flag: '🇪🇸', code: '+34', label: 'España' },
  { flag: '🇩🇪', code: '+49', label: 'Alemania' },
  { flag: '🇮🇹', code: '+39', label: 'Italia' },
  { flag: '🇬🇧', code: '+44', label: 'Reino Unido' },
  { flag: '🇨🇭', code: '+41', label: 'Suiza' },
  { flag: '🇫🇷', code: '+33', label: 'Francia' },
] as const;

function parsePhone(value: string): { prefix: string; digits: string } {
  for (const p of PHONE_PREFIXES) {
    if (value.startsWith(p.code)) {
      return { prefix: p.code, digits: value.slice(p.code.length).trimStart() };
    }
  }
  return { prefix: '+34', digits: value };
}

function isoToBirthDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function profileGenderToGuest(g: string | null): GuestDraft['gender'] {
  if (g === 'male') return 'm';
  if (g === 'female') return 'f';
  if (g === 'other') return 'other';
  return '';
}

function isAdult(birthDate: string): boolean {
  const m = birthDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const birth = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (isNaN(birth.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return birth <= cutoff;
}

function maxBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
}

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  pricing_type: 'per_night' | string;
};

type LocalPlaceState = {
  selectedVehicleId: number | null;
  showNewVehicleForm: boolean;
  newVehicle: { brand: string; model: string; plate: string; alias: string };
  savingVehicle: boolean;
  companionVehicle: { brand: string; model: string; plate: string; alias: string };
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
    newVehicle: { brand: '', model: '', plate: '', alias: '' },
    savingVehicle: false,
    companionVehicle: { brand: '', model: '', plate: '', alias: '' },
    companionVehicleConfirmed: false,
    numGuests: 1,
    numPets: 0,
    electricidad: false,
    guests: [emptyGuest()],
  };
}

function parseBirthDate(s: string): Date {
  if (!s) return new Date();
  const [dd, mm, yyyy] = s.split('/').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dateToBirthString(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
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
  const [showBirthPicker, setShowBirthPicker] = useState<{ plaza: number; guest: number } | null>(null);
  const profileApplied = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const numPlaces = pending.numPlaces;

  useEffect(() => {
    if (!session?.user?.id) return;
    async function load() {
      const [vehiclesRes, extrasRes, profileRes] = await Promise.all([
        supabase.from('vehicles').select('*').eq('user_id', session!.user.id).order('created_at', { ascending: true }),
        supabase.from('extras').select('id,code,name_es,unit_amount_cents,pricing_type').eq('is_active', true),
        supabase.from('user_profiles').select('birth_date, gender').eq('user_id', session!.user.id).maybeSingle(),
      ]);
      const profileExtras = profileRes.data as { birth_date: string | null; gender: string | null } | null;

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

      if (!profileApplied.current && profile && states[0].guests[0].full_name === '') {
        profileApplied.current = true;
        states[0].guests[0] = {
          ...emptyGuest(),
          full_name: profile.full_name ?? '',
          doc_number: profile.dni ?? '',
          phone: profile.phone ?? '',
          email: session?.user?.email ?? '',
          birth_date: profileExtras?.birth_date ? isoToBirthDate(profileExtras.birth_date) : '',
          gender: profileGenderToGuest(profileExtras?.gender ?? null),
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
    AppAlert.alert('Eliminar plaza', `¿Eliminar la Plaza ${idx + 1}?`, [
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
    if (!nv.brand.trim()) { AppAlert.alert('Marca obligatoria'); return; }
    if (!nv.model.trim()) { AppAlert.alert('Modelo obligatorio'); return; }
    if (!isValidSpanishPlate(nv.plate)) { AppAlert.alert('Matrícula inválida', 'Formato esperado: 1234ABC.'); return; }
    updatePlaza(plazaIdx, 'savingVehicle', true);
    const { data, error } = await supabase.from('vehicles').insert({
      user_id: session.user.id,
      brand: nv.brand.trim(),
      model: nv.model.trim(),
      plate: normalizePlate(nv.plate),
      alias: nv.alias.trim() || null,
      length_m: null,
    }).select('*').single();

    updatePlaza(plazaIdx, 'savingVehicle', false);
    if (error) {
      AppAlert.alert('Error', (error as any).code === '23505' ? 'Ya tienes ese vehículo registrado.' : error.message);
      return;
    }
    const inserted = data as Vehicle;
    setVehicles(prev => [...prev, inserted]);
    setPlaceStates(prev => prev.map((s, i) => i === plazaIdx
      ? { ...s, selectedVehicleId: inserted.id, showNewVehicleForm: false, savingVehicle: false, newVehicle: { brand: '', model: '', plate: '', alias: '' } }
      : s));
  };

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });

  const validatePlaza = (idx: number): boolean => {
    const s = placeStates[idx];
    const plazaLabel = placeStates.length > 1 ? `Plaza ${idx + 1} — ` : '';

    if (idx === 0) {
      if (!s.selectedVehicleId) {
        AppAlert.alert('Vehículo requerido', `${plazaLabel}Selecciona tu vehículo para continuar.`);
        return false;
      }
    } else {
      if (!s.companionVehicle.plate.trim()) {
        AppAlert.alert('Matrícula requerida', `${plazaLabel}Indica la matrícula del vehículo del acompañante.`);
        return false;
      }
      if (!isValidSpanishPlate(s.companionVehicle.plate)) {
        AppAlert.alert('Matrícula inválida', `${plazaLabel}Formato esperado: 1234ABC.`);
        return false;
      }
    }

    for (let j = 0; j < s.guests.length; j++) {
      const g = s.guests[j];
      const label = `${plazaLabel}Viajero ${j + 1}`;

      if (!g.full_name.trim()) {
        AppAlert.alert('Nombre requerido', `${label}: indica el nombre completo.`);
        return false;
      }
      const docErr = validateDoc(g.doc_type, g.doc_number);
      if (docErr) {
        AppAlert.alert('Documento inválido', `${label}: ${docErr}`);
        return false;
      }
      if (!g.birth_date.trim()) {
        AppAlert.alert('Fecha requerida', `${label}: indica la fecha de nacimiento.`);
        return false;
      }
      if (!isAdult(g.birth_date)) {
        AppAlert.alert('Edad mínima', `${label}: el viajero debe tener al menos 18 años.`);
        return false;
      }
      if (g.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) {
        AppAlert.alert('Email inválido', `${label}: el email no tiene un formato válido.`);
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validatePlaza(activePlaza)) return;

    if (activePlaza < placeStates.length - 1) {
      setActivePlaza(activePlaza + 1);
      scrollToTop();
      return;
    }

    // Última plaza — re-valida todas por si el usuario volvió atrás y cambió algo
    for (let i = 0; i < placeStates.length - 1; i++) {
      if (!validatePlaza(i)) {
        setActivePlaza(i);
        return;
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
    router.push('/(main)/reservations/date-picker');
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const s = placeStates[activePlaza];
  if (!s) return null;

  const isLastPlaza = activePlaza === placeStates.length - 1;
  const isMainPlaza = activePlaza === 0;
  const atLimit = s.numGuests >= 6;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StepProgress current={2} />
      {/* Header */}
      <View style={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.xs, paddingBottom: spacing.sm }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Text style={{ ...typography.titleSm, color: colors.secondary }}>‹ Volver</Text>
        </Pressable>
        <Text style={{ ...typography.titleLg, marginTop: 4 }}>Configurar tus plazas</Text>
      </View>

      {/* Plaza tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm, flexWrap: 'wrap' }}>
        {placeStates.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => { setActivePlaza(i); scrollToTop(); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full,
              backgroundColor: activePlaza === i ? colors.primary : colors.surfaceContainerHigh,
            }}
          >
            <Text style={{ ...typography.titleSm, color: activePlaza === i ? colors.onPrimary : colors.onSurface }}>
              Plaza {i + 1}
            </Text>
            {placeStates.length > 1 && (
              <Pressable onPress={() => removePlaza(i)} hitSlop={8}>
                <Text style={{ color: activePlaza === i ? colors.onPrimary : colors.onSurfaceVariant, fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' }}>×</Text>
              </Pressable>
            )}
          </Pressable>
        ))}
        <Pressable
          onPress={addPlaza}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full, borderWidth: 1.5, borderColor: colors.secondary, borderStyle: 'dashed' }}
        >
          <Text style={{ ...typography.titleSm, color: colors.secondary }}>+ Añadir plaza</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingBottom: 40 }}>

        {/* ── VEHÍCULO ── */}
        <Text style={groupLabel}>Vehículo</Text>

        {isMainPlaza ? (
          <>
            {vehicles.map(v => {
              const sel = s.selectedVehicleId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => updatePlaza(activePlaza, 'selectedVehicleId', v.id)}
                  style={{
                    borderRadius: radii.md, padding: 14, marginBottom: 8,
                    backgroundColor: sel ? colors.primary : colors.surfaceContainerLow,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    ...shadow.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="car-outline" size={20} color={sel ? colors.onPrimary : colors.onSurface} />
                    <View>
                      <Text style={{ ...typography.titleSm, color: sel ? colors.onPrimary : colors.onSurface }}>
                        {vehicleDisplayName(v)}
                      </Text>
                      <Text style={{ ...typography.bodyMd, color: sel ? 'rgba(255,255,255,0.7)' : colors.onSurfaceVariant }}>
                        {v.plate}
                      </Text>
                    </View>
                  </View>
                  {sel && <Ionicons name="checkmark" size={18} color={colors.onPrimary} />}
                </Pressable>
              );
            })}

            {s.showNewVehicleForm ? (
              <View style={{ borderWidth: 1, borderColor: colors.outline, borderRadius: radii.md, padding: spacing.md, gap: 8, marginBottom: 8, backgroundColor: colors.surfaceContainerLow }}>
                <Text style={typography.titleSm}>Nuevo vehículo</Text>
                <TextInput value={s.newVehicle.brand} onChangeText={v => updateNewVehicleField(activePlaza, 'brand', v)} placeholder="Marca *" placeholderTextColor={colors.onSurfaceVariant} style={input} autoCapitalize="words" />
                <TextInput value={s.newVehicle.model} onChangeText={v => updateNewVehicleField(activePlaza, 'model', v)} placeholder="Modelo *" placeholderTextColor={colors.onSurfaceVariant} style={input} />
                <TextInput value={s.newVehicle.plate} onChangeText={v => updateNewVehicleField(activePlaza, 'plate', v)} placeholder="Matrícula * (1234ABC)" placeholderTextColor={colors.onSurfaceVariant} style={input} autoCapitalize="characters" autoCorrect={false} />
                <TextInput value={s.newVehicle.alias} onChangeText={v => updateNewVehicleField(activePlaza, 'alias', v)} placeholder="Alias (opcional)" placeholderTextColor={colors.onSurfaceVariant} style={input} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => updatePlaza(activePlaza, 'showNewVehicleForm', false)} disabled={s.savingVehicle} style={{ flex: 1, paddingVertical: 10, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', backgroundColor: colors.surfaceContainerHigh }}>
                    <Text style={typography.titleSm}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={() => saveNewVehicle(activePlaza)} disabled={s.savingVehicle} style={{ flex: 1, paddingVertical: 10, borderRadius: radii.sm, backgroundColor: colors.primary, alignItems: 'center' }}>
                    <Text style={{ ...typography.titleSm, color: colors.onPrimary }}>{s.savingVehicle ? 'Guardando…' : 'Guardar y elegir'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => updatePlaza(activePlaza, 'showNewVehicleForm', true)} style={{ paddingVertical: 12, borderRadius: radii.md, alignItems: 'center', marginBottom: spacing.lg, borderWidth: 1.5, borderColor: colors.secondary, borderStyle: 'dashed' }}>
                <Text style={{ ...typography.titleSm, color: colors.secondary }}>+ Añadir vehículo nuevo</Text>
              </Pressable>
            )}
          </>
        ) : s.companionVehicleConfirmed ? (
          <Pressable
            onPress={() => updatePlaza(activePlaza, 'companionVehicleConfirmed', false)}
            style={{
              borderRadius: radii.md, padding: 14, marginBottom: spacing.lg,
              backgroundColor: colors.primary,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              ...shadow.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="car-outline" size={20} color={colors.onPrimary} />
              <View>
                <Text style={{ ...typography.titleSm, color: colors.onPrimary }}>
                  {s.companionVehicle.alias || [s.companionVehicle.brand, s.companionVehicle.model].filter(Boolean).join(' ') || 'Vehículo acompañante'}
                </Text>
                <Text style={{ ...typography.bodyMd, color: 'rgba(255,255,255,0.7)' }}>{s.companionVehicle.plate}</Text>
              </View>
            </View>
            <Text style={{ ...typography.bodyMd, color: 'rgba(255,255,255,0.65)' }}>Editar</Text>
          </Pressable>
        ) : (
          <View style={{ borderWidth: 1, borderColor: colors.outline, borderRadius: radii.md, padding: spacing.md, gap: 8, marginBottom: spacing.lg, backgroundColor: colors.surfaceContainerLow }}>
            <Text style={{ ...typography.bodyMd, marginBottom: 4 }}>
              Datos del vehículo del acompañante. No se guardarán en tu perfil.
            </Text>
            <TextInput
              value={s.companionVehicle.brand}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'brand', v)}
              placeholder="Marca (opcional)"
              placeholderTextColor={colors.onSurfaceVariant}
              style={input}
              autoCapitalize="words"
            />
            <TextInput
              value={s.companionVehicle.model}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'model', v)}
              placeholder="Modelo (opcional)"
              placeholderTextColor={colors.onSurfaceVariant}
              style={input}
            />
            <TextInput
              value={s.companionVehicle.plate}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'plate', v)}
              placeholder="Matrícula *"
              placeholderTextColor={colors.onSurfaceVariant}
              style={input}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              value={s.companionVehicle.alias}
              onChangeText={v => updateCompanionVehicle(activePlaza, 'alias', v)}
              placeholder="Alias (opcional)"
              placeholderTextColor={colors.onSurfaceVariant}
              style={input}
            />
            <Pressable
              onPress={() => {
                if (!s.companionVehicle.plate.trim()) {
                  AppAlert.alert('Matrícula requerida', 'Indica la matrícula del vehículo.');
                  return;
                }
                updatePlaza(activePlaza, 'companionVehicleConfirmed', true);
              }}
              style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radii.sm, alignItems: 'center', marginTop: 4 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ ...typography.titleSm, color: colors.onPrimary, lineHeight: 18 }}>Listo</Text>
                <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
              </View>
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
          <View style={{ backgroundColor: colors.warningContainer, borderRadius: radii.md, padding: 14, marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.warning, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Ionicons name="warning-outline" size={18} color={colors.warningText} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.titleSm, color: colors.warningText, marginBottom: 4 }}>Plaza al máximo.</Text>
              <Text style={{ ...typography.bodyMd, color: colors.warningText }}>¿Faltan personas por añadir?</Text>
              <Pressable onPress={addPlaza} style={{ marginTop: 10, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: radii.sm, alignItems: 'center' }}>
                <Text style={{ ...typography.titleSm, color: colors.onPrimary }}>+ Añadir plaza</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── DATOS DE LOS VIAJEROS ── */}
        <Text style={[groupLabel, { marginTop: 8 }]}>Datos de los viajeros</Text>
        <Text style={{ ...typography.bodyMd, marginBottom: 12 }}>
          Necesarios para el registro SES. Mantén esta información actualizada.
        </Text>

        {s.guests.map((g, gi) => {
          const isTitular = activePlaza === 0 && gi === 0;
          return (
            <View key={gi} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                <Text style={typography.titleSm}>
                  {isTitular ? 'Titular — ' : ''}Viajero {gi + 1}
                </Text>
              </View>

              {/* Nombre */}
              <Text style={fieldLabel}>Nombre completo *</Text>
              <TextInput
                value={g.full_name}
                onChangeText={v => updateGuest(activePlaza, gi, 'full_name', v)}
                placeholder="Nombre y apellidos"
                placeholderTextColor={colors.onSurfaceVariant}
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
                      flex: 1, paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1.5,
                      borderColor: g.doc_type === type ? colors.secondary : colors.outline,
                      backgroundColor: g.doc_type === type ? colors.secondaryContainer : colors.inputSurface,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ ...typography.labelMd, color: g.doc_type === type ? colors.onSecondaryContainer : colors.onSurface }}>
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
                placeholderTextColor={colors.onSurfaceVariant}
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
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="characters"
                autoCorrect={false}
                style={input}
              />

              {/* Fecha de nacimiento */}
              <Text style={fieldLabel}>Fecha de nacimiento *</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={parseBirthDate(g.birth_date)}
                  mode="date"
                  display="compact"
                  maximumDate={maxBirthDate()}
                  onChange={(_: DateTimePickerEvent, date?: Date) => {
                    if (date) updateGuest(activePlaza, gi, 'birth_date', dateToBirthString(date));
                  }}
                  style={{ alignSelf: 'flex-start', marginBottom: 4 }}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowBirthPicker({ plaza: activePlaza, guest: gi })}
                    style={[input, { justifyContent: 'center' }]}
                  >
                    <Text style={{ ...typography.bodyLg, color: g.birth_date ? colors.onSurface : colors.onSurfaceVariant }}>
                      {g.birth_date || 'Seleccionar fecha'}
                    </Text>
                  </Pressable>
                  {showBirthPicker?.plaza === activePlaza && showBirthPicker?.guest === gi && (
                    <DateTimePicker
                      value={parseBirthDate(g.birth_date)}
                      mode="date"
                      display="default"
                      maximumDate={maxBirthDate()}
                      onChange={(_: DateTimePickerEvent, date?: Date) => {
                        setShowBirthPicker(null);
                        if (date) updateGuest(activePlaza, gi, 'birth_date', dateToBirthString(date));
                      }}
                    />
                  )}
                </>
              )}
              {g.birth_date.trim() !== '' && !isAdult(g.birth_date) && (
                <Text style={{ ...typography.bodyMd, color: colors.error, marginTop: 4 }}>
                  El viajero debe tener al menos 18 años.
                </Text>
              )}

              {/* Género */}
              <Text style={fieldLabel}>Género</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                {([['m', 'Hombre'], ['f', 'Mujer'], ['other', 'Otro']] as const).map(([val, label]) => (
                  <Pressable
                    key={val}
                    onPress={() => updateGuest(activePlaza, gi, 'gender', val)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1.5,
                      borderColor: g.gender === val ? colors.secondary : colors.outline,
                      backgroundColor: g.gender === val ? colors.secondaryContainer : colors.inputSurface,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ ...typography.labelMd, color: g.gender === val ? colors.onSecondaryContainer : colors.onSurface }}>
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
                placeholderTextColor={colors.onSurfaceVariant}
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
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="words"
                style={input}
              />

              {/* Localidad */}
              <Text style={fieldLabel}>Localidad</Text>
              <TextInput
                value={g.city_of_residence}
                onChangeText={v => updateGuest(activePlaza, gi, 'city_of_residence', v)}
                placeholder="Ciudad o municipio"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="words"
                style={input}
              />

              {/* Teléfono */}
              <Text style={fieldLabel}>Teléfono</Text>
              <PhoneInput
                value={g.phone}
                onChange={v => updateGuest(activePlaza, gi, 'phone', v)}
              />

              {/* Email */}
              <Text style={fieldLabel}>Email</Text>
              <TextInput
                value={g.email}
                onChangeText={v => updateGuest(activePlaza, gi, 'email', v)}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={colors.onSurfaceVariant}
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
            <Text style={typography.titleSm}>Contratar electricidad</Text>
            {powerExtra && (
              <Text style={{ ...typography.bodyMd, marginTop: 2 }}>
                Suplemento: {formatCents(powerExtra.unit_amount_cents)} / noche
              </Text>
            )}
          </View>
          <Switch
            value={s.electricidad}
            onValueChange={v => updatePlaza(activePlaza, 'electricidad', v)}
            trackColor={{ true: colors.primary, false: colors.outline }}
            thumbColor={colors.onPrimary}
          />
        </View>

        {/* ── BOTÓN ── */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            paddingVertical: 16,
            borderRadius: radii.md,
            alignItems: 'center',
            marginTop: 8,
            opacity: pressed ? 0.7 : 1,
            ...shadow.sm,
          })}
        >
          <Text style={{ ...typography.titleMd, color: colors.onPrimary }}>
            {isLastPlaza ? 'Confirmar y elegir fechas →' : 'Siguiente plaza →'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const { prefix, digits } = parsePhone(value);
  const prefixObj = PHONE_PREFIXES.find(p => p.code === prefix) ?? PHONE_PREFIXES[0];

  return (
    <>
      <View style={[input, { flexDirection: 'row', alignItems: 'center', padding: 0, overflow: 'hidden' }]}>
        <Pressable
          onPress={() => setOpen(v => !v)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 10,
            borderRightWidth: 1, borderRightColor: colors.outline,
          }}
        >
          <Text style={{ fontSize: 16 }}>{prefixObj.flag}</Text>
          <Text style={{ ...typography.bodyLg, color: colors.onSurface, minWidth: 32 }}>{prefix}</Text>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 9 }}>▾</Text>
        </Pressable>
        <TextInput
          value={digits}
          onChangeText={t => onChange(prefix + ' ' + t.trimStart())}
          placeholder="600 000 000"
          placeholderTextColor={colors.onSurfaceVariant}
          keyboardType="phone-pad"
          style={{
            flex: 1,
            ...typography.bodyLg,
            color: colors.onSurface,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />
      </View>
      {open && (
        <View style={{
          borderWidth: 1, borderColor: colors.outline, borderRadius: radii.sm,
          backgroundColor: colors.inputSurface, marginTop: 4,
          overflow: 'hidden', ...shadow.sm,
        }}>
          {PHONE_PREFIXES.map((p, idx) => (
            <Pressable
              key={p.code}
              onPress={() => { onChange(p.code + ' ' + digits.trim()); setOpen(false); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11,
                backgroundColor: p.code === prefix
                  ? colors.secondaryContainer
                  : pressed ? colors.surfaceContainerHigh : 'transparent',
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: colors.outlineVariant,
              })}
            >
              <Text style={{ fontSize: 18 }}>{p.flag}</Text>
              <Text style={{ ...typography.bodyLg, flex: 1, color: colors.onSurface }}>{p.label}</Text>
              <Text style={typography.bodyMd}>{p.code}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
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
        <Text style={typography.bodyLg}>{label}</Text>
        {subtitle && <Text style={{ ...typography.bodyMd, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable onPress={onDecrement} disabled={value <= min} style={counterBtn}>
          <Ionicons name="remove" size={20} color={value <= min ? colors.outline : colors.primary} />
        </Pressable>
        <Text style={{ ...typography.titleLg, minWidth: 24, textAlign: 'center' }}>{value}</Text>
        <Pressable onPress={onIncrement} style={counterBtn}>
          <Ionicons name="add" size={20} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const card = {
  backgroundColor: colors.surfaceContainerLow,
  padding: spacing.lg,
  borderRadius: radii.md,
  marginBottom: spacing.lg,
  ...shadow.sm,
};

const groupLabel = {
  ...typography.labelSm,
  marginBottom: spacing.sm,
};

const fieldLabel = {
  ...typography.labelLg,
  marginTop: 10,
  marginBottom: 4,
};

const input = {
  backgroundColor: colors.inputSurface,
  borderWidth: 1,
  borderColor: colors.outline,
  borderRadius: radii.sm,
  paddingHorizontal: 12,
  paddingVertical: 10,
  ...typography.bodyLg,
  color: colors.onSurface,
};

const divider = {
  height: 1,
  backgroundColor: colors.outlineVariant,
  marginVertical: 8,
};

const counterBtn = {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: colors.surfaceContainerHigh,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
