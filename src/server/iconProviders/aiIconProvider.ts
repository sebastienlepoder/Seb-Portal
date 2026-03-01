/**
 * AI Icon Generator using Claude API
 * Generates custom SVG icons when favicon fetching fails.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const ICON_DIR = join(process.cwd(), 'public', 'icons', 'generated');

export interface AiIconRequest {
  name: string;
  slug: string;
  description?: string;
  category?: string;
}

export interface AiIconResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export async function generateIconWithAI(req: AiIconRequest): Promise<AiIconResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured' };
  }

  try {
    const client = new Anthropic({ apiKey });

    const prompt = `Generate a simple, modern SVG icon for a service/app called "${req.name}".
${req.description ? `Description: ${req.description}` : ''}
${req.category ? `Category: ${req.category}` : ''}

Requirements:
- Size: 128x128 viewBox
- Style: Modern, minimalist, flat design
- Colors: Use a gradient or solid colors that match the brand/service type
- Include a simple icon/symbol that represents the service
- Make it recognizable and professional
- Round corners on the background (rx="24")

Return ONLY the SVG code, nothing else. No markdown, no explanation.`;

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { success: false, error: 'Unexpected response type' };
    }

    let svg = content.text.trim();
    
    // Clean up the response - remove any markdown if present
    if (svg.includes('```')) {
      const match = svg.match(/<svg[\s\S]*<\/svg>/i);
      if (match) svg = match[0];
    }

    // Validate it's actual SVG
    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
      console.log('[ai-icon] Invalid SVG response:', svg.substring(0, 100));
      return { success: false, error: 'Invalid SVG generated' };
    }

    // Ensure directory exists
    if (!existsSync(ICON_DIR)) {
      mkdirSync(ICON_DIR, { recursive: true });
    }

    // Save the SVG
    const filePath = join(ICON_DIR, `${req.slug}.svg`);
    writeFileSync(filePath, svg, 'utf-8');
    
    console.log(`[ai-icon] Generated AI icon for ${req.name} -> ${filePath}`);

    return {
      success: true,
      path: filePath,
      url: `/api/icons/serve/${req.slug}`,
    };
  } catch (error) {
    console.error('[ai-icon] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'AI generation failed' 
    };
  }
}
