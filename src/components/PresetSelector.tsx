'use client';

import { type PresetKey, PRESETS } from '@/lib/utils/presets';

interface PresetSelectorProps {
  value: PresetKey;
  onChange: (preset: PresetKey) => void;
}

export function PresetSelector({ value, onChange }: PresetSelectorProps) {
  const paperPresets = Object.values(PRESETS).filter(p => p.platform === 'paper');
  const arenaPresets = Object.values(PRESETS).filter(p => p.platform === 'arena');

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Context Preset
      </label>
      <div className="flex gap-4">
        {/* Paper presets */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Paper</span>
          <div className="flex gap-2">
            {paperPresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => onChange(preset.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  value === preset.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
                title={preset.description}
              >
                {preset.label.replace('Paper - ', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Arena presets */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Arena</span>
          <div className="flex gap-2">
            {arenaPresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => onChange(preset.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  value === preset.key
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
                title={preset.description}
              >
                {preset.label.replace('Arena - ', '')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
