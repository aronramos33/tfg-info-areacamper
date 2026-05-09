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

### Supabase Edge Function Secrets

Set in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Descripción |
|--------|-------------|
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret del webhook de Stripe |
| `STRIPE_SUCCESS_REDIRECT_URL` | URL de redirección tras pago OK |
| `STRIPE_CANCEL_REDIRECT_URL` | URL de redirección tras pago cancelado |
| `EXPO_GO_BASE_URL` | Base URL de la app para deep links |
| `RESEND_API_KEY` | API key de Resend para emails al admin |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (acceso admin a BD) |

## Architecture

This is a **React Native + Expo** app (TypeScript) for a camping/parking area reservation system. It uses **Expo Router** (file-based routing) with **Supabase** as the full backend (auth + PostgreSQL database).

### Auth & Role-Based Routing

The entire routing strategy is driven by the `AuthProvider` (`providers/AuthProvider.tsx`):

- `AuthProvider` initializes a Supabase session (persisted via AsyncStorage) and queries the `owners` table to set the `isOwner` flag.
- `app/index.tsx` acts as a gate: no session → `/(auth)`, session + `isOwner` → `/admin/qr`, session regular user → `/(main)/qr`.
- The root layout (`app/_layout.tsx`) wraps everything in `GestureHandlerRootView` and `AuthProvider`, then renders a `<Slot>`.

### Route Groups

- `(auth)/` — Login + sign-up (tabs dentro de un mismo screen).
- `(main)/` — Tab navigation for regular users: QR/reservas, nueva reserva, servicios, perfil.
- `(screens)/` — Modal screens: checkout, success.
- `admin/` — Tab navigation for owners: QR scanner, gestión de plazas y reservas, mapa, servicios admin, perfil.

### Key Files

| File | Purpose |
|------|---------|
| `lib/supabase.ts` | Supabase client singleton (AsyncStorage session persistence) |
| `providers/AuthProvider.tsx` | Global auth context: session, user, `isOwner`, `signOut` |
| `app/index.tsx` | Auth gate — redirects based on session/role |
| `app.config.ts` | Expo config: reads `.env`, injects `extra`, configures plugins |
| `components/utils/dates.ts` | `nightsBetween(from, to)` — calcula noches entre dos fechas |
| `components/utils/money.ts` | `formatCents(amount)` — convierte céntimos a EUR string |
| `components/utils/vehicle.ts` | `normalizePlate`, `isValidSpanishPlate`, `vehicleDisplayName`, tipo `Vehicle` |
| `components/utils/refund.ts` | `computeRefundTier`, `computeRefundAmountCents`, `describeRefundPolicy` |
| `components/utils/reservationModification.ts` | `computeReservationTotalCents`, `computeDeltaCents`, `isModifiable`, `isCancellable` |

### Supabase Backend

- **Auth**: Email/password + Google OAuth (`@react-native-google-signin`). OAuth deep-link callback handled in `index.ts` at the root.
- **Tables**: ver sección Supabase más abajo.
- **Edge Functions**: ver sección Edge Functions más abajo.

### Path Aliases

`@/` maps to the project root. Use `@/lib/supabase`, `@/providers/AuthProvider`, etc. for imports.

### New Architecture

React Native New Architecture is enabled (`newArchEnabled: true` in `app.config.ts`). The Reanimated Babel plugin must remain last in `babel.config.js`.

---

## Route Map

| Ruta | Archivo | Propósito |
|------|---------|-----------|
| `/` | `app/index.tsx` | Auth gate — redirige según sesión y rol |
| `/(auth)/sign-in` | `app/(auth)/sign-in.tsx` | Login + registro con email (tabs en un mismo screen) |
| `/(main)/qr` | `app/(main)/qr/index.tsx` | Lista de reservas del usuario: activas, próximas, canceladas, anteriores. QR rotativo cada 45s |
| `/(main)/qr/[reservationId]` | `app/(main)/qr/[reservationId]/index.tsx` | Detalle de reserva: vehículo, extras, desglose, acciones cancelar/modificar |
| `/(main)/qr/[reservationId]/edit` | `app/(main)/qr/[reservationId]/edit.tsx` | Editor de modificación: noches, extras, vehículo. Calcula delta en vivo |
| `/(main)/reservations` | `app/(main)/reservations/index.tsx` | Selector de fechas + botón para iniciar checkout (nueva reserva) |
| `/(main)/services` | `app/(main)/services/index.tsx` | Catálogo de servicios informativos |
| `/(main)/services/[serviceId]` | `app/(main)/services/[serviceId].tsx` | Detalle de servicio |
| `/(main)/profile` | `app/(main)/profile/index.tsx` | Perfil de usuario + acceso a vehículos, contraseña |
| `/(main)/profile/vehicles` | `app/(main)/profile/vehicles.tsx` | CRUD de vehículos del usuario (marca, modelo, matrícula, alias, longitud) |
| `/(screens)/checkout` | `app/(screens)/checkout.tsx` | Flujo de pago: selector de vehículo + extras + Stripe |
| `/(screens)/success` | `app/(screens)/success.tsx` | Confirmación tras pago. Soporta `mode=modify` para modificaciones |
| `/admin/qr` | `app/admin/qr/index.tsx` | Escáner QR para check-in (solo propietario) |
| `/admin/places` | `app/admin/places/index.tsx` | Gestión de plazas de parking |
| `/admin/places/reservas` | `app/admin/places/reservas.tsx` | Listado de reservas con filtros: Todas / Pagadas / Reembolsadas / Canceladas |
| `/admin/places/[reservationId]` | `app/admin/places/[reservationId].tsx` | Detalle de reserva (admin): huésped, vehículo, extras, desglose |
| `/admin/mapa` | `app/admin/mapa/index.tsx` | Mapa interactivo de zonas del área |
| `/admin/services` | `app/admin/services/index.tsx` | Listado y gestión de servicios (admin) |
| `/admin/services/[serviceId]` | `app/admin/services/[serviceId].tsx` | Edición de un servicio existente |
| `/admin/services/new` | `app/admin/services/new.tsx` | Creación de nuevo servicio |

**Layouts de Stack** (necesarios para que las sub-rutas no aparezcan como tabs):
- `app/(main)/qr/_layout.tsx` — Stack para `[reservationId]` y su sub-ruta `edit`
- `app/(main)/profile/_layout.tsx` — Stack para `vehicles`

---

## Components

### Componentes reutilizables

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| `AppButton` | `components/AppButton.tsx` | Botón estándar de la app (acepta `loading`, fondo azul) |
| `SignInButton` | `components/SignInButton.tsx` | Botón de OAuth con Google (WebBrowser flow + SVG logo) |
| `SignInEmailButton` | `components/SignInEmailButton.tsx` | Botón de acceso con email |
| `SignUpEmailButton` | `components/SignUpEmailButton.tsx` | Botón de registro con email |
| `CalendarRangePaged` | `components/CalendarRangePaged.tsx` | Selector de rango de fechas paginado por mes (flash-calendar). Props: `minDate`, `maxDate`, `onChange({startId, endId})` |
| `RequireAuthCard` | `components/RequireAuthCard.tsx` | Card que pide al usuario autenticarse |

### Utilidades

| Función/Tipo | Archivo | Descripción |
|---------|---------|-------------|
| `nightsBetween(from, to)` | `components/utils/dates.ts` | Calcula el número de noches entre dos fechas ISO |
| `formatCents(amount)` | `components/utils/money.ts` | Convierte céntimos a string EUR. `NIGHTLY_CENTS = 1500` |
| `Vehicle` (tipo), `normalizePlate`, `isValidSpanishPlate`, `isValidLengthMeters`, `parseLengthMeters`, `vehicleDisplayName` | `components/utils/vehicle.ts` | Helpers de vehículos |
| `computeRefundTier(startDate)` | `components/utils/refund.ts` | Política: >7d→full, 1-7d→half, <24h→none |
| `computeRefundAmountCents(total, tier)` | `components/utils/refund.ts` | Calcula importe a reembolsar |
| `computeReservationTotalCents(draft)` | `components/utils/reservationModification.ts` | Calcula el total de una reserva dado un estado |
| `computeDeltaCents(original, next)` | `components/utils/reservationModification.ts` | Diferencia entre dos estados de reserva |
| `isModifiable(startDate, status)` | `components/utils/reservationModification.ts` | `confirmed`/`pending` y `start_date > now` |
| `isCancellable(startDate, status)` | `components/utils/reservationModification.ts` | Igual que `isModifiable` |

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

#### `vehicles`
Vehículos de cada usuario (relación 1:N). Un usuario puede tener múltiples vehículos.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK, identity |
| `user_id` | uuid | FK → auth.users (ON DELETE CASCADE) |
| `brand` | text | marca |
| `model` | text | modelo |
| `plate` | text | matrícula |
| `alias` | text | apodo opcional |
| `length_m` | numeric(4,2) | longitud en metros (opcional) |
| `created_at` | timestamptz | default now() |

UNIQUE `(user_id, plate)`. RLS: cada usuario solo ve/edita los suyos.

#### `reservations`
Reservas de usuarios. Enum `status`: `pending` → `confirmed` → `checked_in` → `checked_out` / `cancelled`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `user_id` | uuid | FK → auth.users |
| `place_ids` | int4[] | array de plazas asignadas |
| `num_places` | integer | default 1 |
| `start_date` | date | |
| `end_date` | date | |
| `full_name` | text | nombre del titular |
| `phone` | text | |
| `dni` | text | |
| `vehicle_id` | bigint | FK → vehicles (nullable, ON DELETE SET NULL) |
| `vehicle_brand` | text | snapshot histórico |
| `vehicle_model` | text | snapshot histórico |
| `vehicle_plate` | text | snapshot histórico |
| `vehicle_alias` | text | snapshot histórico |
| `vehicle_length_m` | numeric(4,2) | snapshot histórico |
| `nightly_amount_cents` | integer | precio/noche en el momento de reservar |
| `total_amount_cents` | integer | total pagado (actualizado al modificar) |
| `status` | enum | pending/confirmed/checked_in/checked_out/cancelled |
| `payment_status` | text | `'paid'` o `'refunded'` |
| `checkout_session_id` | text | nullable (Stripe, creación) |
| `payment_intent_id` | text | nullable |
| `refund_id` | text | nullable (último refund_id de Stripe) |
| `refund_amount_cents` | integer | total reembolsado acumulado (default 0) |
| `access_code` | text | nullable, unique |
| `access_expires_at` | timestamptz | nullable |
| `qr_token` | text | nullable |
| `qr_generated_at` | timestamptz | nullable |
| `currency` | text | default `'eur'` |
| `paid_at` | timestamptz | nullable |
| `modified_at` | timestamptz | nullable — última modificación aplicada |
| `cancelled_at` | timestamptz | nullable |
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
Líneas de extras asociadas a una reserva. Se recalculan al modificar la reserva.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint | PK |
| `reservation_id` | bigint | FK → reservations |
| `extra_id` | bigint | FK → extras |
| `pricing_type` | enum | per_night / per_stay |
| `unit_amount_cents` | integer | precio en el momento |
| `quantity` | integer | default 1 |
| `line_total_cents` | integer | default 0 |
| `created_at` | timestamptz | |

#### `services`
Catálogo de servicios informativos del área. PK es `text` (slug). **Sin RLS** — acceso público de lectura.

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
Registro de auditoría de todos los movimientos de dinero (pagos + reembolsos). Cada fila es un evento.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `reservation_id` | bigint | FK → reservations |
| `user_id` | uuid | |
| `stripe_checkout_session_id` | text | nullable, unique |
| `stripe_payment_intent_id` | text | nullable |
| `amount_total` | integer | en céntimos. Positivo = cobro, negativo = reembolso |
| `provider` | text | default `'stripe'` |
| `status` | text | `'completed'` / `'refunded'` |
| `currency` | text | default `'eur'` |
| `metadata` | jsonb | `{action: 'cancel'/'modify'/'modify_paid', tier?, refund_id?}` |
| `created_at` / `updated_at` | timestamptz | |

### RPC

#### `get_available_places(p_start_date, p_end_date, p_count)`
Devuelve array de `place_id` libres para el rango dado. Excluye reservas con `payment_status='paid'` **y** `status <> 'cancelled'`, más `maintenance_blocks` activos. Devuelve `NULL` si no hay suficientes plazas.

### Edge Functions

| Función | Auth | Descripción |
|---------|------|-------------|
| `issue-qr-pass` | JWT | Genera token QR rotativo. Invocada desde `qr/index.tsx` cada 45s |
| `create-checkout-session` | JWT | Crea sesión Stripe con datos de reserva y vehículo. Devuelve `{url, session_id}` |
| `stripe-webhook` | — (Stripe signature) | Webhook de Stripe. Rama por `metadata.action`: `create` → inserta reserva; `modify` → actualiza reserva existente + extras + registra pago |
| `stripe-success` | — | Redirect handler: reenvía `session_id` y `mode` (create/modify) al deep link de la app |
| `stripe-cancel` | — | Redirect handler para pago cancelado |
| `cancel-reservation` | JWT | Cancela reserva del usuario. Calcula tier de reembolso server-side, llama Stripe `/v1/refunds`, actualiza BD, registra en `reservation_payments`, envía email al admin via Resend |
| `modify-reservation` | JWT | Modifica reserva antes del check-in. Tres ramas: `delta=0` → aplica directo; `delta<0` → Stripe refund + aplica; `delta>0` → crea Stripe Checkout. En rama delta<0 envía email al admin |
| `verify-qr-pass` | JWT | Verifica token QR |

### Política de cancelación / reembolso

| Días hasta `start_date` | Tier | Reembolso |
|------------------------|------|-----------|
| > 7 días | `full` | 100% |
| 1 – 7 días | `half` | 50% |
| < 24 horas | `none` | 0% |

La política se calcula **server-side** en `cancel-reservation` (nunca se confía en el cliente). El cliente la pre-visualiza con `computeRefundTier` de `components/utils/refund.ts`.

### Notificaciones al admin

Cuando hay cancelación o modificación con reembolso, las edge functions envían un email al email del admin (obtenido via `auth.admin.getUserById` para cada `user_id` en la tabla `owners`) usando la API REST de **Resend** (`RESEND_API_KEY`). Si la variable no está configurada, la notificación se omite silenciosamente sin afectar al flujo de la reserva.

---

## Flujos de pago

### Crear reserva
`checkout.tsx` → `create-checkout-session` → Stripe → `stripe-success` (redirect) → `success.tsx` (polling `reservations.checkout_session_id`) → `stripe-webhook` inserta la reserva.

### Modificar reserva (delta > 0)
`edit.tsx` → `modify-reservation` → Stripe Checkout → `stripe-success` (redirect con `mode=modify`) → `success.tsx` (polling `reservation_payments.stripe_checkout_session_id`) → `stripe-webhook` (rama `modify`) actualiza la reserva.

### Modificar reserva (delta ≤ 0)
`edit.tsx` → `modify-reservation` → aplica directo en BD (+ Stripe refund si delta < 0) → responde `{mode: 'free'|'refunded'}` → `edit.tsx` muestra Alert y vuelve al detalle.

### Cancelar reserva
`[reservationId]/index.tsx` → Alert con importe preview → `cancel-reservation` → Stripe refund → BD actualizada → email al admin.
