import { Slot, Redirect } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { View, ActivityIndicator } from 'react-native';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (session) return <Redirect href="/(tabs)" />;

  return <Slot />;
}
