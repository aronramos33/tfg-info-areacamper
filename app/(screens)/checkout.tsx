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

type UserProfile = {
  full_name: string;
  phone: string;
  dni: string;
  license_plate: string;
};

type Extra = {
  id: number;
  code: 'PET' | 'POWER' | 'PERSON' | string;
  name_es: string;
  unit_amount_cents: number;
  is_active: boolean;
  pricing_type: 'per_night' | string;
};

const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };

export default function CheckoutScreen() {
  const { session } = useAuth();

  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ✅ Form editable (phone + plate siempre; name + dni solo si faltan)
  const [form, setForm] = useState({
    full_name: '',
    dni: '',
    phone: '',
    license_plate: '',
  });
  const setField = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<
    Record<number, number>
  >({});
  const [numPlaces, setNumPlaces] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;
  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;

  const baseTotal = nights * NIGHTLY_CENTS * numPlaces;
  const isToggle = (e: Extra) => e.code === 'POWER';
  const maxUnits = (e: Extra) => (isToggle(e) ? 1 : 4);

  // Fuera del componente, como función pura (sin dependencias de hooks)
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
      return;
    }

    const loadData = async () => {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('full_name, phone, dni, license_plate')
          .eq('user_id', session.user.id)
          .single();

        // Si full_name está vacío intenta construirlo desde first/last name
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

        // ✅ Inicializa el form con lo que haya (o vacío)
        setForm({
          full_name: fullName ?? '',
          dni: profileData?.dni ?? '',
          phone: profileData?.phone ?? '',
          license_plate: profileData?.license_plate ?? '',
        });

        const { data: extrasData } = await supabase
          .from('extras')
          .select(
            'id, code, name_es, unit_amount_cents, is_active, pricing_type',
          )
          .eq('is_active', true)
          .order('id');

        if (extrasData) {
          const sorted = [...(extrasData as Extra[])].sort(
            (a, b) => (EXTRA_ORDER[a.code] ?? 9) - (EXTRA_ORDER[b.code] ?? 9),
          );
          setExtras(sorted);
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session?.user?.id, session?.user?.user_metadata]);

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

    // ✅ Validación según reglas: phone+plate siempre; name+dni solo si faltan en perfil
    const fullNameToUse = profile.full_name
      ? profile.full_name
      : form.full_name.trim();
    const dniToUse = profile.dni ? profile.dni : form.dni.trim();
    const phoneToUse = form.phone.trim();
    const plateToUse = form.license_plate.trim();

    if (!fullNameToUse || !dniToUse || !phoneToUse || !plateToUse) {
      Alert.alert(
        'Perfil incompleto',
        'Completa tu nombre, DNI, teléfono y matrícula antes de reservar.',
      );
      return;
    }

    setSaving(true);
    try {
      // ✅ Persistir cambios en BD antes de pagar
      const { error: upErr } = await supabase.from('user_profiles').upsert(
        {
          user_id: session.user.id,
          full_name: fullNameToUse,
          dni: dniToUse,
          phone: phoneToUse,
          license_plate: plateToUse,
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
            num_places: numPlaces,
            full_name: fullNameToUse,
            phone: phoneToUse,
            dni: dniToUse,
            license_plate: plateToUse,
            nightly_amount_cents: NIGHTLY_CENTS,
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
          <Text>Precio por noche: {formatCents(NIGHTLY_CENTS)}</Text>
        </View>

        {/* Número de plazas */}
        <View style={card}>
          <Text style={sectionTitle}>Número de plazas</Text>
          <Text style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            {formatCents(NIGHTLY_CENTS)} × {nights} noche
            {nights !== 1 ? 's' : ''} × plaza
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable
              onPress={() => setNumPlaces((n) => Math.max(1, n - 1))}
              style={counterBtn}
            >
              <Text style={counterBtnText}>−</Text>
            </Pressable>
            <Text
              style={{
                fontSize: 26,
                fontWeight: '800',
                minWidth: 32,
                textAlign: 'center',
              }}
            >
              {numPlaces}
            </Text>
            <Pressable
              onPress={() => setNumPlaces((n) => n + 1)}
              style={counterBtn}
            >
              <Text style={counterBtnText}>+</Text>
            </Pressable>
            <Text style={{ color: '#666', fontSize: 14 }}>
              = {formatCents(nights * NIGHTLY_CENTS * numPlaces)}
            </Text>
          </View>
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

          <Text style={{ marginTop: 12, color: '#666' }}>Matrícula</Text>
          <TextInput
            value={form.license_plate}
            onChangeText={(t) => setField('license_plate', t)}
            placeholder="Matrícula"
            autoCapitalize="characters"
            style={input}
          />
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
const counterBtn = {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: '#F2F4F8',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
const counterBtnText = { fontSize: 22, fontWeight: '800' as const };
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
