import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { useBrickifyStore } from '../src/store/useBrickifyStore';

/** Écran 2 — Prise de photo / upload. */
export default function CaptureScreen() {
  const [busy, setBusy] = useState<string | null>(null);
  const { startProject, setUpload } = useBrickifyStore();

  async function handlePicked(uri: string) {
    setBusy('Analyse de la photo…');
    try {
      const project = await api.createProject();
      startProject(project.id, uri);
      const upload = await api.uploadImage(project.id, uri);
      setUpload(upload);
      router.push('/confirm');
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Téléversement impossible.');
    } finally {
      setBusy(null);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Caméra', "Autoriser l'accès à la caméra pour photographier un objet.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets[0]) await handlePicked(res.assets[0].uri);
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) await handlePicked(res.assets[0].uri);
  }

  return (
    <SafeAreaView className="flex-1 bg-brick-paper px-6">
      <Pressable onPress={() => router.back()} className="py-4">
        <Text className="text-gray-500">← Retour</Text>
      </Pressable>
      <Text className="text-3xl font-extrabold text-brick-dark mb-2">Votre objet</Text>
      <Text className="text-gray-500 mb-8">
        Conseil : fond uni et contrasté, objet entier dans le cadre, lumière franche.
      </Text>

      {busy ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#C91A09" />
          <Text className="mt-4 text-gray-600">{busy}</Text>
        </View>
      ) : (
        <View className="gap-4">
          <Pressable
            onPress={takePhoto}
            className="bg-brick-red rounded-2xl py-5 items-center active:opacity-90"
          >
            <Text className="text-white text-lg font-bold">📷  Prendre une photo</Text>
          </Pressable>
          <Pressable
            onPress={pickFromLibrary}
            className="bg-white border border-gray-200 rounded-2xl py-5 items-center active:opacity-90"
          >
            <Text className="text-brick-dark text-lg font-semibold">🖼  Choisir dans la galerie</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
