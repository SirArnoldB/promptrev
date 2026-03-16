// SDK surface — re-export core enhance API plus the Anthropic adapter
export { enhance, RuleBasedAdapter, BUILT_IN_MODIFIERS, resolveModifier } from '@promptrev/core';
export type {
  EnhancerInput,
  EnhancerOutput,
  ModelAdapter,
  ModifierDefinition,
  ModifierKey,
  DiffChunk,
} from '@promptrev/core';

export { AnthropicModelAdapter } from './anthropic-adapter.js';
