/**
 * @brickify/shared — contrats d'API et types partagés entre le backend,
 * le worker et l'application mobile.
 *
 * Règle : ce package ne contient AUCUNE logique, uniquement des types et
 * constantes sérialisables. Le moteur (packages/engine) a ses propres types
 * internes ; ceux-ci sont la projection "réseau" exposée aux clients.
 */

// ---------------------------------------------------------------------------
// Options de génération choisies par l'utilisateur (écran 4)
// ---------------------------------------------------------------------------

export type ModelSize = 'small' | 'medium' | 'large';
export type DetailLevel = 'simple' | 'balanced' | 'detailed';
export type StyleKind = 'realistic' | 'cartoon' | 'pixel_art' | 'blocky';

export interface GenerationOptions {
  size: ModelSize;
  detail: DetailLevel;
  style: StyleKind;
}

/** Largeur cible du modèle, en tenons (studs), par taille. */
export const SIZE_TO_STUDS: Record<ModelSize, number> = {
  small: 16,
  medium: 28,
  large: 44,
};

// ---------------------------------------------------------------------------
// Cycle de vie d'un projet
// ---------------------------------------------------------------------------

export type ProjectStatus =
  | 'draft'        // créé, pas encore d'image ou pas encore lancé
  | 'queued'       // job en file d'attente
  | 'processing'   // pipeline en cours
  | 'ready'        // modèle généré
  | 'failed';      // erreur pipeline

/** Étapes du pipeline, exposées pour l'écran de progression. */
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

// ---------------------------------------------------------------------------
// DTOs API
// ---------------------------------------------------------------------------

export interface ProjectDTO {
  id: string;
  name: string;
  status: ProjectStatus;
  /** 0..100 pendant la génération */
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
  /** Masque calculé immédiatement (segmentation rapide) pour l'écran de confirmation. */
  maskPreviewUrl: string;
  /** Part de l'image couverte par l'objet détecté (0..1) — utile pour avertir si la détection semble mauvaise. */
  maskCoverage: number;
}

export interface GenerationStatusDTO {
  status: ProjectStatus;
  progress: number;
  stage: PipelineStage | null;
  stageLabel: string | null;
  error: string | null;
}

/** Une brique posée dans le modèle (référentiel : x→droite, y→profondeur, z→couches vers le haut). */
export interface PlacedBrickDTO {
  id: string;
  partId: string;       // ex. "3001" (brique 2x4)
  colorId: number;      // id couleur BrickLink
  x: number;            // tenon min en X
  y: number;            // tenon min en Y
  z: number;            // index de couche (0 = posée sur la table / base)
  /** true si la brique est tournée de 90° (sa longueur suit Y au lieu de X). */
  rotated: boolean;
  stepIndex: number;    // étape de montage qui pose cette brique
}

export interface LegoColorDTO {
  id: number;           // id BrickLink
  name: string;
  hex: string;          // "#RRGGBB"
}

export interface LegoPartDTO {
  id: string;           // design id ("3001")
  name: string;         // "Brick 2 x 4"
  widthStuds: number;
  depthStuds: number;
  heightPlates: number; // 3 = brique, 1 = plaque
  kind: 'brick' | 'plate' | 'slope';
}

export interface GeneratedModelDTO {
  id: string;
  projectId: string;
  /** Dimensions de la grille en tenons / couches. */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  pieceCount: number;
  colorCount: number;
  /** 0..1 — heuristique de stabilité (1 = aucune alerte). */
  stabilityScore: number;
  issues: StructuralIssueDTO[];
  bricks: PlacedBrickDTO[];
  colors: LegoColorDTO[];
  parts: LegoPartDTO[];
  stepCount: number;
}

export interface StructuralIssueDTO {
  kind: 'floating' | 'fragile_layer' | 'thin_column' | 'base_added';
  message: string;
  /** Coordonnées concernées, si applicable. */
  at?: { x: number; y: number; z: number };
}

/** Ligne de la nomenclature (BOM). */
export interface PieceLineDTO {
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  colorHex: string;
  quantity: number;
  /** Quantité déjà possédée par l'utilisateur (si inventaire fourni). */
  ownedQuantity: number;
  missingQuantity: number;
  /** Prix unitaire moyen estimé, en centimes d'euro (table statique MVP — remplacé par BrickLink en V2). */
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
  index: number;        // 1..N
  layer: number;        // couche concernée (z)
  brickIds: string[];   // briques posées à cette étape
  pieceSummary: { partId: string; colorId: number; quantity: number }[];
  note: string | null;
}

export interface InstructionsDTO {
  modelId: string;
  stepCount: number;
  layerCount: number;
  steps: BuildStepDTO[];
}

// ---------------------------------------------------------------------------
// Inventaire utilisateur
// ---------------------------------------------------------------------------

export interface InventoryLineDTO {
  partId: string;
  colorId: number;
  quantity: number;
}

export interface InventoryDTO {
  items: (InventoryLineDTO & { partName: string; colorName: string })[];
  totalPieces: number;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export interface CreateProjectRequest {
  name?: string;
}

export interface GenerateRequest {
  options: GenerationOptions;
  /** Profondeur forcée en tenons (sinon déduite du style/taille). */
  depthStuds?: number;
}

export interface UpsertInventoryRequest {
  /** Remplace ou incrémente les lignes données. */
  mode: 'replace' | 'add';
  items: InventoryLineDTO[];
}

export interface ExportRequest {
  projectId: string;
  /** Pour BrickLink : exclure les pièces déjà possédées. */
  onlyMissing?: boolean;
}
