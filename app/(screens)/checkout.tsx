// app/(flow)/reservation-checkout.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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

type Extra = {
  id: number;
  code: 'PET' | 'POWER' | 'PERSON' | string;
  name_es: string;
  unit_amount_cents: number;
  is_active: boolean;
  pricing_type: 'per_night' | string;
};

export default function CheckoutScreen() {
  const { session } = useAuth();

  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<
    Record<number, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Campos del perfil editables directamente en checkout
  const [fullName, setFullName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');

  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;

  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;

  const baseTotal = nights * NIGHTLY_CENTS;
  const isToggleExtra = (e: Extra) => e.code === 'POWER';
  const maxUnitsForExtra = (e: Extra) => (isToggleExtra(e) ? 1 : 4);
  const lineTotalCents = (e: Extra, units: number) =>
    units * nights * e.unit_amount_cents;

  const extrasTotal = useMemo(() => {
    return extras.reduce((sum, e) => {
      const units = extraQuantities[e.id] ?? 0;
      return sum + units * nights * e.unit_amount_cents;
    }, 0);
  }, [extras, extraQuantities, nights]);

  const finalTotal = baseTotal + extrasTotal;

  // ✅ El botón se habilita solo cuando todos los campos están rellenos
  const profileComplete =
    fullName.trim().length >= 2 &&
    dni.trim().length > 0 &&
    phone.trim().length > 0 &&
    licensePlate.trim().length > 0;

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
          .maybeSingle();

        if (profileData) {
          setFullName(profileData.full_name ?? '');
          setDni(profileData.dni ?? '');
          setPhone(profileData.phone ?? '');
          setLicensePlate(profileData.license_plate ?? '');
        }

        const { data: extrasData } = await supabase
          .from('extras')
          .select(
            'id, code, name_es, unit_amount_cents, is_active, pricing_type',
          )
          .eq('is_active', true)
          .order('id');

        if (extrasData) setExtras(extrasData as Extra[]);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session?.user?.id]);

  if (!session) return <RequireAuthCard />;

  if (loading)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );

  const handleConfirm = async () => {
    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.');
      return;
    }

    if (!profileComplete) return;

    setSaving(true);

    try {
      // 1) Upsert perfil y esperar confirmación antes de continuar
      const profilePayload = {
        user_id: session.user.id,
        full_name: fullName.trim(),
        phone: phone.trim(),
        dni: dni.trim().toUpperCase(),
        license_plate: licensePlate.trim().toUpperCase(),
      };

      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert(profilePayload, { onConflict: 'user_id' });

      if (profileError) {
        console.warn('[checkout] profileError:', profileError);
        Alert.alert('Error', 'No se pudieron guardar tus datos de perfil.');
        return; // ← para aquí, no continúa
      }

      // 2) Solo si el perfil se guardó OK, buscar plaza
      const { data: placeData, error: placeError } = await supabase.rpc(
        'get_first_available_place',
        {
          p_start_date: startDate,
          p_end_date: endDate,
        },
      );

      if (placeError) {
        console.warn('[checkout] placeError:', placeError);
        Alert.alert('Error', 'No se pudo comprobar disponibilidad de plazas.');
        return;
      }

      if (!placeData) {
        Alert.alert(
          'Sin plazas disponibles',
          'No hay plazas libres para las fechas seleccionadas. Por favor elige otras fechas.',
        );
        return;
      }

      const assignedPlaceId = placeData as number;

      // 3) Solo si hay plaza, crear reserva
      const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          user_id: session.user.id,
          place_id: assignedPlaceId,
          start_date: startDate,
          end_date: endDate,
          status: 'pending',
          full_name: fullName.trim(),
          phone: phone.trim(),
          dni: dni.trim().toUpperCase(),
          license_plate: licensePlate.trim().toUpperCase(),
          nightly_amount_cents: NIGHTLY_CENTS,
          total_amount_cents: finalTotal,
        })
        .select()
        .single();

      if (reservationError || !reservation) {
        console.warn('[checkout] reservationError:', reservationError);
        Alert.alert('Error', 'No se ha podido crear la reserva.');
        return;
      }

      // 4) Solo si la reserva existe, insertar extras
      const extrasToInsert = extras
        .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
        .map((e) => {
          const units = extraQuantities[e.id] ?? 0;
          return {
            reservation_id: reservation.id,
            extra_id: e.id,
            quantity: units,
            pricing_type: 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: lineTotalCents(e, units),
          };
        });

      if (extrasToInsert.length > 0) {
        const { error: extrasErr } = await supabase
          .from('reservation_extras')
          .insert(extrasToInsert);

        if (extrasErr) {
          console.warn('[checkout] extrasErr:', extrasErr);
          Alert.alert('Error', 'No se han podido guardar los extras.');
          return;
        }
      }

      // 5) Solo si todo lo anterior fue OK, abrir Stripe
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        { body: { reservation_id: Number(reservation.id) } },
      );

      if (fnError) {
        console.warn('[checkout] fnError:', fnError);
        Alert.alert(
          'Error',
          fnError.message ?? 'No se ha podido iniciar el pago.',
        );
        return;
      }

      if (!fnData?.url) {
        Alert.alert('Error', 'Respuesta inválida al iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);
    } catch (e) {
      console.warn('[checkout] catch:', e);
      Alert.alert('Error', 'Ha ocurrido un problema al crear la reserva.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
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
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Estancia</Text>
            <Text>Entrada: {start?.format('DD/MM/YYYY')}</Text>
            <Text>Salida: {end?.format('DD/MM/YYYY')}</Text>
            <Text>Noches: {nights}</Text>
            <Text>Precio por noche: {formatCents(NIGHTLY_CENTS)}</Text>
            <Text style={{ fontWeight: '700', marginTop: 8 }}>
              Total base: {formatCents(baseTotal)}
            </Text>
          </View>

          {/* Tus datos */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tus datos</Text>

            {!profileComplete && (
              <Text style={styles.profileWarning}>
                ⚠️ Completa todos los campos para poder confirmar la reserva.
              </Text>
            )}

            <Text style={styles.fieldLabel}>Nombre completo *</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre y apellidos"
              style={[styles.input, !fullName.trim() && styles.inputError]}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>DNI / NIE *</Text>
            <TextInput
              value={dni}
              onChangeText={setDni}
              placeholder="12345678Z"
              style={[styles.input, !dni.trim() && styles.inputError]}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Teléfono *</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+34 600 000 000"
              style={[styles.input, !phone.trim() && styles.inputError]}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Matrícula *</Text>
            <TextInput
              value={licensePlate}
              onChangeText={setLicensePlate}
              placeholder="1234ABC"
              style={[styles.input, !licensePlate.trim() && styles.inputError]}
              autoCapitalize="characters"
            />
          </View>

          {/* Extras */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Extras adicionales</Text>

            {extras.map((extra) => {
              const qty = extraQuantities[extra.id] ?? 0;
              const isToggle = isToggleExtra(extra);
              const maxQty = maxUnitsForExtra(extra);
              const lineTotal = lineTotalCents(extra, qty);

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
                      <Text
                        style={{ fontSize: 12, color: '#777', marginTop: 2 }}
                      >
                        {isToggle
                          ? `Activado × ${nights} noche(s) → ${formatCents(lineTotal)}`
                          : `${qty} unidad(es) × ${nights} noche(s) → ${formatCents(lineTotal)}`}
                      </Text>
                    )}
                  </View>

                  {isToggle ? (
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
                          backgroundColor:
                            qty === 1 ? '#1A73E8' : 'transparent',
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
                        style={styles.qtyBtn}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
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
                        style={styles.qtyBtn}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Total */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Total</Text>
            <Text>Base: {formatCents(baseTotal)}</Text>
            <Text>Extras: {formatCents(extrasTotal)}</Text>
            <Text style={{ fontWeight: '800', marginTop: 8 }}>
              Total final: {formatCents(finalTotal)}
            </Text>
          </View>

          {/* Botón confirmar — deshabilitado si perfil incompleto */}
          <Pressable
            onPress={handleConfirm}
            disabled={saving || !profileComplete}
            style={{
              backgroundColor: profileComplete ? '#1A73E8' : '#b0bec5',
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: 'center',
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
              {saving
                ? 'Procesando…'
                : !profileComplete
                  ? 'Completa tus datos'
                  : 'Confirmar reserva'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = {
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  profileWarning: {
    color: '#e53935',
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '600' as const,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15,
    color: '#111',
  },
  inputError: {
    borderColor: '#ffcdd2',
    backgroundColor: '#fff8f8',
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F2F4F8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
};
