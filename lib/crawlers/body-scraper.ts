import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// 경제지별 본문 추출 셀렉터
// ---------------------------------------------------------------------------

interface PublisherConfig {
  selectors: string[];       // 본문 CSS 셀렉터 (우선순위 순)
  authorSelectors: string[]; // 기자 이름 셀렉터
  removeSelectors: string[]; // 제거할 요소 (광고, 관련기사 등)
}

const PUBLISHER_CONFIGS: Record<string, PublisherConfig> = {
  // 매일경제
  "mk.co.kr": {
    selectors: [
      "#article_body",
      ".art_txt",
      ".news_cnt_detail_wrap",
      "[itemprop='articleBody']",
      ".article_body",
    ],
    authorSelectors: [".author", ".art_author", ".byline", ".journalist"],
    removeSelectors: [".ad_wrap", ".relation_wrap", ".sns_share", "script", "style", ".photo_group"],
  },
  // 한국경제
  "hankyung.com": {
    selectors: [
      "#articletxt",
      ".article-body",
      "#article-body-contents",
      ".article_txt",
      "[itemprop='articleBody']",
    ],
    authorSelectors: [".article-byline", ".byline", ".reporter", ".author"],
    removeSelectors: [".article-ad", ".related-news", "script", "style", ".img_desc"],
  },
  // 서울경제
  "sedaily.com": {
    selectors: [
      "#v-article-content",
      ".article_view",
      ".article_content",
      ".view_con",
      "[itemprop='articleBody']",
    ],
    authorSelectors: [".author", ".reporter_area", ".byline"],
    removeSelectors: [".ad_area", ".relation_news", "script", "style"],
  },
  // 머니투데이
  "mt.co.kr": {
    selectors: [
      "#textBody",
      ".article_text",
      "#article_body",
      ".news_cnt",
      "[itemprop='articleBody']",
    ],
    authorSelectors: [".author_info", ".byline_info", ".reporter"],
    removeSelectors: [".ad_box", ".related_article", "script", "style", ".article_photo"],
  },
  // 이데일리
  "edaily.co.kr": {
    selectors: [
      ".news_body",
      "#article_body",
      ".article_body",
      ".article_view",
      "[itemprop='articleBody']",
    ],
    authorSelectors: [".byline", ".author_area", ".reporter_info"],
    removeSelectors: [".ad_wrap", ".relation_news", "script", "style"],
  },
};

// 범용 셀렉터 (알려지지 않은 사이트용)
const GENERIC_CONFIG: PublisherConfig = {
  selectors: [
    "[itemprop='articleBody']",
    "article",
    ".article-body",
    ".article_body",
    ".article_content",
    ".news_body",
    ".view_con",
    "#article_body",
    "#articleBody",
    ".entry-content",
    ".post-content",
    "#content",
    "main",
  ],
  authorSelectors: [
    "[itemprop='author']",
    ".byline",
    ".author",
    ".reporter",
    ".journalist",
    ".writer",
  ],
  removeSelectors: ["script", "style", "nav", "footer", ".ad", ".advertisement", ".sns", ".share", ".related"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getConfig(url: string): PublisherConfig {
  const domain = getDomain(url);
  for (const [key, config] of Object.entries(PUBLISHER_CONFIGS)) {
    if (domain.includes(key)) return config;
  }
  return GENERIC_CONFIG;
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export interface ScrapedArticle {
  body: string;
  author: string | null;
  success: boolean;
}

/**
 * 기사 URL에서 본문 전체 텍스트와 기자 이름을 추출
 */
export async function scrapeArticleBody(url: string): Promise<ScrapedArticle> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { body: "", author: null, success: false };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const config = getConfig(url);

    // 불필요한 요소 제거
    for (const sel of config.removeSelectors) {
      $(sel).remove();
    }

    // 본문 추출
    let body = "";
    for (const selector of config.selectors) {
      const el = $(selector).first();
      if (el.length) {
        body = cleanText(el.text());
        if (body.length > 100) break; // 충분한 본문을 찾으면 중단
      }
    }

    // 본문이 너무 짧으면 <p> 태그에서 직접 추출
    if (body.length < 100) {
      const paragraphs: string[] = [];
      $("p").each((_, el) => {
        const text = cleanText($(el).text());
        if (text.length > 20) paragraphs.push(text);
      });
      if (paragraphs.join("\n").length > body.length) {
        body = paragraphs.join("\n");
      }
    }

    // 기자 이름 추출
    let author: string | null = null;
    for (const selector of config.authorSelectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = cleanText(el.text());
        // 기자 이름 패턴: "홍길동 기자" 또는 "홍길동 경제부"
        const match = text.match(/([가-힣]{2,4})\s*(?:기자|특파원|선임기자|수석기자|부장|차장|경제부|사회부|정치부|산업부|국제부)/);
        if (match) {
          author = match[1];
          break;
        }
        // 이메일에서 이름 추출
        const emailMatch = text.match(/([가-힣]{2,4})\s*[\w.]+@/);
        if (emailMatch) {
          author = emailMatch[1];
          break;
        }
        if (text.length < 20 && text.match(/^[가-힣]{2,4}/)) {
          author = text.split(/\s/)[0];
          break;
        }
      }
    }

    // meta 태그에서도 기자 이름 시도
    if (!author) {
      const metaAuthor = $('meta[name="author"]').attr("content") ||
        $('meta[property="article:author"]').attr("content") ||
        $('meta[name="dable:author"]').attr("content");
      if (metaAuthor) {
        author = cleanText(metaAuthor).split(/\s/)[0];
      }
    }

    // 본문 최대 길이 제한 (10KB)
    body = body.slice(0, 10_000);

    return {
      body,
      author: author || null,
      success: body.length > 50,
    };
  } catch {
    return { body: "", author: null, success: false };
  }
}

/**
 * 여러 기사의 본문을 배치로 스크래핑
 * @param urls - 스크래핑할 URL 배열
 * @param concurrency - 동시 요청 수 (기본: 3)
 * @param delayMs - 요청 간 딜레이 (기본: 500ms)
 */
export async function scrapeArticleBodies(
  urls: string[],
  concurrency: number = 3,
  delayMs: number = 500
): Promise<Map<string, ScrapedArticle>> {
  const results = new Map<string, ScrapedArticle>();

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map((url) => scrapeArticleBody(url))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      results.set(
        batch[j],
        result.status === "fulfilled"
          ? result.value
          : { body: "", author: null, success: false }
      );
    }

    // Rate limiting
    if (i + concurrency < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
