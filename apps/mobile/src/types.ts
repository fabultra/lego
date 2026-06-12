/**
 * Types des contrats API.
 *
 * NOTE : copie synchronisée de packages/shared/src/index.ts. L'app mobile a
 * son propre arbre node_modules (Metro + monorepo npm = friction) ; tant que
 * le câblage Metro monorepo n'est pas fait (roadmap V1.1), ce fichier doit
 * être maintenu identique à @brickify/shared.
 */

export type ModelSize = 'small' | 'medium' | 'large';
export type DetailLevel = 'simple' | 'balanced' | 'detailed';
export type StyleKind = 'realistic' | 'cartoon' | 'pixel_art' | 'blocky';

export interface GenerationOptions {
  size: ModelSize;
  detail: DetailLevel;
  style: StyleKind;
}

export type ProjectStatus = 'draft' | 'queued' | 'processing' | 'ready' | 'failed';

export type PipelineStage =
  | 'segmentation'
  | 'silhouette'
  | 'depth'
  | 'voxelize'
  | 'simplify'
  | 'colors'
  | 'bricks'
  | 'stability'
  | 'instructions'
  | 'persist';

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  segmentation: "Détection de l'objet",
  silhouette: 'Extraction de la silhouette',
  depth: 'Estimation de la profondeur',
  voxelize: 'Voxelisation',
  simplify: 'Simplification de la forme',
  colors: 'Réduction des couleurs LEGO',
  bricks: 'Conversion en briques',
  stability: 'Validation structurelle',
  instructions: 'Génération des instructions',
  persist: 'Sauvegarde du modèle',
};

export interface ProjectDTO {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  stage: PipelineStage | null;
  error: string | null;
  options: GenerationOptions;
  sourceImageUrl: string | null;
  maskPreviewUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadImageResponse {
  imageId: string;
  sourceImageUrl: string;
  maskPreviewUrl: string;
  maskCoverage: number;
}

export interface GenerationStatusDTO {
  status: ProjectStatus;
  progress: number;
  stage: PipelineStage | null;
  stageLabel: string | null;
  error: string | null;
}

export interface PlacedBrickDTO {
  id: string;
  partId: string;
  colorId: number;
  x: number;
  y: number;
  z: number;
  rotated: boolean;
  stepIndex: number;
}

export interface LegoColorDTO {
  id: number;
  name: string;
  hex: string;
}

export interface LegoPartDTO {
  id: string;
  name: string;
  widthStuds: number;
  depthStuds: number;
  heightPlates: number;
  kind: 'brick' | 'plate' | 'slope';
}

export interface StructuralIssueDTO {
  kind: 'floating' | 'fragile_layer' | 'thin_column' | 'base_added';
  message: string;
  at?: { x: number; y: number; z: number };
}

export interface GeneratedModelDTO {
  id: string;
  projectId: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  pieceCount: number;
  colorCount: number;
  stabilityScore: number;
  issues: StructuralIssueDTO[];
  bricks: PlacedBrickDTO[];
  colors: LegoColorDTO[];
  parts: LegoPartDTO[];
  stepCount: number;
}

export interface PieceLineDTO {
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  colorHex: string;
  quantity: number;
  ownedQuantity: number;
  missingQuantity: number;
  estUnitPriceCents: number;
  estMissingCostCents: number;
}

export interface PiecesResponseDTO {
  lines: PieceLineDTO[];
  totalPieces: number;
  totalMissingPieces: number;
  estTotalCostCents: number;
  estMissingCostCents: number;
  priceDisclaimer: string;
}

export interface BuildStepDTO {
  index: number;
  layer: number;
  brickIds: string[];
  pieceSummary: { partId: string; colorId: number; quantity: number }[];
  note: string | null;
}

export interface InstructionsDTO {
  modelId: string;
  stepCount: number;
  layerCount: number;
  steps: BuildStepDTO[];
}

export interface InventoryLineDTO {
  partId: string;
  colorId: number;
  quantity: number;
}

export interface InventoryDTO {
  items: (InventoryLineDTO & { partName: string; colorName: string })[];
  totalPieces: number;
}
