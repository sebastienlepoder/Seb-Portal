export type ModelProvider = 'anthropic' | 'openai' | 'openrouter';

export interface ModelDef {
  /** Stable key the client sends back; also persisted per message. */
  id: string;
  label: string;
  provider: ModelProvider;
  /** Actual model id passed to the provider API. */
  modelId: string;
  /** Env var that must be set for this model to be selectable. */
  requiresEnv: string;
  /** Whether the chat tool loop runs for this model (Anthropic only). */
  supportsTools: boolean;
}

export const MODEL_REGISTRY: ModelDef[] = [
  { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   provider: 'anthropic', modelId: 'claude-opus-4-7',   requiresEnv: 'ANTHROPIC_API_KEY', supportsTools: true },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', modelId: 'claude-sonnet-4-6', requiresEnv: 'ANTHROPIC_API_KEY', supportsTools: true },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  provider: 'anthropic', modelId: 'claude-haiku-4-5',  requiresEnv: 'ANTHROPIC_API_KEY', supportsTools: true },
  { id: 'gpt-4o',            label: 'GPT-4o',            provider: 'openai',    modelId: 'gpt-4o',            requiresEnv: 'OPENAI_API_KEY',    supportsTools: false },
  { id: 'gpt-4o-mini',       label: 'GPT-4o mini',       provider: 'openai',    modelId: 'gpt-4o-mini',       requiresEnv: 'OPENAI_API_KEY',    supportsTools: false },
  { id: 'or-gemini-2-flash', label: 'Gemini 2.0 Flash',  provider: 'openrouter', modelId: 'google/gemini-2.0-flash-001', requiresEnv: 'OPENROUTER_API_KEY', supportsTools: false },
  { id: 'or-deepseek-chat',  label: 'DeepSeek V3',       provider: 'openrouter', modelId: 'deepseek/deepseek-chat', requiresEnv: 'OPENROUTER_API_KEY', supportsTools: false },
  { id: 'or-llama-3-70b',    label: 'Llama 3.3 70B',     provider: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct', requiresEnv: 'OPENROUTER_API_KEY', supportsTools: false },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';

export function getModelDef(id: string | undefined): ModelDef | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** Models whose required env var is present in this deployment. */
export function availableModels(): ModelDef[] {
  return MODEL_REGISTRY.filter((m) => !!process.env[m.requiresEnv]);
}

export function isModelAvailable(id: string): boolean {
  const def = getModelDef(id);
  return !!def && !!process.env[def.requiresEnv];
}
