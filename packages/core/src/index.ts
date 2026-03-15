// Main enhancement engine
export { enhance } from './enhancer';
export type { EnhancerInput, EnhancerOutput } from './enhancer';

// Modifiers
export { BUILT_IN_MODIFIERS, resolveModifier } from './modifiers';
export type { ModifierKey, ModifierDefinition } from './modifiers';

// Model adapter interface
export { RuleBasedAdapter } from './model-adapter';
export type { ModelAdapter } from './model-adapter';

// Diff utilities
export { computeDiff, formatDiffForDisplay, formatDiffMarkdown } from './diff';
export type { DiffChunk } from './diff';

// History management
export { HistoryManager, InMemoryStorage } from './history';
export type { HistoryEntry, HistoryStorage } from './history';

// Rule-based enhancement
export { ruleBasedEnhance } from './rule-based';
