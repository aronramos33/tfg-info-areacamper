# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start dev server with tunnel (Expo)
npm run android    # Run on Android device/emulator
npm run ios        # Run on iOS simulator
npm run web        # Run in web browser
npm run lint       # Run ESLint
npm run format     # Run Prettier
npm run typecheck  # TypeScript type checking (no emit)
npm run check      # Run lint + format + typecheck together
```

No test framework is configured in this project.

## Environment Variables

Create a `.env` file at the project root:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

These are loaded by `app.config.ts` via `dotenv` and exposed through `Constants.expoConfig.extra`.

## Architecture

This is a **React Native + Expo** app (TypeScript) for a camping/parking area reservation system. It uses **Expo Router** (file-based routing) with **Supabase** as the full backend (auth + PostgreSQL database).

### Auth & Role-Based Routing

The entire routing strategy is driven by the `AuthProvider` (`providers/AuthProvider.tsx`):

- `AuthProvider` initializes a Supabase session (persisted via AsyncStorage) and queries the `owners` table to set the `isOwner` flag.
- `app/index.tsx` acts as a gate: no session → `/(auth)`, session + `isOwner` → `/admin/qr`, session regular user → `/(main)/qr`.
- The root layout (`app/_layout.tsx`) wraps everything in `GestureHandlerRootView` and `AuthProvider`, then renders a `<Slot>`.

### Route Groups

- `(auth)/` — Login, sign-up, and options screens (unauthenticated).
- `(main)/` — Tab navigation for regular users: QR access code, reservations, services, profile.
- `(screens)/` — Modal screens: checkout, success.
- `admin/` — Tab navigation for owners: QR scanner, parking places management, interactive map, services admin, profile.

### Key Files

| File | Purpose |
|------|---------|
| `lib/supabase.ts` | Supabase client singleton (AsyncStorage session persistence) |
| `providers/AuthProvider.tsx` | Global auth context: session, user, `isOwner`, `signOut` |
| `app/index.tsx` | Auth gate — redirects based on session/role |
| `app.config.ts` | Expo config: reads `.env`, injects `extra`, configures plugins |
| `components/utils/dates.ts` | Date formatting helpers |
| `components/utils/money.ts` | Currency formatting helpers |

### Supabase Backend

- **Auth**: Email/password + Google OAuth (`@react-native-google-signin`). OAuth deep-link callback handled in `index.ts` at the root.
- **Tables**: `user_profiles`, `owners`, `reservations`, plus tables for services and parking places.
- **Edge Functions**: `supabase.functions.invoke('issue-qr-pass')` generates rotating QR tokens (45s refresh cycle).

### Path Aliases

`@/` maps to the project root. Use `@/lib/supabase`, `@/providers/AuthProvider`, etc. for imports.

### New Architecture

React Native New Architecture is enabled (`newArchEnabled: true` in `app.config.ts`). The Reanimated Babel plugin must remain last in `babel.config.js`.

---

## Route Map

Mapa completo de rutas del proyecto con su archivo correspondiente:

| Ruta | Archivo | Propósito |
|------|---------|-----------|
| `/` | `app/index.tsx` | Auth gate — redirige según sesión y rol |
| `/(auth)/` | `app/(auth)/index.tsx` | Pantalla de bienvenida |
| `/(auth)/options` | `app/(auth)/options.tsx` | Selector de método de acceso (Google / Email) |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | Login con email y contraseña |
| `/(auth)/sign-up` | `app/(auth)/sign-up.tsx` | Registro con email y contraseña |
| `/(main)/qr` | `app/(main)/qr/index.tsx` | QR de acceso del usuario (token rotativo cada 45s) |
| `/(main)/reservations` | `app/(main)/reservations/index.tsx` | Listado de reservas del usuario |
| `/(main)/services` | `app/(main)/services/index.tsx` | Catálogo de servicios con selector de fechas |
| `/(main)/services/[serviceId]` | `app/(main)/services/[serviceId].tsx` | Detalle de servicio + flujo de reserva |
| `/(main)/profile` | `app/(main)/profile/index.tsx` | Perfil de usuario, métodos de pago, cambio de contraseña |
| `/(screens)/checkout` | `app/(screens)/checkout.tsx` | Flujo de pago de una reserva |
| `/(screens)/success` | `app/(screens)/success.tsx` | Confirmación de reserva completada |
| `/admin/qr` | `app/admin/qr/index.tsx` | Escáner QR para check-in (solo propietario) |
| `/admin/places` | `app/admin/places/index.tsx` | Gestión de plazas de parking |
| `/admin/places/reservas` | `app/admin/places/reservas.tsx` | Gestión de reservas (vista admin) |
| `/admin/places/[reservationId]` | `app/admin/places/[reservationId].tsx` | Detalle de una reserva concreta |
| `/admin/mapa` | `app/admin/mapa/index.tsx` | Mapa interactivo de zonas del área |
| `/admin/services` | `app/admin/services/index.tsx` | Listado y gestión de servicios (admin) |
| `/admin/services/[serviceId]` | `app/admin/services/[serviceId].tsx` | Edición de un servicio existente |
| `/admin/services/new` | `app/admin/services/new.tsx` | Creación de nuevo servicio |

---

## Components

### Componentes reutilizables

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| `AppButton` | `components/AppButton.tsx` | Botón estándar de la app (acepta `loading`, fondo azul) |
| `SignInButton` | `components/SignInButton.tsx` | Botón de OAuth con Google (WebBrowser flow + SVG logo) |
| `SignInEmailButton` | `components/SignInEmailButton.tsx` | Botón de acceso con email |
| `SignUpEmailButton` | `components/SignUpEmailButton.tsx` | Botón de registro con email |
| `CalendarRangePaged` | `components/CalendarRangePaged.tsx` | Selector de rango de fechas (basado en flash-calendar) |
| `RequireAuthCard` | `components/RequireAuthCard.tsx` | Card que pide al usuario autenticarse |

### Utilidades

| Función | Archivo | Descripción |
|---------|---------|-------------|
| `nightsBetween(from, to)` | `components/utils/dates.ts` | Calcula el número de noches entre dos fechas (usa dayjs) |
| `formatCents(amount)` | `components/utils/money.ts` | Convierte céntimos a string EUR. `NIGHTLY_CENTS = 1500` (€15 base por noche) |

---

## Supabase

### Proyecto Supabase

- **Nombre**: Area Camper Marchuquera
- **ID**: `yghvgxszfhyppeyeixkd`
- **Región**: eu-west-3

### Tablas principales

#### `user_profiles`
Perfil extendido del usuario. PK: `user_id` → `auth.users.id`

| Columna | Tipo | Notas |
|---------|------|-------|
| `user_id` | uuid | PK, FK → auth.users |
| `first_name` | text | nullable |
| `last_name` | text | nullable |
| `full_name` | text | nullable |
| `phone` | text | |
| `dni` | text | |
| `license_plate` | text | matrícula del vehículo |
| `preferred_locale` | text | default `'es'` |
| `accepted_terms_at` | timestamptz | nullable |
| `created_at` | timestamptz | default now() |

#### `owners`
Determina el rol admin. Si un `user_id` existe aquí, `isOwner = true`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `user_id` | uuid | PK, FK → auth.users |

#### `places`
Plazas de parking del área.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK, autoincrement |
| `name` | text | |
| `is_active` | boolean | default true |

#### `pricing`
Precios nocturnos. Solo debe haber una fila activa.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `nightly_amount_cents` | integer | > 0 |
| `currency` | text | default `'EUR'` |
| `active` | boolean | default true |

#### `reservations`
Reservas de usuarios. Enum `status`: `pending` → `confirmed` → `checked_in` → `checked_out` / `cancelled`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `user_id` | uuid | FK → auth.users |
| `place_id` | bigint | FK → places (nullable) |
| `place_ids` | int4[] | array de plazas asignadas |
| `num_places` | integer | default 1 |
| `start_date` | date | |
| `end_date` | date | |
| `full_name` | text | nombre del titular |
| `phone` | text | |
| `dni` | text | |
| `license_plate` | text | |
| `nightly_amount_cents` | integer | precio/noche en el momento |
| `total_amount_cents` | integer | total a pagar |
| `status` | enum | pending/confirmed/checked_in/checked_out/cancelled |
| `payment_status` | text | `'paid'` o `'refunded'` |
| `checkout_session_id` | text | nullable (Stripe) |
| `payment_intent_id` | text | nullable |
| `refund_id` | text | nullable |
| `access_code` | text | nullable, unique |
| `access_expires_at` | timestamptz | nullable |
| `qr_token` | text | nullable, token actual del QR |
| `qr_generated_at` | timestamptz | nullable |
| `currency` | text | default `'eur'` |
| `paid_at` | timestamptz | nullable |
| `created_at` | timestamptz | default now() |

#### `extras`
Servicios extra contratables. Enum `pricing_type`: `per_night` / `per_stay`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `code` | text | unique |
| `name_es` | text | |
| `name_en` | text | |
| `pricing_type` | enum | per_night / per_stay |
| `unit_amount_cents` | integer | >= 0 |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | |

#### `reservation_extras`
Líneas de extras asociadas a una reserva.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `reservation_id` | bigint | FK → reservations |
| `extra_id` | bigint | FK → extras |
| `pricing_type` | enum | per_night / per_stay |
| `unit_amount_cents` | integer | |
| `quantity` | integer | default 1 |
| `line_total_cents` | integer | default 0 |
| `created_at` | timestamptz | |

#### `services`
Catálogo de servicios informativos del área. PK es `text` (slug).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | text | PK (slug) |
| `name_es` | text | |
| `short_description_es` | text | nullable |
| `long_description_es` | text | nullable |
| `image_url` | text | nullable |
| `is_external` | boolean | default false |
| `is_active` | boolean | default true |
| `order_index` | integer | default 0 |
| `created_at` | timestamptz | |

#### `maintenance_blocks`
Bloqueos de plazas por mantenimiento u ocupación manual.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `place_id` | bigint | FK → places |
| `starts_on` | date | |
| `ends_on` | date | |
| `block_type` | text | `'maintenance'` / `'occupied'` |
| `reason` | text | nullable |

#### `reservation_payments`
Registro de pagos Stripe asociados a reservas.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `reservation_id` | bigint | FK → reservations |
| `user_id` | uuid | |
| `stripe_checkout_session_id` | text | nullable, unique |
| `stripe_payment_intent_id` | text | nullable |
| `stripe_customer_id` | text | nullable |
| `amount_total` | integer | en céntimos |
| `provider` | text | default `'stripe'` |
| `status` | text | default `'created'` |
| `currency` | text | default `'eur'` |
| `metadata` | jsonb | default `{}` |
| `created_at` / `updated_at` | timestamptz | |

#### `access_events`
Log de eventos de apertura/cierre de acceso.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `reservation_id` | bigint | FK → reservations |
| `event_type` | text | `'open'` / `'close'` |
| `method` | text | `'qr'` / `'nfc'` |
| `by_user_id` | uuid | nullable, FK → auth.users |
| `at` | timestamptz | default now() |

#### `nfc_credentials`
Credenciales NFC vinculadas a usuario/reserva.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `user_id` | uuid | FK → auth.users |
| `reservation_id` | bigint | nullable, FK → reservations |
| `credential` | text | |
| `created_at` | timestamptz | |

#### `push_tokens`
Tokens de notificaciones push (Expo).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `user_id` | uuid | FK → auth.users |
| `expo_token` | text | |
| `device_locale` | text | default `'es'` |
| `created_at` | timestamptz | |

#### `user_profiles_audit`
Auditoría de cambios en perfiles de usuario (sin RLS).

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK, IDENTITY |
| `actor` | uuid | nullable |
| `action` | text | |
| `old_row` | jsonb | nullable |
| `new_row` | jsonb | nullable |
| `changed_at` | timestamptz | default now() |

### Edge Functions

| Función | Descripción |
|---------|-------------|
| `issue-qr-pass` | Genera token QR rotativo para acceso al área. Invocada en `app/(main)/qr/index.tsx` con refresh cada 45s |

---

## Work in Progress

Archivos placeholder pendientes de implementar:

- `screens/loquesea.tsx`
- `screens/profile/change-password.tsx`
- `screens/profile/full-profile.tsx`
- `screens/profile/payment-methods.tsx`
