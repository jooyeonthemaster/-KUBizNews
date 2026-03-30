import { PUBLISHER_NAMES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsApiResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

export interface CrawledArticle {
  source: "naver";
  sourceId: string;
  url: string;
  originalUrl: string;
  title: string;
  excerpt: string;
  author: string | null;
  publisher: string;
  publisherDomain: string;
  publishedAt: string;
  suggestedCategory: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NAVER_API_BASE = "https://openapi.naver.com/v1/search/news.json";
const PAGE_SIZE = 100;

function stripHtml(html: string): string {
  return html
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function getPublisherName(url: string): string {
  const hostname = extractDomain(url);
  // Check all known publisher mappings
  for (const [domain, name] of Object.entries(PUBLISHER_NAMES)) {
    if (hostname.includes(domain.replace("www.", ""))) {
      return name;
    }
  }
  return hostname;
}

function generateSourceId(item: NaverNewsItem): string {
  const url = item.originallink || item.link;
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `naver-${Math.abs(hash).toString(36)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main crawl function
// ---------------------------------------------------------------------------

export async function crawlNaverNews(options: {
  keywords: string[];
  maxPerKeyword?: number;
  suggestedCategory?: string;
}): Promise<CrawledArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET");
  }

  const { keywords, maxPerKeyword = 100, suggestedCategory = null } = options;
  const allArticles: CrawledArticle[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of keywords) {
    const params = new URLSearchParams({
      query: keyword,
      display: String(Math.min(maxPerKeyword, PAGE_SIZE)),
      start: "1",
      sort: "date",
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${NAVER_API_BASE}?${params}`, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = (await response.json()) as NaverNewsApiResponse;

      for (const item of data.items ?? []) {
        const url = item.originallink || item.link;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        allArticles.push({
          source: "naver",
          sourceId: generateSourceId(item),
          url,
          originalUrl: item.originallink,
          title: stripHtml(item.title),
          excerpt: stripHtml(item.description),
          author: null,
          publisher: getPublisherName(url),
          publisherDomain: extractDomain(url),
          publishedAt: new Date(item.pubDate).toISOString(),
          suggestedCategory,
        });
      }
    } catch {
      console.warn(`Failed to crawl keyword: ${keyword}`);
    }

    await delay(200);
  }

  return allArticles;
}
