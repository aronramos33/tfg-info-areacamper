import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';
import dayjs from 'dayjs';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Reservation = {
  id: number;
  start_date: string;
  end_date: string;
  payment_status: string;
  status: string;
  full_name: string | null;
  total_amount_cents: number | null;
  refund_amount_cents: number | null;
  cancelled_at: string | null;
  modified_at: string | null;
  user_id: string;
};

function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string) {
  return dayjs(d).format('DD/MM/YYYY');
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Pagada',
  modified: 'Modificada',
  refunded: 'Reembolsada',
  cancelled: 'Cancelada',
};
const STATUS_COLORS: Record<string, string> = {
  paid: colors.confirmedBg,
  modified: colors.modifiedBg,
  refunded: '#e3f2fd',
  cancelled: colors.cancelledBg,
};
const STATUS_TEXT_COLORS: Record<string, string> = {
  paid: colors.confirmedText,
  modified: colors.modifiedText,
  refunded: '#2c3e82',
  cancelled: colors.cancelledText,
};

function reservationDisplayStatus(r: Reservation): string {
  if (r.status === 'cancelled') {
    return (r.refund_amount_cents ?? 0) > 0 ? 'refunded' : 'cancelled';
  }
  if (r.modified_at) return 'modified';
  return r.payment_status;
}

export default function AdminReservas() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();

  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [searchName, setSearchName] = useState('');
  const [searchId, setSearchId] = useState('');
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(filter ?? 'all');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        const reservationsRes = await supabase
          .from('reservations')
          .select('id,start_date,end_date,payment_status,status,full_name,total_amount_cents,refund_amount_cents,cancelled_at,modified_at,user_id')
          .order('start_date', { ascending: false });
        setReservations((reservationsRes.data ?? []) as Reservation[]);
        setLoading(false);
      })();
    }, []),
  );

  const filtered = reservations.filter((r) => {
    if (statusFilter !== 'all') {
      const display = reservationDisplayStatus(r);
      if (display !== statusFilter) return false;
    }
    if (searchId.trim() && !String(r.id).includes(searchId.trim())) return false;
    if (searchName.trim()) {
      const name = (r.full_name ?? '').toLowerCase();
      if (!name.includes(searchName.trim().toLowerCase())) return false;
    }
    if (searchFrom.trim()) {
      const from = dayjs(searchFrom.trim(), 'DD/MM/YYYY', true);
      if (from.isValid() && dayjs(r.end_date).isBefore(from)) return false;
    }
    if (searchTo.trim()) {
      const to = dayjs(searchTo.trim(), 'DD/MM/YYYY', true);
      if (to.isValid() && dayjs(r.start_date).isAfter(to)) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Reservas</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.filtersCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'all', label: 'Todas' },
              { key: 'paid', label: 'Pagadas' },
              { key: 'modified', label: 'Modificadas' },
              { key: 'refunded', label: 'Reembolsadas' },
              { key: 'cancelled', label: 'Canceladas' },
            ].map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setStatusFilter(s.key)}
                style={[styles.chip, statusFilter === s.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, statusFilter === s.key && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <TextInput value={searchId} onChangeText={setSearchId} placeholder="Buscar por ID de reserva" style={styles.input} keyboardType="numeric" />
        <TextInput value={searchName} onChangeText={setSearchName} placeholder="Buscar por nombre" style={[styles.input, { marginTop: 8 }]} autoCapitalize="words" />

        <View style={styles.dateRangeRow}>
          <TextInput value={searchFrom} onChangeText={setSearchFrom} placeholder="Desde DD/MM/YYYY" style={[styles.input, { flex: 1 }]} keyboardType="numeric" maxLength={10} />
          <Text style={styles.dateRangeSep}>→</Text>
          <TextInput value={searchTo} onChangeText={setSearchTo} placeholder="Hasta DD/MM/YYYY" style={[styles.input, { flex: 1 }]} keyboardType="numeric" maxLength={10} />
        </View>

        <Text style={styles.resultCount}>
          {filtered.length} reserva{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer}>
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No hay reservas con estos filtros.</Text>
          ) : (
            filtered.map((r) => {
              const ds = reservationDisplayStatus(r);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/admin/places/${r.id}`)}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{r.full_name ?? 'Sin nombre'}</Text>
                      <Text style={styles.cardId}>#{r.id}</Text>
                    </View>
                    <View style={styles.cardRight}>
                      <View style={[styles.badge, { backgroundColor: STATUS_COLORS[ds] ?? colors.surfaceContainerHigh }]}>
                        <Text style={[styles.badgeText, { color: STATUS_TEXT_COLORS[ds] ?? colors.onSurface }]}>
                          {STATUS_LABELS[ds] ?? r.payment_status}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.cardDates}>
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </Text>
                    <Text style={styles.cardAmount}>{formatEuro(r.total_amount_cents)}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  backBtn: { width: 70 },
  backText: { ...typography.titleMd, color: colors.secondary },
  pageTitle: { ...typography.titleLg },

  filtersCard: {
    backgroundColor: colors.surfaceContainerLow,
    marginHorizontal: spacing.lg,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    ...shadow.sm,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.full, backgroundColor: colors.surfaceContainerHigh },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  chipTextActive: { color: colors.onPrimary },

  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  dateRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dateRangeSep: { ...typography.titleMd, color: colors.onSurfaceVariant },
  resultCount: { marginTop: 10, ...typography.labelMd, textAlign: 'right' },

  listContainer: { paddingHorizontal: spacing.lg, paddingBottom: 48, gap: 10 },
  emptyText: { textAlign: 'center', ...typography.bodyMd, marginTop: 40 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: 14,
    ...shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { ...typography.titleMd },
  cardId: { ...typography.labelMd, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.full },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  chevron: { fontSize: 20, color: colors.onSurfaceVariant, fontFamily: 'PlusJakartaSans_700Bold' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDates: { ...typography.bodyMd },
  cardAmount: { ...typography.titleSm, color: colors.onSurface },
});
