import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { OptionSelector } from '../src/components/OptionSelector';
import { useBrickifyStore } from '../src/store/useBrickifyStore';

/** Écran 4 — Taille, niveau de détail, style. */
export default function ConfigureScreen() {
  const { projectId, options, setOptions } = useBrickifyStore();
  const [busy, setBusy] = useState(false);

  async function startGeneration() {
    if (!projectId) {
      router.replace('/capture');
      return;
    }
    setBusy(true);
    try {
      await api.generate(projectId, options);
      router.push('/generating');
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Impossible de lancer la génération.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-brick-paper">
      <ScrollView contentContainerClassName="px-6 pb-8">
        <Pressable onPress={() => router.back()} className="py-4">
          <Text className="text-gray-500">← Retour</Text>
        </Pressable>
        <Text className="text-3xl font-extrabold text-brick-dark mb-6">Votre modèle</Text>

        <OptionSelector
          title="Taille"
          selected={options.size}
          onSelect={(size) => setOptions({ size })}
          options={[
            { value: 'small', label: 'Petit', hint: '~16 tenons' },
            { value: 'medium', label: 'Moyen', hint: '~28 tenons' },
            { value: 'large', label: 'Grand', hint: '~44 tenons' },
          ]}
        />
        <OptionSelector
          title="Niveau de détail"
          selected={options.detail}
          onSelect={(detail) => setOptions({ detail })}
          options={[
            { value: 'simple', label: 'Simple', hint: '4 couleurs' },
            { value: 'balanced', label: 'Équilibré', hint: '8 couleurs' },
            { value: 'detailed', label: 'Détaillé', hint: '14 couleurs' },
          ]}
        />
        <OptionSelector
          title="Style"
          selected={options.style}
          onSelect={(style) => setOptions({ style })}
          options={[
            { value: 'realistic', label: 'Réaliste', hint: 'volume arrondi' },
            { value: 'cartoon', label: 'Cartoon', hint: 'couleurs vives' },
            { value: 'pixel_art', label: 'Pixel art', hint: 'quasi plat' },
            { value: 'blocky', label: 'Sculpture', hint: 'paliers francs' },
          ]}
        />

        <Pressable
          disabled={busy}
          onPress={startGeneration}
          className="bg-brick-red rounded-2xl py-5 items-center mt-4 active:opacity-90 disabled:opacity-50"
        >
          <Text className="text-white text-lg font-bold">
            {busy ? 'Lancement…' : '🧱  Générer mon modèle'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
