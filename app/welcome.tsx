import React from 'react';
import { View, Text } from 'react-native';
import { useAuth } from '../providers/AuthProvider';

export default function Welcome() {
  const { session } = useAuth();

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: '700', textAlign: 'center' }}>
        ¡Bienvenido a mi app!
      </Text>
      {session?.user?.email ? (
        <Text style={{ marginTop: 12, fontSize: 16 }}>
          Has iniciado sesión como {session.user.email}
        </Text>
      ) : null}
    </View>
  );
}
