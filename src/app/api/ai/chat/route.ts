import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireApiAuth } from '@/lib/auth';
import { checkRateLimit, aiChatLimiter } from '@/lib/rate-limit';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/anthropic';
import { dispatchTask, DispatchError } from '@/lib/agent-dispatch';
import type { TaskPriority } from '@/types/agents';
import type { AiProvider, AiMessage, SessionUser } from '@/types';

// ─── Tool definitions ────────────────────────────────────────

const CHAT_TOOLS = [
  {
    name: 'list_projects',
    description:
      'List the projects registered in this portal that the agent worker can act on. Use this when the user mentions a project by partial name and you need to disambiguate, or when they ask "what projects are available?".',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'list_agents',
    description:
      'List the active agent profiles with their roles and expertise tags. Use this when the user asks "which agents are available?" or when you need to pick the right agent for a task.',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'dispatch_to_project',
    description:
      'Dispatch a development task to a project\'s agent worker. The worker clones the GitHub repo and runs Claude with the chosen agent\'s system prompt. Returns a taskId. Call this once you have the project + a clear task description. The agent_role is optional — if omitted, the dispatcher auto-matches by expertise tags.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Project slug or human name' },
        task_title: { type: 'string', description: 'Short imperative title (max 200 chars)' },
        task_description: { type: 'string', description: 'Detailed instructions for the agent' },
        agent_role: {
          type: 'string',
          description: 'Optional: agent slug, role name, or id. Omit for auto-match.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Task priority. Defaults to "normal".',
        },
      },
      required: ['project_name', 'task_title', 'task_description'],
    },
  },
  {
    name: 'ask_user_question',
    description:
      'Ask the user a clarifying question with 2-4 multiple-choice options. Use ONLY when the request is genuinely ambiguous and cannot be resolved from context — e.g. the user said "fix the bug" but did not say which project, or they want to dispatch to a write-enabled project but you should confirm. Do NOT use for obvious cases. The user will pick one option, which becomes their next message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to show the user' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 short option labels (each max ~40 chars)',
        },
      },
      required: ['question', 'options'],
    },
  },
] satisfies Anthropic.Tool[];

// ─── Tool executors ──────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  user: SessionUser
): Promise<string> {
  if (name === 'list_projects') {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['active', 'paused'] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        description: true,
        repoOwner: true,
        repoName: true,
        workingBranch: true,
        allowWrite: true,
      },
    });
    return JSON.stringify(projects);
  }

  if (name === 'list_agents') {
    const agents = await prisma.agentProfile.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, role: true, expertise: true, description: true },
    });
    const formatted = agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      role: a.role,
      description: a.description,
      expertise: (() => {
        try {
          const parsed = JSON.parse(a.expertise);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    }));
    return JSON.stringify(formatted);
  }

  if (name === 'dispatch_to_project') {
    try {
      const result = await dispatchTask({
        projectName: String(input.project_name ?? ''),
        taskTitle: String(input.task_title ?? ''),
        taskDescription: String(input.task_description ?? ''),
        agentRole: input.agent_role ? String(input.agent_role) : null,
        priority: (input.priority as TaskPriority) ?? 'normal',
        createdById: user.id,
      });
      return JSON.stringify({
        success: true,
        taskId: result.taskId,
        taskUrl: result.taskUrl,
        message: result.message,
        agent: result.matchedAgentSlug,
        project: result.matchedProjectSlug,
      });
    } catch (e) {
      if (e instanceof DispatchError) {
        return JSON.stringify({ success: false, error: e.message, code: e.code });
      }
      return JSON.stringify({ success: false, error: (e as Error).message });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ─── System prompt ───────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    'You are the LEPODER Portal AI assistant. You help the operator (Sebastien) manage projects, agents, and dispatched tasks.',
    '',
    'You have four tools:',
    '- `list_projects` — see available projects and their write permissions',
    '- `list_agents` — see available agents and their expertise',
    '- `dispatch_to_project` — create a task for a project\'s agent worker',
    '- `ask_user_question` — ask a clarifying question with 2-4 options',
    '',
    'Guidelines for dispatching tasks:',
    '- If the user clearly names a project + describes work, dispatch immediately. Do not ask redundant questions.',
    '- If the project name is ambiguous (matches multiple, or none precisely), use `list_projects` first, then either pick the obvious match or ask via `ask_user_question`.',
    '- If you need to pick an agent and the task type is non-obvious from keywords, use `list_agents` to see expertise tags.',
    '- Default priority is "normal". Only use "high" or "urgent" if the user explicitly asks.',
    '- After a successful dispatch, tell the user the task ID and the link to track it (/agents?taskId=...).',
    '- If a project is read-only (allowWrite=false), warn the user that the agent will produce a summary only, not a commit. Don\'t refuse — many users dispatch summaries intentionally.',
    '',
    'Guidelines for `ask_user_question`:',
    '- Use sparingly. Only when genuinely ambiguous.',
    '- Phrase the question concisely. Provide 2-4 short options.',
    '- After the user picks, continue with what you were doing.',
    '',
    'For non-dispatch questions, just answer normally — you don\'t need to use tools.',
  ].join('\n');
}

// ─── Question detection ──────────────────────────────────────

function formatQuestionAsText(q: { question: string; options: string[] }): string {
  return `${q.question}\n\nOptions:\n${q.options.map((o) => `- ${o}`).join('\n')}`;
}

// ─── Image attachment limits ─────────────────────────────────

const MAX_IMAGES_PER_MESSAGE = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded
const IMAGE_DATA_URI_RE = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/;
type AnthropicImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Returns null if the URI is invalid or oversized. */
function parseImageDataUri(
  dataUri: string
): { mediaType: AnthropicImageMediaType; data: string; byteSize: number } | null {
  const match = IMAGE_DATA_URI_RE.exec(dataUri);
  if (!match) return null;
  const data = match[2]!;
  const byteSize = Math.floor((data.length * 3) / 4);
  if (byteSize > MAX_IMAGE_BYTES) return null;
  return { mediaType: match[1] as AnthropicImageMediaType, data, byteSize };
}

// Drop a thread the client pre-created via POST /api/ai/threads when
// the AI call fails before any messages land — otherwise it sits
// empty in the sidebar forever.
async function deleteThreadIfEmpty(threadId: string, userId: string): Promise<void> {
  const t = await prisma.aiThread.findUnique({
    where: { id: threadId },
    select: { userId: true, messages: true },
  });
  if (!t || t.userId !== userId) return;
  let isEmpty = false;
  try {
    const arr = JSON.parse(t.messages);
    isEmpty = Array.isArray(arr) && arr.length === 0;
  } catch {
    return;
  }
  if (isEmpty) {
    await prisma.aiThread.delete({ where: { id: threadId } });
  }
}

// ─── POST handler ────────────────────────────────────────────

export async function POST(request: Request) {
  let preCreatedThreadId: string | undefined;
  let currentUserId: string | undefined;
  try {
    const user = await requireApiAuth();
    currentUserId = user.id;
    const ip = getClientIp(request);

    const check = checkRateLimit(aiChatLimiter, user.id);
    if (!check.allowed) {
      return NextResponse.json(
        { ok: false, error: 'AI rate limit exceeded. Wait a moment.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      provider: AiProvider;
      messages: AiMessage[];
      threadId?: string;
      maxTokens?: number;
    };

    const { provider, messages: incoming, threadId, maxTokens = 2048 } = body;
    preCreatedThreadId = threadId;

    if (!incoming?.length) {
      return NextResponse.json({ ok: false, error: 'Messages required' }, { status: 400 });
    }

    // Validate image attachments on the final user message (the only
    // place we forward them). Reject oversized or too-many uploads.
    const lastIncoming = incoming[incoming.length - 1];
    const lastImages = lastIncoming?.role === 'user' ? lastIncoming.images ?? [] : [];
    if (lastImages.length > MAX_IMAGES_PER_MESSAGE) {
      return NextResponse.json(
        { ok: false, error: `Too many images (max ${MAX_IMAGES_PER_MESSAGE})` },
        { status: 400 }
      );
    }
    for (const uri of lastImages) {
      const match = IMAGE_DATA_URI_RE.exec(uri);
      if (!match) {
        return NextResponse.json(
          { ok: false, error: 'Invalid image data URI (png/jpeg/gif/webp base64 only)' },
          { status: 400 }
        );
      }
      const byteSize = Math.floor((match[2]!.length * 3) / 4);
      if (byteSize > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'Image exceeds 5 MB limit' },
          { status: 400 }
        );
      }
    }

    let reply: string;
    let pendingQuestion: { question: string; options: string[] } | null = null;
    const toolEvents: string[] = []; // human-readable summary of tools used

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { ok: false, error: 'OpenAI API key not configured' },
          { status: 503 }
        );
      }
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: incoming.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        max_tokens: Math.min(maxTokens, 4096),
      });
      reply = completion.choices[0]?.message?.content || 'No response';
    } else if (provider === 'anthropic') {
      const anthropic = getAnthropicClient();
      if (!anthropic) {
        return NextResponse.json(
          { ok: false, error: 'Anthropic API key not configured' },
          { status: 503 }
        );
      }
      const systemMsg = incoming.find((m) => m.role === 'system');
      const userAndAssistantMsgs = incoming.filter((m) => m.role !== 'system');
      const systemPrompt = systemMsg?.content || buildSystemPrompt();

      // Anthropic message history (we may add tool_use / tool_result blocks
      // during the loop but they are NOT persisted — only final user-facing
      // text is saved to the DB).
      const messages: Anthropic.MessageParam[] = userAndAssistantMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // If the last user message carries images, replace its plain string
      // content with a structured block array containing the images +
      // text. All prior messages stay as strings for backward compat.
      const lastMsg = userAndAssistantMsgs[userAndAssistantMsgs.length - 1];
      if (lastMsg?.role === 'user' && lastMsg.images?.length) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const dataUri of lastMsg.images) {
          const parsed = parseImageDataUri(dataUri);
          if (!parsed) continue;
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          });
        }
        if (lastMsg.content) blocks.push({ type: 'text', text: lastMsg.content });
        if (blocks.length > 0) {
          messages[messages.length - 1] = { role: 'user', content: blocks };
        }
      }

      const MAX_ITERS = 8;
      let finalText = '';
      let askedQuestion: { question: string; options: string[] } | null = null;

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        const resp = await anthropic.messages.create({
          model: ANTHROPIC_MODELS.sonnet,
          max_tokens: Math.min(maxTokens, 4096),
          system: systemPrompt,
          tools: CHAT_TOOLS,
          messages,
        });

        if (resp.stop_reason !== 'tool_use') {
          finalText = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          break;
        }

        // Append assistant turn so the next call sees it
        messages.push({ role: 'assistant', content: resp.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          if (block.name === 'ask_user_question') {
            askedQuestion = block.input as { question: string; options: string[] };
            // Synthesize a tool_result so the conversation stays
            // well-formed if the user comes back. The result text is the
            // user's eventual answer — we don't have it yet, so we
            // record a placeholder. When the user replies as a fresh
            // user message, this in-memory state is gone anyway.
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Question presented to user; response will arrive as the next user message.',
            });
            toolEvents.push(`Asked: ${askedQuestion.question}`);
            continue;
          }
          const result = await executeTool(block.name, block.input as Record<string, unknown>, user);
          toolEvents.push(`${block.name}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }

        // If a question was asked, stop the loop and return to user
        if (askedQuestion) {
          // Use any text the model also produced as preamble; otherwise
          // fall back to the formatted question.
          const preamble = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text.trim())
            .filter(Boolean)
            .join('\n');
          finalText = preamble
            ? `${preamble}\n\n${formatQuestionAsText(askedQuestion)}`
            : formatQuestionAsText(askedQuestion);
          break;
        }

        messages.push({ role: 'user', content: toolResults });
      }

      reply = finalText || 'No response';
      pendingQuestion = askedQuestion;
    } else {
      return NextResponse.json({ ok: false, error: 'Invalid provider' }, { status: 400 });
    }

    // Persist as plain text + (optionally) the user's image data URIs.
    // Tool calls/results are NOT saved — only the user-visible question
    // and reply text. This keeps history readable and avoids
    // re-executing tools when the thread is reloaded.
    let savedThreadId = threadId;
    let messageCount = 0;
    if (threadId) {
      const thread = await prisma.aiThread.findUnique({ where: { id: threadId } });
      if (thread && thread.userId === user.id) {
        const existingMessages = JSON.parse(thread.messages) as AiMessage[];
        existingMessages.push(
          incoming[incoming.length - 1]!,
          { role: 'assistant', content: reply }
        );
        await prisma.aiThread.update({
          where: { id: threadId },
          data: { messages: JSON.stringify(existingMessages) },
        });
        messageCount = existingMessages.length;
        // Thread now has content — disarm the orphan-cleanup guard.
        preCreatedThreadId = undefined;
      }
    } else {
      const allMessages: AiMessage[] = [
        ...incoming,
        { role: 'assistant', content: reply },
      ];
      const thread = await prisma.aiThread.create({
        data: {
          userId: user.id,
          provider,
          title: incoming[0]?.content.slice(0, 100) || 'New chat',
          messages: JSON.stringify(allMessages),
        },
      });
      savedThreadId = thread.id;
      messageCount = allMessages.length;
    }

    await auditLog({
      userId: user.id,
      action: 'ai_chat',
      details: {
        provider,
        threadId: savedThreadId,
        tools: toolEvents,
        imageCount: lastImages.length,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      data: {
        reply,
        threadId: savedThreadId,
        messageCount,
        question: pendingQuestion,
        toolEvents,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (preCreatedThreadId && currentUserId) {
      await deleteThreadIfEmpty(preCreatedThreadId, currentUserId).catch((cleanupErr) => {
        console.error('[ai/chat] orphan cleanup failed:', cleanupErr);
      });
    }
    console.error('AI chat error:', e);
    return NextResponse.json(
      { ok: false, error: `AI error: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
