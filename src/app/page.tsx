'use client';

import { useState, useCallback } from 'react';
import { PresetSelector } from '@/components/PresetSelector';
import { FormatSelector } from '@/components/FormatSelector';
import { GameStateEditor } from '@/components/GameStateEditor';
import { CardResolutionDisplay } from '@/components/CardResolutionDisplay';
import { GroundingPreview } from '@/components/GroundingPreview';
import { LLMPipeline } from '@/components/LLMPipeline';
import { ResultsPanel } from '@/components/ResultsPanel';
import type { PresetKey } from '@/lib/utils/presets';
import type { GameState } from '@/lib/schemas/game-state';
import type { GroundingPacket } from '@/lib/schemas/grounding-packet';
import type { RulesClerkOutput, StrategistOutput, RefereeOutput, LegalAction } from '@/lib/llm/schemas';

type PipelineStep = 'idle' | 'running' | 'completed' | 'error';

interface Resolution {
  input: string;
  status: 'exact' | 'normalized' | 'face_match' | 'fuzzy' | 'ambiguous' | 'not_found';
  card?: { oracleId: string; name: string; typeLine: string };
  candidates?: Array<{ name: string }>;
}

interface PipelineResults {
  rulesClerk: RulesClerkOutput | null;
  strategist: StrategistOutput | null;
  referee: RefereeOutput | null;
  finalRecommendation: {
    action: LegalAction;
    validated: boolean;
    reasoning: string;
  } | null;
}

export default function Home() {
  // Form state
  const [preset, setPreset] = useState<PresetKey>('arena_bo1');
  const [format, setFormat] = useState('');
  const [gameStateJson, setGameStateJson] = useState('');
  const [parsedGameState, setParsedGameState] = useState<GameState | null>(null);
  const [isValidJson, setIsValidJson] = useState(false);

  // Resolution state
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [groundingPacket, setGroundingPacket] = useState<GroundingPacket | null>(null);
  const [groundingWarnings, setGroundingWarnings] = useState<string[]>([]);

  // Pipeline state
  const [rulesClerkStatus, setRulesClerkStatus] = useState<PipelineStep>('idle');
  const [strategistStatus, setStrategistStatus] = useState<PipelineStep>('idle');
  const [refereeStatus, setRefereeStatus] = useState<PipelineStep>('idle');
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [results, setResults] = useState<PipelineResults>({
    rulesClerk: null,
    strategist: null,
    referee: null,
    finalRecommendation: null,
  });
  const [error, setError] = useState<string | null>(null);

  const handleValidate = useCallback((valid: boolean, state: GameState | null) => {
    setIsValidJson(valid);
    setParsedGameState(state);
    // Reset downstream state when game state changes
    setResolutions([]);
    setGroundingPacket(null);
    setResults({
      rulesClerk: null,
      strategist: null,
      referee: null,
      finalRecommendation: null,
    });
    setRulesClerkStatus('idle');
    setStrategistStatus('idle');
    setRefereeStatus('idle');
  }, []);

  const handleResolveAndGround = async () => {
    if (!parsedGameState) return;

    setIsResolving(true);
    setError(null);

    try {
      const response = await fetch('/api/grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: parsedGameState,
          preset,
          format: format || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to build grounding packet');
      }

      const data = await response.json();

      setResolutions(data.resolutions);
      setGroundingPacket(data.groundingPacket);
      setGroundingWarnings(data.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setIsResolving(false);
    }
  };

  const handleRunPipeline = async () => {
    if (!parsedGameState) return;

    setIsRunningPipeline(true);
    setError(null);
    setRulesClerkStatus('running');
    setStrategistStatus('idle');
    setRefereeStatus('idle');

    try {
      const response = await fetch('/api/llm/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState: parsedGameState,
          preset,
          format: format || undefined,
        }),
      });

      // Simulate step progression for UX
      setRulesClerkStatus('completed');
      setStrategistStatus('running');

      await new Promise(resolve => setTimeout(resolve, 100));
      setStrategistStatus('completed');
      setRefereeStatus('running');

      await new Promise(resolve => setTimeout(resolve, 100));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Pipeline failed');
      }

      const data = await response.json();

      setRefereeStatus('completed');
      setResults({
        rulesClerk: data.rulesClerk,
        strategist: data.strategist,
        referee: data.referee,
        finalRecommendation: data.finalRecommendation,
      });
      setGroundingWarnings(data.groundingWarnings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
      setRefereeStatus('error');
    } finally {
      setIsRunningPipeline(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              OracleMint
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              MTG Play Advisor • Grounded in Scryfall Oracle Text
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Configuration Row */}
          <div className="grid md:grid-cols-2 gap-4 p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <PresetSelector value={preset} onChange={setPreset} />
            <FormatSelector value={format} onChange={setFormat} />
          </div>

          {/* Game State Editor */}
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <GameStateEditor
              value={gameStateJson}
              onChange={setGameStateJson}
              onValidate={handleValidate}
            />

            {/* Resolve Button */}
            <div className="mt-4">
              <button
                onClick={handleResolveAndGround}
                disabled={!isValidJson || isResolving}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  !isValidJson || isResolving
                    ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isResolving ? 'Resolving...' : 'Resolve Cards & Build Grounding Packet'}
              </button>
            </div>
          </div>

          {/* Card Resolution */}
          <CardResolutionDisplay resolutions={resolutions} isLoading={isResolving} />

          {/* Grounding Preview */}
          <GroundingPreview packet={groundingPacket} warnings={groundingWarnings} />

          {/* LLM Pipeline */}
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <LLMPipeline
              rulesClerkStatus={rulesClerkStatus}
              strategistStatus={strategistStatus}
              refereeStatus={refereeStatus}
              onRunPipeline={handleRunPipeline}
              isDisabled={!isValidJson}
              isRunning={isRunningPipeline}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Results */}
          {results.finalRecommendation && (
            <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <ResultsPanel results={results} preset={preset} />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center">
            OracleMint uses Scryfall data and OpenAI for analysis.
            Card text is always sourced from Scryfall — never hallucinated.
          </p>
        </div>
      </footer>
    </div>
  );
}
