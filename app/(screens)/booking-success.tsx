import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

const DAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function fmtEs(d: dayjs.Dayjs): string {
  return `${DAYS_ES[d.day()]}, ${d.date()} ${MONTHS_ES[d.month()]}`;
}

function reservationRef(id: number, startDate: string): string {
  const year = dayjs(startDate).format('YYYY');
  return `Reserva #AC-${year}-${String(id).padStart(5, '0')}`;
}

type Reservation = {
  id: number;
  start_date: string;
  end_date: string;
  payment_status: string;
};

export default function BookingSuccessScreen() {
  const router = useRouter();
  const { reservationId } = useLocalSearchParams<{ reservationId?: string }>();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrValue, setQrValue] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);

  useEffect(() => {
    if (!reservationId) {
      setLoading(false);
      return;
    }
    supabase
      .from('reservations')
      .select('id, start_date, end_date, payment_status')
      .eq('id', Number(reservationId))
      .single()
      .then(({ data }) => {
        if (data) setReservation(data as Reservation);
        setLoading(false);
      });
  }, [reservationId]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(main)/qr');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!reservation || reservation.payment_status !== 'paid') return;
    const windowStart = dayjs(reservation.start_date).subtract(2, 'hour');
    const windowEnd = dayjs(reservation.end_date).endOf('day');
    if (!dayjs().isAfter(windowStart) || !dayjs().isBefore(windowEnd)) return;

    setQrLoading(true);
    supabase.functions
      .invoke('issue-qr-pass', { body: { reservation_id: reservation.id } })
      .then(({ data, error }) => {
        setQrLoading(false);
        if (!error && data?.qr_pass) {
          setQrValue(
            JSON.stringify({
              reservation_id: reservation.id,
              qr_pass: data.qr_pass,
            }),
          );
        }
      });
  }, [reservation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const start = reservation ? dayjs(reservation.start_date) : null;
  const end = reservation ? dayjs(reservation.end_date) : null;
  const windowStart = start ? start.subtract(2, 'hour') : null;
  const qrAvailable = Boolean(
    reservation?.payment_status === 'paid' &&
    windowStart &&
    dayjs().isAfter(windowStart) &&
    end &&
    dayjs().isBefore(end.endOf('day')),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.container}>
        {/* Checkmark circle */}
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={36} color={colors.onPrimary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>¡Reserva confirmada!</Text>
        {reservation && (
          <Text style={styles.refText}>
            {reservationRef(reservation.id, reservation.start_date)}
          </Text>
        )}

        {/* QR section */}
        <Text style={styles.qrSectionLabel}>TU CÓDIGO DE ACCESO</Text>
        <View style={[styles.qrCard, !qrAvailable && styles.qrCardPending]}>
          {qrAvailable ? (
            qrLoading || !qrValue ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <QRCode
                  value={qrValue}
                  size={180}
                  backgroundColor={colors.surfaceContainerLow}
                />
                <Text style={styles.qrHint}>
                  Muéstralo en la barrera de entrada y salida
                </Text>
              </>
            )
          ) : (
            <Text style={styles.qrPendingText}>
              Tu código QR estará disponible{'\n'}
              el{start ? ` ${fmtEs(start)} · desde las 14:00` : '…'}
            </Text>
          )}
        </View>

        {/* Dates */}
        {reservation && start && end && (
          <View style={styles.datesCard}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Check-in</Text>
              <Text style={styles.dateValue}>
                {fmtEs(start)} · desde las 14:00
              </Text>
            </View>
            <View style={styles.dateDivider} />
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Check-out</Text>
              <Text style={styles.dateValue}>{fmtEs(end)} · antes 12:00</Text>
            </View>
          </View>
        )}

        {/* CTA */}
        <Pressable
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.replace('/(main)/qr')}
        >
          <Text style={styles.btnText}>Ver mis reservas</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['2xl'],
  },

  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  title: {
    ...typography.headlineMd,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  refText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.xl,
  },

  qrSectionLabel: {
    ...typography.labelSm,
    marginBottom: spacing.sm,
    alignSelf: 'center',
  },
  qrCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  qrCardPending: {
    minHeight: 100,
  },
  qrHint: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  qrPendingText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },

  datesCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.lg,
    width: '100%',
    ...shadow.sm,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateLabel: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  dateValue: {
    ...typography.titleSm,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 8,
  },
  dateDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant,
    marginVertical: 8,
  },

  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    width: '100%',
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadow.sm,
  },
  btnText: { ...typography.titleMd, color: colors.onPrimary },
});
