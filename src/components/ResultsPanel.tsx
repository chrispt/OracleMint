'use client';

import { useState } from 'react';
import type { RulesClerkOutput, StrategistOutput, RefereeOutput, LegalAction } from '@/lib/llm/schemas';

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

interface ResultsPanelProps {
  results: PipelineResults;
  preset: string;
}

export function ResultsPanel({ results, preset }: ResultsPanelProps) {
  const [showAllActions, setShowAllActions] = useState(false);
  const [showRefereeDetails, setShowRefereeDetails] = useState(false);

  if (!results.finalRecommendation) {
    return null;
  }

  const { action, validated, reasoning } = results.finalRecommendation;
  const topLine = results.strategist?.rankedLines[0];
  const isPaper = preset.startsWith('paper');

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Results
      </h3>

      {/* Main Recommendation */}
      <div className={`p-4 rounded-lg border ${
        validated
          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
          : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">
            Recommended Play
          </span>
          {validated ? (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full dark:bg-green-800 dark:text-green-200">
              Validated
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full dark:bg-amber-800 dark:text-amber-200">
              Issues Found
            </span>
          )}
        </div>

        <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 mb-2">
          {action.description}
        </p>

        {topLine && (
          <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            <span>Score: {(topLine.score * 100).toFixed(0)}%</span>
            <span>Confidence: {topLine.confidence}</span>
          </div>
        )}

        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
          {reasoning}
        </p>

        {/* Platform-specific guidance */}
        {isPaper && topLine?.paperGuidance && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              Paper Guidance
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {topLine.paperGuidance}
            </p>
          </div>
        )}

        {!isPaper && topLine?.arenaGuidance && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-md">
            <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">
              Arena Click Order
            </p>
            {topLine.arenaGuidance.clickOrder && (
              <ol className="text-sm text-purple-700 dark:text-purple-300 list-decimal list-inside">
                {topLine.arenaGuidance.clickOrder.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
            {topLine.arenaGuidance.setStopAt && (
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                Set stop at: {topLine.arenaGuidance.setStopAt}
              </p>
            )}
            {topLine.arenaGuidance.holdFullControl && (
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1 font-medium">
                ⚡ Hold Full Control for this play
              </p>
            )}
          </div>
        )}

        {/* Risks */}
        {topLine?.risks && topLine.risks.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Risks
            </p>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
              {topLine.risks.map((risk, i) => (
                <li key={i}>
                  <span className={`font-medium ${
                    risk.probability === 'high' ? 'text-red-600 dark:text-red-400' :
                    risk.probability === 'medium' ? 'text-amber-600 dark:text-amber-400' :
                    'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    [{risk.probability}]
                  </span>{' '}
                  {risk.risk}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* All Ranked Actions */}
      {results.strategist && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowAllActions(!showAllActions)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-left"
          >
            {showAllActions ? '▼ Hide' : '▶ Show'} All Ranked Actions ({results.strategist.rankedLines.length})
          </button>

          {showAllActions && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md space-y-2">
              {results.strategist.rankedLines.map((line, i) => {
                const lineAction = results.rulesClerk?.legalActions.find(a => a.id === line.actionId);
                return (
                  <div key={line.actionId} className="flex items-start gap-2 text-sm">
                    <span className="font-mono text-zinc-400">#{line.rank}</span>
                    <div className="flex-1">
                      <p className="text-zinc-700 dark:text-zinc-300">
                        {lineAction?.description || line.actionId}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Score: {(line.score * 100).toFixed(0)}% | {line.confidence} confidence
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Referee Details */}
      {results.referee && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowRefereeDetails(!showRefereeDetails)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-left"
          >
            {showRefereeDetails ? '▼ Hide' : '▶ Show'} Validation Details
          </button>

          {showRefereeDetails && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-md space-y-3">
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Verdict: {results.referee.verdict === 'valid' ? '✓ Valid' : '✗ Invalid'}
                </p>
              </div>

              {results.referee.issues.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Issues
                  </p>
                  <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                    {results.referee.issues.map((issue, i) => (
                      <li key={i} className={issue.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}>
                        [{issue.type}] {issue.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results.referee.citations.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Rules Citations
                  </p>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
                    {results.referee.citations.map((citation, i) => (
                      <li key={i}>
                        <span className="font-mono text-blue-600 dark:text-blue-400">
                          {citation.rule}
                        </span>
                        : {citation.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Copy/Share Buttons */}
      <div className="flex gap-2">
        <CopyButton
          label="Copy Compact"
          getText={() => formatCompact(results)}
        />
        <CopyButton
          label="Copy Verbose"
          getText={() => formatVerbose(results)}
        />
      </div>
    </div>
  );
}

function CopyButton({ label, getText }: { label: string; getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function formatCompact(results: PipelineResults): string {
  if (!results.finalRecommendation) return '';

  return `**Recommended Play:** ${results.finalRecommendation.action.description}
Score: ${((results.strategist?.rankedLines[0]?.score || 0) * 100).toFixed(0)}%
${results.finalRecommendation.validated ? '✓ Validated' : '⚠ Issues found'}`;
}

function formatVerbose(results: PipelineResults): string {
  if (!results.finalRecommendation) return '';

  let output = `# OracleMint Analysis

## Recommended Play
${results.finalRecommendation.action.description}

## Reasoning
${results.finalRecommendation.reasoning}
`;

  if (results.strategist) {
    output += `\n## All Ranked Actions\n`;
    results.strategist.rankedLines.forEach(line => {
      const action = results.rulesClerk?.legalActions.find(a => a.id === line.actionId);
      output += `${line.rank}. ${action?.description || line.actionId} (${(line.score * 100).toFixed(0)}%)\n`;
    });
  }

  if (results.referee?.citations.length) {
    output += `\n## Rules Citations\n`;
    results.referee.citations.forEach(c => {
      output += `- ${c.rule}: ${c.text}\n`;
    });
  }

  return output;
}
