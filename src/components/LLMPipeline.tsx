'use client';

type PipelineStep = 'idle' | 'running' | 'completed' | 'error';

interface LLMPipelineProps {
  rulesClerkStatus: PipelineStep;
  strategistStatus: PipelineStep;
  refereeStatus: PipelineStep;
  onRunPipeline: () => void;
  isDisabled: boolean;
  isRunning: boolean;
}

export function LLMPipeline({
  rulesClerkStatus,
  strategistStatus,
  refereeStatus,
  onRunPipeline,
  isDisabled,
  isRunning,
}: LLMPipelineProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        LLM Pipeline
      </h3>

      <div className="flex items-center gap-2">
        <StepIndicator label="1. Rules Clerk" status={rulesClerkStatus} />
        <Arrow />
        <StepIndicator label="2. Strategist" status={strategistStatus} />
        <Arrow />
        <StepIndicator label="3. Referee" status={refereeStatus} />
      </div>

      <button
        onClick={onRunPipeline}
        disabled={isDisabled || isRunning}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          isDisabled || isRunning
            ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isRunning ? 'Running Pipeline...' : 'Run Full Pipeline'}
      </button>
    </div>
  );
}

function StepIndicator({ label, status }: { label: string; status: PipelineStep }) {
  const getColors = () => {
    switch (status) {
      case 'idle':
        return 'bg-zinc-100 border-zinc-300 text-zinc-500 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-400';
      case 'running':
        return 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400 animate-pulse';
      case 'completed':
        return 'bg-green-50 border-green-300 text-green-600 dark:bg-green-900/30 dark:border-green-600 dark:text-green-400';
      case 'error':
        return 'bg-red-50 border-red-300 text-red-600 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400';
    }
  };

  return (
    <div
      className={`px-3 py-2 text-xs font-medium rounded-md border ${getColors()}`}
    >
      {label}
      {status === 'completed' && ' ✓'}
      {status === 'error' && ' ✗'}
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-zinc-400 dark:text-zinc-600">→</span>
  );
}
