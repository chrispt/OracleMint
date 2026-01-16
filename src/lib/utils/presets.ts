/**
 * Context presets for Paper Magic and MTG Arena
 * These influence prompting style, risk tolerance, and output format
 */

export type PresetKey =
  | 'paper_casual'
  | 'paper_fnm'
  | 'paper_competitive'
  | 'arena_bo1'
  | 'arena_bo3';

export type InfoMode = 'open' | 'constrained';
export type RiskTolerance = 'exploratory' | 'moderate' | 'calculated' | 'aggressive';
export type TriggerHandling = 'lenient' | 'standard' | 'strict' | 'automatic';
export type ExplanationStyle = 'educational' | 'practical' | 'technical' | 'click_order';
export type OpponentReadLevel = 'casual' | 'intermediate' | 'expert' | 'ladder' | 'competitive';

export interface Preset {
  key: PresetKey;
  label: string;
  description: string;
  platform: 'paper' | 'arena';
  infoMode: InfoMode;
  riskTolerance: RiskTolerance;
  triggerHandling: TriggerHandling;
  explanationStyle: ExplanationStyle;
  shortcutsEnabled: boolean;
  opponentReadLevel: OpponentReadLevel;
}

export const PRESETS: Record<PresetKey, Preset> = {
  paper_casual: {
    key: 'paper_casual',
    label: 'Paper - Casual',
    description: 'Kitchen table Magic, learning environment',
    platform: 'paper',
    infoMode: 'open',
    riskTolerance: 'exploratory',
    triggerHandling: 'lenient',
    explanationStyle: 'educational',
    shortcutsEnabled: true,
    opponentReadLevel: 'casual',
  },
  paper_fnm: {
    key: 'paper_fnm',
    label: 'Paper - FNM',
    description: 'Friday Night Magic, competitive but friendly',
    platform: 'paper',
    infoMode: 'open',
    riskTolerance: 'moderate',
    triggerHandling: 'standard',
    explanationStyle: 'practical',
    shortcutsEnabled: true,
    opponentReadLevel: 'intermediate',
  },
  paper_competitive: {
    key: 'paper_competitive',
    label: 'Paper - Competitive',
    description: 'Tournament play, strict rules enforcement',
    platform: 'paper',
    infoMode: 'open',
    riskTolerance: 'calculated',
    triggerHandling: 'strict',
    explanationStyle: 'technical',
    shortcutsEnabled: false,
    opponentReadLevel: 'expert',
  },
  arena_bo1: {
    key: 'arena_bo1',
    label: 'Arena - BO1',
    description: 'Best-of-One ranked ladder',
    platform: 'arena',
    infoMode: 'constrained',
    riskTolerance: 'aggressive',
    triggerHandling: 'automatic',
    explanationStyle: 'click_order',
    shortcutsEnabled: true,
    opponentReadLevel: 'ladder',
  },
  arena_bo3: {
    key: 'arena_bo3',
    label: 'Arena - BO3',
    description: 'Best-of-Three traditional',
    platform: 'arena',
    infoMode: 'constrained',
    riskTolerance: 'moderate',
    triggerHandling: 'automatic',
    explanationStyle: 'click_order',
    shortcutsEnabled: true,
    opponentReadLevel: 'competitive',
  },
} as const;

export function getPreset(key: PresetKey): Preset {
  return PRESETS[key];
}

export function getPresetsByPlatform(platform: 'paper' | 'arena'): Preset[] {
  return Object.values(PRESETS).filter(p => p.platform === platform);
}

export const DEFAULT_PRESET: PresetKey = 'arena_bo1';
