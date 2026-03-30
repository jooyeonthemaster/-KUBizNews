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

  const prompt = `당신은 한국 경제 뉴스 분석 전문가입니다. 고려대학교 첨단기술비즈니스 대학원 소속 분석관으로서, 경제 뉴스를 심층 분석합니다.

다음 뉴스 기사를 분석하여 정확한 JSON 형식으로만 응답하세요. 마크다운이나 다른 텍스트 없이 순수 JSON만 출력하세요.

**분석 지침:**
1. **ai_summary**: 핵심 내용을 3-4문장으로 간결하게 요약
2. **ai_explanation**: 경제학/비즈니스 비전공자도 이해할 수 있도록 쉬운 말로 풀어서 설명 (5-8문장). 비유나 예시를 활용하여 친근하고 이해하기 쉽게 작성
3. **category**: 아래 5가지 중 가장 적합한 카테고리 하나 선택
   - "policy": 정부 정책, 규제, 법안, 금융/통화 정책
   - "economy": 경제 지표, 금리, 환율, 주식, 부동산, 물가
   - "social": 고용, 인구, 소비, 복지, 교육, 노동
   - "technology": AI, 반도체, 스타트업, 디지털, 바이오, 핀테크
   - "international": 국제 경제, 무역, 글로벌 이슈
4. **keywords**: 핵심 키워드 3-7개
5. **sentiment**: 기사의 경제적 톤 (positive/negative/neutral/mixed)
6. **sentiment_score**: -1.0(매우 부정) ~ +1.0(매우 긍정)
7. **importance_score**: 0.0(낮음) ~ 1.0(매우 높음). 경제적 파급력, 대중 관심도 고려
8. **key_figures**: 기사에 언급된 주요 인물 (이름만)
9. **key_organizations**: 기사에 언급된 주요 기관/기업
10. **related_topics**: 관련된 경제 주제 2-4개

기사 분석:

제목: ${article.title}
출처: ${article.publisher}
발행일: ${article.published_at ?? "미상"}

본문:
${content.slice(0, 8000)}

위 기사를 분석하여 JSON으로 응답하세요:
{
  "ai_summary": "string",
  "ai_explanation": "string",
  "category": "policy|economy|social|technology|international",
  "keywords": ["string"],
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": number,
  "importance_score": number,
  "key_figures": ["string"],
  "key_organizations": ["string"],
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
