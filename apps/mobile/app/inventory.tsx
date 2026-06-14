import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import type { InventoryDTO } from '../src/types';

/**
 * Mes briques : ajout par numéro de set ("j'ai cette boîte") via le
 * catalogue Rebrickable, et récapitulatif de l'inventaire.
 */
export default function InventoryScreen() {
  const [setNum, setSetNum] = useState('');
  const [busy, setBusy] = useState(false);
  const [inventory, setInventory] = useState<InventoryDTO | null>(null);

  const load = useCallback(async () => {
    try {
      setInventory(await api.getInventory());
    } catch {
      // silencieux
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSet() {
    const num = setNum.trim();
    if (!num) return;
    setBusy(true);
    try {
      const r = await api.addSetToInventory(num);
      Alert.alert(
        'Set ajouté 🧱',
        `${r.setName} (${r.setNum}, ${r.year})\n${r.totalQuantity} pièces ajoutées à votre inventaire.`,
      );
      setSetNum('');
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : 'Set introuvable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-brick-paper">
      <View className="px-6">
        <Pressable onPress={() => router.back()} className="py-4">
          <Text className="text-gray-500">← Retour</Text>
        </Pressable>
        <Text className="text-3xl font-extrabold text-brick-dark mb-1">Mes briques</Text>
        <Text className="text-gray-500 mb-4">
          Entrez les numéros des boîtes LEGO que vous possédez — leurs pièces servent à calculer
          ce qui vous manque pour chaque modèle.
        </Text>

        <View className="flex-row gap-2 mb-4">
          <TextInput
            value={setNum}
            onChangeText={setSetNum}
            placeholder="N° de set, ex. 10696"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-brick-dark"
          />
          <Pressable
            onPress={addSet}
            disabled={busy}
            className="bg-brick-red rounded-xl px-5 items-center justify-center active:opacity-90 disabled:opacity-50"
          >
            {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Ajouter</Text>}
          </Pressable>
        </View>

        {inventory && (
          <Text className="text-gray-500 mb-2">
            {inventory.totalPieces} pièce(s) — {inventory.items.length} référence(s)
          </Text>
        )}
      </View>

      <FlatList
        data={inventory?.items ?? []}
        keyExtractor={(i) => `${i.partId}-${i.colorId}`}
        contentContainerClassName="px-6 pb-8 gap-2"
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-10">
            Inventaire vide — ajoutez votre première boîte !
          </Text>
        }
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 flex-row items-center">
            <View className="flex-1">
              <Text className="text-brick-dark font-medium" numberOfLines={1}>
                {item.partName}
              </Text>
              <Text className="text-gray-400 text-xs">{item.colorName}</Text>
            </View>
            <Text className="font-bold text-brick-dark">×{item.quantity}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
