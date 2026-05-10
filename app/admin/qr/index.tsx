import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/lib/supabase';
import NfcAccessModal from '@/components/NfcAccessModal';

type PermanentPass = {
  id: number;
  label: string;
  is_active: boolean;
};

const REFRESH_MS = 45_000;

export default function AdminQrScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [pass, setPass] = useState<PermanentPass | null>(null);
  const [qrPass, setQrPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nfcVisible, setNfcVisible] = useState(false);

  // Load the permanent pass for this admin
  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setError('No hay sesión iniciada.');
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('permanent_passes')
        .select('id, label, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (fetchErr || !data) {
        setError('No se encontró un pase de acceso activo.');
        setLoading(false);
        return;
      }

      setPass(data as PermanentPass);
      setLoading(false);
    };

    load();
  }, []);

  // Rotate QR token every 45s
  useEffect(() => {
    if (!pass) return;

    let cancelled = false;

    const refresh = async () => {
      const { data, error: fnErr } = await supabase.functions.invoke('issue-qr-pass', {
        body: { pass_id: pass.id },
      });
      if (cancelled) return;
      if (fnErr) {
        setQrPass('');
        return;
      }
      setQrPass(String(data?.qr_pass ?? ''));
    };

    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pass]);

  const qrValue = pass && qrPass
    ? JSON.stringify({ pass_id: pass.id, qr_pass: qrPass })
    : '';

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !pass) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Acceso</Text>
          <Text style={styles.subtle}>{error ?? 'Sin pase de acceso.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View
        style={[
          styles.container,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={styles.title}>Acceso</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{pass.label}</Text>

          <View style={{ marginTop: 20, alignItems: 'center' }}>
            {qrValue ? (
              <>
                <QRCode value={qrValue} size={220} />
                <Text style={[styles.subtle, { marginTop: 12, textAlign: 'center' }]}>
                  Este QR te permite el acceso al recinto.{'\n'}Se renueva automáticamente.
                </Text>
                <Pressable
                  onPress={() => setNfcVisible(true)}
                  style={({ pressed }) => [styles.nfcBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.nfcBtnText}>📡 Acceso por NFC</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.qrPlaceholder}>
                <ActivityIndicator />
              </View>
            )}
          </View>
        </View>
      </View>

      <NfcAccessModal
        visible={nfcVisible}
        onClose={() => setNfcVisible(false)}
        kind="pass"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FB' },
  container: { flex: 1, padding: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'center',
  },
  subtle: { color: '#666', marginTop: 4 },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    alignItems: 'center',
  },
  cardLabel: { fontSize: 16, fontWeight: '700', color: '#333' },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#bbb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nfcBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#1A73E8',
  },
  nfcBtnText: { color: '#1A73E8', fontWeight: '700', fontSize: 14 },
});
