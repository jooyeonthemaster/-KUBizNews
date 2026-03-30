"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate, formatFullDate, truncate } from "@/lib/utils";
import { CATEGORY_CONFIG, SENTIMENT_CONFIG } from "@/lib/types";
import type { Category, Sentiment, ArticleWithAnalysis } from "@/lib/types";

export default function ArticlesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ArticlesContent />
    </Suspense>
  );
}

function ArticlesContent() {
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<ArticleWithAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<ArticleWithAnalysis | null>(null);
  const [filter, setFilter] = useState({
    category: "" as string,
    publisher: "" as string,
    sentiment: "" as string,
    search: "" as string,
  });

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("analyzed", "true");
      if (filter.category) params.set("category", filter.category);
      if (filter.publisher) params.set("publisher", filter.publisher);
      if (filter.sentiment) params.set("sentiment", filter.sentiment);
      if (filter.search) params.set("search", filter.search);

      const res = await fetch(`/api/articles?${params}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("Failed to fetch articles:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Auto-select article from URL
  useEffect(() => {
    const id = searchParams.get("id");
    if (id && articles.length > 0) {
      const found = articles.find((a) => a.id === id);
      if (found) setSelectedArticle(found);
    }
  }, [searchParams, articles]);

  return (
    <div className="flex h-[calc(100vh-65px)] lg:h-screen">
      {/* Article List Panel */}
      <div className={`${selectedArticle ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-[440px] border-r border-border`}>
        {/* Filters */}
        <div className="p-4 border-b border-border space-y-3">
          <h2 className="text-lg font-bold">기사 목록</h2>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filter.category}
              onChange={(e) => { setFilter((f) => ({ ...f, category: e.target.value })); setPage(1); }}
              className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">전체 카테고리</option>
              {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
              ))}
            </select>
            <select
              value={filter.sentiment}
              onChange={(e) => { setFilter((f) => ({ ...f, sentiment: e.target.value })); setPage(1); }}
              className="px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">전체 감성</option>
              {(Object.keys(SENTIMENT_CONFIG) as Sentiment[]).map((s) => (
                <option key={s} value={s}>{SENTIMENT_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="기사 검색..."
            value={filter.search}
            onChange={(e) => { setFilter((f) => ({ ...f, search: e.target.value })); setPage(1); }}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">총 {total}개 기사</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              기사가 없습니다. 크롤링 후 AI 분석을 실행하세요.
            </div>
          ) : (
            articles.map((article) => (
              <button
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className={`w-full text-left p-4 border-b border-border/50 hover:bg-accent/30 transition ${
                  selectedArticle?.id === article.id ? "bg-accent/40" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {article.ai_category && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-white"
                      style={{ background: CATEGORY_CONFIG[article.ai_category]?.color }}
                    >
                      {CATEGORY_CONFIG[article.ai_category]?.labelEn}
                    </span>
                  )}
                  {article.sentiment && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px]"
                      style={{
                        background: SENTIMENT_CONFIG[article.sentiment]?.color + "20",
                        color: SENTIMENT_CONFIG[article.sentiment]?.color,
                      }}
                    >
                      {SENTIMENT_CONFIG[article.sentiment]?.label}
                    </span>
                  )}
                  {article.importance_score != null && article.importance_score >= 0.7 && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400">
                      중요
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-medium line-clamp-2 leading-snug">
                  {article.title}
                </h3>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <span className="font-medium">{article.publisher}</span>
                  {article.author && <span>· {article.author}</span>}
                  <span>· {formatDate(article.published_at)}</span>
                </div>
              </button>
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-muted rounded-lg disabled:opacity-50"
              >
                이전
              </button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm bg-muted rounded-lg disabled:opacity-50"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Article Detail Panel */}
      <div className={`${selectedArticle ? "flex" : "hidden lg:flex"} flex-1 flex-col overflow-y-auto`}>
        {selectedArticle ? (
          <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Back button (mobile) */}
            <button
              onClick={() => setSelectedArticle(null)}
              className="lg:hidden text-sm text-blue-400 mb-2"
            >
              ← 목록으로
            </button>

            {/* Category & Meta */}
            <div className="flex items-center gap-2 flex-wrap">
              {selectedArticle.ai_category && (
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-bold uppercase text-white"
                  style={{ background: CATEGORY_CONFIG[selectedArticle.ai_category]?.color }}
                >
                  {CATEGORY_CONFIG[selectedArticle.ai_category]?.label}{" "}
                  {CATEGORY_CONFIG[selectedArticle.ai_category]?.labelEn}
                </span>
              )}
              {selectedArticle.sentiment && (
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-medium"
                  style={{
                    background: SENTIMENT_CONFIG[selectedArticle.sentiment]?.color + "20",
                    color: SENTIMENT_CONFIG[selectedArticle.sentiment]?.color,
                  }}
                >
                  감성: {SENTIMENT_CONFIG[selectedArticle.sentiment]?.label}
                  {selectedArticle.sentiment_score != null &&
                    ` (${selectedArticle.sentiment_score > 0 ? "+" : ""}${selectedArticle.sentiment_score.toFixed(2)})`}
                </span>
              )}
              {selectedArticle.importance_score != null && (
                <span className="px-2.5 py-1 rounded-md text-xs bg-muted text-muted-foreground">
                  중요도: {(selectedArticle.importance_score * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold leading-tight">
              {selectedArticle.title}
            </h1>

            {/* Author / Publisher / Date */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground border-b border-border pb-4">
              <span className="font-semibold text-foreground">{selectedArticle.publisher}</span>
              {selectedArticle.author && (
                <span>기자: {selectedArticle.author}</span>
              )}
              <span>{formatFullDate(selectedArticle.published_at)}</span>
            </div>

            {/* AI Summary */}
            {selectedArticle.ai_summary && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI 핵심 요약
                </h3>
                <p className="text-sm leading-relaxed">{selectedArticle.ai_summary}</p>
              </div>
            )}

            {/* AI Explanation */}
            {selectedArticle.ai_explanation && (
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-violet-400 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  쉬운 설명
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {selectedArticle.ai_explanation}
                </p>
              </div>
            )}

            {/* Keywords & Entities */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">핵심 키워드</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedArticle.keywords.map((kw) => (
                      <span key={kw} className="px-2 py-0.5 bg-muted rounded-md text-xs">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedArticle.key_figures && selectedArticle.key_figures.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">주요 인물</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedArticle.key_figures.map((f) => (
                      <span key={f} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-xs">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedArticle.key_organizations && selectedArticle.key_organizations.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">주요 기관/기업</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedArticle.key_organizations.map((o) => (
                      <span key={o} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md text-xs">{o}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedArticle.related_topics && selectedArticle.related_topics.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">관련 주제</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedArticle.related_topics.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Original Article Excerpt */}
            {(selectedArticle.body || selectedArticle.excerpt) && (
              <div className="border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">기사 원문 (발췌)</h3>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {truncate(selectedArticle.body || selectedArticle.excerpt || "", 2000)}
                </p>
              </div>
            )}

            {/* Original Link */}
            <div className="flex items-center gap-3 pt-2">
              <a
                href={selectedArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                원문 기사 보기
              </a>
              {selectedArticle.original_url && selectedArticle.original_url !== selectedArticle.url && (
                <a
                  href={selectedArticle.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  원본 링크
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="text-5xl mb-4">📰</div>
              <p className="text-lg font-medium">기사를 선택하세요</p>
              <p className="text-sm mt-1">왼쪽 목록에서 기사를 클릭하면 상세 분석을 볼 수 있습니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
