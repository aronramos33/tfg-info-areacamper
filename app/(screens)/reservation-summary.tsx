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
  pricing_type: 'per_night' | string;
};

export default function ReservationSummaryScreen() {
  const { session, profile } = useAuth();
  const { pending, setPending } = usePendingReservation();

  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const [holder, setHolder] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    dni: profile?.dni ?? '',
  });

  useEffect(() => {
    // Initialize holder from profile or pending
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

  const extrasTotal = useMemo(() => {
    return pending.placeConfigs.reduce((sum, cfg) => {
      return (
        sum +
        cfg.extras.reduce((s, e) => {
          const meta = extras.find((x) => x.id === e.extra_id);
          if (!meta) return s;
          const lineTotal =
            meta.pricing_type === 'per_stay'
              ? e.quantity * meta.unit_amount_cents
              : e.quantity * nights * meta.unit_amount_cents;
          return s + lineTotal;
        }, 0)
      );
    }, 0);
  }, [pending.placeConfigs, extras, nights]);

  const grandTotal = baseTotal + extrasTotal;

  const handlePay = async () => {
    if (!session) return;

    if (!holder.full_name.trim()) {
      Alert.alert('Nombre requerido', 'Indica el nombre del titular.');
      return;
    }
    if (!holder.dni.trim()) {
      Alert.alert('Documento requerido', 'Indica el DNI/NIE/Pasaporte del titular.');
      return;
    }
    if (!holder.phone.trim()) {
      Alert.alert('Teléfono requerido', 'Indica un teléfono de contacto.');
      return;
    }

    // Save holder to context
    setPending((prev) => ({ ...prev, holder }));

    // Build extras payload (flat, per-place with place_index)
    const extrasPayload = pending.placeConfigs.flatMap((cfg, placeIndex) =>
      cfg.extras
        .filter((e) => e.quantity > 0)
        .map((e) => {
          const meta = extras.find((x) => x.id === e.extra_id);
          const unitAmount = meta?.unit_amount_cents ?? 0;
          const pricingType = meta?.pricing_type ?? 'per_night';
          const lineTotal =
            pricingType === 'per_stay'
              ? e.quantity * unitAmount
              : e.quantity * nights * unitAmount;
          return {
            extra_id: e.extra_id,
            quantity: e.quantity,
            place_index: placeIndex,
            pricing_type: pricingType,
            unit_amount_cents: unitAmount,
            line_total_cents: lineTotal,
          };
        }),
    );

    // First vehicle (snapshot for reservations table legacy columns)
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
      if (!fnData?.url) {
        Alert.alert('Error', 'Respuesta inválida al iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);
    } catch (e) {
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
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4 }}>
          Resumen de la reserva
        </Text>
        <Text style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
          Revisa los datos antes de pagar.
        </Text>

        {/* Estancia */}
        <View style={card}>
          <Text style={sectionTitle}>Estancia</Text>
          <Row label="Entrada" value={start.format('DD/MM/YYYY')} />
          <Row label="Salida" value={end.format('DD/MM/YYYY')} />
          <Row label="Noches" value={String(nights)} />
          <Row
            label="Plazas"
            value={pending.selectedPlaceIds
              .sort((a, b) => a - b)
              .map((id) => `P${id}`)
              .join(', ')}
          />
        </View>

        {/* Por plaza */}
        {pending.placeConfigs.map((cfg, i) => {
          const vehicle =
            cfg.vehicleSelection?.type === 'saved'
              ? cfg.vehicleSelection.vehicle
              : null;
          const placeExtras = cfg.extras.filter((e) => e.quantity > 0);
          return (
            <View key={i} style={card}>
              <Text style={sectionTitle}>Plaza {i + 1}</Text>
              <Row label="Viajero" value={cfg.traveler.full_name} />
              <Row label="Documento" value={`${cfg.traveler.doc_type.toUpperCase()} ${cfg.traveler.doc_number}`} />
              {vehicle && (
                <Row
                  label="Vehículo"
                  value={`${vehicleDisplayName(vehicle)} · ${vehicle.plate}`}
                />
              )}
              {placeExtras.map((e) => {
                const meta = extras.find((x) => x.id === e.extra_id);
                return meta ? (
                  <Row
                    key={e.extra_id}
                    label={meta.name_es}
                    value={`×${e.quantity}`}
                  />
                ) : null;
              })}
            </View>
          );
        })}

        {/* Desglose económico */}
        <View style={card}>
          <Text style={sectionTitle}>Total</Text>
          <Row
            label={`Base (${pending.selectedPlaceIds.length} plaza${pending.selectedPlaceIds.length !== 1 ? 's' : ''} × ${nights} noche${nights !== 1 ? 's' : ''})`}
            value={formatCents(baseTotal)}
          />
          {extrasTotal > 0 && <Row label="Extras" value={formatCents(extrasTotal)} />}
          <View style={{ height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 }} />
          <Row
            label="Total"
            value={formatCents(grandTotal)}
            highlight
          />
        </View>

        {/* Titular */}
        <View style={card}>
          <Text style={sectionTitle}>Titular de la reserva</Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            Puedes modificar estos datos. No se guardarán en tu perfil.
          </Text>

          <Text style={fieldLabel}>Nombre completo *</Text>
          <TextInput
            value={holder.full_name}
            onChangeText={(v) => setHolder((h) => ({ ...h, full_name: v }))}
            placeholder="Nombre y apellidos"
            autoCapitalize="words"
            style={input}
          />

          <Text style={fieldLabel}>DNI / NIE / Pasaporte *</Text>
          <TextInput
            value={holder.dni}
            onChangeText={(v) => setHolder((h) => ({ ...h, dni: v }))}
            placeholder="12345678A"
            autoCapitalize="characters"
            autoCorrect={false}
            style={input}
          />

          <Text style={fieldLabel}>Teléfono *</Text>
          <TextInput
            value={holder.phone}
            onChangeText={(v) => setHolder((h) => ({ ...h, phone: v }))}
            placeholder="+34 600 000 000"
            keyboardType="phone-pad"
            style={input}
          />
        </View>

        <Pressable
          onPress={handlePay}
          disabled={paying}
          style={({ pressed }) => ({
            backgroundColor: '#1A73E8',
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: paying || pressed ? 0.7 : 1,
            marginTop: 8,
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

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 13, color: '#777', flex: 1 }}>{label}</Text>
      <Text
        style={{
          fontSize: highlight ? 16 : 13,
          fontWeight: highlight ? '800' : '600',
          color: highlight ? '#007AFF' : '#111',
          textAlign: 'right',
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
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
const sectionTitle = { fontSize: 16, fontWeight: '700' as const, marginBottom: 8 };
const fieldLabel = { fontSize: 13, color: '#666', marginTop: 10, marginBottom: 2 };
const input = {
  backgroundColor: '#F2F4F8',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
};
