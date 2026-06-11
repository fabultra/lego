import { create } from 'zustand';
import type { GenerationOptions, UploadImageResponse } from '../types';

/**
 * État du flux de création (écrans 2 -> 5). Les données serveur (modèle,
 * pièces, instructions) ne sont PAS dupliquées ici : les écrans de résultat
 * les chargent par l'API — le store ne porte que le contexte du parcours.
 */
interface BrickifyState {
  projectId: string | null;
  photoUri: string | null;
  upload: UploadImageResponse | null;
  options: GenerationOptions;

  startProject: (projectId: string, photoUri: string) => void;
  setUpload: (upload: UploadImageResponse) => void;
  setOptions: (options: Partial<GenerationOptions>) => void;
  reset: () => void;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  size: 'medium',
  detail: 'balanced',
  style: 'realistic',
};

export const useBrickifyStore = create<BrickifyState>((set) => ({
  projectId: null,
  photoUri: null,
  upload: null,
  options: DEFAULT_OPTIONS,

  startProject: (projectId, photoUri) => set({ projectId, photoUri, upload: null }),
  setUpload: (upload) => set({ upload }),
  setOptions: (options) => set((s) => ({ options: { ...s.options, ...options } })),
  reset: () =>
    set({ projectId: null, photoUri: null, upload: null, options: DEFAULT_OPTIONS }),
}));
