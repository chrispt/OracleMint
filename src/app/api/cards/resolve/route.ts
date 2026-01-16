import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCardNames } from '@/lib/scryfall/card-resolver';

const RequestSchema = z.object({
  names: z.array(z.string().min(1)).min(1).max(100),
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

    const results = await resolveCardNames(parsed.data.names);

    const resolved = results.map(result => ({
      input: result.input,
      status: result.status,
      card: result.card
        ? {
            oracleId: result.card.oracleId,
            name: result.card.name,
            manaCost: result.card.manaCost,
            cmc: result.card.cmc,
            typeLine: result.card.typeLine,
            oracleText: result.card.oracleText,
            colors: result.card.colors,
            keywords: result.card.keywords,
            layout: result.card.layout,
            faces: result.card.faces.map(face => ({
              name: face.name,
              manaCost: face.manaCost,
              typeLine: face.typeLine,
              oracleText: face.oracleText,
              power: face.power,
              toughness: face.toughness,
              loyalty: face.loyalty,
            })),
            rulings: result.card.rulings.map(ruling => ({
              date: ruling.publishedAt.toISOString().split('T')[0],
              comment: ruling.comment,
              source: ruling.source,
            })),
          }
        : undefined,
      matchedFace: result.matchedFace,
      candidates: result.candidates,
    }));

    return NextResponse.json({ resolved });
  } catch (error) {
    console.error('Card resolution error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
