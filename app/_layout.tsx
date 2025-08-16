import { Stack } from 'expo-router';
import { AuthProvider } from '@/providers/AuthProvider'; // importamos tu provider

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
