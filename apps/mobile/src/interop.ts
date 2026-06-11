import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Enregistrement NativeWind des composants tiers : sans cssInterop, le
 * `className` posé sur un composant non-core est silencieusement ignoré.
 * Importé une seule fois depuis app/_layout.tsx.
 */
cssInterop(SafeAreaView, { className: 'style' });
