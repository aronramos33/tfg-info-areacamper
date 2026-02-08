import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type ExtraSummary = {
  code?: 'PET' | 'POWER' | 'PERSON' | string;
  name: string;
  units?: number;
};

type ReservationRow = {
  id: number;
  start_date: string | null;
  end_date: string | null;
  total_amount_cents: number | null;
  payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded' | string;
  access_code: string | null;
  access_expires_at: string | null;
};

export default function SuccessPage() {
  const router = useRouter();

  const {
    reservation_id,
    session_id,

    // compatibilidad si entras por flujo viejo
    startDate,
    endDate,
    nights,
    total,
    extras,
  } = useLocalSearchParams<{
    reservation_id?: string;
    session_id?: string;

    startDate?: string;
    endDate?: string;
    nights?: string;
    total?: string;
    extras?: string;
  }>();

  const reservationIdNum = reservation_id ? Number(reservation_id) : null;

  const [reservation, setReservation] = useState<ReservationRow | null>(null);
  const [extraLines, setExtraLines] = useState<ExtraSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sessionReady, setSessionReady] = useState(false);

  // ✅ Esperar a que Supabase tenga sesión (evita "Missing authorization header")
  useEffect(() => {
    let alive = true;

    const init = async () => {
      // 1) intenta leer session actual
      const { data } = await supabase.auth.getSession();
      if (alive) setSessionReady(!!data.session);

      // 2) escucha cambios (rehidratación tras deep link)
      const { data: sub } = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          if (alive) setSessionReady(!!newSession);
        },
      );

      return () => {
        sub.subscription.unsubscribe();
      };
    };

    const cleanupPromise = init();

    return () => {
      alive = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  const formatEuro = (cents: number) => `${(cents / 100).toFixed(2)} €`;

  const parsedExtrasLegacy: ExtraSummary[] = useMemo(() => {
    try {
      return extras ? JSON.parse(extras) : [];
    } catch {
      return [];
    }
  }, [extras]);

  const formatExtraLine = (ex: ExtraSummary) => {
    const units = Number(ex.units ?? 0);

    if (ex.code === 'POWER') {
      return `• ${ex.name} — ${units === 1 ? 'Sí' : 'No'}`;
    }

    const label =
      ex.code === 'PET'
        ? units === 1
          ? 'mascota'
          : 'mascotas'
        : ex.code === 'PERSON'
          ? units === 1
            ? 'acompañante'
            : 'acompañantes'
          : units === 1
            ? 'unidad'
            : 'unidades';

    if (units <= 0) return null;
    return `• ${ex.name} — ${units} ${label}`;
  };

  // ✅ Cargar datos reales por reservation_id, pero SOLO cuando sessionReady = true
  useEffect(() => {
    let isMounted = true;

    const loadFromDb = async () => {
      // si no viene reservation_id -> flujo viejo, solo UI
      if (!reservationIdNum) {
        setLoading(false);
        return;
      }

      // clave: si aún no hay sesión, esperamos
      if (!sessionReady) {
        setLoading(true);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      try {
        const { data: r, error: rErr } = await supabase
          .from('reservations')
          .select(
            'id,start_date,end_date,total_amount_cents,payment_status,access_code,access_expires_at',
          )
          .eq('id', reservationIdNum)
          .single();

        if (rErr || !r)
          throw new Error(rErr?.message ?? 'No se pudo cargar la reserva.');

        const { data: re, error: reErr } = await supabase
          .from('reservation_extras')
          .select('extra_id,quantity')
          .eq('reservation_id', reservationIdNum);

        if (reErr)
          throw new Error(reErr.message ?? 'No se pudieron cargar los extras.');

        let extrasForUi: ExtraSummary[] = [];
        if (re && re.length > 0) {
          const ids = re.map((x) => x.extra_id);
          const { data: exRows, error: exErr } = await supabase
            .from('extras')
            .select('id,code,name_es')
            .in('id', ids);

          if (exErr)
            throw new Error(
              exErr.message ?? 'No se pudieron resolver los extras.',
            );

          extrasForUi = re
            .map((line) => {
              const info = exRows?.find((e) => e.id === line.extra_id);
              if (!info) return null;
              return {
                code: info.code,
                name: info.name_es,
                units: line.quantity,
              };
            })
            .filter(Boolean) as ExtraSummary[];
        }

        if (!isMounted) return;
        setReservation(r as ReservationRow);
        setExtraLines(extrasForUi);
      } catch (e: any) {
        if (!isMounted) return;
        setErrorMsg(e?.message ?? 'Error cargando la reserva.');
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    loadFromDb();
    return () => {
      isMounted = false;
    };
  }, [reservationIdNum, sessionReady]);

  // Polling hasta paid (solo si sessionReady y hay reserva)
  useEffect(() => {
    if (!reservationIdNum) return;
    if (!sessionReady) return;
    if (!reservation) return;
    if (reservation.payment_status === 'paid') return;

    let isMounted = true;
    let ticks = 0;
    const maxTicks = 30;

    setPolling(true);

    const timer = setInterval(async () => {
      ticks += 1;

      const { data: r, error: rErr } = await supabase
        .from('reservations')
        .select(
          'payment_status,access_code,access_expires_at,total_amount_cents,start_date,end_date',
        )
        .eq('id', reservationIdNum)
        .single();

      if (!rErr && r && isMounted) {
        setReservation((prev) =>
          prev ? ({ ...prev, ...r } as ReservationRow) : (r as ReservationRow),
        );
        if (r.payment_status === 'paid') {
          clearInterval(timer);
          setPolling(false);
        }
      }

      if (ticks >= maxTicks) {
        clearInterval(timer);
        if (isMounted) setPolling(false);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [reservationIdNum, sessionReady, reservation]);

  const isPaid = reservation?.payment_status === 'paid';
  const totalCents =
    reservation?.total_amount_cents ?? (total ? Number(total) : 0);

  const startText = reservation?.start_date ?? startDate ?? '';
  const endText = reservation?.end_date ?? endDate ?? '';

  const extrasToShow = reservationIdNum ? extraLines : parsedExtrasLegacy;

  return (
    <View style={styles.container}>
      <Ionicons
        name={isPaid ? 'checkmark-circle' : 'time'}
        size={90}
        color={isPaid ? '#4CAF50' : '#FF9500'}
      />

      <Text style={styles.title}>
        {isPaid ? '¡Pago confirmado!' : 'Confirmando el pago…'}
      </Text>

      {session_id ? (
        <Text style={styles.subtle}>Session: {session_id}</Text>
      ) : null}

      {!sessionReady && reservationIdNum ? (
        <View style={{ marginTop: 10 }}>
          <ActivityIndicator />
          <Text style={styles.subtle}>Recuperando sesión…</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ marginTop: 16 }}>
          <ActivityIndicator />
        </View>
      ) : errorMsg ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>No se pudo cargar la reserva</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>

          <Pressable
            style={[styles.secondaryButton, { marginTop: 12 }]}
            onPress={() => router.replace('/(main)/reservations')}
          >
            <Text style={styles.secondaryText}>Ir a Reservas</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {!!startText && (
            <>
              <Text style={styles.label}>Entrada:</Text>
              <Text style={styles.value}>{startText}</Text>
            </>
          )}

          {!!endText && (
            <>
              <Text style={styles.label}>Salida:</Text>
              <Text style={styles.value}>{endText}</Text>
            </>
          )}

          {nights ? (
            <>
              <Text style={styles.label}>Noches:</Text>
              <Text style={styles.value}>{nights}</Text>
            </>
          ) : null}

          {extrasToShow.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>
                Extras añadidos:
              </Text>
              {extrasToShow
                .map(formatExtraLine)
                .filter(Boolean)
                .map((line, idx) => (
                  <Text key={idx} style={styles.extraItem}>
                    {line}
                  </Text>
                ))}
            </>
          )}

          <Text style={[styles.label, { marginTop: 12 }]}>
            {isPaid ? 'Total pagado:' : 'Total:'}
          </Text>
          <Text style={styles.value}>
            {formatEuro(Number(totalCents ?? 0))}
          </Text>

          {!isPaid && (
            <Text style={[styles.subtle, { marginTop: 12 }]}>
              {polling
                ? 'Estamos esperando la confirmación de Stripe…'
                : 'Si esto tarda, vuelve a Reservas y revisa el estado.'}
            </Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.primaryButton, !isPaid && styles.primaryDisabled]}
        disabled={!isPaid}
        onPress={() =>
          router.replace({
            pathname: '/(main)/qr',
            params: reservationIdNum
              ? { reservation_id: String(reservationIdNum) }
              : {},
          })
        }
      >
        <Text style={styles.primaryText}>
          {isPaid
            ? 'Ver mi código QR'
            : 'QR disponible cuando se confirme el pago'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.replace('/(main)/reservations')}
      >
        <Text style={styles.secondaryText}>Volver a Reservas</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 18,
  },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtle: { fontSize: 12, color: '#666', textAlign: 'center' },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    elevation: 3,
    gap: 6,
  },
  label: { fontSize: 14, color: '#666' },
  value: { fontSize: 16, fontWeight: '600' },
  extraItem: { fontSize: 15, color: '#333', marginLeft: 6 },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  secondaryButton: {
    paddingVertical: 12,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  errorTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  errorText: { fontSize: 14, color: '#333' },
});
