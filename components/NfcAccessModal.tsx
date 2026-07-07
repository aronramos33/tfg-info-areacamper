import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

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
              <Ionicons name="radio-outline" size={52} color={colors.secondary} />
              <Text style={styles.bodyText}>
                Acerca tu móvil al lector NFC de la barrera.
              </Text>
              <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
            </View>
          )}

          {phase === 'validating' && (
            <View style={styles.body}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.subtle}>Validando acceso…</Text>
            </View>
          )}

          {phase === 'success' && (
            <View style={styles.body}>
              <Ionicons name="checkmark-circle" size={52} color={colors.confirmedText} />
              <Text style={styles.successText}>BARRERA ABIERTA</Text>
              {tagLabel ? <Text style={styles.subtle}>{tagLabel}</Text> : null}
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.body}>
              <Ionicons name="close-circle" size={52} color={colors.error} />
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
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    padding: spacing.xl,
    ...shadow.md,
  },
  title: { ...typography.headlineMd, textAlign: 'center', marginBottom: 8 },
  body: {
    alignItems: 'center',
    paddingVertical: 24,
    minHeight: 160,
    justifyContent: 'center',
  },
  bodyText: { ...typography.bodyLg, textAlign: 'center', marginTop: 12 },
  subtle: { ...typography.bodyMd, textAlign: 'center', marginTop: 8 },
  successText: {
    ...typography.titleLg,
    color: colors.confirmedText,
    marginTop: 6,
    letterSpacing: 1,
  },
  errorText: {
    ...typography.titleMd,
    color: colors.error,
    marginTop: 6,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary, ...shadow.sm },
  btnPrimaryText: { ...typography.titleSm, color: colors.onPrimary },
  btnSecondary: { backgroundColor: colors.surfaceContainerHigh },
  btnSecondaryText: { ...typography.titleSm },
});
