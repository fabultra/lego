import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrickifyStore } from '../src/store/useBrickifyStore';

/**
 * Écran 3 — Confirmation de l'objet détecté.
 * Le masque (PNG blanc sur transparent) est superposé teinté en vert.
 * La retouche fine du masque (gomme/pinceau) est prévue en V1.1.
 */
export default function ConfirmScreen() {
  const { upload, photoUri } = useBrickifyStore();
  const [showMask, setShowMask] = useState(true);

  if (!upload) {
    router.replace('/capture');
    return null;
  }

  const lowCoverage = upload.maskCoverage < 0.03;
  const highCoverage = upload.maskCoverage > 0.9;

  return (
    <SafeAreaView className="flex-1 bg-brick-paper px-6">
      <Pressable onPress={() => router.back()} className="py-4">
        <Text className="text-gray-500">← Reprendre la photo</Text>
      </Pressable>
      <Text className="text-3xl font-extrabold text-brick-dark mb-2">C'est bien ça ?</Text>
      <Text className="text-gray-500 mb-4">
        La zone verte sera transformée en LEGO. Touchez l'image pour comparer.
      </Text>

      <Pressable
        onPress={() => setShowMask((v) => !v)}
        className="rounded-2xl overflow-hidden bg-gray-900 aspect-[3/4]"
      >
        <Image
          source={{ uri: photoUri ?? upload.sourceImageUrl }}
          className="absolute inset-0 w-full h-full"
          resizeMode="contain"
        />
        {showMask ? (
          <Image
            source={{ uri: upload.maskPreviewUrl }}
            className="absolute inset-0 w-full h-full opacity-60"
            resizeMode="contain"
            tintColor="#22C55E"
          />
        ) : null}
      </Pressable>

      {(lowCoverage || highCoverage) && (
        <View className="mt-3 bg-amber-100 border border-amber-300 rounded-xl p-3">
          <Text className="text-amber-900">
            {lowCoverage
              ? "L'objet détecté est très petit — rapprochez-vous ou utilisez un fond plus uni."
              : 'La détection couvre presque toute la photo — éloignez-vous ou changez de fond.'}
          </Text>
        </View>
      )}

      <View className="flex-1" />
      <Pressable
        onPress={() => router.push('/configure')}
        className="bg-brick-red rounded-2xl py-5 items-center mb-4 active:opacity-90"
      >
        <Text className="text-white text-lg font-bold">Continuer →</Text>
      </Pressable>
    </SafeAreaView>
  );
}
