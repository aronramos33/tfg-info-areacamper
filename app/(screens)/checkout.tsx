// app/(flow)/reservation-checkout.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
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
  pricing_type: 'per_night' | string; // ya los 3 son per_night
};

export default function CheckoutScreen() {
  const { session } = useAuth();

  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<
    Record<number, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fechas y noches
  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;

  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;

  const baseTotal = nights * NIGHTLY_CENTS;

  // Reglas por code
  // - POWER (Electricidad): checkbox sí/no (0/1)
  // - PET (Mascota): unidades hasta 4
  // - PERSON (Acompañante): unidades hasta 4
  const isToggleExtra = (e: Extra) => e.code === 'POWER';
  const maxUnitsForExtra = (e: Extra) => (isToggleExtra(e) ? 1 : 4);

  // ✅ total de línea = unidades * noches * precio_noche
  const lineTotalCents = (e: Extra, units: number) =>
    units * nights * e.unit_amount_cents;

  const extrasTotal = useMemo(() => {
    return extras.reduce((sum, e) => {
      const units = extraQuantities[e.id] ?? 0;
      return sum + units * nights * e.unit_amount_cents;
    }, 0);
  }, [extras, extraQuantities, nights]);

  const finalTotal = baseTotal + extrasTotal;

  // Cargar perfil + extras
  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // perfil
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('full_name, phone, dni, license_plate')
          .eq('user_id', session.user.id)
          .single();

        setProfile(profileData);

        // extras activos
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

  if (!profile)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text>No se pudo cargar tu perfil.</Text>
      </SafeAreaView>
    );

  // Confirmar reserva
  const handleConfirm = async () => {
    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.');
      return;
    }

    setSaving(true);

    try {
      // 1) reserva principal
      const { data: reservation, error } = await supabase
        .from('reservations')
        .insert({
          user_id: session.user.id,
          place_id: null,
          start_date: startDate,
          end_date: endDate,
          status: 'pending',
          full_name: profile.full_name,
          phone: profile.phone,
          dni: profile.dni,
          license_plate: profile.license_plate,
          nightly_amount_cents: NIGHTLY_CENTS,
          total_amount_cents: finalTotal,
        })
        .select()
        .single();

      if (error || !reservation) {
        console.warn(error);
        Alert.alert('Error', 'No se ha podido crear la reserva.');
        return;
      }

      // 2) extras seleccionados
      const extrasToInsert = extras
        .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
        .map((e) => {
          const units = extraQuantities[e.id] ?? 0;

          return {
            reservation_id: reservation.id,
            extra_id: e.id,
            quantity: units, // ✅ unidades (mascotas/acomp.) o 0/1 electricidad
            pricing_type: 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: lineTotalCents(e, units), // ✅ unidades * noches
          };
        });

      if (extrasToInsert.length > 0) {
        const { error: extrasErr } = await supabase
          .from('reservation_extras')
          .insert(extrasToInsert);
        if (extrasErr) {
          console.warn(extrasErr);
          Alert.alert('Error', 'No se han podido guardar los extras.');
          return;
        }
      }

      // 3) Crear Checkout Session (Edge Function) y abrir Stripe Checkout
      const reservationIdNum = Number(reservation.id);

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: { reservation_id: reservationIdNum },
        },
      );

      if (fnError) {
        console.log('create-checkout-session error:', fnError);
        Alert.alert(
          'Error',
          fnError.message ?? 'No se ha podido iniciar el pago.',
        );
        return;
      }

      if (!fnData?.url) {
        console.log('create-checkout-session data:', fnData);
        Alert.alert('Error', 'Respuesta inválida al iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);

      // Nota: el usuario volverá por deep link a /success o /checkout (cancel)
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Ha ocurrido un problema al crear la reserva.');
    } finally {
      setSaving(false);
    }
  };

  // UI
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
        {/* Título */}
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
        <View
          style={{
            backgroundColor: '#fff',
            padding: 16,
            borderRadius: 16,
            marginBottom: 16,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Estancia
          </Text>
          <Text>Entrada: {start?.format('DD/MM/YYYY')}</Text>
          <Text>Salida: {end?.format('DD/MM/YYYY')}</Text>
          <Text>Noches: {nights}</Text>
          <Text>Precio por noche: {formatCents(NIGHTLY_CENTS)}</Text>
          <Text style={{ fontWeight: '700', marginTop: 8 }}>
            Total base: {formatCents(baseTotal)}
          </Text>
        </View>

        {/* Tus datos */}
        <View
          style={{
            backgroundColor: '#fff',
            padding: 16,
            borderRadius: 16,
            marginBottom: 16,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Tus datos
          </Text>
          <Text>Nombre: {profile.full_name}</Text>
          <Text>DNI: {profile.dni}</Text>
          <Text>Teléfono: {profile.phone}</Text>
          <Text>Matrícula: {profile.license_plate}</Text>
        </View>

        {/* Extras */}
        <View
          style={{
            backgroundColor: '#fff',
            padding: 16,
            borderRadius: 16,
            marginBottom: 16,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Extras adicionales
          </Text>

          {extras.map((extra) => {
            const qty = extraQuantities[extra.id] ?? 0; // unidades o 0/1
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
                    <Text style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
                      {isToggle ? (
                        <>
                          Activado × {nights} noche(s) →{' '}
                          {formatCents(lineTotal)}
                        </>
                      ) : (
                        <>
                          {qty} unidad(es) × {nights} noche(s) →{' '}
                          {formatCents(lineTotal)}
                        </>
                      )}
                    </Text>
                  )}
                </View>

                {/* Controles */}
                {isToggle ? (
                  // ✅ Electricidad checkbox Sí/No
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
                      {qty === 1 ? (
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
                      ) : null}
                    </View>

                    <Text style={{ fontWeight: '600' }}>
                      {qty === 1 ? 'Sí' : 'No'}
                    </Text>
                  </Pressable>
                ) : (
                  // ✅ Mascotas + Acompañante unidades hasta 4
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
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: '#F2F4F8',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
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
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: '#F2F4F8',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
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
        <View
          style={{
            backgroundColor: '#fff',
            padding: 16,
            borderRadius: 16,
            marginBottom: 16,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Total
          </Text>
          <Text>Base: {formatCents(baseTotal)}</Text>
          <Text>Extras: {formatCents(extrasTotal)}</Text>
          <Text style={{ fontWeight: '800', marginTop: 8 }}>
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
