// app/checkout.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Button,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import dayjs from 'dayjs';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents, NIGHTLY_CENTS } from '@/components/utils/money';

type UserProfile = {
  full_name: string;
  phone: string;
  dni: string;
  license_plate: string;
};

export default function CheckoutScreen() {
  const router = useRouter();
  const { session } = useAuth();

  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Validar parámetros básicos
  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;

  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;
  const totalCents = nights * NIGHTLY_CENTS;

  useEffect(() => {
    // Si faltan parámetros o son inválidos, volvemos a Search
    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/search') },
      ]);
      return;
    }

    if (!session?.user?.id) {
      Alert.alert('Sesión no válida', 'Inicia sesión de nuevo.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/sign-in') },
      ]);
      return;
    }

    // Cargar snapshot del perfil para pre-rellenar la reserva
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('full_name, phone, dni, license_plate')
          .eq('user_id', session.user.id)
          .single();

        if (error) throw error;
        setProfile(data as UserProfile);
      } catch (e) {
        console.warn('Error cargando perfil', e);
        Alert.alert(
          'Error',
          'No se ha podido cargar tu perfil. Revisa tus datos en la pestaña Perfil.',
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [session?.user?.id, start, end, nights, router]);

  const handleConfirm = async () => {
    if (!session?.user?.id) {
      Alert.alert('Sesión no válida', 'Inicia sesión de nuevo.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/sign-in') },
      ]);
      return;
    }

    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.');
      return;
    }

    setSaving(true);
    try {
      console.log('[checkout] creando reserva con:', {
        user_id: session.user.id,
        start_date: startDate,
        end_date: endDate,
        nights,
        totalCents,
      });

      const { data, error } = await supabase
        .from('reservations')
        .insert({
          user_id: session.user.id,
          place_id: null, // se asignará más adelante
          start_date: startDate,
          end_date: endDate,
          status: 'pending',
          full_name: 'Sin nombre', // de momento hardcodeado
          phone: '',
          dni: '',
          license_plate: '',
          nightly_amount_cents: NIGHTLY_CENTS,
          total_amount_cents: totalCents,
        })
        .select()
        .single(); // 👈 fuerza a devolver la fila insertada

      console.log('[checkout] resultado insert:', { data, error });

      if (error) {
        console.warn('[checkout] error insert reserva:', error);
        Alert.alert('Error', 'No se ha podido crear la reserva (insert).');
        return;
      }

      if (!data) {
        // Si data es null aquí, casi seguro que es un tema de RLS
        Alert.alert(
          'Error',
          'No se ha podido crear la reserva (sin datos devueltos). Revisa las políticas RLS.',
        );
        return;
      }

      Alert.alert(
        'Reserva creada',
        `Reserva #${data.id} creada en estado pendiente.`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/index') }],
      );
    } catch (e: any) {
      console.warn('[checkout] excepción creando reserva:', e);
      Alert.alert('Error', 'Ha ocurrido un error al crear la reserva.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (!profile) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <Text>No se ha podido cargar tu perfil.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>
        Resumen de reserva
      </Text>

      <View style={{ gap: 4 }}>
        <Text>Entrada: {start?.format('DD/MM/YYYY')}</Text>
        <Text>Salida: {end?.format('DD/MM/YYYY')}</Text>
        <Text>Noches: {nights}</Text>
        <Text>Precio por noche: {formatCents(NIGHTLY_CENTS)}</Text>
        <Text style={{ fontWeight: '600' }}>
          Total estimado: {formatCents(totalCents)}
        </Text>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Tus datos</Text>
        <Text>Nombre: {profile.full_name}</Text>
        <Text>DNI: {profile.dni}</Text>
        <Text>Teléfono: {profile.phone}</Text>
        <Text>Matrícula: {profile.license_plate}</Text>
        <Text style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
          Estos datos se guardan como snapshot en la reserva.
        </Text>
      </View>

      {/* Aquí más adelante: selección de extras (mascota, electricidad, acompañantes, etc.) */}

      <Button
        title={saving ? 'Guardando...' : 'Confirmar reserva'}
        onPress={handleConfirm}
        disabled={saving || nights <= 0}
      />
    </ScrollView>
  );
}
