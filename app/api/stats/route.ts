import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const revalidate = 60;

export async function GET() {
  try {
    const supabase = createServiceClient();

    // Parallel queries
    const [
      totalResult,
      analyzedResult,
      todayResult,
      categoryStatsResult,
      sentimentResult,
      publisherResult,
      recentResult,
      trendResult,
      crawlLogsResult,
    ] = await Promise.all([
      // Total articles
      supabase
        .from("te_articles")
        .select("*", { count: "exact", head: true }),

      // Analyzed articles
      supabase
        .from("te_articles")
        .select("*", { count: "exact", head: true })
        .eq("is_analyzed", true),

      // Today's articles
      supabase
        .from("te_articles")
        .select("*", { count: "exact", head: true })
        .gte("published_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

      // Category stats
      supabase
        .from("te_category_stats")
        .select("*")
        .order("article_count", { ascending: false }),

      // Sentiment breakdown
      supabase
        .from("te_analyses")
        .select("sentiment"),

      // Top publishers
      supabase
        .from("te_articles")
        .select("publisher"),

      // Recent analyzed articles
      supabase
        .from("te_articles_with_analysis")
        .select("*")
        .eq("is_analyzed", true)
        .order("published_at", { ascending: false })
        .limit(10),

      // Trend data (articles per day, last 7 days)
      supabase
        .from("te_articles")
        .select("published_at")
        .gte("published_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("published_at", { ascending: true }),

      // Recent crawl logs
      supabase
        .from("te_crawl_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(5),
    ]);

    // Process sentiment breakdown
    const sentimentCounts: Record<string, number> = {};
    for (const row of sentimentResult.data ?? []) {
      const s = row.sentiment || "neutral";
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    }

    // Process publisher breakdown
    const publisherCounts: Record<string, number> = {};
    for (const row of publisherResult.data ?? []) {
      const p = row.publisher || "unknown";
      publisherCounts[p] = (publisherCounts[p] || 0) + 1;
    }
    const topPublishers = Object.entries(publisherCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([publisher, count]) => ({ publisher, count }));

    // Process trend data (articles per day)
    const trendMap: Record<string, number> = {};
    for (const row of trendResult.data ?? []) {
      if (row.published_at) {
        const date = new Date(row.published_at).toISOString().split("T")[0];
        trendMap[date] = (trendMap[date] || 0) + 1;
      }
    }
    const trendData = Object.entries(trendMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totalArticles: totalResult.count ?? 0,
      analyzedArticles: analyzedResult.count ?? 0,
      todayArticles: todayResult.count ?? 0,
      categoryBreakdown: (categoryStatsResult.data ?? []).map((c) => ({
        category: c.category,
        count: c.article_count,
        avgSentiment: c.avg_sentiment,
        topKeywords: c.top_keywords,
      })),
      sentimentBreakdown: Object.entries(sentimentCounts).map(([sentiment, count]) => ({
        sentiment,
        count,
      })),
      topPublishers,
      recentArticles: recentResult.data ?? [],
      trendData,
      crawlLogs: crawlLogsResult.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
