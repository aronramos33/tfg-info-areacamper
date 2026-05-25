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
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents } from '@/components/utils/money';
import { vehicleDisplayName } from '@/components/utils/vehicle';

function normalizeBirthDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null; // formato inválido → null, PostgreSQL lo acepta como NULL
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

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
  const { pending, setPending, resetPending } = usePendingReservation();

  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [holderExpanded, setHolderExpanded] = useState(false);

  const [holder, setHolder] = useState({ full_name: '', phone: '', dni: '' });

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

  const petExtra = extras.find(e => e.code === 'PET');
  const powerExtra = extras.find(e => e.code === 'POWER');
  const personExtra = extras.find(e => e.code === 'PERSON');

  const basePerPlace = nights * pending.nightlyCents;

  // Extras cost for a single place config
  const calcExtras = (cfg: typeof pending.placeConfigs[0]) => {
    let total = 0;
    if (cfg.numPets > 0 && petExtra) {
      total += petExtra.pricing_type === 'per_stay'
        ? cfg.numPets * petExtra.unit_amount_cents
        : cfg.numPets * nights * petExtra.unit_amount_cents;
    }
    if (cfg.electricidad && powerExtra) {
      total += powerExtra.pricing_type === 'per_stay'
        ? powerExtra.unit_amount_cents
        : nights * powerExtra.unit_amount_cents;
    }
    const extraPersons = Math.max(0, cfg.numGuests - 2);
    if (extraPersons > 0 && personExtra) {
      total += personExtra.pricing_type === 'per_stay'
        ? extraPersons * personExtra.unit_amount_cents
        : extraPersons * nights * personExtra.unit_amount_cents;
    }
    return total;
  };

  const grandTotal = useMemo(() => {
    const base = basePerPlace * pending.selectedPlaceIds.length;
    const extrasSum = pending.placeConfigs.reduce((s, cfg) => s + calcExtras(cfg), 0);
    return base + extrasSum;
  }, [pending.placeConfigs, petExtra, powerExtra, personExtra, nights, basePerPlace]);

  const handlePay = async () => {
    if (!session) return;

    if (!holder.full_name.trim()) { Alert.alert('Nombre requerido', 'Indica el nombre del titular.'); return; }
    if (!holder.dni.trim()) { Alert.alert('Documento requerido', 'Indica el DNI/NIE/Pasaporte del titular.'); return; }
    if (!holder.phone.trim()) { Alert.alert('Teléfono requerido', 'Indica un teléfono de contacto.'); return; }

    setPending(prev => ({ ...prev, holder }));

    if (!session?.user?.id) {
      Alert.alert('Sesión requerida', 'Inicia sesión para continuar.');
      return;
    }

    // ─── Construir payloads (extras, travelers, vehicles_snapshot) ─────────
    const extrasPayload = pending.placeConfigs.flatMap((cfg, placeIndex) => {
      const rows: any[] = [];
      if (cfg.numPets > 0 && petExtra) {
        const lineTotal = petExtra.pricing_type === 'per_stay'
          ? cfg.numPets * petExtra.unit_amount_cents
          : cfg.numPets * nights * petExtra.unit_amount_cents;
        rows.push({ extra_id: petExtra.id, quantity: cfg.numPets, place_index: placeIndex, pricing_type: petExtra.pricing_type, unit_amount_cents: petExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      if (cfg.electricidad && powerExtra) {
        const lineTotal = powerExtra.pricing_type === 'per_stay'
          ? powerExtra.unit_amount_cents
          : nights * powerExtra.unit_amount_cents;
        rows.push({ extra_id: powerExtra.id, quantity: 1, place_index: placeIndex, pricing_type: powerExtra.pricing_type, unit_amount_cents: powerExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      const extraPersons = Math.max(0, cfg.numGuests - 2);
      if (extraPersons > 0 && personExtra) {
        const lineTotal = personExtra.pricing_type === 'per_stay'
          ? extraPersons * personExtra.unit_amount_cents
          : extraPersons * nights * personExtra.unit_amount_cents;
        rows.push({ extra_id: personExtra.id, quantity: extraPersons, place_index: placeIndex, pricing_type: personExtra.pricing_type, unit_amount_cents: personExtra.unit_amount_cents, line_total_cents: lineTotal });
      }
      return rows;
    });

    const firstCfg = pending.placeConfigs[0];
    const firstVehicle = firstCfg?.vehicleSelection?.type === 'saved' ? firstCfg.vehicleSelection.vehicle : null;

    const vehiclesSnapshot = pending.placeConfigs.map((cfg, i) => {
      if (cfg.vehicleSelection?.type === 'saved') {
        const v = cfg.vehicleSelection.vehicle;
        return { place_index: i, vehicle_id: v.id, brand: v.brand, model: v.model, plate: v.plate, alias: v.alias ?? null, length_m: v.length_m ?? null };
      }
      if (cfg.vehicleSelection?.type === 'new') {
        const d = cfg.vehicleSelection.draft;
        return { place_index: i, vehicle_id: null, brand: d.brand, model: d.model, plate: d.plate, alias: d.alias || null, length_m: null };
      }
      return { place_index: i, vehicle_id: null, brand: '', model: '', plate: '', alias: null, length_m: null };
    });

    setPaying(true);
    try {
      // ─── 1) Pre-crear reserva en BD con status='pending' ─────────────────
      const { data: reservationRow, error: insErr } = await supabase
        .from('reservations')
        .insert({
          user_id: session.user.id,
          start_date: pending.startDate,
          end_date: pending.endDate,
          place_ids: pending.selectedPlaceIds,
          num_places: pending.selectedPlaceIds.length,
          status: 'pending',
          payment_status: 'pending',
          full_name: holder.full_name.trim(),
          phone: holder.phone.trim(),
          dni: holder.dni.trim(),
          vehicle_id: firstVehicle?.id ?? null,
          vehicle_brand: firstVehicle?.brand ?? null,
          vehicle_model: firstVehicle?.model ?? null,
          vehicle_plate: firstVehicle?.plate ?? null,
          vehicle_alias: firstVehicle?.alias ?? null,
          vehicle_length_m: firstVehicle?.length_m ?? null,
          vehicles_snapshot: vehiclesSnapshot,
          nightly_amount_cents: pending.nightlyCents,
          total_amount_cents: grandTotal,
          currency: 'eur',
        })
        .select('id')
        .single();

      if (insErr || !reservationRow) {
        console.warn('reservation insert error:', insErr);
        Alert.alert('Error', 'No se pudo crear la reserva. Inténtalo de nuevo.');
        return;
      }

      const reservationId = reservationRow.id as number;

      // ─── 2) Insertar travelers ───────────────────────────────────────────
      const travelerRows = pending.placeConfigs.flatMap((cfg, placeIndex) =>
        (cfg.guests ?? [])
          .filter(g => g.full_name?.trim())
          .map((g, guestIndex) => ({
            reservation_id: reservationId,
            full_name: g.full_name,
            doc_type: g.doc_type || null,
            doc_number: g.doc_number || null,
            doc_support_number: g.doc_support_number || null,
            nationality: g.nationality || null,
            birth_date: g.birth_date ? normalizeBirthDate(g.birth_date) : null,
            gender: g.gender || null,
            country_of_residence: g.country_of_residence || null,
            city_of_residence: g.city_of_residence || null,
            phone: g.phone || null,
            email: g.email || null,
            place_index: placeIndex,
            is_main_traveler: placeIndex === 0 && guestIndex === 0,
          }))
      );

      if (travelerRows.length > 0) {
        const { error: travErr } = await supabase.from('travelers').insert(travelerRows);
        if (travErr) {
          console.warn('travelers insert error:', travErr);
          // Limpiar reserva pending huérfana
          await supabase.from('reservations').delete().eq('id', reservationId);
          Alert.alert('Error', 'No se pudieron guardar los datos de los viajeros. Comprueba que todos los campos son correctos.');
          return;
        }
      }

      // ─── 3) Insertar reservation_extras ──────────────────────────────────
      if (extrasPayload.length > 0) {
        const { error: extErr } = await supabase.from('reservation_extras').insert(
          extrasPayload.map(e => ({
            reservation_id: reservationId,
            extra_id: e.extra_id,
            quantity: e.quantity,
            pricing_type: e.pricing_type ?? 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: e.line_total_cents,
            place_index: e.place_index ?? null,
          }))
        );
        if (extErr) {
          console.warn('extras insert error:', extErr);
          // No bloquear el flujo — los extras son secundarios
        }
      }

      // ─── 4) Crear sesión de Stripe ───────────────────────────────────────
      // Generamos return_url AQUÍ para que el backend use exactamente el mismo
      // esquema/host que openAuthSessionAsync va a escuchar. Así no dependemos
      // de EXPO_GO_BASE_URL en el servidor para el flujo create.
      const redirectBase = Linking.createURL('/stripe-redirect');
      console.log('[pay] redirectBase:', redirectBase);

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        { body: { reservation_id: reservationId, return_url: redirectBase } },
      );

      if (fnError || !fnData?.url) {
        Alert.alert('Error', fnError?.message ?? 'No se pudo iniciar el pago.');
        return;
      }

      // ─── 5) Guardar reservation_id en AsyncStorage (fallback ante OTA reload) ─
      await AsyncStorage.setItem('pending_post_payment_reservation_id', String(reservationId));

      // ─── 6) Abrir Stripe y esperar resultado ─────────────────────────────
      console.log('[pay] abriendo Stripe:', fnData.url);
      const result = await WebBrowser.openAuthSessionAsync(fnData.url, redirectBase);
      console.log('[pay] browser cerrado, result.type:', result.type);

      if (result.type === 'success') {
        // stripe-success redirigió a redirectBase → pago completado.
        // stripe-redirect.tsx absorbe el deep link si el SO lo dispara (Android).
        // El detalle de la reserva hace polling hasta que el webhook confirme.
        resetPending();
        router.replace(`/(main)/qr/${reservationId}` as any);
      } else {
        // Usuario cerró el browser o canceló el pago — no navegar.
        console.log('[pay] pago no completado (result.type:', result.type, ')');
        await AsyncStorage.removeItem('pending_post_payment_reservation_id');
        Alert.alert('Pago no completado', 'Puedes intentarlo de nuevo.');
      }
    } catch (e) {
      console.warn('handlePay error:', e);
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
  const numPlaces = pending.selectedPlaceIds.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 }}>

        {/* Title */}
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 20 }}>
          Resumen de tu reserva
        </Text>

        {/* ── ESTANCIA ── */}
        <Label>Estancia</Label>
        <Card>
          <DataRow label="Entrada" value={start.format('ddd, D MMM YYYY')} />
          <Divider />
          <DataRow label="Salida" value={end.format('ddd, D MMM YYYY')} />
          <Divider />
          <DataRow label="Horario" value="Check-in 14–21h · Check-out <12h" dimValue />
        </Card>

        {/* ── TITULAR ── */}
        <Label>Titular</Label>
        <Card>
          {holderExpanded ? (
            <>
              <TextInput
                value={holder.full_name}
                onChangeText={v => setHolder(h => ({ ...h, full_name: v }))}
                placeholder="Nombre y apellidos *"
                autoCapitalize="words"
                style={inputStyle}
              />
              <TextInput
                value={holder.dni}
                onChangeText={v => setHolder(h => ({ ...h, dni: v }))}
                placeholder="DNI / NIE / Pasaporte *"
                autoCapitalize="characters"
                autoCorrect={false}
                style={[inputStyle, { marginTop: 8 }]}
              />
              <TextInput
                value={holder.phone}
                onChangeText={v => setHolder(h => ({ ...h, phone: v }))}
                placeholder="Teléfono *"
                keyboardType="phone-pad"
                style={[inputStyle, { marginTop: 8 }]}
              />
              <Pressable
                onPress={() => setHolderExpanded(false)}
                style={{ marginTop: 12, alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#111' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Guardar</Text>
              </Pressable>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>
                  {holder.full_name || 'Sin nombre'}
                </Text>
                <Text style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  DNI · {holder.dni || '—'}
                </Text>
              </View>
              <Pressable
                onPress={() => setHolderExpanded(true)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F2F4F8' }}
              >
                <Text style={{ fontWeight: '700', fontSize: 13, color: '#111' }}>Editar</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* ── PLAZAS RESERVADAS ── */}
        <Label>Plazas reservadas ({numPlaces})</Label>

        {pending.placeConfigs.map((cfg, i) => {
          const placeId = pending.selectedPlaceIds[i];
          const sel = cfg.vehicleSelection;
          const vehicleName = sel?.type === 'saved'
            ? vehicleDisplayName(sel.vehicle)
            : sel?.type === 'new'
              ? (sel.draft.alias || [sel.draft.brand, sel.draft.model].filter(Boolean).join(' ') || 'Vehículo')
              : '—';
          const vehiclePlate = sel?.type === 'saved'
            ? sel.vehicle.plate
            : sel?.type === 'new'
              ? sel.draft.plate
              : '';

          const extraPersons = Math.max(0, cfg.numGuests - 2);

          return (
            <Card key={i} style={{ marginBottom: 10 }}>
              {/* Badge + vehículo */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Plaza {i + 1}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', flexShrink: 1 }}>
                  {vehicleName}{vehiclePlate ? ` · ${vehiclePlate}` : ''}
                </Text>
              </View>

              {/* Info de la plaza */}
              <PlaceInfoLine text={`${cfg.numGuests} huésped${cfg.numGuests !== 1 ? 'es' : ''}`} />
              {cfg.numPets > 0 && petExtra && (
                <PlaceInfoLine
                  text={`${cfg.numPets} mascota${cfg.numPets !== 1 ? 's' : ''}`}
                  extra={`(+${formatCents(petExtra.unit_amount_cents)}/${petExtra.pricing_type === 'per_stay' ? 'estancia' : 'noche'} · por mascota)`}
                />
              )}
              {cfg.electricidad
                ? <PlaceInfoLine text="Electricidad contratada" />
                : <PlaceInfoLine text="Sin electricidad" dim />
              }
              {extraPersons > 0 && personExtra && (
                <PlaceInfoLine
                  text={`${extraPersons} viajero${extraPersons !== 1 ? 's' : ''} adicional${extraPersons !== 1 ? 'es' : ''}`}
                  extra={`(+${formatCents(personExtra.unit_amount_cents)}/${personExtra.pricing_type === 'per_stay' ? 'estancia' : 'noche'} · c/u)`}
                />
              )}
            </Card>
          );
        })}

        {/* ── DESGLOSE DE PRECIOS ── */}
        <Label>Desglose de precios</Label>
        <Card>
          {pending.placeConfigs.map((cfg, i) => {
            const placeBase = basePerPlace;
            const extraPersons = Math.max(0, cfg.numGuests - 2);

            return (
              <View key={i} style={{ marginBottom: i < pending.placeConfigs.length - 1 ? 10 : 0 }}>
                {/* Plaza base */}
                <PriceRow
                  label={`Plaza ${i + 1} — ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCents(pending.nightlyCents)}`}
                  value={formatCents(placeBase)}
                  bold={false}
                />
                {/* Electricidad */}
                {cfg.electricidad && powerExtra && (
                  <PriceRow
                    label={`+ Electricidad × ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCents(powerExtra.unit_amount_cents)}`}
                    value={formatCents(
                      powerExtra.pricing_type === 'per_stay'
                        ? powerExtra.unit_amount_cents
                        : nights * powerExtra.unit_amount_cents,
                    )}
                    indent
                  />
                )}
                {/* Mascotas */}
                {cfg.numPets > 0 && petExtra && (
                  <PriceRow
                    label={`+ ${cfg.numPets} mascota${cfg.numPets !== 1 ? 's' : ''} × ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCents(petExtra.unit_amount_cents)}`}
                    value={formatCents(
                      petExtra.pricing_type === 'per_stay'
                        ? cfg.numPets * petExtra.unit_amount_cents
                        : cfg.numPets * nights * petExtra.unit_amount_cents,
                    )}
                    indent
                  />
                )}
                {/* Viajeros extra */}
                {extraPersons > 0 && personExtra && (
                  <PriceRow
                    label={`+ ${extraPersons} viajero${extraPersons !== 1 ? 's' : ''} extra × ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCents(personExtra.unit_amount_cents)}`}
                    value={formatCents(
                      personExtra.pricing_type === 'per_stay'
                        ? extraPersons * personExtra.unit_amount_cents
                        : extraPersons * nights * personExtra.unit_amount_cents,
                    )}
                    indent
                  />
                )}
              </View>
            );
          })}

          {/* Total */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 14 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#111' }}>TOTAL (IVA incluido)</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>{formatCents(grandTotal)}</Text>
          </View>
        </Card>

        {/* ── POLÍTICA DE CANCELACIÓN ── */}
        <View style={{ backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#FDE68A' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 10 }}>
            Política de cancelación
          </Text>
          <BulletLine text=">7 días antes → Reembolso total" />
          <BulletLine text="Entre 7 y 1 días → 50% reembolso" />
          <BulletLine text="Menos de 24h → Sin reembolso" />
        </View>

        {/* ── BOTÓN PAGAR ── */}
        <Pressable
          onPress={handlePay}
          disabled={paying}
          style={({ pressed }) => ({
            backgroundColor: '#111', paddingVertical: 18, borderRadius: 14,
            alignItems: 'center', opacity: paying || pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
            {paying ? 'Abriendo pago…' : `Confirmar y pagar  →  ${formatCents(grandTotal)}`}
          </Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
      elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    }, style]}>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#F2F4F8', marginVertical: 10 }} />;
}

function DataRow({ label, value, dimValue = false }: { label: string; value: string; dimValue?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{label}</Text>
      <Text style={{ fontSize: 13, color: dimValue ? '#aaa' : '#555', textAlign: 'right', flexShrink: 1, marginLeft: 8 }}>
        {value}
      </Text>
    </View>
  );
}

function PlaceInfoLine({ text, extra, dim = false }: { text: string; extra?: string; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <Text style={{ fontSize: 13, color: dim ? '#aaa' : '#444' }}>{text}</Text>
      {extra && <Text style={{ fontSize: 12, color: '#888' }}>{extra}</Text>}
    </View>
  );
}

function PriceRow({ label, value, bold = false, indent = false }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, paddingLeft: indent ? 10 : 0 }}>
      <Text style={{ fontSize: indent ? 12 : 13, color: indent ? '#888' : '#555', flex: 1, flexWrap: 'wrap' }}>
        {label}
      </Text>
      <Text style={{ fontSize: indent ? 12 : 13, fontWeight: bold ? '800' : '600', color: '#111', marginLeft: 8 }}>
        {value}
      </Text>
    </View>
  );
}

function BulletLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
      <Text style={{ color: '#92400E', fontSize: 13 }}>•</Text>
      <Text style={{ fontSize: 13, color: '#78350F', flex: 1 }}>{text}</Text>
    </View>
  );
}

const inputStyle = {
  backgroundColor: '#F2F4F8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#111',
};
