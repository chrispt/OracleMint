'use client';

import { useState, useCallback } from 'react';
import type { GameState } from '@/lib/schemas/game-state';

// Example state uses a simpler format - the actual schema has defaults
const EXAMPLE_STATE = {
  turn: 5,
  phase: 'precombat_main',
  priority: 'you',
  activePlayer: 'you',
  life: { you: 20, opponent: 8 },
  manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 },
  you: {
    battlefield: [
      { name: 'Mountain', tapped: true, summoningSick: false },
      { name: 'Mountain', tapped: false, summoningSick: false },
      { name: 'Monastery Swiftspear', tapped: false, summoningSick: false },
    ],
    hand: [
      { name: 'Lightning Bolt' },
      { name: 'Goblin Guide' },
    ],
    graveyard: [],
    exile: [],
  },
  opponent: {
    battlefield: [
      { name: 'Snapcaster Mage', tapped: false, summoningSick: false },
      { name: 'Island', tapped: false, summoningSick: false },
      { name: 'Island', tapped: false, summoningSick: false },
    ],
    hand: { count: 4 },
    graveyard: [{ name: 'Counterspell' }],
    exile: [],
  },
  stack: [],
} as const;

interface GameStateEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate: (valid: boolean, state: GameState | null) => void;
}

export function GameStateEditor({ value, onChange, onValidate }: GameStateEditorProps) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      setError(null);

      if (!newValue.trim()) {
        onValidate(false, null);
        return;
      }

      try {
        const parsed = JSON.parse(newValue);
        onValidate(true, parsed);
      } catch (e) {
        setError('Invalid JSON');
        onValidate(false, null);
      }
    },
    [onChange, onValidate]
  );

  const loadExample = () => {
    const exampleJson = JSON.stringify(EXAMPLE_STATE, null, 2);
    handleChange(exampleJson);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Game State (JSON)
        </label>
        <button
          onClick={loadExample}
          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Load Example
        </button>
      </div>

      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder="Paste your game state JSON here..."
        className={`w-full h-80 p-3 text-sm font-mono rounded-md border ${
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-zinc-300 dark:border-zinc-700 focus:ring-blue-500'
        } bg-white dark:bg-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2`}
        spellCheck={false}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
        <p>Required fields: turn, phase, priority</p>
        <p>
          Phase values: untap, upkeep, draw, precombat_main, begin_combat,
          declare_attackers, declare_blockers, combat_damage, end_combat,
          postcombat_main, end, cleanup
        </p>
      </div>
    </div>
  );
}
