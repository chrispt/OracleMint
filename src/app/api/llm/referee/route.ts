import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { GroundingPacketSchema } from '@/lib/schemas/grounding-packet';
import { callReferee } from '@/lib/llm/client';

const RequestSchema = z.object({
  groundingPacket: GroundingPacketSchema,
  proposedLine: z.object({
    actionId: z.string(),
    description: z.string(),
  }),
  preset: z.enum(['paper_casual', 'paper_fnm', 'paper_competitive', 'arena_bo1', 'arena_bo3']).default('arena_bo1'),
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

    const { groundingPacket, proposedLine, preset } = parsed.data;

    const result = await callReferee(groundingPacket, proposedLine, preset);

    return NextResponse.json({
      ...result.data,
      meta: result.meta,
    });
  } catch (error) {
    console.error('Referee error:', error);
    return NextResponse.json(
      {
        error: 'LLM call failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
