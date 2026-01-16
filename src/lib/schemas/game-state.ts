/**
 * Game State Schema - Complete MTG game state representation
 * Supports both Paper Magic and MTG Arena
 */

import { z } from 'zod';

// ============ Card References ============

export const CardReferenceSchema = z.object({
  name: z.string().min(1, 'Card name is required'),
  oracleId: z.string().optional(),
  faceIndex: z.number().int().min(0).max(1).optional(),
});

export type CardReference = z.infer<typeof CardReferenceSchema>;

// ============ Permanents ============

export const PermanentSchema = CardReferenceSchema.extend({
  id: z.string().optional(), // Unique identifier for this permanent instance
  tapped: z.boolean().default(false),
  summoningSick: z.boolean().default(false),
  counters: z.record(z.string(), z.number()).optional(),
  attachedTo: z.string().optional(), // ID of permanent this is attached to
  controller: z.enum(['you', 'opponent']).optional(),
  damage: z.number().int().min(0).optional(),

  // Combat state
  attacking: z.boolean().optional(),
  attackingTarget: z.string().optional(), // Player ID or planeswalker ID
  blocking: z.string().optional(), // ID of creature being blocked
  blockedBy: z.array(z.string()).optional(), // IDs of creatures blocking this
});

export type Permanent = z.infer<typeof PermanentSchema>;

// ============ Tokens ============

export const TokenCharacteristicsSchema = z.object({
  power: z.string().optional(),
  toughness: z.string().optional(),
  colors: z.array(z.string()),
  types: z.array(z.string()),
});

export const TokenSchema = z.object({
  type: z.literal('token'),
  id: z.string().optional(),
  name: z.string(),
  characteristics: TokenCharacteristicsSchema,
  createdBy: z.string().optional(), // oracle_id of the card that created it
  tapped: z.boolean().default(false),
  counters: z.record(z.string(), z.number()).optional(),
  controller: z.enum(['you', 'opponent']).optional(),
  damage: z.number().int().min(0).optional(),

  // Combat state
  attacking: z.boolean().optional(),
  attackingTarget: z.string().optional(),
  blocking: z.string().optional(),
  blockedBy: z.array(z.string()).optional(),
});

export type Token = z.infer<typeof TokenSchema>;

// ============ Stack Items ============

export const StackItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['spell', 'ability', 'trigger']),
  source: CardReferenceSchema,
  abilityText: z.string().optional(), // For abilities/triggers
  targets: z.array(z.string()).optional(),
  controller: z.enum(['you', 'opponent']),
  modes: z.array(z.string()).optional(), // For modal spells/abilities
});

export type StackItem = z.infer<typeof StackItemSchema>;

// ============ Zones ============

export const LibrarySchema = z.object({
  count: z.number().int().min(0).default(0),
  knownTop: z.array(CardReferenceSchema).optional(), // From scry/reveal effects
  knownBottom: z.array(CardReferenceSchema).optional(), // Rarely used
});

export const HandSchema = z.union([
  z.array(CardReferenceSchema), // Full known hand (paper or your hand)
  z.object({
    count: z.number().int().min(0),
    known: z.array(CardReferenceSchema).optional(), // Revealed cards only
  }),
]);

export const PlayerZonesSchema = z.object({
  battlefield: z.array(z.union([PermanentSchema, TokenSchema])).default([]),
  hand: HandSchema.default([]),
  graveyard: z.array(CardReferenceSchema).default([]),
  exile: z.array(CardReferenceSchema).default([]),
  library: LibrarySchema.optional(),
  commandZone: z.array(CardReferenceSchema).optional(), // For Commander
});

export type PlayerZones = z.infer<typeof PlayerZonesSchema>;

// ============ Mana Pool ============

export const ManaPoolSchema = z.object({
  W: z.number().int().min(0).default(0),
  U: z.number().int().min(0).default(0),
  B: z.number().int().min(0).default(0),
  R: z.number().int().min(0).default(0),
  G: z.number().int().min(0).default(0),
  C: z.number().int().min(0).default(0), // Colorless
});

export type ManaPool = z.infer<typeof ManaPoolSchema>;

// ============ Phases ============

export const PhaseSchema = z.enum([
  'untap',
  'upkeep',
  'draw',
  'precombat_main',
  'begin_combat',
  'declare_attackers',
  'declare_blockers',
  'combat_damage',
  'end_combat',
  'postcombat_main',
  'end',
  'cleanup',
]);

export type Phase = z.infer<typeof PhaseSchema>;

// Simplified phases for quick entry
export const SimplifiedPhaseSchema = z.enum([
  'main1',
  'combat',
  'main2',
  'end',
]);

// ============ Arena-Specific ============

export const ArenaTriggerSchema = z.object({
  source: z.string(),
  text: z.string(),
  mandatory: z.boolean().optional(),
});

export const ArenaStateSchema = z.object({
  pendingTriggers: z.array(ArenaTriggerSchema).optional(),
  autoStops: z.array(z.string()).optional(),
  fullControlEnabled: z.boolean().optional(),
});

// ============ Full Game State ============

export const GameStateSchema = z.object({
  // Turn structure
  turn: z.number().int().positive(),
  phase: PhaseSchema,
  priority: z.enum(['you', 'opponent']),
  activePlayer: z.enum(['you', 'opponent']).default('you'),

  // Life totals
  life: z.object({
    you: z.number().int(),
    opponent: z.number().int(),
  }).default({ you: 20, opponent: 20 }),

  // Mana pools
  manaPool: ManaPoolSchema.optional(),
  opponentManaPool: ManaPoolSchema.optional(),

  // Player zones
  you: PlayerZonesSchema,
  opponent: PlayerZonesSchema,

  // The stack
  stack: z.array(StackItemSchema).default([]),

  // Metadata
  format: z.string().optional(),
  notes: z.string().optional(), // Free-form notes (paper)

  // Arena-specific state
  arena: ArenaStateSchema.optional(),

  // Commander-specific
  commanderDamage: z.record(z.string(), z.number()).optional(),

  // Revealed info tracking (for constrained info mode)
  revealedInfo: z.object({
    opponentHand: z.array(CardReferenceSchema).optional(),
    opponentLibraryTop: z.array(CardReferenceSchema).optional(),
  }).optional(),

  // Land drops
  landsPlayedThisTurn: z.number().int().min(0).default(0),
  maxLandsPerTurn: z.number().int().min(1).default(1),
});

export type GameState = z.infer<typeof GameStateSchema>;

// ============ Minimum Required State ============

export const MinimumGameStateSchema = z.object({
  turn: z.number().int().positive(),
  phase: PhaseSchema,
  priority: z.enum(['you', 'opponent']),
});

export type MinimumGameState = z.infer<typeof MinimumGameStateSchema>;

// ============ Quick Entry Schema ============

export const QuickEntrySchema = z.object({
  // Basic game info
  yourLife: z.number().int().default(20),
  opponentLife: z.number().int().default(20),
  turn: z.number().int().positive().default(1),
  phase: SimplifiedPhaseSchema.default('main1'),
  yourTurn: z.boolean().default(true),
  havePriority: z.boolean().default(true),

  // Available mana (text like "WUBRG" or "2WW")
  availableMana: z.string().optional(),

  // Cards (simple name lists)
  yourBattlefield: z.array(z.string()).default([]),
  yourHand: z.array(z.string()).default([]),
  yourGraveyard: z.array(z.string()).default([]),
  opponentBattlefield: z.array(z.string()).default([]),
  opponentHandCount: z.number().int().min(0).default(0),
  opponentGraveyard: z.array(z.string()).default([]),

  // Optional stack
  stack: z.array(z.string()).default([]),
});

export type QuickEntry = z.infer<typeof QuickEntrySchema>;

// ============ Helper Functions ============

/**
 * Convert simplified phase to full phase
 */
export function expandSimplifiedPhase(simple: z.infer<typeof SimplifiedPhaseSchema>): Phase {
  const mapping: Record<z.infer<typeof SimplifiedPhaseSchema>, Phase> = {
    main1: 'precombat_main',
    combat: 'declare_attackers',
    main2: 'postcombat_main',
    end: 'end',
  };
  return mapping[simple];
}

/**
 * Parse mana string like "2WW" or "WUBRG" into ManaPool
 */
export function parseManaString(manaStr: string): ManaPool {
  const pool: ManaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  let i = 0;
  while (i < manaStr.length) {
    const char = manaStr[i].toUpperCase();

    if (['W', 'U', 'B', 'R', 'G', 'C'].includes(char)) {
      pool[char as keyof ManaPool]++;
      i++;
    } else if (/\d/.test(char)) {
      // Parse numeric colorless mana
      let num = '';
      while (i < manaStr.length && /\d/.test(manaStr[i])) {
        num += manaStr[i];
        i++;
      }
      pool.C += parseInt(num, 10);
    } else {
      i++; // Skip unknown characters
    }
  }

  return pool;
}

/**
 * Convert QuickEntry to full GameState
 */
export function quickEntryToGameState(quick: QuickEntry): Partial<GameState> {
  const phase = expandSimplifiedPhase(quick.phase);

  // Helper to create a permanent with required fields
  const toPermanent = (name: string): Permanent => ({
    name,
    tapped: false,
    summoningSick: false,
  });

  return {
    turn: quick.turn,
    phase,
    priority: quick.havePriority ? 'you' : 'opponent',
    activePlayer: quick.yourTurn ? 'you' : 'opponent',
    life: {
      you: quick.yourLife,
      opponent: quick.opponentLife,
    },
    manaPool: quick.availableMana ? parseManaString(quick.availableMana) : undefined,
    you: {
      battlefield: quick.yourBattlefield.map(toPermanent),
      hand: quick.yourHand.map(name => ({ name })),
      graveyard: quick.yourGraveyard.map(name => ({ name })),
      exile: [],
    },
    opponent: {
      battlefield: quick.opponentBattlefield.map(toPermanent),
      hand: { count: quick.opponentHandCount },
      graveyard: quick.opponentGraveyard.map(name => ({ name })),
      exile: [],
    },
    stack: quick.stack.map(name => ({
      type: 'spell' as const,
      source: { name },
      controller: 'you' as const,
    })),
  };
}

/**
 * Validate that a game state has minimum required fields
 */
export function validateMinimumState(state: unknown): state is MinimumGameState {
  return MinimumGameStateSchema.safeParse(state).success;
}

/**
 * Extract all card names from a game state
 */
export function extractCardNames(state: GameState): string[] {
  const names: string[] = [];

  const addCardsFromZone = (cards: (CardReference | Permanent | Token)[]) => {
    for (const card of cards) {
      if ('name' in card && card.name) {
        names.push(card.name);
      }
    }
  };

  // Your zones
  addCardsFromZone(state.you.battlefield);
  if (Array.isArray(state.you.hand)) {
    addCardsFromZone(state.you.hand);
  }
  addCardsFromZone(state.you.graveyard);
  addCardsFromZone(state.you.exile);
  if (state.you.commandZone) {
    addCardsFromZone(state.you.commandZone);
  }

  // Opponent zones
  addCardsFromZone(state.opponent.battlefield);
  if (Array.isArray(state.opponent.hand)) {
    addCardsFromZone(state.opponent.hand);
  } else if (state.opponent.hand.known) {
    addCardsFromZone(state.opponent.hand.known);
  }
  addCardsFromZone(state.opponent.graveyard);
  addCardsFromZone(state.opponent.exile);
  if (state.opponent.commandZone) {
    addCardsFromZone(state.opponent.commandZone);
  }

  // Stack
  for (const item of state.stack) {
    if (item.source.name) {
      names.push(item.source.name);
    }
  }

  return [...new Set(names)]; // Remove duplicates
}
