import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { IsoBrickView } from '../../src/components/IsoBrickView';
import { LayerPlan } from '../../src/components/LayerPlan';
import type { GeneratedModelDTO, InstructionsDTO, PiecesResponseDTO } from '../../src/types';

type Tab = 'model' | 'pieces' | 'steps' | 'export';

/** Écrans 6-9 — Résultat 3D, liste de pièces, instructions, export. */
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('model');
  const [model, setModel] = useState<GeneratedModelDTO | null>(null);
  const [pieces, setPieces] = useState<PiecesResponseDTO | null>(null);
  const [useInventory, setUseInventory] = useState(false);
  const [instructions, setInstructions] = useState<InstructionsDTO | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!id) return;
    api.getModel(id).then(setModel).catch(showError);
  }, [id]);

  useEffect(() => {
    if (!id || tab !== 'pieces') return;
    api.getPieces(id, useInventory).then(setPieces).catch(showError);
  }, [id, tab, useInventory]);

  useEffect(() => {
    if (!id || tab !== 'steps' || instructions) return;
    api.getInstructions(id).then(setInstructions).catch(showError);
  }, [id, tab, instructions]);

  const step = instructions?.steps[stepIdx];
  const viewW = width - 48;

  async function shareExport(kind: 'bricklink' | 'studio') {
    if (!id) return;
    try {
      const content = await api.exportFile(kind, id, kind === 'bricklink' && useInventory);
      const ext = kind === 'bricklink' ? 'xml' : 'ldr';
      const file = new File(Paths.cache, `brickify-${id.slice(0, 8)}.${ext}`);
      file.write(content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Export prêt', `Fichier écrit : ${file.uri}`);
      }
    } catch (e) {
      showError(e);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-brick-paper">
      <View className="px-6 flex-row items-center justify-between py-3">
        <Pressable onPress={() => router.dismissAll()}>
          <Text className="text-gray-500">✕ Fermer</Text>
        </Pressable>
        <Text className="font-bold text-brick-dark">Votre modèle</Text>
        <View className="w-14" />
      </View>

      {/* Onglets */}
      <View className="flex-row mx-6 bg-gray-200 rounded-xl p-1 mb-3">
        {(
          [
            ['model', 'Modèle'],
            ['pieces', 'Pièces'],
            ['steps', 'Montage'],
            ['export', 'Export'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg items-center ${tab === t ? 'bg-white' : ''}`}
          >
            <Text className={tab === t ? 'font-bold text-brick-dark' : 'text-gray-500'}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!model ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#C91A09" />
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-6 pb-10">
          {tab === 'model' && (
            <View>
              <View className="bg-white rounded-2xl p-2 items-center border border-gray-100">
                <IsoBrickView model={model} width={viewW} height={viewW * 0.95} />
              </View>
              <View className="flex-row gap-2 mt-3">
                <Stat label="Pièces" value={String(model.pieceCount)} />
                <Stat label="Couleurs" value={String(model.colorCount)} />
                <Stat label="Étapes" value={String(model.stepCount)} />
                <Stat label="Stabilité" value={`${Math.round(model.stabilityScore * 100)}%`} />
              </View>
              {model.issues.length > 0 && (
                <View className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 gap-1">
                  {dedupeIssues(model).map((m, i) => (
                    <Text key={i} className="text-amber-900 text-sm">
                      • {m}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {tab === 'pieces' && (
            <View>
              <View className="flex-row items-center justify-between bg-white rounded-xl px-4 py-3 border border-gray-100 mb-3">
                <Text className="text-brick-dark font-medium">Utiliser mes pièces</Text>
                <Switch value={useInventory} onValueChange={setUseInventory} />
              </View>
              {!pieces ? (
                <ActivityIndicator color="#C91A09" />
              ) : (
                <View>
                  {pieces.lines.map((l) => (
                    <View
                      key={`${l.partId}-${l.colorId}`}
                      className="flex-row items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-gray-100 mb-2"
                    >
                      <View
                        className="w-7 h-7 rounded-md border border-black/10"
                        style={{ backgroundColor: l.colorHex }}
                      />
                      <View className="flex-1">
                        <Text className="text-brick-dark font-medium">{l.partName}</Text>
                        <Text className="text-gray-400 text-xs">{l.colorName}</Text>
                      </View>
                      {useInventory && l.missingQuantity < l.quantity && (
                        <Text className="text-green-700 text-xs font-semibold">
                          {l.ownedQuantity} en stock
                        </Text>
                      )}
                      <Text className="font-bold text-brick-dark">×{l.quantity}</Text>
                    </View>
                  ))}
                  <View className="bg-brick-dark rounded-xl p-4 mt-2">
                    <Row k="Total des pièces" v={String(pieces.totalPieces)} />
                    {useInventory && (
                      <Row k="Pièces manquantes" v={String(pieces.totalMissingPieces)} />
                    )}
                    <Row
                      k={useInventory ? 'Coût des manquantes' : 'Coût estimé'}
                      v={`≈ ${(
                        (useInventory ? pieces.estMissingCostCents : pieces.estTotalCostCents) / 100
                      ).toFixed(2)} €`}
                    />
                  </View>
                  <Text className="text-gray-400 text-xs mt-2">{pieces.priceDisclaimer}</Text>
                </View>
              )}
            </View>
          )}

          {tab === 'steps' &&
            (!instructions || !step ? (
              <ActivityIndicator color="#C91A09" />
            ) : (
              <View>
                <Text className="text-center text-gray-500 mb-1">
                  Étape {step.index} / {instructions.stepCount} — couche {step.layer + 1}
                </Text>
                {step.note ? (
                  <Text className="text-center text-brick-dark font-medium mb-2">{step.note}</Text>
                ) : null}
                <View className="bg-white rounded-2xl p-2 items-center border border-gray-100">
                  <LayerPlan model={model} step={step} width={viewW} height={viewW * 0.7} />
                </View>
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {step.pieceSummary.map((p, i) => {
                    const color = model.colors.find((c) => c.id === p.colorId);
                    const part = model.parts.find((pp) => pp.id === p.partId);
                    return (
                      <View
                        key={i}
                        className="flex-row items-center gap-2 bg-white border border-gray-100 rounded-full px-3 py-1.5"
                      >
                        <View
                          className="w-4 h-4 rounded-sm border border-black/10"
                          style={{ backgroundColor: color?.hex ?? '#999' }}
                        />
                        <Text className="text-sm text-brick-dark">
                          {p.quantity}× {part?.name ?? p.partId}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View className="mt-4 bg-white rounded-2xl p-2 items-center border border-gray-100">
                  <IsoBrickView
                    model={model}
                    maxStep={step.index}
                    highlightStep={step.index}
                    width={viewW}
                    height={viewW * 0.8}
                  />
                </View>
                <View className="flex-row gap-3 mt-4">
                  <NavBtn
                    label="← Précédent"
                    disabled={stepIdx === 0}
                    onPress={() => setStepIdx((i) => Math.max(0, i - 1))}
                  />
                  <NavBtn
                    label="Suivant →"
                    primary
                    disabled={stepIdx >= instructions.steps.length - 1}
                    onPress={() => setStepIdx((i) => Math.min(instructions.steps.length - 1, i + 1))}
                  />
                </View>
              </View>
            ))}

          {tab === 'export' && (
            <View className="gap-3">
              <ExportCard
                title="Liste BrickLink (XML)"
                desc="Wanted List importable sur bricklink.com pour commander les pièces."
                onPress={() => shareExport('bricklink')}
              />
              <ExportCard
                title="BrickLink Studio (.ldr)"
                desc="Modèle LDraw ouvrable dans Studio, LeoCAD ou LDView."
                onPress={() => shareExport('studio')}
              />
              <Text className="text-gray-400 text-xs mt-1">
                Le projet est sauvegardé automatiquement dans « Mes projets ».
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function showError(e: unknown) {
  Alert.alert('Oups', e instanceof Error ? e.message : 'Une erreur est survenue.');
}

function dedupeIssues(model: GeneratedModelDTO): string[] {
  return [...new Set(model.issues.map((i) => i.message))].slice(0, 4);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-white rounded-xl py-3 items-center border border-gray-100">
      <Text className="font-extrabold text-brick-dark text-lg">{value}</Text>
      <Text className="text-gray-400 text-xs">{label}</Text>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-gray-300">{k}</Text>
      <Text className="text-white font-bold">{v}</Text>
    </View>
  );
}

function NavBtn({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 py-4 rounded-2xl items-center ${
        primary ? 'bg-brick-red' : 'bg-white border border-gray-200'
      } ${disabled ? 'opacity-40' : 'active:opacity-90'}`}
    >
      <Text className={primary ? 'text-white font-bold' : 'text-brick-dark font-semibold'}>
        {label}
      </Text>
    </Pressable>
  );
}

function ExportCard({ title, desc, onPress }: { title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white border border-gray-100 rounded-2xl p-4 active:opacity-90"
    >
      <Text className="font-bold text-brick-dark mb-1">{title}</Text>
      <Text className="text-gray-500 text-sm">{desc}</Text>
    </Pressable>
  );
}
