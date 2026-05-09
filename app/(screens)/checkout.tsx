import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents, NIGHTLY_CENTS } from '@/components/utils/money';
import {
  Vehicle,
  isValidLengthMeters,
  isValidSpanishPlate,
  normalizePlate,
  parseLengthMeters,
  vehicleDisplayName,
} from '@/components/utils/vehicle';
import ParkingMapPicker from '@/components/ParkingMapPicker';

type UserProfile = {
  full_name: string;
  phone: string;
  dni: string;
};

type Extra = {
  id: number;
  code: 'PET' | 'POWER' | 'PERSON' | string;
  name_es: string;
  unit_amount_cents: number;
  is_active: boolean;
  pricing_type: 'per_night' | string;
};

type Place = { id: number; name: string };

const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };

export default function CheckoutScreen() {
  const { session } = useAuth();

  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    dni: '',
    phone: '',
  });
  const setField = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    null,
  );
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    brand: '',
    model: '',
    plate: '',
    alias: '',
    length_m: '',
  });
  const [savingVehicle, setSavingVehicle] = useState(false);
  const setNewVehicleField = (
    key: keyof typeof newVehicle,
    value: string,
  ) => setNewVehicle((p) => ({ ...p, [key]: value }));

  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<
    Record<number, number>
  >({});

  // Place selection state (replaces numPlaces stepper)
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [occupiedPlaceIds, setOccupiedPlaceIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);

  const numPlaces = selectedPlaceIds.length;

  const [nightlyCents, setNightlyCents] = useState<number>(NIGHTLY_CENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;
  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;

  const baseTotal = nights * nightlyCents * numPlaces;
  const isToggle = (e: Extra) => e.code === 'POWER';
  const maxUnits = (e: Extra) => (isToggle(e) ? 1 : 4);

  function calcLineTotal(
    units: number,
    nights: number,
    unitAmountCents: number,
  ) {
    return units * nights * unitAmountCents;
  }

  const extrasTotal = useMemo(
    () =>
      extras.reduce((sum, e) => {
        const units = extraQuantities[e.id] ?? 0;
        const lineTotal = (e: Extra, units: number) =>
          units * nights * e.unit_amount_cents;
        return sum + lineTotal(e, units);
      }, 0),
    [extras, extraQuantities, nights],
  );

  const finalTotal = baseTotal + extrasTotal;

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      setPlacesLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const [
          pricingRes,
          profileRes,
          vehiclesRes,
          extrasRes,
          placesRes,
          occupiedRes,
        ] = await Promise.all([
          supabase
            .from('pricing')
            .select('nightly_amount_cents')
            .eq('active', true)
            .single(),
          supabase
            .from('user_profiles')
            .select('full_name, phone, dni')
            .eq('user_id', session.user.id)
            .single(),
          supabase
            .from('vehicles')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('extras')
            .select('id, code, name_es, unit_amount_cents, is_active, pricing_type')
            .eq('is_active', true)
            .order('id'),
          supabase
            .from('places')
            .select('id, name')
            .eq('is_active', true)
            .order('id'),
          supabase
            .from('reservations')
            .select('place_ids')
            .neq('status', 'cancelled')
            .eq('payment_status', 'paid')
            .lt('start_date', endDate)
            .gt('end_date', startDate),
        ]);

        if (pricingRes.data)
          setNightlyCents(pricingRes.data.nightly_amount_cents);

        const profileData = profileRes.data;
        let fullName = profileData?.full_name ?? '';
        if (!fullName) {
          const meta = session.user.user_metadata;
          const first = (meta?.first_name ?? meta?.given_name ?? '') as string;
          const last = (meta?.last_name ?? meta?.family_name ?? '') as string;
          fullName = [first, last].filter(Boolean).join(' ');
        }
        setProfile(
          profileData ? { ...profileData, full_name: fullName } : null,
        );
        setForm({
          full_name: fullName ?? '',
          dni: profileData?.dni ?? '',
          phone: profileData?.phone ?? '',
        });

        const vList = (vehiclesRes.data ?? []) as Vehicle[];
        setVehicles(vList);
        if (vList.length === 1) setSelectedVehicleId(vList[0].id);

        if (extrasRes.data) {
          const sorted = [...(extrasRes.data as Extra[])].sort(
            (a, b) => (EXTRA_ORDER[a.code] ?? 9) - (EXTRA_ORDER[b.code] ?? 9),
          );
          setExtras(sorted);
        }

        setAllPlaces((placesRes.data ?? []) as Place[]);

        const occupied = new Set<number>();
        for (const r of occupiedRes.data ?? []) {
          for (const pid of (r.place_ids as number[]) ?? []) {
            occupied.add(pid);
          }
        }
        setOccupiedPlaceIds(occupied);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
        setPlacesLoading(false);
      }
    };

    loadData();
  }, [session?.user?.id, session?.user?.user_metadata, startDate, endDate]);

  if (!session) return <RequireAuthCard />;
  if (loading)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  if (!profile)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text>No se pudo cargar tu perfil.</Text>
      </SafeAreaView>
    );

  const handleConfirm = async () => {
    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.');
      return;
    }

    if (selectedPlaceIds.length === 0) {
      Alert.alert(
        'Elige una plaza',
        'Selecciona al menos una plaza para continuar.',
      );
      return;
    }

    const fullNameToUse = profile.full_name
      ? profile.full_name
      : form.full_name.trim();
    const dniToUse = profile.dni ? profile.dni : form.dni.trim();
    const phoneToUse = form.phone.trim();

    if (!fullNameToUse || !dniToUse || !phoneToUse) {
      Alert.alert(
        'Perfil incompleto',
        'Completa tu nombre, DNI y teléfono antes de reservar.',
      );
      return;
    }

    const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
    if (!vehicle) {
      Alert.alert(
        'Vehículo no seleccionado',
        'Selecciona el vehículo con el que vas a acampar (o añade uno nuevo).',
      );
      return;
    }

    setSaving(true);
    try {
      const { error: upErr } = await supabase.from('user_profiles').upsert(
        {
          user_id: session.user.id,
          full_name: fullNameToUse,
          dni: dniToUse,
          phone: phoneToUse,
        },
        { onConflict: 'user_id' },
      );

      if (upErr) {
        Alert.alert('Error', upErr.message ?? 'No se pudo guardar tu perfil.');
        return;
      }

      const extrasPayload = extras
        .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
        .map((e) => {
          const units = extraQuantities[e.id] ?? 0;
          return {
            extra_id: e.id,
            quantity: units,
            pricing_type: 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: calcLineTotal(units, nights, e.unit_amount_cents),
          };
        });

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            start_date: startDate,
            end_date: endDate,
            num_places: selectedPlaceIds.length,
            place_ids: selectedPlaceIds,
            full_name: fullNameToUse,
            phone: phoneToUse,
            dni: dniToUse,
            vehicle_id: vehicle.id,
            vehicle_brand: vehicle.brand,
            vehicle_model: vehicle.model,
            vehicle_plate: vehicle.plate,
            vehicle_alias: vehicle.alias ?? '',
            vehicle_length_m: vehicle.length_m,
            nightly_amount_cents: nightlyCents,
            extras: extrasPayload,
          },
        },
      );

      if (fnError) {
        Alert.alert('Error', fnError.message ?? 'No se pudo iniciar el pago.');
        return;
      }
      if (!fnData?.url) {
        Alert.alert('Error', 'Respuesta inválida al iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Ha ocurrido un problema al crear la reserva.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 32,
          backgroundColor: '#F8F9FC',
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          Resumen de tu reserva
        </Text>

        {/* Estancia */}
        <View style={card}>
          <Text style={sectionTitle}>Estancia</Text>
          <Text>Entrada: {start?.format('DD/MM/YYYY')}</Text>
          <Text>Salida: {end?.format('DD/MM/YYYY')}</Text>
          <Text>Noches: {nights}</Text>
          <Text>Precio por noche: {formatCents(nightlyCents)}</Text>
        </View>

        {/* Selección de plaza */}
        <View style={card}>
          <Text style={sectionTitle}>Elige tus plazas</Text>
          <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            {formatCents(nightlyCents)} × {nights} noche
            {nights !== 1 ? 's' : ''} × plaza
          </Text>

          {placesLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : (
            <ParkingMapPicker
              places={allPlaces}
              occupiedIds={occupiedPlaceIds}
              selectedIds={selectedPlaceIds}
              onToggle={(id) =>
                setSelectedPlaceIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((x) => x !== id)
                    : [...prev, id],
                )
              }
            />
          )}

          {selectedPlaceIds.length > 0 && (
            <Text style={{ marginTop: 12, color: '#333', fontWeight: '600' }}>
              {selectedPlaceIds.length} plaza
              {selectedPlaceIds.length !== 1 ? 's' : ''} →{' '}
              {formatCents(nights * nightlyCents * selectedPlaceIds.length)}
            </Text>
          )}
        </View>

        {/* Tus datos */}
        <View style={card}>
          <Text style={sectionTitle}>Tus datos</Text>

          <Text style={{ marginTop: 6, color: '#666' }}>Nombre</Text>
          {profile.full_name ? (
            <Text>{profile.full_name || '—'}</Text>
          ) : (
            <TextInput
              value={form.full_name}
              onChangeText={(t) => setField('full_name', t)}
              placeholder="Nombre y apellidos"
              autoCapitalize="words"
              style={input}
            />
          )}

          <Text style={{ marginTop: 12, color: '#666' }}>DNI</Text>
          {profile.dni ? (
            <Text>{profile.dni || '—'}</Text>
          ) : (
            <TextInput
              value={form.dni}
              onChangeText={(t) => setField('dni', t)}
              placeholder="DNI"
              autoCapitalize="characters"
              style={input}
            />
          )}

          <Text style={{ marginTop: 12, color: '#666' }}>Teléfono</Text>
          <TextInput
            value={form.phone}
            onChangeText={(t) => setField('phone', t)}
            placeholder="Teléfono"
            keyboardType="phone-pad"
            style={input}
          />
        </View>

        {/* Vehículo */}
        <View style={card}>
          <Text style={sectionTitle}>Vehículo</Text>
          {vehicles.length === 0 && !showNewVehicleForm && (
            <Text style={{ color: '#666', marginBottom: 10 }}>
              Aún no tienes vehículos guardados. Añade uno para continuar.
            </Text>
          )}

          {vehicles.map((v) => {
            const selected = selectedVehicleId === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => setSelectedVehicleId(v.id)}
                style={{
                  borderWidth: 2,
                  borderColor: selected ? '#1A73E8' : '#E5E7EB',
                  backgroundColor: selected ? '#EAF1FE' : '#fff',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 15 }}>
                  {vehicleDisplayName(v)}
                </Text>
                <Text style={{ color: '#555', fontSize: 13 }}>
                  {v.brand} {v.model}
                </Text>
                <Text
                  style={{
                    color: '#1A73E8',
                    fontWeight: '700',
                    marginTop: 2,
                    letterSpacing: 1,
                  }}
                >
                  {v.plate}
                </Text>
              </Pressable>
            );
          })}

          {showNewVehicleForm ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 12,
                padding: 12,
                gap: 8,
                backgroundColor: '#FAFBFD',
              }}
            >
              <Text style={{ fontWeight: '700' }}>Nuevo vehículo</Text>
              <TextInput
                value={newVehicle.brand}
                onChangeText={(t) => setNewVehicleField('brand', t)}
                placeholder="Marca *"
                style={input}
                autoCapitalize="words"
              />
              <TextInput
                value={newVehicle.model}
                onChangeText={(t) => setNewVehicleField('model', t)}
                placeholder="Modelo *"
                style={input}
              />
              <TextInput
                value={newVehicle.plate}
                onChangeText={(t) => setNewVehicleField('plate', t)}
                placeholder="Matrícula * (1234ABC)"
                style={input}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                value={newVehicle.alias}
                onChangeText={(t) => setNewVehicleField('alias', t)}
                placeholder="Alias (opcional)"
                style={input}
              />
              <TextInput
                value={newVehicle.length_m}
                onChangeText={(t) => setNewVehicleField('length_m', t)}
                placeholder="Longitud en metros (opcional)"
                style={input}
                keyboardType="decimal-pad"
              />
              <View
                style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}
              >
                <Pressable
                  onPress={() => {
                    setShowNewVehicleForm(false);
                    setNewVehicle({
                      brand: '',
                      model: '',
                      plate: '',
                      alias: '',
                      length_m: '',
                    });
                  }}
                  disabled={savingVehicle}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#ddd',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  disabled={savingVehicle}
                  onPress={async () => {
                    if (!session?.user?.id) return;
                    if (!newVehicle.brand.trim()) {
                      Alert.alert('Marca obligatoria', 'Indica la marca.');
                      return;
                    }
                    if (!newVehicle.model.trim()) {
                      Alert.alert('Modelo obligatorio', 'Indica el modelo.');
                      return;
                    }
                    if (!isValidSpanishPlate(newVehicle.plate)) {
                      Alert.alert(
                        'Matrícula inválida',
                        'Formato esperado: 1234ABC.',
                      );
                      return;
                    }
                    if (!isValidLengthMeters(newVehicle.length_m)) {
                      Alert.alert(
                        'Longitud inválida',
                        'Indica un valor entre 0 y 20 metros.',
                      );
                      return;
                    }
                    setSavingVehicle(true);
                    const payload = {
                      user_id: session.user.id,
                      brand: newVehicle.brand.trim(),
                      model: newVehicle.model.trim(),
                      plate: normalizePlate(newVehicle.plate),
                      alias: newVehicle.alias.trim() || null,
                      length_m: parseLengthMeters(newVehicle.length_m),
                    };
                    const { data, error } = await supabase
                      .from('vehicles')
                      .insert(payload)
                      .select('*')
                      .single();
                    setSavingVehicle(false);
                    if (error) {
                      if ((error as any).code === '23505') {
                        Alert.alert(
                          'Matrícula duplicada',
                          'Ya tienes un vehículo con esa matrícula.',
                        );
                        return;
                      }
                      Alert.alert('Error', error.message);
                      return;
                    }
                    const inserted = data as Vehicle;
                    setVehicles((prev) => [...prev, inserted]);
                    setSelectedVehicleId(inserted.id);
                    setShowNewVehicleForm(false);
                    setNewVehicle({
                      brand: '',
                      model: '',
                      plate: '',
                      alias: '',
                      length_m: '',
                    });
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: '#1A73E8',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '700' }}>
                    {savingVehicle ? 'Guardando…' : 'Guardar y elegir'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowNewVehicleForm(true)}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: '#1A73E8',
                borderStyle: 'dashed',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <Text style={{ color: '#1A73E8', fontWeight: '700' }}>
                + Añadir vehículo nuevo
              </Text>
            </Pressable>
          )}
        </View>

        {/* Extras */}
        <View style={card}>
          <Text style={sectionTitle}>Extras adicionales</Text>
          {extras.map((extra) => {
            const qty = extraQuantities[extra.id] ?? 0;
            const toggle = isToggle(extra);
            const maxQty = maxUnits(extra);
            const lt = calcLineTotal(qty, nights, extra.unit_amount_cents);

            return (
              <View
                key={extra.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '500' }}>
                    {extra.name_es}
                  </Text>
                  <Text style={{ color: '#555' }}>
                    {formatCents(extra.unit_amount_cents)} / noche
                  </Text>
                  {extra.code === 'PERSON' && (
                    <Text style={{ fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' }}>
                      {numPlaces > 0
                        ? `${numPlaces * 2} persona${numPlaces * 2 !== 1 ? 's' : ''} incluida${numPlaces * 2 !== 1 ? 's' : ''} (2 por plaza). Añade aquí el excedente.`
                        : 'Incluye 2 personas por plaza. Añade solo las que superen ese límite.'}
                    </Text>
                  )}
                  {qty > 0 && (
                    <Text style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
                      {toggle
                        ? `Activado × ${nights} noche(s) → ${formatCents(lt)}`
                        : `${qty} ud. × ${nights} noche(s) → ${formatCents(lt)}`}
                    </Text>
                  )}
                </View>

                {toggle ? (
                  <Pressable
                    onPress={() =>
                      setExtraQuantities((prev) => ({
                        ...prev,
                        [extra.id]: prev[extra.id] === 1 ? 0 : 1,
                      }))
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: '#F2F4F8',
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: qty === 1 ? '#1A73E8' : '#999',
                        backgroundColor: qty === 1 ? '#1A73E8' : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {qty === 1 && (
                        <Text
                          style={{
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: '700',
                            lineHeight: 16,
                          }}
                        >
                          ✓
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontWeight: '600' }}>
                      {qty === 1 ? 'Sí' : 'No'}
                    </Text>
                  </Pressable>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.max(0, (prev[extra.id] ?? 0) - 1),
                        }))
                      }
                      style={smallBtn}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '800' }}>−</Text>
                    </Pressable>
                    <Text style={{ minWidth: 18, textAlign: 'center' }}>
                      {qty}
                    </Text>
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.min(
                            maxQty,
                            (prev[extra.id] ?? 0) + 1,
                          ),
                        }))
                      }
                      style={smallBtn}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '800' }}>+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Total final */}
        <View style={card}>
          <Text style={sectionTitle}>Total</Text>
          <Text>
            Base ({numPlaces} plaza{numPlaces !== 1 ? 's' : ''}):{' '}
            {formatCents(baseTotal)}
          </Text>
          <Text>Extras: {formatCents(extrasTotal)}</Text>
          <Text style={{ fontWeight: '800', marginTop: 8, fontSize: 16 }}>
            Total final: {formatCents(finalTotal)}
          </Text>
        </View>

        {/* Botón confirmar */}
        <Pressable
          onPress={handleConfirm}
          disabled={saving}
          style={{
            backgroundColor: '#1A73E8',
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: 'center',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
            {saving ? 'Procesando…' : 'Confirmar reserva'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// Estilos inline
const card = {
  backgroundColor: '#fff',
  padding: 16,
  borderRadius: 16,
  marginBottom: 16,
  elevation: 2,
};
const sectionTitle = {
  fontSize: 18,
  fontWeight: '600' as const,
  marginBottom: 8,
};
const smallBtn = {
  width: 34,
  height: 34,
  borderRadius: 10,
  backgroundColor: '#F2F4F8',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
const input = {
  backgroundColor: '#F2F4F8',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginTop: 6,
};
