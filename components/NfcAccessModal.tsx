import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { supabase } from '@/lib/supabase';

type NfcAccessModalProps = {
  visible: boolean;
  onClose: () => void;
  kind: 'reservation' | 'pass';
};

type Phase = 'scanning' | 'validating' | 'success' | 'error';

const DEMO_TAG_UID = '8FC731F1';

const ERROR_MESSAGES: Record<string, string> = {
  unknown_tag: 'Tag NFC no autorizado.',
  no_active_reservation: 'No tienes una reserva activa para este horario.',
  no_active_pass: 'Tu pase de acceso no está activo.',
  invalid_session: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
};

export default function NfcAccessModal({
  visible,
  onClose,
  kind,
}: NfcAccessModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [message, setMessage] = useState('');
  const [tagLabel, setTagLabel] = useState('');
  const cancelledRef = useRef(false);

  const runFlow = async () => {
    cancelledRef.current = false;
    setPhase('scanning');
    setMessage('');
    setTagLabel('');

    // Simula el tiempo de lectura del tag NFC (~1.5s)
    await new Promise((res) => setTimeout(res, 1500));
    if (cancelledRef.current) return;

    setPhase('validating');

    const { data, error } = await supabase.functions.invoke('verify-nfc-pass', {
      body: { tag_uid: DEMO_TAG_UID, kind },
    });

    if (cancelledRef.current) return;

    if (error || !data?.ok) {
      const reason: string = (data?.reason as string) ?? error?.message ?? 'unknown';
      setPhase('error');
      setMessage(ERROR_MESSAGES[reason] ?? `Acceso denegado (${reason}).`);
      return;
    }

    setTagLabel(String(data?.tag_label ?? ''));
    setPhase('success');
  };

  useEffect(() => {
    if (!visible) return;
    runFlow();
    return () => {
      cancelledRef.current = true;
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Acceso por NFC</Text>

          {phase === 'scanning' && (
            <View style={styles.body}>
              <Text style={styles.bigIcon}>📡</Text>
              <Text style={styles.bodyText}>
                Acerca tu móvil al lector NFC de la barrera.
              </Text>
              <ActivityIndicator style={{ marginTop: 16 }} />
            </View>
          )}

          {phase === 'validating' && (
            <View style={styles.body}>
              <ActivityIndicator />
              <Text style={styles.subtle}>Validando acceso…</Text>
            </View>
          )}

          {phase === 'success' && (
            <View style={styles.body}>
              <Text style={[styles.bigIcon, { color: '#1a7f37' }]}>✓</Text>
              <Text style={styles.successText}>BARRERA ABIERTA</Text>
              {tagLabel ? <Text style={styles.subtle}>{tagLabel}</Text> : null}
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.body}>
              <Text style={[styles.bigIcon, { color: '#b42318' }]}>✕</Text>
              <Text style={styles.errorText}>Acceso denegado</Text>
              <Text style={styles.subtle}>{message}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {phase === 'error' && (
              <Pressable
                onPress={runFlow}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.btnPrimaryText}>Reintentar</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.btnSecondaryText}>
                {phase === 'success' ? 'Listo' : 'Cerrar'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#111',
  },
  body: {
    alignItems: 'center',
    paddingVertical: 24,
    minHeight: 160,
    justifyContent: 'center',
  },
  bigIcon: { fontSize: 52, textAlign: 'center' },
  bodyText: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    marginTop: 12,
  },
  subtle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 8 },
  successText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a7f37',
    marginTop: 6,
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b42318',
    marginTop: 6,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#1a73e8' },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  btnSecondary: { backgroundColor: '#eef0f3' },
  btnSecondaryText: { color: '#111', fontWeight: '600' },
});
