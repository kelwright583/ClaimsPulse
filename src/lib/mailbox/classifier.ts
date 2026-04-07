export interface ClassificationResult {
  categoryName: string;
  isUrgent: boolean;
  senderType: string;
  confidence: number;
  reasoning: string;
  suggestedAssignee?: string;
}

interface ClassifyEmailParams {
  subject: string;
  body: string;
  from: string;
  categories: Array<{ name: string; description?: string | null }>;
  urgentKeywords?: string[];
  classificationInstructions?: string | null;
}

export async function classifyEmail(params: ClassifyEmailParams): Promise<ClassificationResult> {
  const { subject, body, from, categories, urgentKeywords = [], classificationInstructions } = params;

  const fallback: ClassificationResult = {
    categoryName: categories[0]?.name ?? 'General',
    isUrgent: false,
    senderType: 'unknown',
    confidence: 0,
    reasoning: 'Classification unavailable — no API key configured.',
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Heuristic fallback: keyword-based urgent detection
    const urgentMatch = urgentKeywords.some(kw =>
      subject.toLowerCase().includes(kw.toLowerCase()) ||
      body.toLowerCase().includes(kw.toLowerCase())
    );
    return { ...fallback, isUrgent: urgentMatch, confidence: 0.5, reasoning: 'Keyword-based classification (no API key).' };
  }

  const categoryList = categories.map(c => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n');
  const keywordsStr = urgentKeywords.length > 0 ? `\nUrgent keywords: ${urgentKeywords.join(', ')}` : '';
  const instrStr = classificationInstructions ? `\nAdditional instructions: ${classificationInstructions}` : '';

  const prompt = `You are an email routing assistant for Santam Emerging Business (SEB) claims department. Classify the following email.

Available categories:
${categoryList}
${keywordsStr}
${instrStr}

Email:
From: ${from}
Subject: ${subject}
Body:
${body.slice(0, 2000)}

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "categoryName": "<one of the category names above>",
  "isUrgent": <true|false>,
  "senderType": "<attorney|broker|insured|assessor|internal|unknown>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explaining your classification>",
  "suggestedAssignee": "<email address if determinable, otherwise null>"
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error('Anthropic API error:', resp.status, await resp.text());
      return fallback;
    }

    const data = await resp.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content.find(c => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as ClassificationResult;

    // Validate category name
    const validCategory = categories.find(c => c.name === parsed.categoryName);
    if (!validCategory) {
      parsed.categoryName = categories[0]?.name ?? 'General';
    }

    return parsed;
  } catch (err) {
    console.error('classifyEmail error:', err);
    return fallback;
  }
}
