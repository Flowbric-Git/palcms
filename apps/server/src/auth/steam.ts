/**
 * Connexion Steam via OpenID 2.0 (aucune clé API nécessaire pour identifier le joueur).
 * Une clé Steam Web API optionnelle permet en plus de récupérer pseudo et avatar.
 */
const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function steamLoginUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID}?${params}`;
}

/** Vérifie la réponse de Steam auprès de Steam lui-même et renvoie le SteamID64. */
export async function verifySteamResponse(query: Record<string, string>, expectedReturnTo: string): Promise<string> {
  if (query['openid.mode'] !== 'id_res') throw new Error('Connexion Steam annulée');
  if (query['openid.op_endpoint'] !== STEAM_OPENID) throw new Error('Réponse Steam invalide');
  const returnTo = query['openid.return_to'] ?? '';
  if (!returnTo.startsWith(expectedReturnTo)) throw new Error('Adresse de retour Steam invalide');
  const match = CLAIMED_ID_RE.exec(query['openid.claimed_id'] ?? '');
  if (!match) throw new Error('Identifiant Steam invalide');

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/.test(text)) throw new Error('Steam a refusé la vérification');
  return match[1];
}

export interface SteamProfile {
  personaName: string;
  avatarUrl: string | null;
}

export async function fetchSteamProfile(steamId: string, apiKey: string): Promise<SteamProfile | null> {
  if (!apiKey) return null;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { response?: { players?: { personaname?: string; avatarfull?: string }[] } };
    const p = json.response?.players?.[0];
    if (!p) return null;
    return { personaName: p.personaname ?? '', avatarUrl: p.avatarfull ?? null };
  } catch {
    return null;
  }
}

/** Identifiant du joueur tel que renvoyé par l'API REST de Palworld. */
export const palworldUidFromSteam = (steamId: string) => `steam_${steamId}`;
