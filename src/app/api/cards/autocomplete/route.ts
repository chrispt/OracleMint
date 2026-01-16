import { NextRequest, NextResponse } from 'next/server';
import { autocompleteCards } from '@/lib/scryfall/card-resolver';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 10;
    const results = await autocompleteCards(query, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Autocomplete error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
