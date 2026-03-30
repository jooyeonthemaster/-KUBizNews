import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const supabase = createClient(
  "https://dylloavkiyqfnqglaryw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5bGxvYXZraXlxZm5xZ2xhcnl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTUzMzcyNywiZXhwIjoyMDc1MTA5NzI3fQ.ss63dLf_NZ8TY25r1Xb6uWO9jWkIU1HnZyu9iAtPKtA"
);

const PUBLISHER_MAP = {
  "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제",
  "sedaily.com": "서울경제",
  "mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리",
  "news.mt.co.kr": "머니투데이",
};

const BODY_SELECTORS = [
  "#article_body", ".article_body", "#articletxt", ".article-body",
  "#textBody", ".news_body", ".article_text", ".art_txt", ".view_con",
  "[itemprop='articleBody']", ".news_cnt_detail_wrap", "#v-article-content",
  "article", ".article_content", ".entry-content",
];

function stripHtml(html) {
  return html.replace(/<\/?b>/gi, "").replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'").trim();
}

function getPublisher(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, name] of Object.entries(PUBLISHER_MAP)) {
      if (hostname.includes(domain)) return name;
    }
    return hostname;
  } catch { return "unknown"; }
}

async function scrapeBody(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { body: "", author: null };

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove noise
    $("script, style, nav, footer").remove();
    $(".ad, .advertisement, .sns_share, .relation_wrap, .related-news").remove();

    // Extract body
    let body = "";
    for (const sel of BODY_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        body = el.text().replace(/\s+/g, " ").trim();
        if (body.length > 100) break;
      }
    }

    // Fallback: paragraphs
    if (body.length < 100) {
      const ps = [];
      $("p").each((_, el) => {
        const t = $(el).text().replace(/\s+/g, " ").trim();
        if (t.length > 20) ps.push(t);
      });
      if (ps.join("\n").length > body.length) body = ps.join("\n");
    }

    // Extract author
    let author = null;
    const metaAuthor = $('meta[name="author"]').attr("content") || $('meta[name="dable:author"]').attr("content");
    if (metaAuthor) author = metaAuthor.trim();
    if (!author) {
      const byline = $(".byline, .author, .reporter, .journalist, .article-byline").first().text().trim();
      const match = byline.match(/([가-힣]{2,4})\s*(?:기자|특파원|선임기자|부장)/);
      if (match) author = match[1];
    }

    return { body: body.slice(0, 10000), author };
  } catch {
    return { body: "", author: null };
  }
}

async function run() {
  // Step 1: Naver API
  console.log("=== Step 1: Naver API 크롤링 ===");
  const keywords = ["경제 금리 환율", "반도체 AI 산업", "부동산 정책", "수출 무역 관세", "스타트업 투자"];
  const allArticles = [];

  for (const keyword of keywords) {
    const params = new URLSearchParams({ query: keyword, display: "10", start: "1", sort: "date" });
    try {
      const res = await fetch("https://openapi.naver.com/v1/search/news.json?" + params, {
        headers: {
          "X-Naver-Client-Id": "YNawOEmuZVlXmXfiCUQE",
          "X-Naver-Client-Secret": "OdR4WbSSPt",
        },
      });
      if (!res.ok) { console.log("  API error for:", keyword); continue; }
      const data = await res.json();
      for (const item of data.items || []) {
        allArticles.push({
          url: item.originallink || item.link,
          title: stripHtml(item.title),
          excerpt: stripHtml(item.description),
          publishedAt: new Date(item.pubDate).toISOString(),
        });
      }
      console.log(`  "${keyword}" → ${data.items?.length || 0}개`);
    } catch (e) {
      console.log("  Error:", e.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Deduplicate
  const seen = new Set();
  const unique = allArticles.filter((a) => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
  console.log(`\n총 ${unique.length}개 고유 기사\n`);

  // Step 2: Scrape bodies (최대 15개)
  console.log("=== Step 2: 본문 스크래핑 ===");
  const toScrape = unique.slice(0, 15);
  let successCount = 0;

  for (const article of toScrape) {
    const publisher = getPublisher(article.url);
    const { body, author } = await scrapeBody(article.url);
    const bodyLen = body.length;

    if (bodyLen > 100) {
      successCount++;
      console.log(`  ✓ [${publisher}] ${bodyLen}자 | ${author || "기자미상"} | ${article.title.substring(0, 45)}...`);

      // DB 저장
      await supabase.from("te_articles").upsert({
        source: "naver",
        url: article.url,
        original_url: article.url,
        title: article.title,
        body: body,
        excerpt: article.excerpt,
        author: author,
        publisher: publisher,
        published_at: article.publishedAt,
        is_analyzed: false,
      }, { onConflict: "url", ignoreDuplicates: true });
    } else {
      console.log(`  ✗ [${publisher}] 본문없음 | ${article.title.substring(0, 45)}...`);
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n스크래핑 성공: ${successCount}/${toScrape.length}`);

  // Step 3: AI 분석 (Gemini 3 Flash)
  console.log("\n=== Step 3: Gemini 3 Flash AI 분석 ===");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI("AIzaSyDj_ZS3HxLSzpJEGFhSaV12SHxVrLy_mOQ");
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const { data: articlesToAnalyze } = await supabase
    .from("te_articles")
    .select("id, title, body, excerpt, publisher, published_at")
    .eq("is_analyzed", false)
    .not("body", "is", null)
    .order("published_at", { ascending: false })
    .limit(20);

  for (const article of articlesToAnalyze || []) {
    console.log(`  분석 중: ${article.title.substring(0, 50)}...`);

    const content = article.body || article.excerpt || "";
    const prompt = `당신은 한국 경제 뉴스 분석 전문가입니다. 고려대학교 첨단기술비즈니스 대학원 소속 분석관으로서, 경제 뉴스를 심층 분석합니다.

다음 뉴스 기사를 분석하여 정확한 JSON 형식으로만 응답하세요. 마크다운이나 다른 텍스트 없이 순수 JSON만 출력하세요.

기사 제목: ${article.title}
출처: ${article.publisher}
발행일: ${article.published_at || "미상"}

본문:
${content.slice(0, 8000)}

JSON 형식:
{
  "ai_summary": "핵심 내용 3-4문장 요약",
  "ai_explanation": "비전공자도 이해할 수 있게 쉬운 말로 5-8문장 설명. 비유나 예시 활용",
  "category": "policy|economy|social|technology|international",
  "keywords": ["키워드1", "키워드2", "..."],
  "sentiment": "positive|negative|neutral|mixed",
  "sentiment_score": -1.0,
  "importance_score": 0.0,
  "key_figures": ["인물명"],
  "key_organizations": ["기관/기업명"],
  "related_topics": ["관련주제1", "관련주제2"]
}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      });

      const rawText = result.response.text();
      let parsed;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        console.log("  ⚠ JSON 파싱 실패");
        continue;
      }

      // DB에 분석 결과 저장
      await supabase.from("te_analyses").upsert({
        article_id: article.id,
        ai_summary: parsed.ai_summary || "",
        ai_explanation: parsed.ai_explanation || "",
        category: parsed.category || "economy",
        keywords: parsed.keywords || [],
        sentiment: parsed.sentiment || "neutral",
        sentiment_score: parsed.sentiment_score || 0,
        importance_score: parsed.importance_score || 0.5,
        key_figures: parsed.key_figures || [],
        key_organizations: parsed.key_organizations || [],
        related_topics: parsed.related_topics || [],
      }, { onConflict: "article_id" });

      await supabase.from("te_articles").update({ is_analyzed: true, category: parsed.category }).eq("id", article.id);

      console.log(`  ✓ [${parsed.category}/${parsed.sentiment}] 중요도:${parsed.importance_score} | 키워드: ${(parsed.keywords || []).slice(0, 3).join(", ")}`);
    } catch (e) {
      console.log("  ✗ 분석 실패:", e.message?.substring(0, 80));
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  // 최종 결과
  const { count: total } = await supabase.from("te_articles").select("*", { count: "exact", head: true });
  const { count: withBody } = await supabase.from("te_articles").select("*", { count: "exact", head: true }).not("body", "is", null);
  const { count: analyzed } = await supabase.from("te_analyses").select("*", { count: "exact", head: true });
  console.log(`\n=== 최종 결과 ===`);
  console.log(`총 기사: ${total} | 본문 있음: ${withBody} | AI 분석 완료: ${analyzed}`);
}

run().catch((e) => console.error("Fatal:", e));
