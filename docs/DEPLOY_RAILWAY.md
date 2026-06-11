# Déployer Brickify AI sur Railway

Configuration MVP : **un seul service** (API + worker embarqué) + PostgreSQL +
Redis + un volume pour les fichiers. Le repo contient déjà `railway.json`
(commande de démarrage, healthcheck) — Railway le détecte automatiquement.

La commande de démarrage fait tout : `prisma migrate deploy` (migrations) →
`tsx prisma/seed.ts` (catalogue, idempotent) → API + worker.

---

## 1. Créer le projet

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `fabultra/lego`.
2. Le premier déploiement va échouer (pas encore de base de données) : normal,
   on continue.

## 2. Ajouter PostgreSQL et Redis

Dans le projet : **Create** → **Database** → **Add PostgreSQL**, puis à
nouveau → **Add Redis**.

## 3. Variables du service web

Service `lego` → onglet **Variables** → **Raw Editor**, coller :

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
EMBED_WORKER=true
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/data/storage
AUTH_MODE=dev
```

Notes :
- L'API détecte `RAILWAY_PUBLIC_DOMAIN` automatiquement, **mais** ce
  variable n'existe qu'après la génération du domaine (étape 5) : si le
  premier déploiement a démarré avant, les URLs de fichiers pointent sur
  localhost. Deux options : redéployer après l'étape 5, ou (recommandé,
  déterministe) ajouter explicitement
  `PUBLIC_BASE_URL=https://<domaine>` une fois le domaine connu.
- `PORT` est injecté par Railway — ne pas le définir.
- ⚠️ `AUTH_MODE=dev` = **tous les clients partagent le même utilisateur**.
  Parfait pour tester depuis l'app mobile, à remplacer avant toute ouverture :
  `AUTH_MODE=supabase` + `SUPABASE_JWT_SECRET=<JWT secret du projet Supabase>`.

## 4. Volume pour les fichiers

Clic droit sur le service → **Attach Volume** → mount path : **`/data`**.
(Photos, masques et grilles JSON y survivent aux redéploiements.)

## 5. Domaine public

Service → **Settings** → **Networking** → **Generate Domain**.
Vous obtenez `https://<service>.up.railway.app`.

## 6. Vérifier

```bash
curl https://<domaine>/healthz
# {"ok":true,"service":"brickify-api"}

# Parcours complet sans vraie photo :
cd apps/api && npx tsx scripts/make-sample-photo.ts /tmp/photo.jpg
curl -X POST https://<domaine>/projects -H 'Content-Type: application/json' -d '{"name":"Test Railway"}'
curl -X POST https://<domaine>/projects/<ID>/images -F image=@/tmp/photo.jpg
curl -X POST https://<domaine>/projects/<ID>/generate -H 'Content-Type: application/json' \
  -d '{"options":{"size":"medium","detail":"balanced","style":"realistic"}}'
curl https://<domaine>/projects/<ID>/status   # → ready en quelques secondes
```

## 7. Brancher l'app mobile

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://<domaine> npm run start
```

(Ou mettre la variable dans `apps/mobile/.env` : `EXPO_PUBLIC_API_URL=…`.)

---

## Quand le trafic grandit : passer en multi-services

Le mode mono-service est un choix MVP (1 replica, stockage sur volume non
partageable). Pour scaler :

1. **Stockage S3** : créer un bucket Cloudflare R2 (ou MinIO/S3) et remplacer
   les variables stockage par :
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=brickify
   S3_ACCESS_KEY=…
   S3_SECRET_KEY=…
   ```
   (Le code sert alors des URLs signées — le volume devient inutile.)
2. **Service worker dédié** : dans le même projet Railway → **New Service** →
   même repo GitHub → Settings → **Custom Start Command** :
   `npm run worker -w apps/api`, avec les mêmes variables (sans `EMBED_WORKER`),
   et remettre `EMBED_WORKER=false` sur le service web. Augmenter ensuite le
   nombre de replicas du worker selon la file.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Build OK mais crash au boot : `Cannot find module 'tsx'` | `npm ci` a tourné avec `NODE_ENV=production` — c'est prévu : `tsx` et `prisma` sont en `dependencies` du paquet `apps/api` (ne pas les redescendre en devDependencies) |
| `ECONNREFUSED 6379` en boucle | `REDIS_URL` absent ou référence `${{Redis.REDIS_URL}}` non résolue |
| Migrations en échec au boot | `DATABASE_URL` manquant, ou base pas encore provisionnée — redéployer |
| Images 404 après redéploiement | volume non attaché ou `STORAGE_LOCAL_DIR` ≠ chemin monté |
| URLs d'images en `http://localhost:8080/...` | service démarré avant la création du domaine — définir `PUBLIC_BASE_URL` puis redéployer |
| L'app mobile ne voit pas l'API | `EXPO_PUBLIC_API_URL` manquant (relancer `expo start` après changement) |
