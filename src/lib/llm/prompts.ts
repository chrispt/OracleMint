/**
 * LLM Prompt Templates for OracleMint
 * Supports both Paper Magic and MTG Arena with preset-aware variations
 */

import type { GroundingPacket } from '@/lib/schemas/grounding-packet';
import type { LegalAction } from './schemas';
import { type Preset, type PresetKey, getPreset } from '@/lib/utils/presets';

// ============ System Messages ============

const SYSTEM_BASE = `You are an expert Magic: The Gathering rules advisor and strategic analyst.

CRITICAL RULES:
1. ONLY use the card data provided in the Grounding Packet. NEVER hallucinate or assume card text.
2. Each card's Oracle text in the packet is AUTHORITATIVE. If you don't have Oracle text for a card, explicitly say so.
3. Return ONLY valid JSON matching the required schema. No markdown, no explanations outside the JSON.
4. Be precise about game rules - cite Comprehensive Rules when relevant.`;

// ============ Rules Clerk Prompts ============

export function buildRulesClerkPrompt(
  packet: GroundingPacket,
  presetKey: PresetKey
): { system: string; user: string } {
  const preset = getPreset(presetKey);

  const system = `${SYSTEM_BASE}

You are the RULES CLERK. Your ONLY job is to enumerate ALL legal actions available at this exact moment.

CONTEXT:
- Platform: ${preset.platform === 'paper' ? 'Paper Magic' : 'MTG Arena'}
- Format: ${packet.context.format || 'Unknown'}
- Info Mode: ${preset.infoMode === 'open' ? 'Full game state visible' : 'Constrained (hidden zones)'}
${preset.platform === 'arena' ? '- Arena auto-handles triggers; note which need player choice' : ''}

RULES FOR ENUMERATION:
1. Consider: current phase, priority, stack state, mana available, valid targets, restrictions
2. Include ALL technically legal actions, even obviously suboptimal ones
3. For each action, list any triggered abilities that would result
4. Mark actions that are restricted by timing or other rules
${preset.platform === 'arena' ? '5. Mark actions requiring "Full Control" mode with requiresFullControl: true' : ''}

OUTPUT SCHEMA:
{
  "legalActions": [
    {
      "id": "action_1",
      "type": "cast_spell" | "activate_ability" | "play_land" | "attack" | "block" | "pass_priority" | "special_action" | "trigger_choice",
      "card": "Card Name",
      "ability": "Ability text if applicable",
      "targets": ["target1", "target2"],
      "manaCost": { "total": 2, "colors": { "R": 1, "generic": 1 } },
      "description": "Human-readable description",
      "restrictions": ["any restrictions or requirements"],
      "triggers": ["abilities that would trigger"]
    }
  ],
  "stackState": "empty" | "has_items",
  "currentPriority": "active_player" | "non_active_player",
  "pendingTriggers": [
    { "source": "card name", "trigger": "trigger text", "mustResolve": true }
  ],
  "stateBasedActions": ["any pending SBAs"]
}

Do NOT include strategic advice. Only enumerate what is LEGAL.`;

  const user = `GROUNDING PACKET:
${JSON.stringify(packet, null, 2)}

Enumerate all legal actions for the player with priority.`;

  return { system, user };
}

// ============ Strategist Prompts ============

export function buildStrategistPrompt(
  packet: GroundingPacket,
  legalActions: LegalAction[],
  presetKey: PresetKey
): { system: string; user: string } {
  const preset = getPreset(presetKey);

  const riskGuidance = getRiskGuidance(preset);
  const styleGuidance = getStyleGuidance(preset);

  const system = `${SYSTEM_BASE}

You are the STRATEGIST. Rank the provided legal actions by Expected Value (EV).

CONTEXT:
- Platform: ${preset.platform === 'paper' ? 'Paper Magic' : 'MTG Arena'}
- Format: ${packet.context.format || 'Unknown'}
- Risk Tolerance: ${preset.riskTolerance}
- Opponent Read Level: ${preset.opponentReadLevel}

${riskGuidance}

${styleGuidance}

EVALUATION CRITERIA:
1. Win probability impact (most important)
2. Board state advantage
3. Card advantage
4. Mana efficiency
5. Risk/reward balance
6. Likely opponent responses

OUTPUT SCHEMA:
{
  "rankedLines": [
    {
      "actionId": "action_1",
      "rank": 1,
      "score": 0.85,
      "reasoning": "Detailed explanation",
      "expectedOutcome": {
        "opponentLife": 17,
        "selfLife": 20,
        "boardAdvantage": "+1 creature",
        "cardAdvantage": "0",
        "manaEfficiency": "good"
      },
      "risks": [
        { "risk": "Opponent may have removal", "probability": "medium", "mitigation": "None available" }
      ],
      "confidence": "high" | "medium" | "low",
      ${preset.platform === 'paper' ? '"paperGuidance": "Announce: \'Cast X targeting Y\'"' : '"arenaGuidance": { "clickOrder": ["Click card in hand", "Click target"], "setStopAt": "opponent upkeep", "holdFullControl": false }'}
    }
  ],
  "overallAssessment": "Brief summary of the position",
  "keyFactors": ["Factor 1", "Factor 2"],
  "recommendation": {
    "primary": "action_1",
    "alternative": "action_2",
    "reasoning": "Why this is the best play"
  }
}`;

  const user = `GROUNDING PACKET:
${JSON.stringify(packet, null, 2)}

LEGAL ACTIONS TO RANK:
${JSON.stringify(legalActions, null, 2)}

Rank these actions from best to worst with detailed reasoning.`;

  return { system, user };
}

function getRiskGuidance(preset: Preset): string {
  switch (preset.riskTolerance) {
    case 'exploratory':
      return 'RISK GUIDANCE: Consider fun and learning. Suggest interesting lines even if not optimal.';
    case 'moderate':
      return 'RISK GUIDANCE: Balance risk and reward. Prefer consistent plays but consider calculated risks.';
    case 'calculated':
      return 'RISK GUIDANCE: Play to win. Only take risks when the EV is clearly positive.';
    case 'aggressive':
      return 'RISK GUIDANCE: BO1 mindset - must win this game. Value tempo highly. Take positive-EV risks.';
  }
}

function getStyleGuidance(preset: Preset): string {
  switch (preset.explanationStyle) {
    case 'educational':
      return 'STYLE: Explain concepts for learning. Define terms. Suggest what to consider.';
    case 'practical':
      return 'STYLE: Clear, actionable advice. Focus on what to do and why.';
    case 'technical':
      return 'STYLE: Precise rules language. Reference game mechanics. Assume expert knowledge.';
    case 'click_order':
      return 'STYLE: Include exact Arena click sequences. Note auto-pass and stop settings.';
  }
}

// ============ Referee Prompts ============

export function buildRefereePrompt(
  packet: GroundingPacket,
  proposedLine: { actionId: string; description: string },
  presetKey: PresetKey
): { system: string; user: string } {
  const preset = getPreset(presetKey);

  const triggerGuidance = getTriggerGuidance(preset);

  const system = `${SYSTEM_BASE}

You are the REFEREE. Validate the proposed play sequence for rules correctness.

CONTEXT:
- Platform: ${preset.platform === 'paper' ? 'Paper Magic' : 'MTG Arena'}
- Format: ${packet.context.format || 'Unknown'}
- Trigger Handling: ${preset.triggerHandling}

YOUR VALIDATION CHECKS:
1. Timing legality - correct phase, priority held, stack order
2. Target legality - valid at targeting AND resolution
3. Cost payment - can all costs be paid?
4. Triggered abilities - handled correctly
5. State-based actions - applied properly
6. Replacement effects - correct application

${triggerGuidance}

RULES CITATION FORMAT:
When citing rules, use "CR XXX.Xa" format and quote the relevant portion.

OUTPUT SCHEMA:
{
  "verdict": "valid" | "invalid",
  "issues": [
    {
      "severity": "error" | "warning",
      "type": "timing_violation" | "target_illegal" | "cost_unpayable" | "trigger_missed" | "sba_pending" | "replacement_misapplied" | "priority_error" | "zone_error" | "rule_violation",
      "description": "What is wrong",
      "actionId": "which action",
      "suggestion": "How to fix it"
    }
  ],
  "correctedSequence": "Corrected play sequence if invalid, null if valid",
  "citations": [
    {
      "rule": "CR 117.3a",
      "text": "Relevant rule text",
      "relevance": "Why this rule applies"
    }
  ],
  "explanation": "Brief explanation of the validation"
}`;

  const user = `GROUNDING PACKET:
${JSON.stringify(packet, null, 2)}

PROPOSED PLAY:
Action ID: ${proposedLine.actionId}
Description: ${proposedLine.description}

Validate this play sequence and cite relevant rules.`;

  return { system, user };
}

function getTriggerGuidance(preset: Preset): string {
  switch (preset.triggerHandling) {
    case 'lenient':
      return 'TRIGGER HANDLING: Casual/kitchen table. Missed triggers can often be remedied. Be forgiving.';
    case 'standard':
      return 'TRIGGER HANDLING: Standard rules. Missed triggers are noted but may be fixable by calling a judge.';
    case 'strict':
      return 'TRIGGER HANDLING: Competitive REL. Missed triggers are missed. No take-backs.';
    case 'automatic':
      return 'TRIGGER HANDLING: Arena handles triggers automatically. Focus on order choices.';
  }
}

// ============ JSON Schema for OpenAI ============

export const RULES_CLERK_JSON_SCHEMA = {
  name: 'rules_clerk_output',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      legalActions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['cast_spell', 'activate_ability', 'play_land', 'attack', 'block', 'pass_priority', 'special_action', 'trigger_choice'] },
            card: { type: 'string' },
            ability: { type: 'string' },
            targets: { type: 'array', items: { type: 'string' } },
            manaCost: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                colors: { type: 'object', additionalProperties: { type: 'number' } },
              },
            },
            description: { type: 'string' },
            restrictions: { type: 'array', items: { type: 'string' } },
            triggers: { type: 'array', items: { type: 'string' } },
            requiresFullControl: { type: 'boolean' },
          },
          required: ['id', 'type', 'description', 'restrictions', 'triggers'],
        },
      },
      stackState: { type: 'string', enum: ['empty', 'has_items'] },
      currentPriority: { type: 'string' },
      pendingTriggers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            trigger: { type: 'string' },
            mustResolve: { type: 'boolean' },
          },
          required: ['source', 'trigger', 'mustResolve'],
        },
      },
      stateBasedActions: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    required: ['legalActions', 'stackState', 'currentPriority', 'pendingTriggers', 'stateBasedActions'],
  },
};

export const STRATEGIST_JSON_SCHEMA = {
  name: 'strategist_output',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      rankedLines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            actionId: { type: 'string' },
            rank: { type: 'integer' },
            score: { type: 'number' },
            reasoning: { type: 'string' },
            expectedOutcome: {
              type: 'object',
              properties: {
                opponentLife: { type: 'number' },
                selfLife: { type: 'number' },
                boardAdvantage: { type: 'string' },
                cardAdvantage: { type: 'string' },
                manaEfficiency: { type: 'string' },
              },
              required: ['boardAdvantage', 'cardAdvantage'],
            },
            risks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk: { type: 'string' },
                  probability: { type: 'string', enum: ['low', 'medium', 'high'] },
                  mitigation: { type: 'string' },
                },
                required: ['risk', 'probability', 'mitigation'],
              },
            },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            paperGuidance: { type: 'string' },
            arenaGuidance: {
              type: 'object',
              properties: {
                clickOrder: { type: 'array', items: { type: 'string' } },
                setStopAt: { type: 'string' },
                holdFullControl: { type: 'boolean' },
              },
            },
          },
          required: ['actionId', 'rank', 'score', 'reasoning', 'expectedOutcome', 'risks', 'confidence'],
        },
      },
      overallAssessment: { type: 'string' },
      keyFactors: { type: 'array', items: { type: 'string' } },
      recommendation: {
        type: 'object',
        properties: {
          primary: { type: 'string' },
          alternative: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['primary', 'reasoning'],
      },
    },
    required: ['rankedLines', 'overallAssessment', 'keyFactors', 'recommendation'],
  },
};

export const REFEREE_JSON_SCHEMA = {
  name: 'referee_output',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['valid', 'invalid'] },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['error', 'warning'] },
            type: { type: 'string', enum: ['timing_violation', 'target_illegal', 'cost_unpayable', 'trigger_missed', 'sba_pending', 'replacement_misapplied', 'priority_error', 'zone_error', 'rule_violation'] },
            description: { type: 'string' },
            actionId: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: ['severity', 'type', 'description'],
        },
      },
      correctedSequence: { type: ['string', 'null'] },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rule: { type: 'string' },
            text: { type: 'string' },
            relevance: { type: 'string' },
          },
          required: ['rule', 'text', 'relevance'],
        },
      },
      explanation: { type: 'string' },
    },
    required: ['verdict', 'issues', 'correctedSequence', 'citations'],
  },
};
