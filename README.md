# TFG Info Areacamper - Autenticación con Supabase

Este proyecto implementa autenticación completa con Supabase, incluyendo:

- Inicio de sesión con email/contraseña
- Registro con email/contraseña
- Autenticación con Google OAuth
- Manejo automático de sesiones

## Configuración de Supabase

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Anota la URL del proyecto y la clave anónima

### 2. Configurar autenticación

1. En tu proyecto Supabase, ve a **Authentication** > **Settings**
2. En **Site URL**, agrega:
   - Para desarrollo: `https://auth.expo.io/@aronramos33/tfg-info-areacamper`
   - Para producción: `tfg-info-areacamper://auth-callback`

### 3. Configurar Google OAuth (opcional)

1. Ve a **Authentication** > **Providers** > **Google**
2. Habilita Google
3. Configura tu proyecto en [Google Cloud Console](https://console.cloud.google.com):
   - Crea credenciales OAuth 2.0
   - Agrega las URLs de redirección de Supabase
   - Copia el Client ID y Client Secret a Supabase

### 4. Configurar variables de entorno

Edita `app.config.ts` y reemplaza:

```typescript
extra: {
  SUPABASE_URL: 'https://tu-proyecto.supabase.co', // Tu URL real
  SUPABASE_ANON_KEY: 'tu-clave-anonima-aqui',    // Tu clave real
  EXPO_OWNER: '@aronramos33',
  EXPO_SLUG: 'tfg-info-areacamper',
},
```

## Estructura del proyecto

```
app/
├── (auth)/           # Rutas de autenticación
│   ├── sign-in.tsx   # Inicio de sesión
│   └── sign-up.tsx   # Registro
├── (tabs)/           # Rutas principales (requieren autenticación)
│   └── index.tsx     # Página principal
└── _layout.tsx       # Layout principal con AuthProvider

lib/
├── supabase.ts       # Cliente de Supabase
└── oauth.ts          # Lógica de OAuth con Google

providers/
└── AuthProvider.tsx  # Contexto de autenticación

hooks/
└── useGoogleAuth.ts  # Hook para autenticación con Google
```

## Flujo de autenticación

1. **Usuario no autenticado**: Se redirige a `/(auth)/sign-in`
2. **Inicio de sesión exitoso**: Se redirige automáticamente a `/(tabs)`
3. **Usuario autenticado**: Accede a las rutas protegidas
4. **Cerrar sesión**: Vuelve a la pantalla de inicio de sesión

## Funcionalidades implementadas

- ✅ Autenticación con email/contraseña
- ✅ Registro de usuarios
- ✅ Autenticación con Google OAuth
- ✅ Manejo automático de sesiones
- ✅ Redirección automática según estado de autenticación
- ✅ Interfaz de usuario limpia y responsive
- ✅ Manejo de errores
- ✅ Cerrar sesión

## Comandos útiles

```bash
# Instalar dependencias
npm install

# Iniciar en desarrollo
npm start

# Ejecutar en Android
npm run android

# Ejecutar en iOS
npm run ios
```

## Solución de problemas

### La sesión no persiste

- Verifica que las URLs de redirección estén configuradas correctamente en Supabase
- Asegúrate de que `AsyncStorage` esté funcionando en tu dispositivo

### Error en autenticación con Google

- Verifica la configuración de OAuth en Google Cloud Console
- Confirma que las URLs de redirección coincidan entre Google y Supabase

### No se redirige después de autenticarse

- El `AuthProvider` maneja la redirección automáticamente
- Verifica que no haya errores en la consola
- Asegúrate de que la sesión se esté estableciendo correctamente

## Dependencias principales

- `@supabase/supabase-js`: Cliente de Supabase
- `expo-auth-session`: Manejo de sesiones de autenticación
- `expo-web-browser`: Navegador web para OAuth
- `@react-native-async-storage/async-storage`: Almacenamiento local
- `expo-router`: Navegación y enrutamiento
