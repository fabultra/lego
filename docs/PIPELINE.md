# Brickify AI — Pipeline photo → LEGO

Référence détaillée du moteur (`packages/engine`). Chaque étape correspond à un
module avec la même signature qu'ici ; tout est pur, déterministe et testé.
Les paramètres concrets (taille → tenons, détail → couleurs, style → profil)
sont résolus dans `pipeline.ts::resolveParams`.

```
photo (RasterImage RGBA)
  │ 1. segmentation        SimpleSegmenter (Otsu + hystérésis + morpho)
  ▼
masque binaire
  │ 2. silhouette          grille (x,z) proportionnée 8mm/9.6mm + couleur/cellule
  ▼
silhouette colorée
  │ 3. profondeur          extrusion à profil (flat | elliptique | paliers)
  ▼
carte de profondeur
  │ 4. voxelisation        extrusion centrée sur le plan médian
  ▼
grille voxel colorée (palette LEGO complète)
  │ 5. couleurs            réduction aux N couleurs dominantes (CIELAB)
  │ 6. simplification      îlots, cavités, règle de support, base auto
  ▼
grille constructible
  │ 7. briques             fusion gloutonne avec score d'imbrication
  │ 8. stabilité           graphe de contacts + boucle de constructibilité
  ▼
briques posées
  │ 9. instructions + BOM  couches bas→haut, ~6 pièces/étape ; agrégation + prix
  ▼
PipelineResult { bricks, steps, bom, palette, issues, stabilityScore, grid, mask }
```

---

## 1. Segmentation (`segmentation.ts`)

Hypothèse MVP assumée : fond raisonnablement uni (l'UX le demande à l'utilisateur).

```
segment(image):
  img    ← redimensionner à 384px max (nearest)
  fond   ← k-means k≤2 sur l'anneau de bordure (2px)          # 1 ou 2 teintes de fond
  dist[p]← min distance RGB de p aux centres de fond
  t      ← max(24, Otsu(histogramme(dist)))                    # seuil fort
  fort   ← dist > t ;  faible ← dist > 0.4·t
  masque ← fort ∪ {faible connectés à fort}                    # HYSTÉRÉSIS : rattrape
                                                               # les zones peu contrastées
                                                               # (ex. pied beige sur fond gris)
  masque ← combler les zones non-fond enfermées (flood depuis les bords)
  masque ← open puis close (3x3)                               # poussières / fissures
  masque ← plus grande composante connexe                      # sujet principal
  retour masque + couverture (part de l'image)
```

La couverture sert d'indicateur qualité côté UX (« objet très petit », « tout
l'écran est détecté »). **Extension V2** : l'interface `Segmenter` accepte une
implémentation distante (rembg, SAM + clic utilisateur, API cloud) sans changer
le pipeline. Le masque corrigé par l'utilisateur (`MASK_EDITED`) court-circuite
cette étape via `precomputedMask`.

## 2. Silhouette (`silhouette.ts`)

Particularité LEGO : une brique n'est **pas cubique** (8 mm de pas de tenon,
9.6 mm de haut). Une cellule de silhouette couvre donc `cellPx` pixels en
largeur et `cellPx × 1.2` en hauteur, sinon tous les modèles sortent écrasés.

```
buildSilhouette(image, masque, largeurTenons, seuilCouverture):
  bbox ← boîte englobante du masque
  cellPx ← bbox.largeur / largeurTenons
  sz ← round(bbox.hauteur / (cellPx × 1.2))        # plafonné à 66 couches
  pour chaque cellule (x, z):                       # z inversé : 0 = bas
    couverture ← part de pixels du masque dans la cellule
    si couverture ≥ seuil : occupée, couleur = moyenne RGB des pixels masqués
  tidy: combler les trous 1-cellule (≥3 voisins), retirer les cellules isolées
```

## 3. Profondeur (`depth.ts`) — le cœur du compromis MVP

On ne reconstruit pas la 3D ; on extrude intelligemment :

- **`flat`** (pixel art) : profondeur constante (~12 % de la largeur).
- **`rounded`** (réaliste/cartoon) : transformée de distance chamfer 3-4 sur la
  silhouette ; profondeur(cellule) = `maxDepth × √(rel·(2−rel))` où `rel` =
  distance au bord normalisée. Profil **elliptique** : épais au cœur, fin aux
  bords → un mug, un animal, une voiture ressemblent à des volumes, pas à des
  biscuits découpés.
- **`paliers`** (sculpture) : `rounded` quantifié par pas de 2 tenons.

```
V2 : profondeur monoculaire (Depth Anything/MiDaS) -> carte de relief réel avant/arrière.
V3 : multi-photos (visual hull) puis splatting/photogrammétrie. Même sortie DepthMap.
```

## 4. Voxelisation (`voxelize.ts`)

Extrusion **centrée** sur le plan médian y (volume symétrique avant/arrière —
le seul choix raisonnable sans information de profondeur réelle). Chaque voxel
prend la couleur de sa colonne, immédiatement mappée vers la couleur LEGO la
plus proche (distance CIELAB — le RGB brut classe mal les bruns/jaunes LEGO).
Le style cartoon booste la saturation avant mapping.

## 5. Réduction de palette (`colors.ts`)

Comptage des couleurs LEGO utilisées → on garde les `maxColors` plus fréquentes
(simple 4 / équilibré 8 / détaillé 14, plafonné par style) → les autres sont
remappées vers la couleur conservée la plus proche en Lab. Ordre par fréquence
décroissante : rendu et exports déterministes.

## 6. Simplification / constructibilité voxel (`simplify.ts`)

```
1. removeSmallIslands : composantes 6-connexes < minVoxels supprimées
2. fillInternalHoles  : poches d'air inaccessibles comblées (couleur majoritaire voisine)
3. enforceSupport     : couche par couche (bas→haut), un voxel survit si
     - il a un voxel sous lui, OU
     - il est connecté (4-conn dans sa couche) à un voxel supporté
       à ≤ 5 cellules   # un surplomb court peut être porté par une brique
                        # qui s'ancre sur la zone soutenue
4. base auto : si l'assise (couche 0) < 45 % de la plus grande couche,
   ajout d'une couche de PLAQUES gris clair = empreinte dilatée d'un tenon
```

**Pourquoi l'intérieur reste plein (MVP)** : une coque creuse exige des piliers
internes et des ponts — sinon le « toit » flotte. Plutôt qu'un creusage naïf
qui produit des modèles impossibles, le MVP assume le plein (constructible
trivialement, comptage majoré). **V2 — creusage honnête** : retirer les voxels
à distance ≥ 2 de la surface, conserver un treillis de colonnes internes tous
les 3-4 tenons, et valider chaque « plafond » par la règle des briques
flottantes existante.

## 7. Voxels → briques (`bricks.ts`)

Recouvrement **exact** de chaque couche, couleur par couleur :

```
pour z = 0..sz-1:
  pièces ← plaques si couche de base, sinon briques {2x4,2x3,2x2,1x4,1x3,1x2,1x1}
  orientation préférée ← alternée selon parité de z      # croise les joints
  ordre de scan ← ligne/colonne alterné selon parité     # déplace les joints
  pour chaque cellule libre (coin min):
    pour chaque pièce × orientation qui rentre (mêmes couleur, cellules libres):
      score = aire×100
            + min(4, briques distinctes chevauchées dessous)×40   # IMBRICATION
            + bonus orientation préférée
    placer le meilleur score
```

Garanties : la 1x1 couvre toujours → couverture exacte ; aucune pièce ne
traverse deux couleurs ; déterminisme total. Le score d'imbrication produit des
murs « appareillés » (comme un mur de briques réel) au lieu de colonnes
empilées. Testé : un bloc 8×4×2 produit des 2x4 croisées entre couches.

**V2** : post-passe slopes (cellule de bord dont la voisine supérieure est en
retrait → slope 45°), et recuit local (échanger 2 découpes pour réduire le
nombre de pièces).

## 8. Validation structurelle (`stability.ts` + boucle dans `pipeline.ts`)

```
graphe : brique A ↔ brique B si couches adjacentes ET chevauchement plan ≥ 1 tenon
ancrées : BFS depuis la couche 0 (le clutch tient aussi les pièces suspendues)
briques flottantes (non atteintes) → SUPPRIMÉES (contrainte produit dure)

boucle de constructibilité :
  tant que des briques flottantes existent (≤ 100 itérations, décroissance stricte):
    vider leurs voxels → re-fusionner la grille → re-valider
  # nécessaire : la règle voxel (support latéral ≤5) suppose qu'une brique
  # chevauchera la zone portante — la fusion ne le garantit pas toujours
  # (ex. l'équateur d'une sphère : ni voxel dessous, ni dessus)

alertes : couches à contact < 10 % de leur aire (fragile_layer),
          jonctions à brique unique (thin_column)
score = 1 − 0.15·fragiles − 0.08·colonnes − pénalité de creusage
```

Le test `aucune brique flottante dans le résultat final` verrouille cette
garantie en CI.

## 9. Instructions (`instructions.ts`) et BOM (`bom.ts`)

- Couches bas → haut ; dans une couche : arrière → avant puis gauche → droite
  (on ne pose jamais derrière ce qu'on vient de construire).
- ~6 pièces par étape (max 9), découpe équilibrée ; chaque étape liste les
  pièces à prendre `{part, couleur, quantité}` + note (« Assembler la base »).
- Mobile : plan de couche façon notice (couche inférieure grisée, briques de
  l'étape contour fort + studs) + vue iso progressive (`maxStep`).
- BOM = agrégation (part, couleur) des placements, prix = table statique
  (`catalog.ts`, en centimes) avec disclaimer ; croisée avec l'inventaire côté
  API pour `manquantes` et coût des manquantes.

## 10. Réglages par taille / détail / style

| Paramètre | small | medium | large |
|---|---|---|---|
| largeur (tenons) | 16 | 28 | 44 |

| | simple | balanced | detailed |
|---|---|---|---|
| couleurs max | 4 | 8 | 14 |
| seuil de couverture cellule | 0.55 | 0.50 | 0.42 |
| îlot minimal (voxels) | 8 | 5 | 3 |

| | realistic | cartoon | pixel_art | blocky |
|---|---|---|---|---|
| profil profondeur | elliptique | elliptique | plat | paliers de 2 |
| profondeur max | 50 % largeur | 50 % | 12 % | 50 % |
| couleurs | — | ≤ 6, saturation ×1.35 | — | ≤ 5 |

## 11. Évolutions du pipeline (résumé)

| Étape | MVP (implémenté) | V2 | V3 |
|---|---|---|---|
| Segmentation | Otsu+hystérésis | rembg / SAM + tap | — |
| Profondeur | extrusion à profil | depth mono (DepthAnything) | multi-vues / splatting |
| Volume | plein | creusage + treillis | — |
| Pièces | briques + plaques | slopes, SNOT léger | pièces spéciales |
| Entrée | 1 photo | 2-4 photos, .obj/.glb/.stl | scan vidéo |
| Prix | table statique | BrickLink API | multi-fournisseurs |
