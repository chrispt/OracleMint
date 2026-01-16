import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GameStateSchema } from '@/lib/schemas/game-state';
import { buildGroundingPacket, serializeGroundingPacket } from '@/lib/schemas/grounding-packet';
import { PRESETS } from '@/lib/utils/presets';

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

    const result = await buildGroundingPacket(gameState, preset, format);

    return NextResponse.json({
      groundingPacket: result.packet,
      serialized: serializeGroundingPacket(result.packet),
      resolutions: result.resolutionResults.map(r => ({
        input: r.input,
        status: r.status,
        cardName: r.card?.name,
        candidates: r.candidates?.map(c => c.name),
      })),
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Grounding packet error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
