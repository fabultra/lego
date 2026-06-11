import type {
  DetailLevel,
  GenerationOptions,
  ModelSize,
  PipelineStage,
  ProjectDTO,
  ProjectStatus,
  StyleKind,
} from '@brickify/shared';
import { PIPELINE_STAGE_LABELS } from '@brickify/shared';
import type { Project, UploadedImage } from '@prisma/client';
import { storage } from './storage';

/** Enums Prisma (SCREAMING_CASE) -> DTO (snake/lower). */
export const toDtoStatus = (s: Project['status']): ProjectStatus =>
  s.toLowerCase() as ProjectStatus;
export const toDtoSize = (s: Project['size']): ModelSize => s.toLowerCase() as ModelSize;
export const toDtoDetail = (d: Project['detail']): DetailLevel => d.toLowerCase() as DetailLevel;
export const toDtoStyle = (s: Project['style']): StyleKind => s.toLowerCase() as StyleKind;

export const fromDtoSize = (s: ModelSize) => s.toUpperCase() as Project['size'];
export const fromDtoDetail = (d: DetailLevel) => d.toUpperCase() as Project['detail'];
export const fromDtoStyle = (s: StyleKind) => s.toUpperCase() as Project['style'];

export function projectOptions(p: Project): GenerationOptions {
  return { size: toDtoSize(p.size), detail: toDtoDetail(p.detail), style: toDtoStyle(p.style) };
}

export async function serializeProject(
  p: Project & { images: UploadedImage[] },
): Promise<ProjectDTO> {
  const source = p.images.find((i) => i.kind === 'SOURCE');
  const mask =
    p.images.find((i) => i.kind === 'MASK_EDITED') ?? p.images.find((i) => i.kind === 'MASK_AUTO');
  return {
    id: p.id,
    name: p.name,
    status: toDtoStatus(p.status),
    progress: p.progress,
    stage: (p.stage as PipelineStage | null) ?? null,
    error: p.error,
    options: projectOptions(p),
    sourceImageUrl: source ? await storage.url(source.storageKey) : null,
    maskPreviewUrl: mask ? await storage.url(mask.storageKey) : null,
    thumbnailUrl: source ? await storage.url(source.storageKey) : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function stageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? stage;
}
