/**
 * Zod schemas for validating LLM outputs
 * Ensures structured, reliable responses from the AI models
 */

import { z } from 'zod';

// ============ Rules Clerk Output ============

export const LegalActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'cast_spell',
    'activate_ability',
    'play_land',
    'attack',
    'block',
    'pass_priority',
    'special_action',
    'trigger_choice',
  ]),
  card: z.string().optional(),
  ability: z.string().optional(),
  targets: z.array(z.string()).optional(),
  manaCost: z.object({
    total: z.number(),
    colors: z.record(z.string(), z.number()),
  }).optional(),
  description: z.string(),
  restrictions: z.array(z.string()),
  triggers: z.array(z.string()),
  requiresFullControl: z.boolean().optional(), // Arena-specific
});

export type LegalAction = z.infer<typeof LegalActionSchema>;

export const PendingTriggerSchema = z.object({
  source: z.string(),
  trigger: z.string(),
  mustResolve: z.boolean(),
});

export const RulesClerkOutputSchema = z.object({
  legalActions: z.array(LegalActionSchema),
  stackState: z.enum(['empty', 'has_items']),
  currentPriority: z.string(),
  pendingTriggers: z.array(PendingTriggerSchema),
  stateBasedActions: z.array(z.string()),
  notes: z.string().optional(), // Any additional context
});

export type RulesClerkOutput = z.infer<typeof RulesClerkOutputSchema>;

// ============ Strategist Output ============

export const ExpectedOutcomeSchema = z.object({
  opponentLife: z.number().optional(),
  selfLife: z.number().optional(),
  boardAdvantage: z.string(),
  cardAdvantage: z.string(),
  manaEfficiency: z.string().optional(),
  winProbabilityDelta: z.string().optional(),
});

export const RiskSchema = z.object({
  risk: z.string(),
  probability: z.enum(['low', 'medium', 'high']),
  mitigation: z.string(),
});

export const RankedLineSchema = z.object({
  actionId: z.string(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  expectedOutcome: ExpectedOutcomeSchema,
  risks: z.array(RiskSchema),
  confidence: z.enum(['low', 'medium', 'high']),
  // Platform-specific guidance
  paperGuidance: z.string().optional(),
  arenaGuidance: z.object({
    clickOrder: z.array(z.string()).optional(),
    setStopAt: z.string().optional(),
    holdFullControl: z.boolean().optional(),
  }).optional(),
});

export type RankedLine = z.infer<typeof RankedLineSchema>;

export const StrategistOutputSchema = z.object({
  rankedLines: z.array(RankedLineSchema).min(1),
  overallAssessment: z.string(),
  keyFactors: z.array(z.string()),
  recommendation: z.object({
    primary: z.string(),
    alternative: z.string().optional(),
    reasoning: z.string(),
  }),
});

export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;

// ============ Referee Output ============

export const IssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  type: z.enum([
    'timing_violation',
    'target_illegal',
    'cost_unpayable',
    'trigger_missed',
    'sba_pending',
    'replacement_misapplied',
    'priority_error',
    'zone_error',
    'rule_violation',
  ]),
  description: z.string(),
  actionId: z.string().optional(),
  suggestion: z.string().optional(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const CitationSchema = z.object({
  rule: z.string(), // e.g., "CR 117.3a"
  text: z.string(),
  relevance: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const RefereeOutputSchema = z.object({
  verdict: z.enum(['valid', 'invalid']),
  issues: z.array(IssueSchema),
  correctedSequence: z.string().nullable(),
  citations: z.array(CitationSchema),
  explanation: z.string().optional(),
});

export type RefereeOutput = z.infer<typeof RefereeOutputSchema>;

// ============ Combined Pipeline Output ============

export const PipelineOutputSchema = z.object({
  rulesClerk: RulesClerkOutputSchema,
  strategist: StrategistOutputSchema,
  referee: RefereeOutputSchema,
  finalRecommendation: z.object({
    action: z.string(),
    actionId: z.string(),
    confidence: z.enum(['low', 'medium', 'high']),
    validated: z.boolean(),
    paperInstructions: z.string().optional(),
    arenaInstructions: z.object({
      clickOrder: z.array(z.string()),
      stops: z.array(z.string()).optional(),
      fullControlNeeded: z.boolean(),
    }).optional(),
  }),
});

export type PipelineOutput = z.infer<typeof PipelineOutputSchema>;

// ============ Error Response ============

export const LLMErrorSchema = z.object({
  error: z.string(),
  code: z.enum([
    'invalid_output',
    'rate_limit',
    'context_too_long',
    'unknown',
  ]),
  retryable: z.boolean(),
});

export type LLMError = z.infer<typeof LLMErrorSchema>;

// ============ Validation Helpers ============

export function validateRulesClerkOutput(data: unknown): RulesClerkOutput {
  return RulesClerkOutputSchema.parse(data);
}

export function validateStrategistOutput(data: unknown): StrategistOutput {
  return StrategistOutputSchema.parse(data);
}

export function validateRefereeOutput(data: unknown): RefereeOutput {
  return RefereeOutputSchema.parse(data);
}

export function safeValidateRulesClerkOutput(data: unknown): { success: true; data: RulesClerkOutput } | { success: false; error: z.ZodError } {
  const result = RulesClerkOutputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeValidateStrategistOutput(data: unknown): { success: true; data: StrategistOutput } | { success: false; error: z.ZodError } {
  const result = StrategistOutputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function safeValidateRefereeOutput(data: unknown): { success: true; data: RefereeOutput } | { success: false; error: z.ZodError } {
  const result = RefereeOutputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
