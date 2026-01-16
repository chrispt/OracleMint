/**
 * Card resolution logic
 * Handles exact matching, face matching for DFCs, fuzzy matching, and Scryfall fallback
 */

import { db } from '@/lib/db';
import { normalizeName, parseCardNameVariants } from '@/lib/utils/card-names';
import { getCardByName, getRulingsByCardId, type ScryfallCard } from './client';
import type { Card, CardFace, Ruling } from '@prisma/client';

export type ResolveStatus =
  | 'exact'
  | 'normalized'
  | 'face_match'
  | 'fuzzy'
  | 'ambiguous'
  | 'not_found';

export interface CardWithRelations extends Card {
  faces: CardFace[];
  rulings: Ruling[];
}

export interface ResolveResult {
  status: ResolveStatus;
  card?: CardWithRelations;
  candidates?: Array<{ name: string; oracleId: string; typeLine: string }>;
  matchedFace?: number;
  input: string;
}

/**
 * Resolve a single card name to its database entry
 */
export async function resolveCardName(input: string): Promise<ResolveResult> {
  const variants = parseCardNameVariants(input);
  const primaryNormalized = variants[0];

  // 1. Try exact match on full normalized name
  let card = await db.card.findFirst({
    where: { normalizedName: primaryNormalized },
    include: { faces: true, rulings: true },
  });

  if (card) {
    return { status: 'exact', card, input };
  }

  // 2. Try matching on card face names (for DFC/split/adventure)
  for (const variant of variants) {
    const face = await db.cardFace.findFirst({
      where: { normalizedName: variant },
      include: {
        card: {
          include: { faces: true, rulings: true },
        },
      },
    });

    if (face) {
      return {
        status: 'face_match',
        card: face.card,
        matchedFace: face.faceIndex,
        input,
      };
    }
  }

  // 3. Try prefix matching for potential typos
  const candidates = await db.card.findMany({
    where: {
      normalizedName: {
        startsWith: primaryNormalized.slice(0, Math.max(3, Math.floor(primaryNormalized.length / 2))),
      },
    },
    take: 10,
    select: { name: true, oracleId: true, typeLine: true },
  });

  if (candidates.length > 0) {
    // Check if one is a very close match (could be the right one)
    const exactCandidate = candidates.find(
      c => normalizeName(c.name) === primaryNormalized
    );

    if (exactCandidate) {
      // Fetch the full card
      card = await db.card.findUnique({
        where: { oracleId: exactCandidate.oracleId },
        include: { faces: true, rulings: true },
      });

      if (card) {
        return { status: 'normalized', card, input };
      }
    }

    // Multiple candidates - return for disambiguation
    if (candidates.length > 1) {
      return { status: 'ambiguous', candidates, input };
    }
  }

  // 4. Fall back to Scryfall API
  return await fetchAndCacheFromScryfall(input);
}

/**
 * Resolve multiple card names at once
 */
export async function resolveCardNames(inputs: string[]): Promise<ResolveResult[]> {
  const results: ResolveResult[] = [];

  for (const input of inputs) {
    const result = await resolveCardName(input);
    results.push(result);
  }

  return results;
}

/**
 * Fetch a card from Scryfall and cache it in the database
 */
async function fetchAndCacheFromScryfall(input: string): Promise<ResolveResult> {
  const scryfallCard = await getCardByName(input, { fuzzy: true });

  if (!scryfallCard) {
    return { status: 'not_found', input };
  }

  // Cache the card in our database
  const card = await upsertCardFromScryfall(scryfallCard);

  // Also fetch and cache rulings
  try {
    const rulings = await getRulingsByCardId(scryfallCard.id);
    if (rulings.length > 0) {
      await upsertRulings(scryfallCard.oracle_id, rulings);
    }
  } catch (error) {
    console.error(`Failed to fetch rulings for ${scryfallCard.name}:`, error);
  }

  // Fetch the complete card with relations
  const fullCard = await db.card.findUnique({
    where: { oracleId: card.oracleId },
    include: { faces: true, rulings: true },
  });

  return {
    status: 'fuzzy',
    card: fullCard || undefined,
    input,
  };
}

/**
 * Upsert a card from Scryfall data
 */
async function upsertCardFromScryfall(scryfallCard: ScryfallCard): Promise<Card> {
  const normalizedCardName = normalizeName(scryfallCard.name);

  const card = await db.card.upsert({
    where: { oracleId: scryfallCard.oracle_id },
    create: {
      oracleId: scryfallCard.oracle_id,
      scryfallId: scryfallCard.id,
      name: scryfallCard.name,
      normalizedName: normalizedCardName,
      layout: scryfallCard.layout,
      manaCost: scryfallCard.mana_cost,
      cmc: scryfallCard.cmc,
      typeLine: scryfallCard.type_line,
      oracleText: scryfallCard.oracle_text,
      colors: scryfallCard.colors || [],
      colorIdentity: scryfallCard.color_identity,
      keywords: scryfallCard.keywords,
      releasedAt: scryfallCard.released_at ? new Date(scryfallCard.released_at) : null,
    },
    update: {
      scryfallId: scryfallCard.id,
      name: scryfallCard.name,
      normalizedName: normalizedCardName,
      layout: scryfallCard.layout,
      manaCost: scryfallCard.mana_cost,
      cmc: scryfallCard.cmc,
      typeLine: scryfallCard.type_line,
      oracleText: scryfallCard.oracle_text,
      colors: scryfallCard.colors || [],
      colorIdentity: scryfallCard.color_identity,
      keywords: scryfallCard.keywords,
      releasedAt: scryfallCard.released_at ? new Date(scryfallCard.released_at) : null,
    },
  });

  // Handle multi-face cards
  if (scryfallCard.card_faces && scryfallCard.card_faces.length > 0) {
    // Delete existing faces
    await db.cardFace.deleteMany({
      where: { cardId: card.id },
    });

    // Create new faces
    for (let i = 0; i < scryfallCard.card_faces.length; i++) {
      const face = scryfallCard.card_faces[i];
      await db.cardFace.create({
        data: {
          cardId: card.id,
          faceIndex: i,
          name: face.name,
          normalizedName: normalizeName(face.name),
          manaCost: face.mana_cost,
          typeLine: face.type_line,
          oracleText: face.oracle_text,
          power: face.power,
          toughness: face.toughness,
          loyalty: face.loyalty,
          defense: face.defense,
        },
      });
    }
  }

  return card;
}

/**
 * Upsert rulings for a card
 */
async function upsertRulings(
  oracleId: string,
  rulings: Array<{ published_at: string; comment: string; source: string }>
): Promise<void> {
  // Delete existing rulings
  await db.ruling.deleteMany({
    where: { oracleId },
  });

  // Insert new rulings
  for (const ruling of rulings) {
    await db.ruling.create({
      data: {
        oracleId,
        publishedAt: new Date(ruling.published_at),
        comment: ruling.comment,
        source: ruling.source,
      },
    });
  }
}

/**
 * Autocomplete card names for search UI
 */
export async function autocompleteCards(
  query: string,
  limit: number = 10
): Promise<Array<{ name: string; oracleId: string; typeLine: string }>> {
  if (query.length < 2) return [];

  const normalized = normalizeName(query);

  // First try prefix matches (faster, more relevant)
  const prefixMatches = await db.card.findMany({
    where: { normalizedName: { startsWith: normalized } },
    take: limit,
    select: { name: true, oracleId: true, typeLine: true },
    orderBy: { name: 'asc' },
  });

  if (prefixMatches.length >= limit) {
    return prefixMatches;
  }

  // Then try contains matches
  const containsMatches = await db.card.findMany({
    where: {
      normalizedName: { contains: normalized },
      NOT: { normalizedName: { startsWith: normalized } },
    },
    take: limit - prefixMatches.length,
    select: { name: true, oracleId: true, typeLine: true },
    orderBy: { name: 'asc' },
  });

  return [...prefixMatches, ...containsMatches];
}

/**
 * Get a card by oracle ID with all relations
 */
export async function getCardByOracleId(oracleId: string): Promise<CardWithRelations | null> {
  return db.card.findUnique({
    where: { oracleId },
    include: { faces: true, rulings: true },
  });
}

/**
 * Get multiple cards by oracle IDs
 */
export async function getCardsByOracleIds(oracleIds: string[]): Promise<CardWithRelations[]> {
  return db.card.findMany({
    where: { oracleId: { in: oracleIds } },
    include: { faces: true, rulings: true },
  });
}
