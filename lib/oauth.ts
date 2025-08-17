// lib/oauth.ts
import * as WebBrowser from 'expo-web-browser';
//import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import Constants from 'expo-constants';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const IS_EXPO_GO = Constants.appOwnership === 'expo';

// ⬇️ Rellena con tus datos reales
const EXPO_OWNER = '@aronramos33'; // por ejemplo: '@midudev'
const EXPO_SLUG = 'tfg-info-areacamper'; // por ejemplo: 'mi-app'
const NATIVE_SCHEME = 'tfg-info-areacamper'; // el scheme que pusiste en app.json

// ⚠️ URL exacta que usaremos como redirect en Expo Go (sin makeRedirectUri)
const EXPO_GO_REDIRECT = `https://auth.expo.io/${EXPO_OWNER}/${EXPO_SLUG}`;

// ⚠️ URL exacta para build nativa / dev client
const NATIVE_REDIRECT = `${NATIVE_SCHEME}://auth-callback`;

function getRedirectUri() {
  return IS_EXPO_GO ? EXPO_GO_REDIRECT : NATIVE_REDIRECT;
}

function getStringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

async function createSessionFromCallbackUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const access_token = getStringParam(params, 'access_token');
  const refresh_token = getStringParam(params, 'refresh_token');
  const code = getStringParam(params, 'code');

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    WebBrowser.dismissAuthSession(); // 🔒 cierra la ventana si sigue abierta
    return;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    WebBrowser.dismissAuthSession();
    return;
  }

  throw new Error('No se recibieron tokens ni code en el callback.');
}

export async function signInWithGoogle() {
  const redirectTo = getRedirectUri();

  // 1) Pide la URL del proveedor sin redirigir automáticamente
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;

  // 2) Abre el flujo y espera EXACTAMENTE el redirectTo anterior
  const res = await WebBrowser.openAuthSessionAsync(
    data?.url ?? '',
    redirectTo,
  );

  // 3) Completa sesión si regresó bien
  if (res.type === 'success' && res.url) {
    await createSessionFromCallbackUrl(res.url);
  }
}

// Si usas Linking.useURL() (aperturas en frío)
export async function handleIncomingLink(url: string | null) {
  if (url) await createSessionFromCallbackUrl(url);
}
