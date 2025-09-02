import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

const AppButton = ({
  title,
  onPress,
  loading,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppButton;
