/**
 * Bulk sync from Scryfall to database
 * Handles streaming downloads, chunked processing, and checkpoints for resume
 */

import { db } from '@/lib/db';
import { SyncStatus } from '@prisma/client';
import { normalizeName } from '@/lib/utils/card-names';
import {
  getBulkDataUrl,
  streamBulkData,
  type ScryfallCard,
  type ScryfallRuling,
} from './client';

const BATCH_SIZE = 500;
const MAX_RUNTIME_MS = 55_000; // Leave 5s buffer for Vercel's 60s limit

export interface SyncProgress {
  syncRunId: string;
  status: SyncStatus;
  processed: number;
  totalRecords: number | null;
  lastOracleId: string | null;
}

/**
 * Start a new sync run or resume a paused one
 */
export async function startSync(
  type: 'oracle_cards' | 'rulings' | 'full',
  options: {
    force?: boolean;
    resumeId?: string;
  } = {}
): Promise<SyncProgress> {
  const { force = false, resumeId } = options;

  // If resuming, find the existing sync run
  if (resumeId) {
    const existingRun = await db.syncRun.findUnique({
      where: { id: resumeId },
    });

    if (!existingRun) {
      throw new Error(`Sync run ${resumeId} not found`);
    }

    if (existingRun.status !== 'PAUSED') {
      throw new Error(`Sync run ${resumeId} is not paused (status: ${existingRun.status})`);
    }

    // Resume processing
    return await processSyncRun(existingRun.id);
  }

  // Check if we need to sync (compare updated_at from Scryfall)
  if (!force) {
    const lastSuccessfulSync = await db.syncRun.findFirst({
      where: { type, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    if (lastSuccessfulSync) {
      const bulkInfo = await getBulkDataUrl(type === 'full' ? 'oracle_cards' : type);
      const scryfallUpdatedAt = new Date(bulkInfo.updated_at);

      if (lastSuccessfulSync.completedAt && lastSuccessfulSync.completedAt >= scryfallUpdatedAt) {
        return {
          syncRunId: lastSuccessfulSync.id,
          status: 'COMPLETED',
          processed: lastSuccessfulSync.processed,
          totalRecords: lastSuccessfulSync.totalRecords,
          lastOracleId: null,
        };
      }
    }
  }

  // Create a new sync run
  const syncRun = await db.syncRun.create({
    data: {
      type,
      status: 'DOWNLOADING',
    },
  });

  try {
    // Get bulk data URL
    const bulkInfo = await getBulkDataUrl(type === 'full' ? 'oracle_cards' : type);

    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        blobUrl: bulkInfo.download_uri,
        blobSize: bulkInfo.size,
      },
    });

    // Start processing
    return await processSyncRun(syncRun.id);
  } catch (error) {
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

/**
 * Process a sync run (either new or resumed)
 */
async function processSyncRun(syncRunId: string): Promise<SyncProgress> {
  const startTime = Date.now();

  const syncRun = await db.syncRun.findUnique({
    where: { id: syncRunId },
  });

  if (!syncRun || !syncRun.blobUrl) {
    throw new Error('Invalid sync run');
  }

  await db.syncRun.update({
    where: { id: syncRunId },
    data: { status: 'PROCESSING' },
  });

  const resumeFromOracleId = syncRun.lastOracleId;
  let processed = syncRun.processed;
  let failed = syncRun.failed;
  let lastOracleId: string | null = null;
  let shouldSkip = !!resumeFromOracleId;

  try {
    // Stream and process the bulk data
    const stream = await streamBulkData(syncRun.blobUrl);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let batch: ScryfallCard[] = [];

    while (true) {
      // Check timeout
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        // Pause for resume
        await db.syncRun.update({
          where: { id: syncRunId },
          data: {
            status: 'PAUSED',
            processed,
            failed,
            lastOracleId,
          },
        });

        return {
          syncRunId,
          status: 'PAUSED',
          processed,
          totalRecords: syncRun.totalRecords,
          lastOracleId,
        };
      }

      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining batch
        if (batch.length > 0) {
          const { success, failures } = await upsertCardBatch(batch);
          processed += success;
          failed += failures;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete JSON lines (NDJSON format)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || line.trim() === '[' || line.trim() === ']') continue;

        try {
          // Handle array format (bulk files are JSON arrays, not NDJSON)
          let cleanLine = line.trim();
          if (cleanLine.endsWith(',')) {
            cleanLine = cleanLine.slice(0, -1);
          }

          const card: ScryfallCard = JSON.parse(cleanLine);

          // Skip until we reach the resume point
          if (shouldSkip) {
            if (card.oracle_id === resumeFromOracleId) {
              shouldSkip = false;
            }
            continue;
          }

          batch.push(card);
          lastOracleId = card.oracle_id;

          // Process batch when full
          if (batch.length >= BATCH_SIZE) {
            const { success, failures } = await upsertCardBatch(batch);
            processed += success;
            failed += failures;
            batch = [];

            // Update checkpoint
            await db.syncRun.update({
              where: { id: syncRunId },
              data: {
                processed,
                failed,
                lastOracleId,
              },
            });
          }
        } catch (parseError) {
          // Skip malformed lines
          failed++;
        }
      }
    }

    // Mark as completed
    await db.syncRun.update({
      where: { id: syncRunId },
      data: {
        status: 'COMPLETED',
        processed,
        failed,
        completedAt: new Date(),
      },
    });

    return {
      syncRunId,
      status: 'COMPLETED',
      processed,
      totalRecords: processed + failed,
      lastOracleId: null,
    };
  } catch (error) {
    await db.syncRun.update({
      where: { id: syncRunId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processed,
        failed,
        lastOracleId,
      },
    });
    throw error;
  }
}

/**
 * Upsert a batch of cards to the database
 */
async function upsertCardBatch(cards: ScryfallCard[]): Promise<{ success: number; failures: number }> {
  let success = 0;
  let failures = 0;

  for (const card of cards) {
    try {
      await upsertCard(card);
      success++;
    } catch (error) {
      console.error(`Failed to upsert card ${card.name}:`, error);
      failures++;
    }
  }

  return { success, failures };
}

/**
 * Upsert a single card with its faces
 */
async function upsertCard(scryfallCard: ScryfallCard): Promise<void> {
  const normalizedCardName = normalizeName(scryfallCard.name);

  // Upsert the main card
  const card = await db.card.upsert({
    where: { oracleId: scryfallCard.oracle_id },
    create: {
      oracleId: scryfallCard.oracle_id,
      scryfallId: scryfallCard.id,
      name: scryfallCard.name,
      normalizedName: normalizedCardName,
      layout: scryfallCard.layout,
      manaCost: scryfallCard.mana_cost,
      cmc: scryfallCard.cmc,
      typeLine: scryfallCard.type_line,
      oracleText: scryfallCard.oracle_text,
      colors: scryfallCard.colors || [],
      colorIdentity: scryfallCard.color_identity,
      keywords: scryfallCard.keywords,
      releasedAt: scryfallCard.released_at ? new Date(scryfallCard.released_at) : null,
    },
    update: {
      scryfallId: scryfallCard.id,
      name: scryfallCard.name,
      normalizedName: normalizedCardName,
      layout: scryfallCard.layout,
      manaCost: scryfallCard.mana_cost,
      cmc: scryfallCard.cmc,
      typeLine: scryfallCard.type_line,
      oracleText: scryfallCard.oracle_text,
      colors: scryfallCard.colors || [],
      colorIdentity: scryfallCard.color_identity,
      keywords: scryfallCard.keywords,
      releasedAt: scryfallCard.released_at ? new Date(scryfallCard.released_at) : null,
    },
  });

  // Handle multi-face cards
  if (scryfallCard.card_faces && scryfallCard.card_faces.length > 0) {
    // Delete existing faces first
    await db.cardFace.deleteMany({
      where: { cardId: card.id },
    });

    // Create new faces
    for (let i = 0; i < scryfallCard.card_faces.length; i++) {
      const face = scryfallCard.card_faces[i];
      await db.cardFace.create({
        data: {
          cardId: card.id,
          faceIndex: i,
          name: face.name,
          normalizedName: normalizeName(face.name),
          manaCost: face.mana_cost,
          typeLine: face.type_line,
          oracleText: face.oracle_text,
          power: face.power,
          toughness: face.toughness,
          loyalty: face.loyalty,
          defense: face.defense,
        },
      });
    }
  }
}

/**
 * Sync rulings for all cards in the database
 */
export async function syncRulings(rulings: ScryfallRuling[]): Promise<{ success: number; failures: number }> {
  let success = 0;
  let failures = 0;

  // Group rulings by oracle_id for batch processing
  const rulingsByOracleId = new Map<string, ScryfallRuling[]>();
  for (const ruling of rulings) {
    const existing = rulingsByOracleId.get(ruling.oracle_id) || [];
    existing.push(ruling);
    rulingsByOracleId.set(ruling.oracle_id, existing);
  }

  for (const [oracleId, cardRulings] of rulingsByOracleId) {
    try {
      // Check if card exists
      const card = await db.card.findUnique({
        where: { oracleId },
      });

      if (!card) {
        // Skip rulings for cards we don't have
        continue;
      }

      // Delete existing rulings for this card
      await db.ruling.deleteMany({
        where: { oracleId },
      });

      // Insert new rulings
      for (const ruling of cardRulings) {
        await db.ruling.create({
          data: {
            oracleId,
            publishedAt: new Date(ruling.published_at),
            comment: ruling.comment,
            source: ruling.source,
          },
        });
      }

      success++;
    } catch (error) {
      console.error(`Failed to sync rulings for ${oracleId}:`, error);
      failures++;
    }
  }

  return { success, failures };
}

/**
 * Get the status of a sync run
 */
export async function getSyncStatus(syncRunId: string): Promise<SyncProgress | null> {
  const syncRun = await db.syncRun.findUnique({
    where: { id: syncRunId },
  });

  if (!syncRun) return null;

  return {
    syncRunId: syncRun.id,
    status: syncRun.status,
    processed: syncRun.processed,
    totalRecords: syncRun.totalRecords,
    lastOracleId: syncRun.lastOracleId,
  };
}

/**
 * Get the latest sync run for a type
 */
export async function getLatestSyncRun(type: string): Promise<SyncProgress | null> {
  const syncRun = await db.syncRun.findFirst({
    where: { type },
    orderBy: { startedAt: 'desc' },
  });

  if (!syncRun) return null;

  return {
    syncRunId: syncRun.id,
    status: syncRun.status,
    processed: syncRun.processed,
    totalRecords: syncRun.totalRecords,
    lastOracleId: syncRun.lastOracleId,
  };
}
