import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!granted) {
    Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para cambiar la foto.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return null;

  const uri = result.assets[0].uri;
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const path = `${userId}/avatar.${ext}`;

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;

  const { error: dbError } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, avatar_url: publicUrl }, { onConflict: 'user_id' });
  if (dbError) throw dbError;

  return publicUrl;
}

export async function deleteAvatar(userId: string): Promise<void> {
  const { data: files } = await supabase.storage.from('avatars').list(userId);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from('avatars').remove(paths);
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({ avatar_url: null })
    .eq('user_id', userId);
  if (error) throw error;
}
