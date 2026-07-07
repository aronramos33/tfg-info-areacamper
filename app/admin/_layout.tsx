import { View, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../providers/AuthProvider';
import { colors, radii } from '@/lib/theme';

const ADMIN_TAB_CONFIG = [
  { name: 'services',   title: 'Servicios', icon: 'briefcase-outline' },
  { name: 'places',     title: 'Estado',    icon: 'calendar-outline'  },
  { name: 'mapa/index', title: 'Mapa',      icon: 'map-outline'       },
  { name: 'qr/index',   title: 'QR',        icon: 'qr-code-outline'   },
  { name: 'profile',    title: 'Perfil',    icon: 'person-outline'    },
] as const;

function AdminTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom || 8 }]}>
      {state.routes.map((route, index) => {
        const config = ADMIN_TAB_CONFIG.find((t) => t.name === route.name);
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
              <Ionicons name={config.icon as any} size={20} color={color} />
              <Text style={[tabStyles.label, { color }]} numberOfLines={1}>{config.title}</Text>
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
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: radii.md,
    gap: 3,
  },
  pillActive: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
});

export default function AdminTabsLayout() {
  const { session, loading, ownerLoading } = useAuth();

  if (loading || (session && ownerLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(main)/qr" />;
  }

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <AdminTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="services"   options={{ title: 'Servicios' }} />
      <Tabs.Screen name="places"     options={{ title: 'Estado'    }} />
      <Tabs.Screen name="mapa/index" options={{ title: 'Mapa'      }} />
      <Tabs.Screen name="qr/index"   options={{ title: 'QR'        }} />
      <Tabs.Screen name="profile"    options={{ title: 'Perfil'    }} />
    </Tabs>
  );
}
