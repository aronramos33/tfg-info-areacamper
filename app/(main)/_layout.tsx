import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../providers/AuthProvider';
import { colors, radii } from '@/lib/theme';

const TAB_CONFIG = [
  { name: 'services',     title: 'Servicios',  icon: 'briefcase-outline'  },
  { name: 'reservations', title: 'Reservar',   icon: 'calendar-outline'   },
  { name: 'qr',           title: 'Mis Viajes', icon: 'qr-code-outline'    },
  { name: 'profile',      title: 'Perfil',     icon: 'person-outline'     },
] as const;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom || 8 }]}>
      {state.routes.map((route, index) => {
        const config = TAB_CONFIG.find((t) => t.name === route.name);
        if (!config) return null;

        const focused = state.index === index;
        const color = focused ? colors.primary : colors.onSurfaceVariant;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={tabStyles.tabItem}
          >
            <View style={[tabStyles.pill, focused && tabStyles.pillActive]}>
              <Ionicons name={config.icon as any} size={22} color={color} />
              <Text style={[tabStyles.label, { color }]}>{config.title}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.inputSurface,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  pill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.md,
    gap: 3,
  },
  pillActive: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});

export default function MainTabs() {
  const { isOwner } = useAuth();

  if (isOwner) {
    return <Redirect href="/admin/qr" />;
  }

  return (
    <Tabs
      initialRouteName="qr"
      backBehavior="history"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="services"     options={{ title: 'Servicios'  }} />
      <Tabs.Screen name="reservations" options={{ title: 'Reservar'   }} />
      <Tabs.Screen name="qr"           options={{ title: 'Mis Viajes' }} />
      <Tabs.Screen name="profile"      options={{ title: 'Perfil'     }} />
    </Tabs>
  );
}
