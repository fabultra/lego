# Brickify AI — Architecture

> Photographier un objet réel → obtenir un modèle LEGO constructible :
> rendu 3D, liste de pièces, coût estimé, instructions étape par étape.

Ce document couvre la faisabilité, l'architecture, les modules, les données,
l'API, l'UX, les risques et la roadmap. Le pipeline algorithmique détaillé
(photo → voxels → briques → instructions) est dans [PIPELINE.md](./PIPELINE.md).

---

## 1. Analyse de faisabilité — honnête

### Ce qui est solide dès aujourd'hui (et implémenté dans ce repo)

| Problème | Difficulté | Approche MVP |
|---|---|---|
| Segmentation d'objet sur fond uni | Faible | Seuillage Otsu + hystérésis + morpho (pur TS, implémenté) ; remplaçable par rembg/SAM |
| Silhouette → grille LEGO proportionnée | Faible | Échantillonnage avec ratio brique réel 8 mm / 9.6 mm (implémenté) |
| Profondeur **plausible** sans 3D | Moyenne | Extrusion à profil elliptique par transformée de distance (implémenté) |
| Couleurs → palette LEGO | Faible | Distance CIELAB vers 25 couleurs BrickLink (implémenté) |
| Voxels → briques stables | Moyenne | Glouton avec score d'imbrication + joints alternés (implémenté) |
| Constructibilité physique | Moyenne | Règle de support + boucle de retrait des briques flottantes (implémenté, testé) |
| Instructions par couches | Faible | Tri bas→haut, arrière→avant, ~6 pièces/étape (implémenté) |

### Ce qui est difficile — il faut le dire clairement

1. **La reconstruction 3D fidèle depuis UNE photo n'existe pas.** Une photo ne
   contient pas l'arrière de l'objet. Tout produit qui promet ça triche :
   soit il extrude (comme notre MVP), soit il hallucine (modèles génératifs
   image→3D type TripoSR/Zero123 — résultats spectaculaires mais
   imprévisibles, et il faut ensuite TOUT le reste du pipeline quand même).
   **Décision : MVP = extrusion assumée, avec un profil de profondeur qui rend
   80 % des objets "présentables" ; la vraie 3D est la V3.**
2. **La voxelisation détruit les détails fins** (anses, antennes, doigts).
   Mitigation : niveau de détail choisi par l'utilisateur, suppression
   automatique des îlots trop petits, et UX qui cadre les attentes (« style
   sculpture LEGO », pas « réplique »).
3. **Un modèle creux constructible exige des treillis internes** (un toit de
   briques ne tient pas sans support). Le MVP garde l'intérieur **plein** :
   estimation de pièces majorée mais constructibilité garantie. Le creusage
   intelligent est en V2 (cf. PIPELINE.md §11).
4. **Les surplombs sont la vraie frontière physique.** L'« équateur » d'une
   sphère n'a ni brique dessous ni dessus. Notre boucle de constructibilité
   *creuse* ces zones plutôt que de livrer un modèle impossible — compromis
   forme/réalisme assumé et signalé à l'utilisateur (`stabilityScore`, issues).
5. **Les prix réels fluctuent.** MVP : table statique de prix moyens avec
   disclaimer. V2 : BrickLink Price Guide API (rate-limitée, nécessite compte
   vendeur — à anticiper contractuellement).

**Verdict : produit faisable.** Le MVP décrit ici tourne déjà de bout en bout
(tests + démo + API exercée). La valeur perçue vient de la boucle complète
(photo → pièces → instructions → commande), pas de la perfection 3D.

---

## 2. Architecture d'ensemble

```
┌─────────────────────┐         ┌──────────────────────────────────────────┐
│  Mobile (Expo RN)   │  HTTPS  │                 API (Express)            │
│  ───────────────    │ ──────► │  /projects /inventory /exports /files    │
│  9 écrans           │         │  auth (dev | Supabase JWT)               │
│  Zustand, NativeWind│ ◄────── │  zod, multer, sharp (décodage)           │
│  rendu iso SVG      │  JSON   └───────┬──────────────┬───────────────────┘
└─────────────────────┘                 │              │
                                 enqueue│              │ lecture/écriture
                                        ▼              ▼
                              ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
                              │ Redis/BullMQ │   │  PostgreSQL  │   │ S3 / disque │
                              │ file "gener- │   │   (Prisma)   │   │ images +    │
                              │  ation"      │   │              │   │ masques +   │
                              └──────┬───────┘   └──────▲───────┘   │ grilles JSON│
                                     │                  │           └──────▲──────┘
                                     ▼                  │                  │
                              ┌──────────────────────────────────────────────┐
                              │     Worker (BullMQ) — processus séparé       │
                              │  @brickify/engine : pipeline pur TypeScript  │
                              │  segmentation→silhouette→profondeur→voxels   │
                              │  →couleurs→simplification→briques→stabilité  │
                              │  →instructions→BOM                           │
                              └──────────────────────────────────────────────┘
```

### Décisions structurantes

- **Le moteur (`@brickify/engine`) est un package pur, sans I/O ni dépendance.**
  C'est la décision la plus importante du projet : le cœur métier est testable
  en millisecondes, déterministe (aucun aléa), exécutable dans un worker
  Node, un test, un script — et portable plus tard (worker WASM côté client
  pour la prévisualisation instantanée).
- **Express plutôt que NestJS** pour le MVP : moins de cérémonie, démarrage
  plus rapide, et la structure routes/services/jobs est déjà modulaire. La
  migration NestJS reste triviale si l'équipe grossit (les modules sont
  découpés selon les mêmes frontières que des modules Nest).
- **Jobs asynchrones dès le MVP** (BullMQ) : la génération prend des
  centaines de ms aujourd'hui mais des secondes/minutes dès que la
  segmentation ML et la profondeur monoculaire arriveront. Le contrat
  (polling de `/status` avec progression par étape) ne changera pas.
- **Les étapes IA sont des interfaces** (`Segmenter`, profil de profondeur) :
  on remplace l'implémentation heuristique par un appel Replicate/SAM/MiDaS
  sans toucher au reste.
- **Rendu mobile en SVG isométrique** (pas de GL au MVP) : fiable dans Expo Go,
  zéro dépendance native, esthétique « notice LEGO ». L'interface du composant
  permet de brancher react-three-fiber en V1.1.

---

## 3. Découpage en modules

```
brickify-ai/
├── packages/
│   ├── shared/          # contrats API (types purs, zéro logique)
│   └── engine/          # LE cœur : pipeline photo→LEGO (zéro dépendance)
│       ├── segmentation # détection objet (interface + impl. heuristique)
│       ├── silhouette   # image → grille proportionnée LEGO
│       ├── depth        # extrusion à profil (flat / rounded / quantifié)
│       ├── voxelize     # grille 3D colorée
│       ├── colors       # palette LEGO, réduction CIELAB
│       ├── simplify     # îlots, cavités, supports, base auto
│       ├── bricks       # fusion voxels→briques (imbrication)
│       ├── stability    # graphe de contacts, briques flottantes, score
│       ├── instructions # étapes de montage
│       └── bom          # nomenclature + prix estimés
├── apps/
│   ├── api/             # Express + Prisma + BullMQ + stockage + auth
│   │   ├── routes/      # projects, inventory, exports
│   │   └── jobs/        # queue, worker, processeur de génération
│   └── mobile/          # Expo + expo-router + Zustand + NativeWind
│       ├── app/         # 9 écrans (file-based routing)
│       └── src/         # api client, store, composants de rendu
└── docs/
```

Frontières de responsabilité :
- `engine` ne sait pas ce qu'est un fichier, une DB ou un job.
- `api` ne contient AUCUNE logique LEGO : décodage image (sharp), orchestration,
  persistance, sérialisation.
- `mobile` ne calcule rien : il affiche ce que l'API sert (le rendu iso est une
  projection du JSON, pas un calcul de modèle).

---

## 4. Modèle de données (Prisma)

Schéma complet : [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).

```
User 1──n Project 1──n UploadedImage (SOURCE | MASK_AUTO | MASK_EDITED)
              │ 1──1 GeneratedModel 1──n ModelPiece ──► LegoPiece (catalogue)
              │                     1──n BuildStep        └──► LegoColor
User 1──1 UserInventory 1──n InventoryPiece ──► LegoPiece, LegoColor
```

Points notables :
- `Project` porte le statut de génération (`status/progress/stage/error`) →
  le polling mobile ne coûte qu'une lecture de ligne.
- `ModelPiece` = une brique posée (position, rotation, étape) ; la BOM est
  dérivée par agrégation — pas de double source de vérité.
- `GeneratedModel.palette/issues/stats` en JSON : données de rendu figées au
  moment de la génération (pas de jointures pour afficher un modèle).
- `LegoPiece`/`LegoColor` : catalogue seedé **depuis le moteur** (source unique).

## 5. API REST

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/projects` | créer un projet |
| GET | `/projects` | lister mes projets |
| GET | `/projects/:id` | détail projet |
| DELETE | `/projects/:id` | supprimer |
| POST | `/projects/:id/images` | upload photo → masque immédiat (écran 3) |
| POST | `/projects/:id/generate` | options + mise en file du job |
| GET | `/projects/:id/status` | `{status, progress, stage, stageLabel, error}` |
| GET | `/projects/:id/model` | briques + palette + parts + issues |
| GET | `/projects/:id/pieces?useInventory=` | BOM, manquantes, coût estimé |
| GET | `/projects/:id/instructions` | étapes de montage |
| GET | `/inventory` / POST `/inventory` | inventaire utilisateur (saisie manuelle MVP) |
| POST | `/inventory/scan` | **501** — scan photo des pièces (V2) |
| POST | `/exports/bricklink` | Wanted List XML (option `onlyMissing`) |
| POST | `/exports/studio` | LDraw `.ldr` (importable Studio/LeoCAD) |
| GET | `/files/*` | fichiers (mode stockage local ; URLs signées en S3) |
| GET | `/healthz` | sonde |

Types des payloads : [`packages/shared/src/index.ts`](../packages/shared/src/index.ts)
(DTOs partagés API/mobile). Erreurs : `{error: {code, message}}`, validation zod.

## 6. UX — 9 écrans (implémentés)

| # | Écran | Fichier | Notes |
|---|---|---|---|
| 1 | Accueil | `app/index.tsx` | CTA « Photographier un objet », étapes |
| 2 | Capture | `app/capture.tsx` | caméra/galerie, conseils de prise de vue |
| 3 | Confirmation | `app/confirm.tsx` | masque vert superposé, alerte couverture, toggle |
| 4 | Options | `app/configure.tsx` | taille / détail / style avec hints concrets |
| 5 | Génération | `app/generating.tsx` | barre + libellé d'étape du pipeline, gestion échec |
| 6 | Résultat 3D | `app/result/[id]` onglet Modèle | iso SVG + stats + alertes structurelles |
| 7 | Pièces | onglet Pièces | toggle « utiliser mes pièces », coût manquantes |
| 8 | Montage | onglet Montage | plan de couche façon notice + vue iso progressive |
| 9 | Export/Sauvegarde | onglet Export + `app/projects.tsx` | partage XML/.ldr, liste projets |

Principes : un seul chemin heureux, jamais de jargon (« la zone verte sera
transformée en LEGO »), les avertissements de détection AVANT de payer le coût
d'une génération, et les attentes cadrées par les hints de style.

## 7. Risques techniques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Segmentation heuristique échoue sur fond chargé | UX dégradée | UX guide la prise de vue + alerte couverture + masque corrigible (V1.1) + bascule SAM/rembg derrière l'interface `Segmenter` |
| Modèles « cookie-cutter » décevants | Rétention | Profil elliptique (déjà mieux), styles assumés, multi-photos V2 |
| Comptes de pièces énormes (intérieur plein) | Coût perçu | Affichage honnête + creusage V2 + tailles S/M par défaut |
| IDs couleurs/pièces BrickLink inexacts | Exports cassés | Tables centralisées et commentées `à auditer`, validation par import réel avant prod |
| Génération lente avec ML (V2) | Files d'attente | Déjà asynchrone ; autoscaling workers ; préview basse résolution côté client (engine en WASM) |
| Propriété intellectuelle (marque LEGO) | Légal | « briques compatibles », aucune marque dans l'app, conditions claires marketplace |
| Coût API ML | Marges | Heuristiques d'abord, ML seulement si nécessaire (le pipeline actuel est gratuit en compute) |

## 8. Roadmap

### Phase 0 — MVP (ce repo) ✅
Pipeline complet heuristique, API + worker + DB, app 9 écrans, exports
BrickLink/Studio, inventaire manuel, tests moteur.

### Phase 1 — Qualité perçue (4-6 semaines)
- Correction manuelle du masque (pinceau/gomme sur l'écran 3, `MASK_EDITED` déjà prévu côté API/worker).
- Auth Supabase réelle (middleware déjà prêt), comptes et sync multi-appareils.
- Rendu interactif react-three-fiber (rotation/zoom), partage d'un rendu image.
- Profondeur monoculaire (Depth Anything via Replicate) derrière l'interface depth → remplace l'extrusion pour le style « réaliste ».
- Monorepo Metro (supprimer la copie de types mobile).

### Phase 2 — Différenciation (2-3 mois)
- Multi-photos (2-4 angles) : silhouettes croisées = visual hull grossier.
- Creusage avec treillis interne + renforts automatiques.
- Slopes/SNOT pour le niveau « détaillé ».
- Scan d'inventaire par photo (détection fine-tunée sur pièces courantes).
- Import `.obj/.glb/.stl` (voxelisation directe — le pipeline aval existe déjà).
- Prix BrickLink temps réel ; suggestions « constructible avec mes pièces ».

### Phase 3 — Produit avancé (6 mois+)
- Reconstruction 3D : Gaussian Splatting / modèles image-to-3D, puis voxelisation.
- Instructions PDF façon notice officielle (rendu vectoriel par étape).
- Marketplace de modèles générés (modération, partage de revenus).
- Web admin (Next.js) : métriques pipeline, files, catalogue.

## 9. Prochaines étapes concrètes

1. `docker compose up -d && npm run db:migrate && npm run db:seed` puis lancer
   API + worker + Expo (cf. README) — boucle complète sur device.
2. Tester sur 20 vrais objets variés ; constituer un set d'images de
   régression et des seuils de qualité (couverture masque, score stabilité).
3. Écran de retouche du masque (V1.1) — plus gros levier de qualité/€.
4. Brancher Supabase Auth (1 jour, le contrat est prêt).
5. Auditer les IDs BrickLink/LDraw par un import réel de chaque export.
6. EAS Build + TestFlight ; instrumentation (taux de réussite par étape du
   pipeline = LA métrique produit).
