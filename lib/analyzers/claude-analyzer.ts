import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Category, Sentiment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  ai_summary: string;
  ai_explanation: string;
  category: Category;
  keywords: string[];
  sentiment: Sentiment;
  sentiment_score: number;
  importance_score: number;
  key_figures: string[];
  key_organizations: string[];
  related_topics: string[];
}

interface ArticleInput {
  title: string;
  body: string | null;
  excerpt: string | null;
  publisher: string;
  published_at: string | null;
}

// ---------------------------------------------------------------------------
// Gemini 3 Flash API
// ---------------------------------------------------------------------------

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return new GoogleGenerativeAI(apiKey);
}

export async function analyzeArticle(article: ArticleInput): Promise<AnalysisResult> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const content = article.body || article.excerpt || "";

  const prompt = `You are a Korean economic news analyst for Korea University Graduate School of Advanced Technology Business.
Analyze the following article and return ONLY valid JSON. No markdown, no explanation — pure JSON only.

CRITICAL CATEGORY CLASSIFICATION RULES (CHECK IN THIS EXACT ORDER):
1. "international" — HIGHEST PRIORITY. If the article discusses: foreign countries (USA, China, Japan, EU, Middle East, etc.), US Federal Reserve (연준/Fed), Trump/트럼프, tariffs/관세, international oil prices/유가, foreign stock markets, WTO, OPEC, IMF, exchange rates (원달러/엔달러), wars/conflicts abroad, global supply chains, international trade → ALWAYS "international"
2. "policy" — Korean domestic government policy ONLY (Korean National Assembly, Bank of Korea domestic policy)
3. "economy" — Pure Korean domestic economy ONLY (KOSPI/KOSDAQ, Korean real estate, Korean CPI, Korean corporate earnings)
4. "social" — Korean domestic employment, demographics, welfare, education, labor
5. "technology" — AI, semiconductors, startups, fintech, biotech (Korean tech industry)

IMPORTANT: If the article mentions 미국, 중국, 일본, 유럽, 글로벌, 국제, 해외, 연준, Fed, 트럼프, 중동, OPEC, WTO as the MAIN topic → it MUST be "international"

Article:
Title: ${article.title}
Publisher: ${article.publisher}
Date: ${article.published_at ?? "unknown"}

Body:
${content.slice(0, 4000)}

Return this JSON (all text fields in Korean):
{
  "ai_summary": "핵심 내용 3-4문장 요약",
  "ai_explanation": "비전공자도 이해할 수 있게 쉬운 말로 5-8문장 설명, 비유와 예시 활용",
  "category": "policy|economy|social|technology|international",
  "keywords": ["키워드1", "키워드2"],
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": -1.0 to 1.0,
  "importance_score": 0.0 to 1.0,
  "key_figures": ["인물명"],
  "key_organizations": ["기관명"],
  "related_topics": ["string"]
}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const rawText = result.response.text();
  return parseResponse(rawText);
}

/**
 * Batch analyze multiple articles
 */
export async function analyzeArticlesBatch(
  articles: (ArticleInput & { id: string })[],
  concurrency: number = 5
): Promise<Map<string, AnalysisResult>> {
  const results = new Map<string, AnalysisResult>();

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (article) => {
        const result = await analyzeArticle(article);
        return { id: article.id, result };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.id, r.value.result);
      }
    }

    // Gemini Flash is fast - shorter delay
    if (i + concurrency < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseResponse(raw: string): AnalysisResult {
  // Direct JSON parse
  try {
    return validateResult(JSON.parse(raw));
  } catch { /* continue */ }

  // Extract from ```json ... ```
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return validateResult(JSON.parse(jsonMatch[1].trim()));
    } catch { /* continue */ }
  }

  // Extract first { ... }
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return validateResult(JSON.parse(braceMatch[0]));
    } catch { /* continue */ }
  }

  // Fallback
  return {
    ai_summary: raw.slice(0, 300),
    ai_explanation: "분석을 처리하지 못했습니다.",
    category: "economy",
    keywords: [],
    sentiment: "neutral",
    sentiment_score: 0,
    importance_score: 0.5,
    key_figures: [],
    key_organizations: [],
    related_topics: [],
  };
}

function validateResult(data: Record<string, unknown>): AnalysisResult {
  const validCategories = ["policy", "economy", "social", "technology", "international"];
  const validSentiments = ["positive", "negative", "neutral", "mixed"];

  return {
    ai_summary: String(data.ai_summary ?? ""),
    ai_explanation: String(data.ai_explanation ?? ""),
    category: (validCategories.includes(data.category as string) ? data.category : "economy") as Category,
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    sentiment: (validSentiments.includes(data.sentiment as string) ? data.sentiment : "neutral") as Sentiment,
    sentiment_score: Number(data.sentiment_score) || 0,
    importance_score: Math.min(1, Math.max(0, Number(data.importance_score) || 0.5)),
    key_figures: Array.isArray(data.key_figures) ? data.key_figures.map(String) : [],
    key_organizations: Array.isArray(data.key_organizations) ? data.key_organizations.map(String) : [],
    related_topics: Array.isArray(data.related_topics) ? data.related_topics.map(String) : [],
  };
}
