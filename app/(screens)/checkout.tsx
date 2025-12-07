// app/(flow)/reservation-checkout.tsx  (o donde lo tengas)
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  name_es: string;
  unit_amount_cents: number;
  is_active: boolean;
};

export default function CheckoutScreen() {
  const router = useRouter();
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

  // 🔢 TOTAL EXTRAS: precio_noche * nº_noches_extra (NO * noches_totales)
  const extrasTotal = extras.reduce((sum, e) => {
    const qty = extraQuantities[e.id] ?? 0; // nº de noches que quiero ese extra
    return sum + qty * e.unit_amount_cents;
  }, 0);

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
          .select('*')
          .eq('is_active', true)
          .order('id');

        if (extrasData) setExtras(extrasData);
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
        Alert.alert('Error', 'No se ha podido crear la reserva.');
        return;
      }

      // 2) extras seleccionados
      const extrasToInsert = extras
        .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
        .map((e) => {
          const qty = extraQuantities[e.id]; // nº de noches para ese extra
          return {
            reservation_id: reservation.id,
            extra_id: e.id,
            quantity: qty,
            pricing_type: 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: e.unit_amount_cents * qty, // 👈 SOLO qty, nada de * nights
          };
        });

      if (extrasToInsert.length > 0) {
        await supabase.from('reservation_extras').insert(extrasToInsert);
      }

      // 3) ir a success
      router.replace({
        pathname: '/(screens)/success',
        params: {
          nights,
          total: finalTotal,
          startDate,
          endDate,
          extras: JSON.stringify(
            extras
              .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
              .map((e) => ({
                name: e.name_es,
                nights: extraQuantities[e.id],
              })),
          ),
        },
      });
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
            const qty = extraQuantities[extra.id] ?? 0;

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
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '500' }}>
                    {extra.name_es}
                  </Text>
                  <Text style={{ color: '#555' }}>
                    {formatCents(extra.unit_amount_cents)} / noche
                  </Text>
                  {qty > 0 && (
                    <Text style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
                      {qty} noche(s) →{' '}
                      {formatCents(qty * extra.unit_amount_cents)}
                    </Text>
                  )}
                </View>

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
                        [extra.id]: Math.max(0, qty - 1),
                      }))
                    }
                    style={{
                      backgroundColor: '#EEE',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                    }}
                  >
                    <Text>-</Text>
                  </Pressable>

                  <Text style={{ width: 28, textAlign: 'center' }}>{qty}</Text>

                  <Pressable
                    onPress={() =>
                      setExtraQuantities((prev) => ({
                        ...prev,
                        [extra.id]: Math.min(nights, qty + 1),
                      }))
                    }
                    style={{
                      backgroundColor: '#EEE',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                    }}
                  >
                    <Text>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Text style={{ fontWeight: '700', marginTop: 8 }}>
            Total extras: {formatCents(extrasTotal)}
          </Text>
        </View>

        {/* Total final */}
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          Total final: {formatCents(finalTotal)}
        </Text>

        {/* Botón confirmar */}
        <Pressable
          onPress={handleConfirm}
          disabled={saving}
          style={{
            backgroundColor: '#1A73E8',
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: 'center',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>
              Confirmar reserva
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
