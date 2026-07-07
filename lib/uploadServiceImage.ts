import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export async function pickImage(): Promise<string | null> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!granted) {
    Alert.alert(
      'Permiso denegado',
      'Necesitamos acceso a tu galería para subir imágenes.',
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function uploadServiceImage(
  localUri: string,
  serviceId: string,
): Promise<string> {
  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const path = `${serviceId}-${Date.now()}.${ext}`;

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('service-images')
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });

  if (error) throw error;

  return supabase.storage.from('service-images').getPublicUrl(path).data
    .publicUrl;
}
