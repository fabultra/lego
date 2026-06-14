import { LEGO_PALETTE } from '@brickify/engine';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { prisma } from '../db';

/**
 * Import du catalogue Rebrickable (https://rebrickable.com/downloads/,
 * licence libre avec attribution) :
 *  - colors.csv          -> LegoColor (270 couleurs canoniques) + AUDIT de la
 *                           palette moteur (nom/hex doivent correspondre)
 *  - parts.csv           -> LegoPiece (~50k, isBuildable=false)
 *  - sets.csv            -> RbSet (~25k)
 *  - inventories.csv +
 *    inventory_parts.csv -> RbSetPart (contenu réel de chaque set, dernière
 *                           version d'inventaire, hors pièces de rechange)
 *
 * Tout est streamé (gzip -> lignes) pour tenir en RAM constante, et
 * idempotent : relancer l'import remplace les données catalogue.
 */

const CDN = 'https://cdn.rebrickable.com/media/downloads';

async function* csvRows(file: string): AsyncGenerator<string[]> {
  const res = await fetch(`${CDN}/${file}`);
  if (!res.ok || !res.body) throw new Error(`Téléchargement ${file} : HTTP ${res.status}`);
  const lines = createInterface({
    input: Readable.fromWeb(res.body as never).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let header = true;
  for await (const line of lines) {
    if (header) {
      header = false;
      continue;
    }
    if (line.trim().length === 0) continue;
    yield parseCsvLine(line);
  }
}

/** Parseur CSV minimal avec gestion des champs entre guillemets. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export interface ImportReport {
  colors: number;
  paletteAuditWarnings: string[];
  parts: number;
  sets: number;
  setParts: number;
}

export async function importRebrickable(log: (msg: string) => void): Promise<ImportReport> {
  const report: ImportReport = { colors: 0, paletteAuditWarnings: [], parts: 0, sets: 0, setParts: 0 };

  // --- 1. Couleurs + audit de la palette moteur ----------------------------
  log('couleurs : téléchargement…');
  const paletteById = new Map(LEGO_PALETTE.map((c) => [c.id, c]));
  for await (const [idStr, name, rgb, isTrans] of csvRows('colors.csv.gz')) {
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id) || id < 0) continue;
    const hex = `#${rgb.toUpperCase()}`;
    const engine = paletteById.get(id);
    if (engine) {
      if (engine.name !== name) {
        report.paletteAuditWarnings.push(`couleur ${id} : moteur="${engine.name}" vs Rebrickable="${name}"`);
      }
      // l'hex moteur peut différer légèrement (rendu) — on garde celui du moteur
    }
    await prisma.legoColor.upsert({
      where: { id },
      create: {
        id,
        name,
        hex: engine?.hex ?? hex,
        blId: engine?.blId ?? null,
        isTrans: isTrans === 'True',
      },
      update: { name, isTrans: isTrans === 'True', ...(engine ? { blId: engine.blId } : {}) },
    });
    report.colors++;
  }
  log(`couleurs : ${report.colors} importées, ${report.paletteAuditWarnings.length} alerte(s) d'audit`);
  for (const w of report.paletteAuditWarnings) log(`  AUDIT: ${w}`);

  // --- 2. Pièces (catalogue complet, hors générateur) ----------------------
  log('pièces : téléchargement…');
  let batch: { id: string; name: string }[] = [];
  const flushParts = async () => {
    if (batch.length === 0) return;
    await prisma.legoPiece.createMany({
      data: batch.map((p) => ({ id: p.id, name: p.name.slice(0, 250) })),
      skipDuplicates: true, // ne touche pas aux 12 pièces générables seedées
    });
    report.parts += batch.length;
    batch = [];
  };
  for await (const [partNum, name] of csvRows('parts.csv.gz')) {
    if (!partNum) continue;
    batch.push({ id: partNum, name });
    if (batch.length >= 2000) await flushParts();
  }
  await flushParts();
  log(`pièces : ${report.parts} traitées`);

  // --- 3. Sets ---------------------------------------------------------------
  log('sets : téléchargement…');
  let setBatch: { setNum: string; name: string; year: number; numParts: number }[] = [];
  const flushSets = async () => {
    if (setBatch.length === 0) return;
    await prisma.rbSet.createMany({ data: setBatch, skipDuplicates: true });
    report.sets += setBatch.length;
    setBatch = [];
  };
  for await (const [setNum, name, year, , numParts] of csvRows('sets.csv.gz')) {
    if (!setNum) continue;
    setBatch.push({
      setNum,
      name: name.slice(0, 250),
      year: parseInt(year, 10) || 0,
      numParts: parseInt(numParts, 10) || 0,
    });
    if (setBatch.length >= 2000) await flushSets();
  }
  await flushSets();
  log(`sets : ${report.sets} traités`);

  // --- 4. Inventaires : dernière version par set ------------------------------
  log('inventaires : index des versions…');
  // Les inventaires couvrent aussi les minifigs ("fig-…") et autres entités
  // absentes de sets.csv -> on ne garde que les sets réellement importés.
  const validSets = new Set(
    (await prisma.rbSet.findMany({ select: { setNum: true } })).map((s) => s.setNum),
  );
  // inventories.csv : id, version, set_num — on garde la version max par set.
  const latestBySet = new Map<string, { invId: string; version: number }>();
  for await (const [invId, versionStr, setNum] of csvRows('inventories.csv.gz')) {
    if (!validSets.has(setNum)) continue;
    const version = parseInt(versionStr, 10) || 0;
    const cur = latestBySet.get(setNum);
    if (!cur || version > cur.version) latestBySet.set(setNum, { invId, version });
  }
  const setByInv = new Map<string, string>();
  for (const [setNum, { invId }] of latestBySet) setByInv.set(invId, setNum);
  log(`inventaires : ${setByInv.size} sets indexés`);

  // --- 5. Contenu des sets (streamé, agrégé par lots) -------------------------
  log('contenu des sets : import (le plus long)…');
  await prisma.rbSetPart.deleteMany({});
  // Pièces connues : RbSetPart.partId n'a pas de FK mais l'inventaire
  // utilisateur en a une -> on filtre sur les parts réellement importées.
  const knownParts = new Set((await prisma.legoPiece.findMany({ select: { id: true } })).map((p) => p.id));

  let spBatch: { setNum: string; partId: string; colorId: number; quantity: number }[] = [];
  const agg = new Map<string, { setNum: string; partId: string; colorId: number; quantity: number }>();
  const flushSetParts = async (force = false) => {
    if (!force && agg.size < 20000) return;
    spBatch = [...agg.values()];
    agg.clear();
    for (let i = 0; i < spBatch.length; i += 5000) {
      await prisma.rbSetPart.createMany({
        data: spBatch.slice(i, i + 5000),
        skipDuplicates: true,
      });
    }
    report.setParts += spBatch.length;
    if (report.setParts % 100000 < spBatch.length) log(`  …${report.setParts} lignes`);
    spBatch = [];
  };
  // inventory_parts.csv : inventory_id, part_num, color_id, quantity, is_spare[, img_url]
  // Flush uniquement aux frontières d'inventaire : les lignes d'un même set
  // ne sont jamais coupées en deux lots (sinon skipDuplicates perdrait des
  // quantités agrégées sous la même clé).
  let lastInv = '';
  for await (const [invId, partNum, colorIdStr, qtyStr, isSpare] of csvRows('inventory_parts.csv.gz')) {
    if (invId !== lastInv) {
      await flushSetParts();
      lastInv = invId;
    }
    if (isSpare === 'True' || isSpare === 't') continue;
    const setNum = setByInv.get(invId);
    if (!setNum || !knownParts.has(partNum)) continue;
    const colorId = parseInt(colorIdStr, 10);
    const quantity = parseInt(qtyStr, 10) || 0;
    if (Number.isNaN(colorId) || colorId < 0 || quantity <= 0) continue;
    const key = `${setNum}|${partNum}|${colorId}`;
    const cur = agg.get(key);
    if (cur) cur.quantity += quantity;
    else agg.set(key, { setNum, partId: partNum, colorId, quantity });
  }
  await flushSetParts(true);
  log(`contenu des sets : ${report.setParts} lignes importées`);
  log('Import Rebrickable terminé ✓ (données © Rebrickable, utilisées avec attribution)');
  return report;
}
