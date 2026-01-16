import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startSync, getSyncStatus, getLatestSyncRun } from '@/lib/scryfall/bulk-sync';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function validateAdminAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return token === ADMIN_TOKEN;
}

const PostRequestSchema = z.object({
  type: z.enum(['oracle_cards', 'rulings', 'full']).default('oracle_cards'),
  force: z.boolean().default(false),
  resumeId: z.string().optional(),
});

// POST: Start or resume a sync
export async function POST(request: NextRequest) {
  // Check for cron secret (Vercel Cron) or admin token
  const cronSecret = request.headers.get('Authorization');
  const isCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron && !validateAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PostRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { type, force, resumeId } = parsed.data;

    const result = await startSync(type, { force, resumeId });

    return NextResponse.json({
      syncRunId: result.syncRunId,
      status: result.status,
      processed: result.processed,
      totalRecords: result.totalRecords,
      lastOracleId: result.lastOracleId,
      message:
        result.status === 'COMPLETED'
          ? 'Sync already up to date'
          : result.status === 'PAUSED'
          ? 'Sync paused, can be resumed'
          : 'Sync started',
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET: Get sync status
export async function GET(request: NextRequest) {
  if (!validateAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const syncRunId = searchParams.get('id');
    const type = searchParams.get('type') || 'oracle_cards';

    if (syncRunId) {
      const status = await getSyncStatus(syncRunId);
      if (!status) {
        return NextResponse.json({ error: 'Sync run not found' }, { status: 404 });
      }
      return NextResponse.json(status);
    }

    // Return latest sync for the type
    const latest = await getLatestSyncRun(type);
    if (!latest) {
      return NextResponse.json({
        message: 'No sync runs found',
        type,
      });
    }

    return NextResponse.json(latest);
  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
