/**
 * Scryfall API client with rate limiting and proper headers
 * Respects Scryfall's rate limits: max 10 requests/second
 */

const SCRYFALL_BASE_URL = 'https://api.scryfall.com';

const SCRYFALL_HEADERS = {
  'User-Agent': 'OracleMint/1.0 (https://oraclemint.vercel.app)',
  'Accept': 'application/json',
};

// Rate limiter to respect Scryfall's 10 req/sec limit
const rateLimiter = {
  lastRequest: 0,
  minDelay: 100, // 100ms = max 10 req/sec

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await sleep(this.minDelay - elapsed);
    }
    this.lastRequest = Date.now();
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ScryfallError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ScryfallError';
  }
}

/**
 * Fetch from Scryfall with automatic rate limiting and backoff on 429
 */
export async function fetchWithBackoff(
  url: string,
  options: {
    retries?: number;
    timeout?: number;
  } = {}
): Promise<Response> {
  const { retries = 3, timeout = 30000 } = options;

  for (let attempt = 0; attempt < retries; attempt++) {
    await rateLimiter.throttle();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: SCRYFALL_HEADERS,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        console.warn(`Scryfall rate limit hit, waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ScryfallError('Request timeout', 408, 'The request to Scryfall timed out');
      }
      if (attempt === retries - 1) throw error;
      await sleep(1000 * (attempt + 1)); // Exponential backoff
    }
  }

  throw new ScryfallError('Max retries exceeded', 503, 'Failed to fetch from Scryfall after multiple attempts');
}

// ============ API Methods ============

export interface BulkDataInfo {
  object: string;
  id: string;
  type: string;
  updated_at: string;
  uri: string;
  name: string;
  description: string;
  size: number;
  download_uri: string;
  content_type: string;
  content_encoding: string;
}

export interface BulkDataResponse {
  object: string;
  has_more: boolean;
  data: BulkDataInfo[];
}

/**
 * Get the bulk data manifest from Scryfall
 */
export async function getBulkDataManifest(): Promise<BulkDataResponse> {
  const response = await fetchWithBackoff(`${SCRYFALL_BASE_URL}/bulk-data`);
  if (!response.ok) {
    throw new ScryfallError(
      'Failed to fetch bulk data manifest',
      response.status,
      await response.text()
    );
  }
  return response.json();
}

/**
 * Get a specific bulk data download URL
 */
export async function getBulkDataUrl(type: 'oracle_cards' | 'rulings' | 'all_cards'): Promise<BulkDataInfo> {
  const manifest = await getBulkDataManifest();
  const bulkData = manifest.data.find(d => d.type === type);
  if (!bulkData) {
    throw new ScryfallError(`Bulk data type '${type}' not found`, 404);
  }
  return bulkData;
}

export interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  layout: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords: string[];
  released_at?: string;
  rulings_uri: string;
  card_faces?: ScryfallCardFace[];
}

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}

export interface ScryfallRuling {
  oracle_id: string;
  source: string;
  published_at: string;
  comment: string;
}

/**
 * Fetch a card by name (exact or fuzzy match)
 */
export async function getCardByName(
  name: string,
  options: { fuzzy?: boolean } = {}
): Promise<ScryfallCard | null> {
  const { fuzzy = true } = options;
  const param = fuzzy ? 'fuzzy' : 'exact';
  const url = `${SCRYFALL_BASE_URL}/cards/named?${param}=${encodeURIComponent(name)}`;

  const response = await fetchWithBackoff(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ScryfallError(
      'Failed to fetch card',
      response.status,
      await response.text()
    );
  }

  return response.json();
}

/**
 * Fetch rulings for a card by its Scryfall ID
 */
export async function getRulingsByCardId(cardId: string): Promise<ScryfallRuling[]> {
  const url = `${SCRYFALL_BASE_URL}/cards/${cardId}/rulings`;
  const response = await fetchWithBackoff(url);

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new ScryfallError(
      'Failed to fetch rulings',
      response.status,
      await response.text()
    );
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch card autocomplete suggestions
 */
export async function autocomplete(query: string): Promise<string[]> {
  if (query.length < 2) return [];

  const url = `${SCRYFALL_BASE_URL}/cards/autocomplete?q=${encodeURIComponent(query)}`;
  const response = await fetchWithBackoff(url);

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Stream download bulk data (returns a ReadableStream)
 */
export async function streamBulkData(downloadUrl: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(downloadUrl, {
    headers: SCRYFALL_HEADERS,
  });

  if (!response.ok || !response.body) {
    throw new ScryfallError(
      'Failed to start bulk data download',
      response.status,
      'Response body is not available'
    );
  }

  return response.body;
}
