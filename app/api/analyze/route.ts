import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analyzeArticle } from "@/lib/analyzers/claude-analyzer";

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// 백그라운드 분석 작업 상태 (서버 메모리에 유지)
// ---------------------------------------------------------------------------

interface AnalysisJob {
  id: string;
  status: "running" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  results: { id: string; category: string; sentiment: string }[];
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

const activeJobs = new Map<string, AnalysisJob>();

// ---------------------------------------------------------------------------
// POST: 분석 시작 (즉시 응답, 백그라운드 실행)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 10;
    const articleId = body.articleId as string | undefined;

    const supabase = createServiceClient();

    // Fetch unanalyzed articles
    let query = supabase
      .from("te_articles")
      .select("id, title, body, excerpt, publisher, published_at")
      .eq("is_analyzed", false)
      .not("body", "is", null)
      .order("published_at", { ascending: false });

    if (articleId) {
      query = supabase
        .from("te_articles")
        .select("id, title, body, excerpt, publisher, published_at")
        .eq("id", articleId);
    } else {
      query = query.limit(limit);
    }

    const { data: articles, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!articles || articles.length === 0) {
      return NextResponse.json({
        success: true,
        jobId: null,
        analyzed: 0,
        message: "분석할 기사가 없습니다.",
      });
    }

    // 작업 ID 생성
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const job: AnalysisJob = {
      id: jobId,
      status: "running",
      total: articles.length,
      completed: 0,
      failed: 0,
      results: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    activeJobs.set(jobId, job);

    // 오래된 작업 정리 (1시간 이상)
    for (const [id, j] of activeJobs) {
      if (Date.now() - new Date(j.startedAt).getTime() > 3600000) {
        activeJobs.delete(id);
      }
    }

    // 백그라운드에서 분석 실행 (await 하지 않음!)
    runAnalysisInBackground(jobId, articles, supabase);

    // 즉시 응답
    return NextResponse.json({
      success: true,
      jobId,
      total: articles.length,
      message: `${articles.length}개 기사 분석이 백그라운드에서 시작되었습니다.`,
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET: 진행 상황 조회
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    // 모든 활성 작업 목록 반환
    const jobs = Array.from(activeJobs.values()).map((j) => ({
      id: j.id,
      status: j.status,
      total: j.total,
      completed: j.completed,
      failed: j.failed,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
    }));
    return NextResponse.json({ jobs });
  }

  const job = activeJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    results: job.results,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
  });
}

// ---------------------------------------------------------------------------
// 백그라운드 분석 실행 함수
// ---------------------------------------------------------------------------

async function runAnalysisInBackground(
  jobId: string,
  articles: { id: string; title: string; body: string | null; excerpt: string | null; publisher: string; published_at: string | null }[],
  supabase: ReturnType<typeof createServiceClient>
) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  console.log(`[Analysis Job ${jobId}] Started: ${articles.length} articles`);

  try {
    for (const article of articles) {
      try {
        const analysis = await analyzeArticle({
          title: article.title,
          body: article.body,
          excerpt: article.excerpt,
          publisher: article.publisher,
          published_at: article.published_at,
        });

        // Insert analysis
        const { error: insertError } = await supabase.from("te_analyses").upsert(
          {
            article_id: article.id,
            ai_summary: analysis.ai_summary,
            ai_explanation: analysis.ai_explanation,
            category: analysis.category,
            keywords: analysis.keywords,
            sentiment: analysis.sentiment,
            sentiment_score: analysis.sentiment_score,
            importance_score: analysis.importance_score,
            key_figures: analysis.key_figures,
            key_organizations: analysis.key_organizations,
            related_topics: analysis.related_topics,
          },
          { onConflict: "article_id" }
        );

        if (!insertError) {
          await supabase
            .from("te_articles")
            .update({ is_analyzed: true, category: analysis.category })
            .eq("id", article.id);

          job.completed++;
          job.results.push({
            id: article.id,
            category: analysis.category,
            sentiment: analysis.sentiment,
          });

          console.log(`[Analysis Job ${jobId}] ${job.completed}/${job.total} - [${analysis.category}] ${article.title.slice(0, 40)}...`);
        } else {
          job.failed++;
          console.error(`[Analysis Job ${jobId}] DB error for ${article.id}:`, insertError.message);
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        job.failed++;
        console.error(`[Analysis Job ${jobId}] Failed for ${article.id}:`, err);
      }
    }

    // Update category stats
    await updateCategoryStats(supabase);

    job.status = "completed";
    job.completedAt = new Date().toISOString();
    console.log(`[Analysis Job ${jobId}] Completed: ${job.completed} success, ${job.failed} failed`);
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    job.completedAt = new Date().toISOString();
    console.error(`[Analysis Job ${jobId}] Fatal error:`, error);
  }
}

// ---------------------------------------------------------------------------
// 카테고리 통계 업데이트
// ---------------------------------------------------------------------------

async function updateCategoryStats(supabase: ReturnType<typeof createServiceClient>) {
  const categories = ["policy", "economy", "social", "technology", "international"];

  for (const category of categories) {
    const { count } = await supabase
      .from("te_articles")
      .select("*", { count: "exact", head: true })
      .eq("category", category);

    const { data: sentimentData } = await supabase
      .from("te_analyses")
      .select("sentiment_score")
      .eq("category", category);

    const avgSentiment =
      sentimentData && sentimentData.length > 0
        ? sentimentData.reduce((sum, d) => sum + (d.sentiment_score || 0), 0) / sentimentData.length
        : 0;

    const { data: keywordData } = await supabase
      .from("te_analyses")
      .select("keywords")
      .eq("category", category)
      .limit(50);

    const keywordCounts: Record<string, number> = {};
    for (const row of keywordData ?? []) {
      for (const kw of row.keywords ?? []) {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      }
    }
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);

    await supabase.from("te_category_stats").upsert(
      {
        category,
        article_count: count ?? 0,
        avg_sentiment: avgSentiment,
        top_keywords: topKeywords,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category" }
    );
  }
}
