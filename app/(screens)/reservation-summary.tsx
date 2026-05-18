import React, { useEffect, useMemo, useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents } from '@/components/utils/money';
import { vehicleDisplayName } from '@/components/utils/vehicle';

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  pricing_type: 'per_night' | 'per_stay' | string;
};

export default function ReservationSummaryScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { pending, setPending } = usePendingReservation();

  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const [holder, setHolder] = useState({
    full_name: '',
    phone: '',
    dni: '',
  });

  useEffect(() => {
    setHolder({
      full_name: pending.holder.full_name || profile?.full_name || '',
      phone: pending.holder.phone || profile?.phone || '',
      dni: pending.holder.dni || profile?.dni || '',
    });
  }, [profile]);

  useEffect(() => {
    supabase
      .from('extras')
      .select('id, code, name_es, unit_amount_cents, pricing_type')
      .eq('is_active', true)
      .then(({ data }) => {
        setExtras((data ?? []) as Extra[]);
        setLoading(false);
      });
  }, []);

  const nights = useMemo(
    () => nightsBetween(pending.startDate, pending.endDate),
    [pending.startDate, pending.endDate],
  );

  const baseTotal = nights * pending.nightlyCents * pending.selectedPlaceIds.length;

  const petExtra = extras.find(e => e.code === 'PET');
  const powerExtra = extras.find(e => e.code === 'POWER');

  const extrasTotal = useMemo(() => {
    return pending.placeConfigs.reduce((sum, cfg) => {
      let placeSum = 0;
      if (cfg.numPets > 0 && petExtra) {
        placeSum += petExtra.pricing_type === 'per_stay'
          ? cfg.numPets * petExtra.unit_amount_cents
          : cfg.numPets * nights * petExtra.unit_amount_cents;
      }
      if (cfg.electricidad && powerExtra) {
        placeSum += powerExtra.pricing_type === 'per_stay'
          ? powerExtra.unit_amount_cents
          : nights * powerExtra.unit_amount_cents;
      }
      return sum + placeSum;
    }, 0);
  }, [pending.placeConfigs, petExtra, powerExtra, nights]);

  const grandTotal = baseTotal + extrasTotal;

  const handlePay = async () => {
    if (!session) return;

    if (!holder.full_name.trim()) { Alert.alert('Nombre requerido', 'Indica el nombre del titular.'); return; }
    if (!holder.dni.trim()) { Alert.alert('Documento requerido', 'Indica el DNI/NIE/Pasaporte del titular.'); return; }
    if (!holder.phone.trim()) { Alert.alert('Teléfono requerido', 'Indica un teléfono de contacto.'); return; }

    setPending(prev => ({ ...prev, holder }));

    // Build flat extras payload (PET + POWER per place, no PERSON)
    const extrasPayload = pending.placeConfigs.flatMap((cfg, placeIndex) => {
      const rows: object[] = [];
      if (cfg.numPets > 0 && petExtra) {
        const lineTotal = petExtra.pricing_type === 'per_stay'
          ? cfg.numPets * petExtra.unit_amount_cents
          : cfg.numPets * nights * petExtra.unit_amount_cents;
        rows.push({
          extra_id: petExtra.id, quantity: cfg.numPets, place_index: placeIndex,
          pricing_type: petExtra.pricing_type,
          unit_amount_cents: petExtra.unit_amount_cents,
          line_total_cents: lineTotal,
        });
      }
      if (cfg.electricidad && powerExtra) {
        const lineTotal = powerExtra.pricing_type === 'per_stay'
          ? powerExtra.unit_amount_cents
          : nights * powerExtra.unit_amount_cents;
        rows.push({
          extra_id: powerExtra.id, quantity: 1, place_index: placeIndex,
          pricing_type: powerExtra.pricing_type,
          unit_amount_cents: powerExtra.unit_amount_cents,
          line_total_cents: lineTotal,
        });
      }
      return rows;
    });

    const firstCfg = pending.placeConfigs[0];
    const firstVehicle =
      firstCfg?.vehicleSelection?.type === 'saved'
        ? firstCfg.vehicleSelection.vehicle
        : null;

    setPaying(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            start_date: pending.startDate,
            end_date: pending.endDate,
            num_places: pending.selectedPlaceIds.length,
            place_ids: pending.selectedPlaceIds,
            full_name: holder.full_name.trim(),
            phone: holder.phone.trim(),
            dni: holder.dni.trim(),
            vehicle_id: firstVehicle?.id ?? null,
            vehicle_brand: firstVehicle?.brand ?? '',
            vehicle_model: firstVehicle?.model ?? '',
            vehicle_plate: firstVehicle?.plate ?? '',
            vehicle_alias: firstVehicle?.alias ?? '',
            vehicle_length_m: firstVehicle?.length_m ?? null,
            nightly_amount_cents: pending.nightlyCents,
            extras: extrasPayload,
          },
        },
      );

      if (fnError) {
        Alert.alert('Error', fnError.message ?? 'No se pudo iniciar el pago.');
        return;
      }
      if (!fnData?.url || !fnData?.session_id) {
        Alert.alert('Error', 'Respuesta inválida al iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);
      // The deep link (stripe-success → EXPO_GO_BASE_URL/success?session_id=...) handles
      // the navigation to success.tsx. No explicit push needed here.
    } catch {
      Alert.alert('Error', 'Ha ocurrido un problema al crear la reserva.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const start = dayjs(pending.startDate);
  const end = dayjs(pending.endDate);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4 }}>Resumen de la reserva</Text>
        <Text style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Revisa los datos antes de pagar.</Text>

        {/* Estancia */}
        <View style={card}>
          <Text style={sectionTitle}>Estancia</Text>
          <Row label="Entrada" value={start.format('DD/MM/YYYY')} />
          <Row label="Salida" value={end.format('DD/MM/YYYY')} />
          <Row label="Noches" value={String(nights)} />
          <Row
            label="Plazas"
            value={pending.selectedPlaceIds.sort((a, b) => a - b).map(id => `P${id}`).join(', ')}
          />
        </View>

        {/* Por plaza */}
        {pending.placeConfigs.map((cfg, i) => {
          const vehicle = cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle : null;
          return (
            <View key={i} style={card}>
              <Text style={sectionTitle}>Plaza {i + 1}</Text>
              {vehicle && <Row label="Vehículo" value={`${vehicleDisplayName(vehicle)} · ${vehicle.plate}`} />}
              <Row label="Acompañantes" value={String(cfg.numGuests)} />
              {cfg.numPets > 0 && <Row label="Mascotas" value={String(cfg.numPets)} />}
              {cfg.electricidad && <Row label="Electricidad" value="Sí" />}
              {cfg.guests.map((g, gi) => (
                <Row key={gi} label={gi === 0 && i === 0 ? 'Titular' : `Acompañante ${gi + 1}`} value={g.full_name} />
              ))}
            </View>
          );
        })}

        {/* Desglose */}
        <View style={card}>
          <Text style={sectionTitle}>Total</Text>
          <Row
            label={`Base (${pending.selectedPlaceIds.length} plaza${pending.selectedPlaceIds.length !== 1 ? 's' : ''} × ${nights} noche${nights !== 1 ? 's' : ''})`}
            value={formatCents(baseTotal)}
          />
          {extrasTotal > 0 && <Row label="Extras" value={formatCents(extrasTotal)} />}
          <View style={{ height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 }} />
          <Row label="Total" value={formatCents(grandTotal)} highlight />
        </View>

        {/* Titular */}
        <View style={card}>
          <Text style={sectionTitle}>Titular de la reserva</Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            Puedes modificar estos datos. No se guardarán en tu perfil.
          </Text>

          <Text style={fieldLabel}>Nombre completo *</Text>
          <TextInput value={holder.full_name} onChangeText={v => setHolder(h => ({ ...h, full_name: v }))} placeholder="Nombre y apellidos" autoCapitalize="words" style={input} />

          <Text style={fieldLabel}>DNI / NIE / Pasaporte *</Text>
          <TextInput value={holder.dni} onChangeText={v => setHolder(h => ({ ...h, dni: v }))} placeholder="12345678A" autoCapitalize="characters" autoCorrect={false} style={input} />

          <Text style={fieldLabel}>Teléfono *</Text>
          <TextInput value={holder.phone} onChangeText={v => setHolder(h => ({ ...h, phone: v }))} placeholder="+34 600 000 000" keyboardType="phone-pad" style={input} />
        </View>

        <Pressable
          onPress={handlePay}
          disabled={paying}
          style={({ pressed }) => ({
            backgroundColor: '#1A73E8', paddingVertical: 16, borderRadius: 14,
            alignItems: 'center', opacity: paying || pressed ? 0.7 : 1, marginTop: 8,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
            {paying ? 'Abriendo pago…' : `Pagar ${formatCents(grandTotal)}`}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, color: '#777', flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: highlight ? 16 : 13, fontWeight: highlight ? '800' : '600', color: highlight ? '#007AFF' : '#111', textAlign: 'right', flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const card = { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } };
const sectionTitle = { fontSize: 16, fontWeight: '700' as const, marginBottom: 8 };
const fieldLabel = { fontSize: 13, color: '#666', marginTop: 10, marginBottom: 2 };
const input = { backgroundColor: '#F2F4F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };
