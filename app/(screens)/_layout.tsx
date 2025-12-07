import { Stack } from 'expo-router';

export default function ScreenLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal', // o "card"
      }}
    />
  );
}
