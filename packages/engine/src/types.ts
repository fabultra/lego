/**
 * Types internes du moteur Brickify.
 *
 * Conventions de coordonnées :
 *  - Image : (px, py), origine en haut à gauche, py vers le bas.
 *  - Grille LEGO : x -> droite (tenons), y -> profondeur (tenons),
 *    z -> hauteur (couches de briques, 0 = posée sur la table).
 *  - Le plan de l'image correspond au plan (x, z) : px -> x, py -> z inversé.
 *    L'extrusion (profondeur estimée) se fait le long de y.
 *
 * Unités physiques LEGO :
 *  - pas d'un tenon : 8 mm ; hauteur d'une brique : 9.6 mm (ratio 1.2).
 *    Une cellule de silhouette couvre donc (cellPx) px en largeur et
 *    (cellPx * 1.2) px en hauteur pour conserver les proportions.
 */

export const BRICK_HEIGHT_RATIO = 1.2; // 9.6mm / 8mm

/** Image RGBA brute, indépendante de toute lib de décodage. */
export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, longueur = width * height * 4 */
  data: Uint8ClampedArray;
}

/** Masque binaire (1 = objet). */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Silhouette échantillonnée sur la grille LEGO (plan x/z).
 * `occupancy[z * sx + x] = 1` si la cellule appartient à l'objet.
 * `colors` : couleur RGB moyenne de la cellule (3 octets par cellule), valide
 * uniquement quand occupancy = 1.
 */
export interface Silhouette {
  sx: number;
  sz: number;
  occupancy: Uint8Array;
  colors: Uint8ClampedArray;
}

/**
 * Carte de profondeur par cellule de silhouette : nombre de voxels occupés
 * le long de y, centrés autour du plan médian. 0 si cellule vide.
 */
export interface DepthMap {
  sx: number;
  sz: number;
  depth: Uint8Array;
}

/**
 * Grille de voxels colorés.
 * data[x + y*sx + z*sx*sy] = index dans `paletteIds` (>= 0) ou -1 si vide.
 * Après `mapColorsToLego`, les index pointent dans la palette LEGO retenue.
 */
export interface VoxelGrid {
  sx: number;
  sy: number;
  sz: number;
  data: Int16Array;
}

export interface LegoColor {
  /**
   * Id couleur canonique Rebrickable (compatible LDraw pour les couleurs
   * standards) — utilisé partout en interne et pour l'export Studio/LDraw.
   */
  id: number;
  /** Id couleur BrickLink (export Wanted List). */
  blId: number;
  name: string;
  hex: string;
  rgb: [number, number, number];
}

export type PartKind = 'brick' | 'plate' | 'slope';

export interface LegoPart {
  /** Design id LEGO/BrickLink, ex. "3001". */
  id: string;
  name: string;
  widthStuds: number;  // dimension la plus longue
  depthStuds: number;
  heightPlates: number; // 3 = brique, 1 = plaque
  kind: PartKind;
  /** Prix unitaire moyen estimé (centimes) — table statique MVP. */
  avgPriceCents: number;
}

/** Brique placée. (x, y) = coin min en tenons, z = couche. */
export interface PlacedBrick {
  id: string;
  partId: string;
  /** Index dans la palette retenue du modèle. */
  colorIndex: number;
  x: number;
  y: number;
  z: number;
  /** true : la longueur de la pièce suit l'axe y. */
  rotated: boolean;
  stepIndex: number;
}

export interface StructuralIssue {
  kind: 'floating' | 'fragile_layer' | 'thin_column' | 'base_added';
  message: string;
  at?: { x: number; y: number; z: number };
}

export interface BuildStep {
  index: number;
  layer: number;
  brickIds: string[];
  pieceSummary: { partId: string; colorIndex: number; quantity: number }[];
  note: string | null;
}

export interface BomLine {
  partId: string;
  partName: string;
  colorIndex: number;
  quantity: number;
  estUnitPriceCents: number;
}

// ---------------------------------------------------------------------------
// Options et résultat du pipeline
// ---------------------------------------------------------------------------

export type EngineSize = 'small' | 'medium' | 'large';
export type EngineDetail = 'simple' | 'balanced' | 'detailed';
export type EngineStyle = 'realistic' | 'cartoon' | 'pixel_art' | 'blocky';
export type DepthMode = 'flat' | 'rounded';

export interface PipelineOptions {
  size: EngineSize;
  detail: EngineDetail;
  style: EngineStyle;
  /** Force la profondeur max (en tenons). Sinon déduite du style. */
  depthStuds?: number;
  /** Ajout d'une base en plaques : auto = si le modèle semble instable. */
  addBase?: 'auto' | 'always' | 'never';
  /** Masque pré-calculé (ex. corrigé par l'utilisateur) — court-circuite la segmentation. */
  precomputedMask?: Mask;
}

/** Paramètres résolus (taille/détail/style -> valeurs concrètes). */
export interface ResolvedParams {
  targetStudsWidth: number;
  maxColors: number;
  depthMode: DepthMode;
  maxDepthStuds: number;
  /** 'blocky' : profondeur par paliers (look sculpté). */
  depthQuantizeStep: number;
  /** 'cartoon' : boost de saturation avant mapping couleur. */
  saturationBoost: number;
  coverageThreshold: number;
  minIslandVoxels: number;
  /** Lissage de la silhouette (itérations bouchage de trous / cellules isolées). */
  smoothIterations: number;
  allowSlopes: boolean; // réservé V2 — non utilisé par le MVP
}

export type ProgressCallback = (stage: string, pct: number) => void;

export interface PipelineStats {
  voxelCount: number;
  removedUnsupportedVoxels: number;
  filledHoles: number;
  removedIslands: number;
  /** Briques en surplomb irréalisable retirées par la boucle de constructibilité. */
  carvedFloatingBricks: number;
}

export interface PipelineResult {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Palette retenue (sous-ensemble de la palette LEGO). */
  palette: LegoColor[];
  parts: LegoPart[];
  bricks: PlacedBrick[];
  steps: BuildStep[];
  bom: BomLine[];
  issues: StructuralIssue[];
  stabilityScore: number;
  stats: PipelineStats;
  /** Masque utilisé (pour preview / correction ultérieure). */
  mask: Mask;
  /** Grille finale (debug / rendu voxel côté client). */
  grid: VoxelGrid;
}

export function gridIndex(g: { sx: number; sy: number }, x: number, y: number, z: number): number {
  return x + y * g.sx + z * g.sx * g.sy;
}

export function cloneGrid(g: VoxelGrid): VoxelGrid {
  return { sx: g.sx, sy: g.sy, sz: g.sz, data: new Int16Array(g.data) };
}
