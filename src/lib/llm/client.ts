/**
 * OpenAI LLM Client for OracleMint
 * Handles API calls with structured outputs and validation
 */

import OpenAI from 'openai';
import type { GroundingPacket } from '@/lib/schemas/grounding-packet';
import type { PresetKey } from '@/lib/utils/presets';
import {
  type RulesClerkOutput,
  type StrategistOutput,
  type RefereeOutput,
  type LegalAction,
  safeValidateRulesClerkOutput,
  safeValidateStrategistOutput,
  safeValidateRefereeOutput,
} from './schemas';
import {
  buildRulesClerkPrompt,
  buildStrategistPrompt,
  buildRefereePrompt,
  RULES_CLERK_JSON_SCHEMA,
  STRATEGIST_JSON_SCHEMA,
  REFEREE_JSON_SCHEMA,
} from './prompts';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = 'gpt-4o';
const MAX_RETRIES = 2;

export interface LLMCallMeta {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface LLMResult<T> {
  data: T;
  meta: LLMCallMeta;
}

export class LLMValidationError extends Error {
  constructor(
    message: string,
    public details: unknown
  ) {
    super(message);
    this.name = 'LLMValidationError';
  }
}

// ============ Rules Clerk ============

export async function callRulesClerk(
  packet: GroundingPacket,
  presetKey: PresetKey
): Promise<LLMResult<RulesClerkOutput>> {
  const { system, user } = buildRulesClerkPrompt(packet, presetKey);

  return await callWithRetry(
    system,
    user,
    RULES_CLERK_JSON_SCHEMA,
    safeValidateRulesClerkOutput,
    'rules_clerk'
  );
}

// ============ Strategist ============

export async function callStrategist(
  packet: GroundingPacket,
  legalActions: LegalAction[],
  presetKey: PresetKey
): Promise<LLMResult<StrategistOutput>> {
  const { system, user } = buildStrategistPrompt(packet, legalActions, presetKey);

  return await callWithRetry(
    system,
    user,
    STRATEGIST_JSON_SCHEMA,
    safeValidateStrategistOutput,
    'strategist'
  );
}

// ============ Referee ============

export async function callReferee(
  packet: GroundingPacket,
  proposedLine: { actionId: string; description: string },
  presetKey: PresetKey
): Promise<LLMResult<RefereeOutput>> {
  const { system, user } = buildRefereePrompt(packet, proposedLine, presetKey);

  return await callWithRetry(
    system,
    user,
    REFEREE_JSON_SCHEMA,
    safeValidateRefereeOutput,
    'referee'
  );
}

// ============ Full Pipeline ============

export interface PipelineResult {
  rulesClerk: LLMResult<RulesClerkOutput>;
  strategist: LLMResult<StrategistOutput>;
  referee: LLMResult<RefereeOutput>;
  finalRecommendation: {
    action: LegalAction;
    validated: boolean;
    reasoning: string;
  };
}

export async function runFullPipeline(
  packet: GroundingPacket,
  presetKey: PresetKey
): Promise<PipelineResult> {
  // Step 1: Get all legal actions
  const rulesClerkResult = await callRulesClerk(packet, presetKey);

  // Step 2: Rank the actions
  const strategistResult = await callStrategist(
    packet,
    rulesClerkResult.data.legalActions,
    presetKey
  );

  // Step 3: Validate the top recommendation
  const topRankedLine = strategistResult.data.rankedLines[0];
  const topAction = rulesClerkResult.data.legalActions.find(
    a => a.id === topRankedLine.actionId
  );

  if (!topAction) {
    throw new Error('Top ranked action not found in legal actions');
  }

  const refereeResult = await callReferee(
    packet,
    {
      actionId: topRankedLine.actionId,
      description: topAction.description,
    },
    presetKey
  );

  // If top recommendation is invalid, try validating alternatives
  let validatedAction = topAction;
  let validated = refereeResult.data.verdict === 'valid';
  let validationReasoning = strategistResult.data.recommendation.reasoning;

  if (!validated && strategistResult.data.rankedLines.length > 1) {
    // Try the next best action
    for (let i = 1; i < Math.min(3, strategistResult.data.rankedLines.length); i++) {
      const alternativeLine = strategistResult.data.rankedLines[i];
      const alternativeAction = rulesClerkResult.data.legalActions.find(
        a => a.id === alternativeLine.actionId
      );

      if (!alternativeAction) continue;

      const altRefereeResult = await callReferee(
        packet,
        {
          actionId: alternativeLine.actionId,
          description: alternativeAction.description,
        },
        presetKey
      );

      if (altRefereeResult.data.verdict === 'valid') {
        validatedAction = alternativeAction;
        validated = true;
        validationReasoning = `Top recommendation was invalid (${refereeResult.data.issues.map(i => i.description).join('; ')}). Using alternative: ${alternativeLine.reasoning}`;
        break;
      }
    }
  }

  return {
    rulesClerk: rulesClerkResult,
    strategist: strategistResult,
    referee: refereeResult,
    finalRecommendation: {
      action: validatedAction,
      validated,
      reasoning: validationReasoning,
    },
  };
}

// ============ Internal Helpers ============

async function callWithRetry<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: object,
  validator: (data: unknown) => { success: true; data: T } | { success: false; error: unknown },
  callName: string
): Promise<LLMResult<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now();

    try {
      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema as OpenAI.ResponseFormatJSONSchema.JSONSchema,
        },
        temperature: 0.1, // Low temperature for consistent outputs
      });

      const latencyMs = Date.now() - startTime;
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      const validationResult = validator(parsed);

      if (!validationResult.success) {
        throw new LLMValidationError(
          `Invalid ${callName} output`,
          validationResult.error
        );
      }

      return {
        data: validationResult.data,
        meta: {
          model: response.model,
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
          latencyMs,
        },
      };
    } catch (error) {
      lastError = error as Error;

      if (error instanceof LLMValidationError && attempt < MAX_RETRIES) {
        console.warn(`${callName} validation failed, retrying... (attempt ${attempt + 1})`);
        continue;
      }

      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(error.headers?.['retry-after'] || '5', 10);
          await sleep(retryAfter * 1000);
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError || new Error(`${callName} failed after ${MAX_RETRIES} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Utility Functions ============

export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

export function checkContextFits(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 128000
): boolean {
  const estimated = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
  return estimated < maxTokens * 0.8; // Leave 20% for response
}
