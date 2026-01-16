'use client';

interface ResolvedCard {
  input: string;
  status: 'exact' | 'normalized' | 'face_match' | 'fuzzy' | 'ambiguous' | 'not_found';
  card?: {
    oracleId: string;
    name: string;
    typeLine: string;
  };
  candidates?: Array<{ name: string }>;
}

interface CardResolutionDisplayProps {
  resolutions: ResolvedCard[];
  isLoading: boolean;
}

export function CardResolutionDisplay({ resolutions, isLoading }: CardResolutionDisplayProps) {
  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-md">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 animate-pulse">
          Resolving cards...
        </p>
      </div>
    );
  }

  if (resolutions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Card Resolution
      </h3>
      <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md space-y-1.5">
        {resolutions.map((res, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <StatusIcon status={res.status} />
            <span className="text-zinc-700 dark:text-zinc-300">{res.input}</span>
            {res.card && (
              <span className="text-zinc-500 dark:text-zinc-400">
                → {res.card.name}
              </span>
            )}
            {res.status === 'ambiguous' && res.candidates && (
              <span className="text-amber-600 dark:text-amber-400 text-xs">
                (did you mean: {res.candidates.slice(0, 3).map(c => c.name).join(', ')}?)
              </span>
            )}
            {res.status === 'not_found' && (
              <span className="text-red-500 text-xs">Not found</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ResolvedCard['status'] }) {
  switch (status) {
    case 'exact':
    case 'normalized':
    case 'face_match':
    case 'fuzzy':
      return <span className="text-green-500">✓</span>;
    case 'ambiguous':
      return <span className="text-amber-500">⚠</span>;
    case 'not_found':
      return <span className="text-red-500">✗</span>;
  }
}
