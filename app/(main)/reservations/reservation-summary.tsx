import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
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
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import StepProgress from '@/components/StepProgress';
import { AppAlert } from '@/components/AppAlert';

function normalizeBirthDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
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

    if (!holder.full_name.trim()) { AppAlert.alert('Nombre requerido', 'Indica el nombre del titular.'); return; }
    if (!holder.dni.trim()) { AppAlert.alert('Documento requerido', 'Indica el DNI/NIE/Pasaporte del titular.'); return; }
    if (!holder.phone.trim()) { AppAlert.alert('Teléfono requerido', 'Indica un teléfono de contacto.'); return; }

    setPending(prev => ({ ...prev, holder }));

    if (!session?.user?.id) {
      AppAlert.alert('Sesión requerida', 'Inicia sesión para continuar.');
      return;
    }

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
        AppAlert.alert('Error', 'No se pudo crear la reserva. Inténtalo de nuevo.');
        return;
      }

      const reservationId = reservationRow.id as number;

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
          await supabase.from('reservations').delete().eq('id', reservationId);
          AppAlert.alert('Error', 'No se pudieron guardar los datos de los viajeros. Comprueba que todos los campos son correctos.');
          return;
        }
      }

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
        }
      }

      const redirectBase = Linking.createURL('/stripe-redirect');
      console.log('[pay] redirectBase:', redirectBase);

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        { body: { reservation_id: reservationId, return_url: redirectBase } },
      );

      if (fnError || !fnData?.url) {
        AppAlert.alert('Error', fnError?.message ?? 'No se pudo iniciar el pago.');
        return;
      }

      await AsyncStorage.setItem('pending_post_payment_reservation_id', String(reservationId));

      console.log('[pay] abriendo Stripe:', fnData.url);
      const result = await WebBrowser.openAuthSessionAsync(fnData.url, redirectBase);
      console.log('[pay] browser cerrado, result.type:', result.type);

      if (result.type === 'success') {
        await AsyncStorage.removeItem('pending_post_payment_reservation_id');
        resetPending();
        router.replace({
          pathname: '/(screens)/booking-success',
          params: { reservationId: String(reservationId) },
        } as any);
      } else {
        console.log('[pay] pago no completado (result.type:', result.type, ')');
        await AsyncStorage.removeItem('pending_post_payment_reservation_id');
        AppAlert.alert('Pago no completado', 'Puedes intentarlo de nuevo.');
      }
    } catch (e) {
      console.warn('handlePay error:', e);
      AppAlert.alert('Error', 'Ha ocurrido un problema al crear la reserva.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const start = dayjs(pending.startDate);
  const end = dayjs(pending.endDate);
  const numPlaces = pending.selectedPlaceIds.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StepProgress current={5} />
      <Pressable onPress={() => router.back()} style={{ paddingHorizontal: spacing['2xl'], paddingVertical: spacing.xs, alignSelf: 'flex-start' }}>
        <Text style={{ ...typography.titleSm, color: colors.secondary }}>‹ Volver</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingTop: spacing.xs, paddingBottom: 48 }}>

        <Text style={{ ...typography.headlineMd, marginBottom: spacing['2xl'] }}>
          Resumen de tu reserva
        </Text>

        {/* ── ESTANCIA ── */}
        <SectionLabel>Estancia</SectionLabel>
        <Card>
          <DataRow label="Entrada" value={start.format('ddd, D MMM YYYY')} />
          <Divider />
          <DataRow label="Salida" value={end.format('ddd, D MMM YYYY')} />
          <Divider />
          <DataRow label="Horario" value="Check-in 14–21h · Check-out <12h" dimValue />
        </Card>

        {/* ── TITULAR ── */}
        <SectionLabel>Titular</SectionLabel>
        <Card>
          {holderExpanded ? (
            <>
              <TextInput
                value={holder.full_name}
                onChangeText={v => setHolder(h => ({ ...h, full_name: v }))}
                placeholder="Nombre y apellidos *"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="words"
                style={inputStyle}
              />
              <TextInput
                value={holder.dni}
                onChangeText={v => setHolder(h => ({ ...h, dni: v }))}
                placeholder="DNI / NIE / Pasaporte *"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[inputStyle, { marginTop: 8 }]}
              />
              <TextInput
                value={holder.phone}
                onChangeText={v => setHolder(h => ({ ...h, phone: v }))}
                placeholder="Teléfono *"
                placeholderTextColor={colors.onSurfaceVariant}
                keyboardType="phone-pad"
                style={[inputStyle, { marginTop: 8 }]}
              />
              <Pressable
                onPress={() => setHolderExpanded(false)}
                style={{ marginTop: 12, alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.primary }}
              >
                <Text style={{ ...typography.titleSm, color: colors.onPrimary }}>Guardar</Text>
              </Pressable>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={typography.titleMd}>
                  {holder.full_name || 'Sin nombre'}
                </Text>
                <Text style={{ ...typography.bodyMd, marginTop: 2 }}>
                  DNI · {holder.dni || '—'}
                </Text>
              </View>
              <Pressable
                onPress={() => setHolderExpanded(true)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.surfaceContainerHigh, borderWidth: 1, borderColor: colors.outline }}
              >
                <Text style={typography.titleSm}>Editar</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* ── PLAZAS RESERVADAS ── */}
        <SectionLabel>Plazas reservadas ({numPlaces})</SectionLabel>

        {pending.placeConfigs.map((cfg, i) => {
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ ...typography.titleSm, color: colors.onPrimary }}>Plaza {i + 1}</Text>
                </View>
                <Text style={{ ...typography.titleSm, flexShrink: 1 }}>
                  {vehicleName}{vehiclePlate ? ` · ${vehiclePlate}` : ''}
                </Text>
              </View>

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
        <SectionLabel>Desglose de precios</SectionLabel>
        <Card>
          {pending.placeConfigs.map((cfg, i) => {
            const placeBase = basePerPlace;
            const extraPersons = Math.max(0, cfg.numGuests - 2);

            return (
              <View key={i} style={{ marginBottom: i < pending.placeConfigs.length - 1 ? 10 : 0 }}>
                <PriceRow
                  label={`Plaza ${i + 1} — ${nights} noche${nights !== 1 ? 's' : ''} × ${formatCents(pending.nightlyCents)}`}
                  value={formatCents(placeBase)}
                />
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

          <View style={{ height: 1, backgroundColor: colors.outline, marginVertical: 14 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={typography.titleMd}>TOTAL (IVA incluido)</Text>
            <Text style={{ ...typography.titleLg, fontSize: 18 }}>{formatCents(grandTotal)}</Text>
          </View>
        </Card>

        {/* ── POLÍTICA DE CANCELACIÓN ── */}
        <View style={{ backgroundColor: colors.warningContainer, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing['2xl'], borderWidth: 1, borderColor: colors.warning }}>
          <Text style={{ ...typography.titleSm, color: colors.warningText, marginBottom: 10 }}>
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
            backgroundColor: colors.primary,
            paddingVertical: 18,
            borderRadius: radii.md,
            alignItems: 'center',
            opacity: paying || pressed ? 0.7 : 1,
            ...shadow.sm,
          })}
        >
          <Text style={{ ...typography.titleLg, color: colors.onPrimary }}>
            {paying ? 'Abriendo pago…' : `Confirmar y pagar  →  ${formatCents(grandTotal)}`}
          </Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ ...typography.labelSm, marginBottom: 8, marginTop: 4 }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radii.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      ...shadow.sm,
    }, style]}>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10 }} />;
}

function DataRow({ label, value, dimValue = false }: { label: string; value: string; dimValue?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={typography.titleSm}>{label}</Text>
      <Text style={{ ...typography.bodyMd, textAlign: 'right', flexShrink: 1, marginLeft: 8, opacity: dimValue ? 0.6 : 1 }}>
        {value}
      </Text>
    </View>
  );
}

function PlaceInfoLine({ text, extra, dim = false }: { text: string; extra?: string; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <Text style={{ ...typography.bodyMd, color: dim ? colors.onSurfaceVariant : colors.onSurface }}>{text}</Text>
      {extra && <Text style={typography.bodyMd}>{extra}</Text>}
    </View>
  );
}

function PriceRow({ label, value, indent = false }: { label: string; value: string; indent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, paddingLeft: indent ? 10 : 0 }}>
      <Text style={{ fontSize: indent ? 12 : 13, color: indent ? colors.onSurfaceVariant : colors.onSurface, flex: 1, flexWrap: 'wrap', fontFamily: 'PlusJakartaSans_400Regular' }}>
        {label}
      </Text>
      <Text style={{ fontSize: indent ? 12 : 13, fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.onSurface, marginLeft: 8 }}>
        {value}
      </Text>
    </View>
  );
}

function BulletLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
      <Text style={{ ...typography.bodyMd, color: colors.warningText }}>•</Text>
      <Text style={{ ...typography.bodyMd, color: colors.warningText, flex: 1 }}>{text}</Text>
    </View>
  );
}

const inputStyle = {
  backgroundColor: colors.inputSurface,
  borderWidth: 1,
  borderColor: colors.outline,
  borderRadius: radii.sm,
  paddingHorizontal: 12,
  paddingVertical: 11,
  ...typography.bodyLg,
  color: colors.onSurface,
};
