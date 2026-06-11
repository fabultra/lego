import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Écran 1 — Accueil. */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brick-paper">
      <ScrollView contentContainerClassName="px-6 pt-10 pb-8">
        <View className="flex-row items-center gap-2 mb-2">
          <View className="w-8 h-8 rounded-lg bg-brick-red" />
          <View className="w-8 h-8 rounded-lg bg-brick-yellow" />
          <View className="w-8 h-8 rounded-lg bg-blue-600" />
        </View>
        <Text className="text-4xl font-extrabold text-brick-dark">Brickify AI</Text>
        <Text className="text-lg text-gray-500 mt-2 mb-10">
          Photographiez un objet, repartez avec un modèle LEGO à construire.
        </Text>

        <Pressable
          onPress={() => router.push('/capture')}
          className="bg-brick-red rounded-2xl py-5 items-center shadow-sm active:opacity-90"
        >
          <Text className="text-white text-xl font-bold">📷  Photographier un objet</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/projects')}
          className="mt-4 bg-white border border-gray-200 rounded-2xl py-4 items-center active:opacity-90"
        >
          <Text className="text-brick-dark text-base font-semibold">Mes projets</Text>
        </Pressable>

        <View className="mt-12 gap-4">
          {[
            ['1', "Photographiez l'objet sur un fond uni"],
            ['2', 'Confirmez la silhouette détectée'],
            ['3', 'Choisissez taille, style et niveau de détail'],
            ['4', 'Construisez avec les instructions pas à pas'],
          ].map(([n, label]) => (
            <View key={n} className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-full bg-brick-yellow items-center justify-center">
                <Text className="font-bold text-brick-dark">{n}</Text>
              </View>
              <Text className="text-gray-600 flex-1">{label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
