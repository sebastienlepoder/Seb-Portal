import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';

/**
 * AI-assisted link creator: given a URL or description, suggests
 * name, description, tags, category, statusCheckUrl, icon prompt.
 */
export async function POST(request: Request) {
  try {
    await requireApiAdmin();

    const { url, description } = (await request.json()) as {
      url?: string;
      description?: string;
    };

    if (!url && !description) {
      return NextResponse.json(
        { ok: false, error: 'Provide url or description' },
        { status: 400 }
      );
    }

    // Try OpenAI first, then Anthropic
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const prompt = `Given this service URL and/or description, suggest the following fields for a portal dashboard tile. Return JSON only.

URL: ${url || 'N/A'}
Description: ${description || 'N/A'}

Return:
{
  "name": "Short name",
  "description": "One-line description",
  "tags": ["tag1", "tag2"],
  "category": "Category name",
  "section": "One of: Home Automation, Business, Banking & Markets, Accounting, Dev & Infra, Loisirs / Personal, AI, Remote Access, Email, Bookmarks",
  "statusCheckUrl": "URL for health check or empty string",
  "iconPrompt": "Description for icon generation"
}`;

    let suggestion: string | null = null;

    if (openaiKey) {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: openaiKey });
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });
      suggestion = resp.choices[0]?.message?.content || null;
    } else if (anthropicKey) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      suggestion = resp.content[0]?.type === 'text' ? resp.content[0].text : null;
    } else {
      return NextResponse.json(
        { ok: false, error: 'No AI API key configured' },
        { status: 503 }
      );
    }

    if (!suggestion) {
      return NextResponse.json({ ok: false, error: 'AI returned empty' }, { status: 500 });
    }

    // Parse JSON from response
    const jsonMatch = suggestion.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    return NextResponse.json({ ok: true, data: parsed });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED' || (e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }
    console.error('AI suggest error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
