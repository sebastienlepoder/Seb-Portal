import { requireApiAuth } from '@/lib/auth';
import { availableModels, DEFAULT_MODEL_ID, isModelAvailable } from '@/lib/ai/models';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const models = availableModels().map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    supportsTools: m.supportsTools,
  }));

  const defaultModel = isModelAvailable(DEFAULT_MODEL_ID)
    ? DEFAULT_MODEL_ID
    : models[0]?.id ?? null;

  return Response.json({ ok: true, data: { models, defaultModel } });
}
