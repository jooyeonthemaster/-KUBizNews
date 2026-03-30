import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { crawlNaverNews } from "@/lib/crawlers/naver-crawler";
import { crawlRssFeeds } from "@/lib/crawlers/rss-crawler";
import { scrapeArticleBodies } from "@/lib/crawlers/body-scraper";
import { CATEGORY_KEYWORDS, ECONOMY_RSS_FEEDS, TARGET_PUBLISHERS } from "@/lib/constants";
import type { Category } from "@/lib/types";

export const maxDuration = 300; // 5분 (본문 스크래핑 시간 고려)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const categories = (body.categories as Category[]) || [
      "policy", "economy", "social", "technology", "international",
    ];
    const targetPublishersOnly = body.targetPublishersOnly === true;
    const targetPublishers = (body.targetPublishers as string[]) || TARGET_PUBLISHERS as unknown as string[];
    const hoursBack = (body.hoursBack as number) || 48;
    const maxPerKeyword = (body.maxPerKeyword as number) || 50;

    const supabase = createServiceClient();

    // Create crawl log
    const { data: log } = await supabase
      .from("te_crawl_logs")
      .insert({
        source: "all",
        keyword: categories.join(","),
        category: "all",
        status: "running",
      })
      .select("id")
      .single();

    const logId = log?.id;

    // ==============================================================
    // Phase 1: Crawl URLs from Naver API + RSS (parallel)
    // ==============================================================

    const crawlPromises: Promise<unknown[]>[] = [];

    for (const category of categories) {
      const keywords = CATEGORY_KEYWORDS[category] ?? [];
      if (keywords.length > 0) {
        crawlPromises.push(
          crawlNaverNews({
            keywords,
            maxPerKeyword,
            suggestedCategory: category,
          })
        );
      }
    }

    crawlPromises.push(
      crawlRssFeeds({
        feeds: ECONOMY_RSS_FEEDS as unknown as { name: string; url: string }[],
        hoursBack,
      })
    );

    const allResults = await Promise.allSettled(crawlPromises);

    type ArticleResult = {
      url: string;
      originalUrl?: string;
      original_url?: string;
      title: string;
      body?: string;
      excerpt?: string;
      author?: string | null;
      publisher: string;
      publisherDomain?: string;
      publishedAt?: string;
      published_at?: string;
      source: string;
      sourceId?: string;
      source_id?: string;
      suggestedCategory?: string | null;
    };

    let allArticles: ArticleResult[] = [];
    for (const result of allResults) {
      if (result.status === "fulfilled") {
        allArticles.push(...(result.value as ArticleResult[]));
      }
    }

    // ==============================================================
    // Phase 2: Filter by target publishers (if enabled)
    // ==============================================================
    if (targetPublishersOnly) {
      allArticles = allArticles.filter((a) => {
        const domain = a.publisherDomain || "";
        return targetPublishers.some((tp: string) => domain.includes(tp));
      });
    }

    // ==============================================================
    // Phase 3: Deduplicate by URL
    // ==============================================================
    const seen = new Set<string>();
    const uniqueArticles = allArticles.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    // ==============================================================
    // Phase 4: 본문 스크래핑 (cheerio) — 핵심 기능!
    // ==============================================================
    console.log(`[Crawl] Phase 4: Scraping ${uniqueArticles.length} article bodies...`);

    const urlsToScrape = uniqueArticles.map((a) => a.url);
    const scrapedBodies = await scrapeArticleBodies(urlsToScrape, 5, 300);

    let scrapeSuccessCount = 0;
    for (const article of uniqueArticles) {
      const scraped = scrapedBodies.get(article.url);
      if (scraped?.success) {
        article.body = scraped.body;
        if (scraped.author && !article.author) {
          article.author = scraped.author;
        }
        scrapeSuccessCount++;
      }
    }

    console.log(`[Crawl] Phase 4 complete: ${scrapeSuccessCount}/${uniqueArticles.length} bodies scraped`);

    // ==============================================================
    // Phase 5: Store in Supabase
    // ==============================================================
    let newCount = 0;

    for (const article of uniqueArticles) {
      const { error } = await supabase.from("te_articles").upsert(
        {
          source: article.source === "naver" ? "naver" : "rss",
          source_id: article.sourceId || article.source_id || null,
          url: article.url,
          original_url: article.originalUrl || article.original_url || article.url,
          title: article.title,
          body: article.body || null,
          excerpt: article.excerpt || null,
          author: article.author || null,
          publisher: article.publisher,
          published_at: article.publishedAt || article.published_at || null,
          category: article.suggestedCategory || null,
          is_analyzed: false,
        },
        { onConflict: "url", ignoreDuplicates: true }
      );

      if (!error) newCount++;
    }

    // Update crawl log
    if (logId) {
      await supabase
        .from("te_crawl_logs")
        .update({
          articles_found: uniqueArticles.length,
          articles_new: newCount,
          completed_at: new Date().toISOString(),
          status: "completed",
        })
        .eq("id", logId);
    }

    return NextResponse.json({
      success: true,
      totalCrawled: allArticles.length,
      uniqueArticles: uniqueArticles.length,
      newArticles: newCount,
      bodiesScraped: scrapeSuccessCount,
      categories,
    });
  } catch (error) {
    console.error("Crawl error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Crawl failed" },
      { status: 500 }
    );
  }
}
