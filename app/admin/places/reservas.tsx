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
  user_id: string;
};

function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string) {
  return dayjs(d).format('DD/MM/YYYY');
}

const STATUS_LABELS: Record<string, string> = {
  paid: '✅ Pagada',
  refunded: '↩️ Reembolsada',
  cancelled: '❌ Cancelada',
};
const STATUS_COLORS: Record<string, string> = {
  paid: '#e8f5e9',
  refunded: '#e3f2fd',
  cancelled: '#fdecea',
};

function reservationDisplayStatus(r: Reservation): string {
  if (r.status === 'cancelled') return 'cancelled';
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
          .select(
            'id,start_date,end_date,payment_status,status,full_name,total_amount_cents,refund_amount_cents,cancelled_at,user_id',
          )
          .order('start_date', { ascending: false });

        const ownersRes = await supabase.from('owners').select('user_id');

        const ownerIds = new Set(
          (ownersRes.data ?? []).map((o: any) => o.user_id),
        );

        setReservations(
          ((reservationsRes.data ?? []) as Reservation[]).filter(
            (r) => !ownerIds.has(r.user_id),
          ),
        );

        setLoading(false);
      })();
    }, []),
  );

  const filtered = reservations.filter((r) => {
    if (statusFilter !== 'all') {
      const display = reservationDisplayStatus(r);
      if (display !== statusFilter) return false;
    }
    if (searchId.trim() && !String(r.id).includes(searchId.trim()))
      return false;
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      {/* Cabecera */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/admin/places')}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Reservas</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Filtros */}
      <View style={styles.filtersCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 10 }}
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'all', label: 'Todas' },
              { key: 'paid', label: '✅ Pagadas' },
              { key: 'refunded', label: '↩️ Reembolsadas' },
              { key: 'cancelled', label: '❌ Canceladas' },
            ].map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setStatusFilter(s.key)}
                style={[
                  styles.chip,
                  statusFilter === s.key && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    statusFilter === s.key && styles.chipTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <TextInput
          value={searchId}
          onChangeText={setSearchId}
          placeholder="Buscar por ID de reserva"
          style={styles.input}
          keyboardType="numeric"
        />

        <TextInput
          value={searchName}
          onChangeText={setSearchName}
          placeholder="Buscar por nombre"
          style={[styles.input, { marginTop: 8 }]}
          autoCapitalize="words"
        />

        <View style={styles.dateRangeRow}>
          <TextInput
            value={searchFrom}
            onChangeText={setSearchFrom}
            placeholder="Desde DD/MM/YYYY"
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            maxLength={10}
          />
          <Text style={styles.dateRangeSep}>→</Text>
          <TextInput
            value={searchTo}
            onChangeText={setSearchTo}
            placeholder="Hasta DD/MM/YYYY"
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            maxLength={10}
          />
        </View>

        <Text style={styles.resultCount}>
          {filtered.length} reserva{filtered.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer}>
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay reservas con estos filtros.
            </Text>
          ) : (
            filtered.map((r) => (
              <Pressable
                key={r.id}
                onPress={() =>
                  router.push({
                    pathname: `/admin/places/${r.id}`,
                    params: { from: 'reservas' },
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>
                      {r.full_name ?? 'Sin nombre'}
                    </Text>
                    <Text style={styles.cardId}>
                      #{r.id}
                    </Text>
                  </View>
                  <View style={styles.cardRight}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            STATUS_COLORS[reservationDisplayStatus(r)] ?? '#eee',
                        },
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {STATUS_LABELS[reservationDisplayStatus(r)] ??
                          r.payment_status}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardDates}>
                    📅 {formatDate(r.start_date)} → {formatDate(r.end_date)}
                  </Text>
                  <Text style={styles.cardAmount}>
                    {formatEuro(r.total_amount_cents)}
                  </Text>
                </View>
              </Pressable>
            ))
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F7F8FB',
  },
  backBtn: { width: 70 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#111' },

  filtersCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f0f0f0',
  },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#555' },
  chipTextActive: { color: 'white' },

  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  dateRangeSep: { fontSize: 16, color: '#aaa', fontWeight: '700' },
  resultCount: {
    marginTop: 10,
    fontSize: 12,
    color: '#aaa',
    fontWeight: '600',
    textAlign: 'right',
  },

  listContainer: { paddingHorizontal: 16, paddingBottom: 48, gap: 10 },
  emptyText: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 40,
    fontSize: 15,
  },

  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardId: { fontSize: 12, color: '#aaa', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  chevron: { fontSize: 20, color: '#ccc', fontWeight: '700' },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDates: { fontSize: 13, color: '#555' },
  cardAmount: { fontSize: 14, fontWeight: '800', color: '#333' },
});
