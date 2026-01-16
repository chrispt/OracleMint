'use client';

import { useState } from 'react';
import type { GroundingPacket } from '@/lib/schemas/grounding-packet';

interface GroundingPreviewProps {
  packet: GroundingPacket | null;
  warnings: string[];
}

export function GroundingPreview({ packet, warnings }: GroundingPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!packet) {
    return null;
  }

  const cardCount = Object.keys(packet.cardDatabase).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Grounding Packet
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {isExpanded ? 'Hide' : 'Show'} Details
        </button>
      </div>

      <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md">
        <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <span>Cards: {cardCount}</span>
          <span>Preset: {packet.context.preset}</span>
          {packet.context.format && <span>Format: {packet.context.format}</span>}
        </div>

        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((warning, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ {warning}
              </p>
            ))}
          </div>
        )}

        {isExpanded && (
          <pre className="mt-3 p-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 rounded overflow-auto max-h-60">
            {JSON.stringify(packet, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
