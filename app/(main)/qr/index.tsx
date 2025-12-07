import { View, Text } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';

export default function QRIndex() {
  const { session } = useAuth();

  if (!session) return <RequireAuthCard />;

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Aquí va tu código QR 🟦</Text>
    </View>
  );
}
