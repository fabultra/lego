import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import type { ProjectDTO } from '../src/types';

const STATUS_BADGE: Record<ProjectDTO['status'], { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-gray-200 text-gray-700' },
  queued: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Génération…', cls: 'bg-blue-100 text-blue-800' },
  ready: { label: 'Prêt', cls: 'bg-green-100 text-green-800' },
  failed: { label: 'Échec', cls: 'bg-red-100 text-red-800' },
};

/** Écran 9 (partie sauvegarde) — Mes projets. */
export default function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setProjects(await api.listProjects());
    } catch {
      // silencieux : pull-to-refresh disponible
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-brick-paper">
      <View className="px-6">
        <Pressable onPress={() => router.back()} className="py-4">
          <Text className="text-gray-500">← Retour</Text>
        </Pressable>
        <Text className="text-3xl font-extrabold text-brick-dark mb-4">Mes projets</Text>
      </View>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerClassName="px-6 pb-8 gap-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-16">
            Aucun projet — photographiez votre premier objet !
          </Text>
        }
        renderItem={({ item }) => {
          const badge = STATUS_BADGE[item.status];
          return (
            <Pressable
              disabled={item.status !== 'ready'}
              onPress={() => router.push({ pathname: '/result/[id]', params: { id: item.id } })}
              className="bg-white rounded-2xl p-3 flex-row items-center gap-3 border border-gray-100 active:opacity-90"
            >
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} className="w-16 h-16 rounded-xl bg-gray-100" />
              ) : (
                <View className="w-16 h-16 rounded-xl bg-gray-100 items-center justify-center">
                  <Text className="text-2xl">🧱</Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="font-semibold text-brick-dark" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {new Date(item.createdAt).toLocaleDateString('fr-CA')}
                </Text>
              </View>
              <Text className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                {badge.label}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
