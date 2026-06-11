import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { useBrickifyStore } from '../src/store/useBrickifyStore';
import type { GenerationStatusDTO } from '../src/types';

const POLL_MS = 1200;

/** Écran 5 — Génération en cours (polling du statut). */
export default function GeneratingScreen() {
  const { projectId } = useBrickifyStore();
  const [status, setStatus] = useState<GenerationStatusDTO | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) {
      router.replace('/capture');
      return;
    }
    const tick = async () => {
      try {
        const s = await api.getStatus(projectId);
        setStatus(s);
        if (s.status === 'ready') {
          if (timer.current) clearInterval(timer.current);
          router.replace({ pathname: '/result/[id]', params: { id: projectId } });
        } else if (s.status === 'failed') {
          if (timer.current) clearInterval(timer.current);
        }
      } catch {
        // erreur réseau passagère : on retentera au tick suivant
      }
    };
    void tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [projectId]);

  const failed = status?.status === 'failed';
  const progress = status?.progress ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-brick-paper px-6 justify-center">
      {failed ? (
        <View className="items-center">
          <Text className="text-5xl mb-4">😕</Text>
          <Text className="text-2xl font-bold text-brick-dark mb-2">Génération impossible</Text>
          <Text className="text-gray-500 text-center mb-8">{status?.error}</Text>
          <Pressable
            onPress={() => router.replace('/capture')}
            className="bg-brick-red rounded-2xl py-4 px-8 active:opacity-90"
          >
            <Text className="text-white font-bold">Reprendre une photo</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text className="text-6xl text-center mb-6">🧱</Text>
          <Text className="text-2xl font-extrabold text-brick-dark text-center mb-2">
            Construction du modèle…
          </Text>
          <Text className="text-gray-500 text-center mb-8">
            {status?.stageLabel ?? 'Mise en file d’attente'}
          </Text>
          <View className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-3 bg-brick-red rounded-full"
              style={{ width: `${Math.max(4, progress)}%` }}
            />
          </View>
          <Text className="text-gray-400 text-center mt-3">{progress}%</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
