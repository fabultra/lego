import { config } from '../config';

/**
 * Client Replicate minimal (sans SDK) : exécution d'un modèle communautaire
 * par id de version, avec attente synchrone (Prefer: wait) puis polling.
 * Les ids de version sont résolus une fois par modèle et mis en cache.
 */

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: unknown;
}

const versionCache = new Map<string, string>();

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.replicate.token}`,
    'Content-Type': 'application/json',
  };
}

async function resolveVersion(model: string): Promise<string> {
  const cached = versionCache.get(model);
  if (cached) return cached;
  const res = await fetch(`https://api.replicate.com/v1/models/${model}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Replicate: modèle ${model} introuvable (HTTP ${res.status})`);
  const body = (await res.json()) as { latest_version?: { id?: string } };
  const version = body.latest_version?.id;
  if (!version) throw new Error(`Replicate: pas de version publiée pour ${model}`);
  versionCache.set(model, version);
  return version;
}

/** Lance une prédiction et retourne son output (ou jette en cas d'échec/timeout). */
export async function runReplicate(
  model: string,
  input: Record<string, unknown>,
  timeoutMs = config.replicate.timeoutMs,
): Promise<unknown> {
  const version = await resolveVersion(model);
  const deadline = Date.now() + timeoutMs;

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { ...authHeaders(), Prefer: 'wait' },
    body: JSON.stringify({ version, input }),
  });
  let pred = (await res.json()) as ReplicatePrediction;
  if (!res.ok && !pred.id) {
    // 402 = facturation absente, 401 = token invalide, etc.
    throw new Error(`Replicate HTTP ${res.status}: ${JSON.stringify(pred).slice(0, 200)}`);
  }

  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() > deadline) throw new Error(`Replicate: timeout après ${timeoutMs}ms (${model})`);
    await new Promise((r) => setTimeout(r, 1200));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: authHeaders(),
    });
    pred = (await poll.json()) as ReplicatePrediction;
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`Replicate: ${pred.status} — ${JSON.stringify(pred.error).slice(0, 200)}`);
  }
  return pred.output;
}

/** Récupère le binaire pointé par un output (URL directe ou première d'une liste). */
export async function fetchOutputBuffer(output: unknown): Promise<Buffer> {
  const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : undefined;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error(`Replicate: output inattendu (${JSON.stringify(output).slice(0, 120)})`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Replicate: téléchargement output HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
