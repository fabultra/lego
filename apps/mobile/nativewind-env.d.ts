/// <reference types="nativewind/types" />

// Composants tiers enregistrés via cssInterop (voir src/interop.ts).
// L'import rend ce fichier "module" -> augmentation (et non remplacement)
// des types du paquet.
import 'react-native-safe-area-context';

declare module 'react-native-safe-area-context' {
  interface NativeSafeAreaViewProps {
    className?: string;
  }
}
