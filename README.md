# 🧱 Brickify AI

Photographiez un objet réel → obtenez un **modèle LEGO constructible** :
rendu 3D, nombre de pièces, liste par type/taille/couleur, coût estimé des
pièces manquantes et **instructions de montage couche par couche**.

- Architecture, faisabilité, risques, roadmap : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Pipeline algorithmique détaillé (photo → voxels → briques) : [docs/PIPELINE.md](docs/PIPELINE.md)

## Structure

```
packages/shared    contrats API partagés (types purs)
packages/engine    moteur photo→LEGO : pur TypeScript, zéro dépendance, testé
apps/api           Express + Prisma (PostgreSQL) + BullMQ (Redis) + stockage local/S3
apps/mobile        Expo (React Native) : 9 écrans, Zustand, NativeWind, rendu iso SVG
```

## Démarrage rapide

### 0. Voir le moteur tourner immédiatement (aucune infra)

```bash
npm install
npm test           # 16 tests du moteur (couverture exacte, stabilité, déterminisme)
npm run demo:engine  # image synthétique → modèle complet (vue ASCII, BOM, étapes)
```

### 1. Stack complète (API + worker + DB)

```bash
docker compose up -d                  # PostgreSQL + Redis + MinIO
cp .env.example apps/api/.env
npm run db:migrate -w apps/api        # ou: cd apps/api && npx prisma migrate dev
npm run db:seed                       # catalogue pièces + couleurs
npm run dev:api                       # API sur :3000 (auth dev: aucun token requis)
npm run dev:worker                    # worker de génération (autre terminal)
```

Essai sans vraie photo :

```bash
cd apps/api && npx tsx scripts/make-sample-photo.ts /tmp/photo.jpg
curl -X POST localhost:3000/projects -H 'Content-Type: application/json' -d '{"name":"Test"}'
curl -X POST localhost:3000/projects/<ID>/images -F image=@/tmp/photo.jpg
curl -X POST localhost:3000/projects/<ID>/generate -H 'Content-Type: application/json' \
  -d '{"options":{"size":"medium","detail":"balanced","style":"realistic"}}'
curl localhost:3000/projects/<ID>/status
curl localhost:3000/projects/<ID>/pieces
```

### 2. Mobile (Expo)

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_URL=http://<ip-locale>:3000 npm run start   # scanner le QR avec Expo Go
```

> `apps/mobile` a son propre `node_modules` (hors workspaces npm) : Metro +
> monorepo sera câblé en V1.1 ; en attendant `src/types.ts` est une copie
> synchronisée de `packages/shared`.

## Parcours utilisateur

1. **Accueil** → « Photographier un objet »
2. **Capture** (caméra ou galerie) — l'API calcule le masque immédiatement
3. **Confirmation** : la zone verte sera transformée en LEGO (alerte si la
   détection semble mauvaise)
4. **Options** : taille (16/28/44 tenons), détail (4/8/14 couleurs), style
   (réaliste, cartoon, pixel art, sculpture)
5. **Génération** : job BullMQ, progression par étape du pipeline
6. **Résultat** : modèle iso 3D, stabilité, alertes structurelles
7. **Pièces** : BOM, toggle « utiliser mes pièces », coût des manquantes
8. **Montage** : plan de couche façon notice + vue 3D progressive, ~6 pièces/étape
9. **Export** : BrickLink Wanted List (XML), BrickLink Studio (.ldr)

## Garanties du moteur (testées)

- Couverture **exacte** : chaque voxel couvert par exactement une brique, jamais
  deux couleurs sous une même pièce.
- **Aucune pièce flottante** : toute brique a un chemin de contacts tenon/tube
  vers le sol (boucle de constructibilité, surplombs impossibles creusés et signalés).
- Joints **alternés** entre couches (murs appareillés), base en plaques ajoutée
  automatiquement si l'assise est étroite.
- Proportions réelles : 1 tenon = 8 mm, 1 brique = 9.6 mm.
- Pièces courantes uniquement : 1x1→2x4, plaques pour la base (slopes en V2).
- Déterminisme total (même photo + mêmes options = même modèle).

## Honnêteté technique

Une photo ne contient pas l'arrière d'un objet. Le MVP **extrude la silhouette
avec un profil elliptique** (pas une reconstruction 3D) — c'est assumé, documenté,
et remplaçable : profondeur monoculaire en V2, multi-photos/3D réelle en V3.
Détails dans [docs/PIPELINE.md](docs/PIPELINE.md).

## Scripts utiles

| Commande | Effet |
|---|---|
| `npm test` | tests du moteur |
| `npm run demo:engine` | démo bout-en-bout sans infra |
| `npm run typecheck` | typecheck shared + engine + api |
| `npm run dev:api` / `dev:worker` | API / worker |
| `cd apps/mobile && npm run typecheck` | typecheck mobile |
