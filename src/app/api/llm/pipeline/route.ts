import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GameStateSchema } from '@/lib/schemas/game-state';
import { buildGroundingPacket } from '@/lib/schemas/grounding-packet';
import { runFullPipeline } from '@/lib/llm/client';

const RequestSchema = z.object({
  gameState: GameStateSchema,
  preset: z.enum(['paper_casual', 'paper_fnm', 'paper_competitive', 'arena_bo1', 'arena_bo3']).default('arena_bo1'),
  format: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { gameState, preset, format } = parsed.data;

    // Build grounding packet
    const groundingResult = await buildGroundingPacket(gameState, preset, format);

    if (groundingResult.warnings.length > 0) {
      console.warn('Grounding warnings:', groundingResult.warnings);
    }

    // Run full pipeline
    const pipelineResult = await runFullPipeline(groundingResult.packet, preset);

    return NextResponse.json({
      rulesClerk: {
        legalActions: pipelineResult.rulesClerk.data.legalActions,
        stackState: pipelineResult.rulesClerk.data.stackState,
        currentPriority: pipelineResult.rulesClerk.data.currentPriority,
        pendingTriggers: pipelineResult.rulesClerk.data.pendingTriggers,
        stateBasedActions: pipelineResult.rulesClerk.data.stateBasedActions,
        meta: pipelineResult.rulesClerk.meta,
      },
      strategist: {
        rankedLines: pipelineResult.strategist.data.rankedLines,
        overallAssessment: pipelineResult.strategist.data.overallAssessment,
        keyFactors: pipelineResult.strategist.data.keyFactors,
        recommendation: pipelineResult.strategist.data.recommendation,
        meta: pipelineResult.strategist.meta,
      },
      referee: {
        verdict: pipelineResult.referee.data.verdict,
        issues: pipelineResult.referee.data.issues,
        correctedSequence: pipelineResult.referee.data.correctedSequence,
        citations: pipelineResult.referee.data.citations,
        meta: pipelineResult.referee.meta,
      },
      finalRecommendation: pipelineResult.finalRecommendation,
      groundingWarnings: groundingResult.warnings,
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    return NextResponse.json(
      {
        error: 'Pipeline failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
