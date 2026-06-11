import type {
  GeneratedModelDTO,
  GenerationOptions,
  GenerationStatusDTO,
  InstructionsDTO,
  PiecesResponseDTO,
  ProjectDTO,
  UploadImageResponse,
} from '../types';

/**
 * Client API minimal. En dev : EXPO_PUBLIC_API_URL=http://<ip-locale>:3000
 * (le simulateur iOS accepte localhost, un appareil physique non).
 * L'auth MVP est en mode dev côté serveur ; brancher Supabase = ajouter
 * l'en-tête Authorization ici, rien d'autre ne change.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      // corps non JSON
    }
    throw new ApiClientError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  baseUrl: BASE_URL,

  createProject(name?: string): Promise<ProjectDTO> {
    return request('/projects', { method: 'POST', body: JSON.stringify({ name }) });
  },

  listProjects(): Promise<ProjectDTO[]> {
    return request('/projects');
  },

  getProject(id: string): Promise<ProjectDTO> {
    return request(`/projects/${id}`);
  },

  async uploadImage(projectId: string, localUri: string): Promise<UploadImageResponse> {
    const form = new FormData();
    // React Native accepte {uri, name, type} pour les fichiers multipart.
    form.append('image', {
      uri: localUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    return request(`/projects/${projectId}/images`, { method: 'POST', body: form });
  },

  generate(projectId: string, options: GenerationOptions): Promise<{ jobId: string }> {
    return request(`/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ options }),
    });
  },

  getStatus(projectId: string): Promise<GenerationStatusDTO> {
    return request(`/projects/${projectId}/status`);
  },

  getModel(projectId: string): Promise<GeneratedModelDTO> {
    return request(`/projects/${projectId}/model`);
  },

  getPieces(projectId: string, useInventory: boolean): Promise<PiecesResponseDTO> {
    return request(`/projects/${projectId}/pieces?useInventory=${useInventory}`);
  },

  getInstructions(projectId: string): Promise<InstructionsDTO> {
    return request(`/projects/${projectId}/instructions`);
  },

  /** Retourne le contenu texte de l'export (XML BrickLink ou LDraw). */
  async exportFile(kind: 'bricklink' | 'studio', projectId: string, onlyMissing = false): Promise<string> {
    const res = await fetch(`${BASE_URL}/exports/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, onlyMissing }),
    });
    if (!res.ok) throw new ApiClientError(res.status, `Export ${kind} en échec`);
    return res.text();
  },
};
