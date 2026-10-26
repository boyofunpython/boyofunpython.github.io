// Shared by the worker, host timers, and the downloadable AI contract.
export const PYTHON_LIMITS = {
  runMs: 30_000,
  prepareMs: 90_000,
  outputChars: 100_000,
} as const;
