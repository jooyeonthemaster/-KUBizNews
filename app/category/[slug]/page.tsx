"use client";

import { useEffect, useState, useCallback, use } from "react";
import { formatDate, truncate } from "@/lib/utils";
import { CATEGORY_CONFIG, SENTIMENT_CONFIG } from "@/lib/types";
import type { Category, ArticleWithAnalysis } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const category = slug as Category;
  const config = CATEGORY_CONFIG[category];

  const [articles, setArticles] = useState<ArticleWithAnalysis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [keywordStats, setKeywordStats] = useState<{ keyword: string; count: number }[]>([]);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category,
        page: String(page),
        limit: "15",
        analyzed: "true",
      });
      const res = await fetch(`/api/articles?${params}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles);
        setTotal(data.total);
        setTotalPages(data.totalPages);

        // Calculate keyword stats from articles
        const kwCounts: Record<string, number> = {};
        for (const a of data.articles) {
          for (const kw of a.keywords ?? []) {
            kwCounts[kw] = (kwCounts[kw] || 0) + 1;
          }
        }
        setKeywordStats(
          Object.entries(kwCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword, count]) => ({ keyword, count }))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">존재하지 않는 카테고리입니다.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold"
          style={{ background: config.color }}
        >
          {config.label.charAt(0)}
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {config.label} <span className="text-muted-foreground font-normal">{config.labelEn}</span>
          </h1>
          <p className="text-sm text-muted-foreground">총 {total}개 기사</p>
        </div>
      </div>

      {/* Keyword Chart */}
      {keywordStats.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            핵심 키워드 빈도
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={keywordStats} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {keywordStats.map((_, idx) => (
                    <Cell key={idx} fill={config.color} opacity={1 - idx * 0.07} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Articles */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: config.color }} />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>이 카테고리에 분석된 기사가 없습니다.</p>
          </div>
        ) : (
          articles.map((article, i) => (
            <div
              key={article.id}
              className={`bg-card rounded-xl border border-border p-5 hover:border-border/80 transition animate-fade-in stagger-${Math.min(i + 1, 5)}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ background: config.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {article.sentiment && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          background: SENTIMENT_CONFIG[article.sentiment]?.color + "20",
                          color: SENTIMENT_CONFIG[article.sentiment]?.color,
                        }}
                      >
                        {SENTIMENT_CONFIG[article.sentiment]?.label}
                      </span>
                    )}
                    {article.importance_score != null && (
                      <span className="text-[10px] text-muted-foreground">
                        중요도 {(article.importance_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <a href={`/articles?id=${article.id}`}>
                    <h3 className="text-base font-semibold hover:text-blue-400 transition leading-snug">
                      {article.title}
                    </h3>
                  </a>
                  {article.ai_summary && (
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      {truncate(article.ai_summary, 200)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{article.publisher}</span>
                    {article.author && <span>{article.author}</span>}
                    <span>{formatDate(article.published_at)}</span>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline ml-auto"
                    >
                      원문 →
                    </a>
                  </div>
                  {article.keywords && article.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.keywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-muted rounded-lg text-sm disabled:opacity-50"
          >
            이전
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-muted rounded-lg text-sm disabled:opacity-50"
          >
            다음
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          KU BizNews — 고려대학교 첨단기술비즈니스 대학원 · 개발자 유선화
        </p>
      </footer>
    </div>
  );
}
