import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertState = {
  visible: boolean;
  title: string;
  message: string | undefined;
  buttons: AlertButton[];
};

const HIDDEN: AlertState = { visible: false, title: '', message: undefined, buttons: [] };

let _show: ((title: string, message?: string, buttons?: AlertButton[]) => void) | null = null;

export const AppAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    _show?.(title, message, buttons);
  },
};

export function AppAlertProvider() {
  const [state, setState] = useState<AlertState>(HIDDEN);

  useEffect(() => {
    _show = (title, message, buttons) => {
      setState({
        visible: true,
        title,
        message,
        buttons: buttons?.length ? buttons : [{ text: 'Aceptar' }],
      });
    };
    return () => { _show = null; };
  }, []);

  const dismiss = (onPress?: () => void) => {
    setState(s => ({ ...s, visible: false }));
    if (onPress) setTimeout(onPress, 200);
  };

  const { visible, title, message, buttons } = state;
  const vertical = buttons.length > 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => dismiss()}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={[styles.actions, vertical && styles.actionsVertical]}>
            {buttons.map((btn, i) => (
              <Pressable
                key={i}
                onPress={() => dismiss(btn.onPress)}
                style={({ pressed }) => [
                  styles.btn,
                  !vertical && styles.btnFlex,
                  btn.style === 'cancel'
                    ? styles.btnCancel
                    : btn.style === 'destructive'
                    ? styles.btnDestructive
                    : styles.btnDefault,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text
                  style={[
                    styles.btnText,
                    btn.style === 'cancel'
                      ? styles.btnTextCancel
                      : btn.style === 'destructive'
                      ? styles.btnTextDestructive
                      : styles.btnTextDefault,
                  ]}
                >
                  {btn.text}
                </Text>
              </Pressable>
            ))}
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
  title: {
    ...typography.headlineMd,
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    ...typography.bodyLg,
    textAlign: 'center',
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  actionsVertical: {
    flexDirection: 'column',
  },
  btn: {
    paddingVertical: 13,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlex: { flex: 1 },
  btnDefault: { backgroundColor: colors.primary, ...shadow.sm },
  btnCancel: { backgroundColor: colors.surfaceContainerHigh },
  btnDestructive: { backgroundColor: colors.errorContainer },
  btnText: { ...typography.titleSm },
  btnTextDefault: { color: colors.onPrimary },
  btnTextCancel: { color: colors.onSurface },
  btnTextDestructive: { color: colors.error },
});
