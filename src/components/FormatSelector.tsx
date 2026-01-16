'use client';

const FORMATS = [
  { value: '', label: 'Any Format' },
  { value: 'standard', label: 'Standard' },
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'pauper', label: 'Pauper' },
  { value: 'commander', label: 'Commander' },
  { value: 'brawl', label: 'Brawl' },
  { value: 'historic', label: 'Historic' },
  { value: 'alchemy', label: 'Alchemy' },
  { value: 'explorer', label: 'Explorer' },
  { value: 'timeless', label: 'Timeless' },
];

interface FormatSelectorProps {
  value: string;
  onChange: (format: string) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Format (Optional)
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 text-sm rounded-md border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      >
        {FORMATS.map(format => (
          <option key={format.value} value={format.value}>
            {format.label}
          </option>
        ))}
      </select>
    </div>
  );
}
