import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { GeneratedModelDTO } from '../types';
import { Brick3DView } from './Brick3DView';
import { IsoBrickView } from './IsoBrickView';

/**
 * Visualiseur du modèle : 3D interactif (rotation/zoom) par défaut, avec
 *  - repli AUTOMATIQUE sur la vue isométrique SVG si le contexte GL échoue
 *    (error boundary) ;
 *  - bascule MANUELLE 2D/3D (certains appareils rament en GL).
 */

interface Props {
  model: GeneratedModelDTO;
  width: number;
  height: number;
  maxStep?: number;
}

class GLBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[3D] contexte GL indisponible, repli vue 2D :', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ModelViewer({ model, width, height, maxStep }: Props) {
  const [mode, setMode] = React.useState<'3d' | '2d'>('3d');

  const iso = <IsoBrickView model={model} width={width} height={height} maxStep={maxStep} />;

  return (
    <View style={{ width, height }}>
      {mode === '3d' ? (
        <GLBoundary fallback={iso}>
          <Brick3DView model={model} width={width} height={height} maxStep={maxStep} />
        </GLBoundary>
      ) : (
        iso
      )}

      <Pressable
        onPress={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}
        className="absolute top-2 right-2 bg-white/85 border border-gray-200 rounded-full px-3 py-1.5 active:opacity-80"
      >
        <Text className="text-brick-dark text-xs font-bold">{mode === '3d' ? '2D' : '3D'}</Text>
      </Pressable>

      {mode === '3d' ? (
        <View pointerEvents="none" className="absolute bottom-2 left-0 right-0 items-center">
          <Text className="text-gray-400 text-[11px]">Glissez pour tourner · pincez pour zoomer</Text>
        </View>
      ) : null}
    </View>
  );
}
