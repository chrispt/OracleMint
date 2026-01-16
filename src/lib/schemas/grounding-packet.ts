/**
 * Grounding Packet - The data package sent to LLMs
 * Contains game state + all relevant card Oracle text + rulings
 */

import { z } from 'zod';
import { GameStateSchema, type GameState, extractCardNames } from './game-state';
import { type PresetKey, getPreset } from '@/lib/utils/presets';
import { resolveCardNames, type CardWithRelations, type ResolveResult } from '@/lib/scryfall/card-resolver';

// ============ Card Data for LLM ============

export const CardDataSchema = z.object({
  oracleId: z.string(),
  name: z.string(),
  manaCost: z.string().nullable(),
  cmc: z.number(),
  typeLine: z.string(),
  oracleText: z.string().nullable(),
  colors: z.array(z.string()),
  keywords: z.array(z.string()),
  faces: z.array(z.object({
    name: z.string(),
    manaCost: z.string().nullable(),
    typeLine: z.string(),
    oracleText: z.string().nullable(),
    power: z.string().nullable(),
    toughness: z.string().nullable(),
    loyalty: z.string().nullable(),
  })).optional(),
  rulings: z.array(z.object({
    date: z.string(),
    text: z.string(),
  })),
});

export type CardData = z.infer<typeof CardDataSchema>;

// ============ Context ============

export const GroundingContextSchema = z.object({
  preset: z.string(),
  platform: z.enum(['paper', 'arena']),
  format: z.string().optional(),
  infoMode: z.enum(['open', 'constrained']),
  triggerHandling: z.string(),
  explanationStyle: z.string(),
});

export type GroundingContext = z.infer<typeof GroundingContextSchema>;

// ============ Grounding Packet ============

export const GroundingPacketSchema = z.object({
  gameState: GameStateSchema,
  cardDatabase: z.record(z.string(), CardDataSchema), // oracleId -> CardData
  context: GroundingContextSchema,
  unresolvedCards: z.array(z.string()).optional(), // Cards that couldn't be resolved
});

export type GroundingPacket = z.infer<typeof GroundingPacketSchema>;

// ============ Resolution Result ============

export interface GroundingResult {
  packet: GroundingPacket;
  resolutionResults: ResolveResult[];
  warnings: string[];
}

// ============ Builder ============

/**
 * Build a grounding packet from game state
 */
export async function buildGroundingPacket(
  gameState: GameState,
  presetKey: PresetKey,
  format?: string
): Promise<GroundingResult> {
  const preset = getPreset(presetKey);
  const warnings: string[] = [];
  const unresolvedCards: string[] = [];

  // Extract all card names from the game state
  const cardNames = extractCardNames(gameState);

  // Resolve all cards
  const resolutionResults = await resolveCardNames(cardNames);

  // Build card database
  const cardDatabase: Record<string, CardData> = {};

  for (const result of resolutionResults) {
    if (result.card) {
      const cardData = cardToCardData(result.card);
      cardDatabase[result.card.oracleId] = cardData;
    } else if (result.status === 'not_found') {
      unresolvedCards.push(result.input);
      warnings.push(`Card not found: "${result.input}"`);
    } else if (result.status === 'ambiguous') {
      unresolvedCards.push(result.input);
      const candidateNames = result.candidates?.map(c => c.name).join(', ') || 'unknown';
      warnings.push(`Ambiguous card name: "${result.input}" - did you mean: ${candidateNames}?`);
    }
  }

  // Build context
  const context: GroundingContext = {
    preset: presetKey,
    platform: preset.platform,
    format: format || gameState.format,
    infoMode: preset.infoMode,
    triggerHandling: preset.triggerHandling,
    explanationStyle: preset.explanationStyle,
  };

  // Build the packet
  const packet: GroundingPacket = {
    gameState,
    cardDatabase,
    context,
    unresolvedCards: unresolvedCards.length > 0 ? unresolvedCards : undefined,
  };

  return {
    packet,
    resolutionResults,
    warnings,
  };
}

/**
 * Convert database card to LLM-friendly format
 */
function cardToCardData(card: CardWithRelations): CardData {
  return {
    oracleId: card.oracleId,
    name: card.name,
    manaCost: card.manaCost,
    cmc: card.cmc,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    colors: card.colors,
    keywords: card.keywords,
    faces: card.faces.length > 0
      ? card.faces.map(face => ({
          name: face.name,
          manaCost: face.manaCost,
          typeLine: face.typeLine,
          oracleText: face.oracleText,
          power: face.power,
          toughness: face.toughness,
          loyalty: face.loyalty,
        }))
      : undefined,
    rulings: card.rulings.map(ruling => ({
      date: ruling.publishedAt.toISOString().split('T')[0],
      text: ruling.comment,
    })),
  };
}

/**
 * Serialize grounding packet to a string for inclusion in prompts
 */
export function serializeGroundingPacket(packet: GroundingPacket): string {
  return JSON.stringify(packet, null, 2);
}

/**
 * Create a compact version of the packet for smaller context windows
 */
export function compactGroundingPacket(packet: GroundingPacket): string {
  const compact = {
    state: {
      turn: packet.gameState.turn,
      phase: packet.gameState.phase,
      priority: packet.gameState.priority,
      active: packet.gameState.activePlayer,
      life: packet.gameState.life,
      mana: packet.gameState.manaPool,
      you: summarizeZones(packet.gameState.you),
      opp: summarizeZones(packet.gameState.opponent),
      stack: packet.gameState.stack.map(s => ({
        type: s.type,
        card: s.source.name,
        ctrl: s.controller,
      })),
    },
    cards: Object.entries(packet.cardDatabase).reduce((acc, [id, card]) => {
      acc[card.name] = {
        mana: card.manaCost,
        type: card.typeLine,
        text: card.oracleText,
        rules: card.rulings.length,
      };
      return acc;
    }, {} as Record<string, unknown>),
    ctx: packet.context,
  };

  return JSON.stringify(compact);
}

function summarizeZones(zones: typeof GameStateSchema._type['you']) {
  return {
    board: zones.battlefield.map(p => ('name' in p ? p.name : p.name)),
    hand: Array.isArray(zones.hand)
      ? zones.hand.map(c => c.name)
      : { count: zones.hand.count, known: zones.hand.known?.map(c => c.name) },
    grave: zones.graveyard.map(c => c.name),
  };
}
