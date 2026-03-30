"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatDate, truncate } from "@/lib/utils";
import { CATEGORY_CONFIG, SENTIMENT_CONFIG } from "@/lib/types";
import type { Category, ArticleWithAnalysis } from "@/lib/types";

interface Stats {
  totalArticles: number;
  analyzedArticles: number;
  todayArticles: number;
  categoryBreakdown: { category: Category; count: number; avgSentiment: number; topKeywords: string[] }[];
  sentimentBreakdown: { sentiment: string; count: number }[];
  topPublishers: { publisher: string; count: number }[];
  recentArticles: ArticleWithAnalysis[];
  trendData: { date: string; count: number }[];
  crawlLogs: { id: string; started_at: string; articles_found: number; articles_new: number; status: string }[];
}

const ADMIN_PASSWORD = "@nadr1106";

const ALL_PUBLISHERS = [
  { id: "mk.co.kr", name: "매일경제" },
  { id: "hankyung.com", name: "한국경제" },
  { id: "sedaily.com", name: "서울경제" },
  { id: "mt.co.kr", name: "머니투데이" },
  { id: "edaily.co.kr", name: "이데일리" },
] as const;

const ALL_CATEGORIES = [
  { id: "policy", label: "정책 Policy" },
  { id: "economy", label: "경제 Economy" },
  { id: "social", label: "사회 Social" },
  { id: "technology", label: "기술 Technology" },
  { id: "international", label: "국제 International" },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingAction, setPendingAction] = useState<"crawl" | "analyze" | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showCrawlSettings, setShowCrawlSettings] = useState(false);
  // Crawl settings
  const [crawlHoursBack, setCrawlHoursBack] = useState(48);
  const [crawlMaxPerKeyword, setCrawlMaxPerKeyword] = useState(50);
  const [crawlTargetOnly, setCrawlTargetOnly] = useState(false);
  const [crawlPublishers, setCrawlPublishers] = useState<string[]>(ALL_PUBLISHERS.map((p) => p.id));
  const [crawlCategories, setCrawlCategories] = useState<string[]>(ALL_CATEGORIES.map((c) => c.id));
  const [analyzeLimit, setAnalyzeLimit] = useState(20);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const requestAction = (action: "crawl" | "analyze") => {
    if (isAuthenticated) {
      if (action === "crawl") executeCrawl();
      else executeAnalyze();
    } else {
      setPendingAction(action);
      setPasswordInput("");
      setShowPasswordModal(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setShowPasswordModal(false);
      setPasswordInput("");
      if (pendingAction === "crawl") executeCrawl();
      else if (pendingAction === "analyze") executeAnalyze();
      setPendingAction(null);
    } else {
      setMessage("비밀번호가 틀렸습니다.");
      setShowPasswordModal(false);
      setPasswordInput("");
      setPendingAction(null);
    }
  };

  const togglePublisher = (id: string) => {
    setCrawlPublishers((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: string) => {
    setCrawlCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const executeCrawl = async () => {
    setCrawling(true);
    setShowCrawlSettings(false);
    setMessage("크롤링 시작... (본문 스크래핑 포함, 수 분 소요)");
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPublishersOnly: crawlTargetOnly,
          targetPublishers: crawlPublishers,
          categories: crawlCategories,
          hoursBack: crawlHoursBack,
          maxPerKeyword: crawlMaxPerKeyword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`크롤링 완료: ${data.newArticles}개 새 기사 수집 (총 ${data.uniqueArticles}개, 본문 ${data.bodiesScraped}개 스크래핑)`);
        fetchStats();
      } else {
        setMessage(`오류: ${data.error}`);
      }
    } catch {
      setMessage("크롤링 중 오류가 발생했습니다.");
    } finally {
      setCrawling(false);
    }
  };

  const executeAnalyze = async () => {
    setAnalyzing(true);
    setMessage("Gemini 3 Flash 분석 시작...");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: analyzeLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`오류: ${data.error}`);
        setAnalyzing(false);
        return;
      }

      if (!data.jobId) {
        setMessage(data.message || "분석할 기사가 없습니다.");
        setAnalyzing(false);
        return;
      }

      // 백그라운드 작업 폴링
      setMessage(`분석 진행 중: 0/${data.total} (백그라운드 실행 — 페이지를 벗어나도 계속됩니다)`);
      const jobId = data.jobId;

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/analyze?jobId=${jobId}`);
          if (!statusRes.ok) return;
          const status = await statusRes.json();

          setMessage(
            `분석 진행 중: ${status.completed}/${status.total} 완료` +
            (status.failed > 0 ? ` (${status.failed}건 실패)` : "") +
            ` — 백그라운드 실행 중`
          );

          if (status.status === "completed" || status.status === "failed") {
            clearInterval(pollInterval);
            setAnalyzing(false);
            fetchStats();
            if (status.status === "completed") {
              setMessage(`AI 분석 완료: ${status.completed}/${status.total}개 기사 분석됨 (Gemini 3 Flash)`);
            } else {
              setMessage(`분석 중 오류 발생: ${status.error || "알 수 없는 오류"}`);
            }
          }
        } catch {
          // 폴링 실패해도 백그라운드 작업은 계속됨
        }
      }, 2000);

      // 안전장치: 10분 후 폴링 중지
      setTimeout(() => {
        clearInterval(pollInterval);
        setAnalyzing(false);
      }, 600000);
    } catch {
      setMessage("분석 요청 중 오류가 발생했습니다.");
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 animate-pulse" />
          <p className="text-muted-foreground text-sm">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const categoryData = (stats?.categoryBreakdown ?? []).map((c) => ({
    name: CATEGORY_CONFIG[c.category]?.label ?? c.category,
    nameEn: CATEGORY_CONFIG[c.category]?.labelEn ?? c.category,
    count: c.count,
    fill: CATEGORY_CONFIG[c.category]?.color ?? "#6B7280",
  }));

  const sentimentData = (stats?.sentimentBreakdown ?? []).map((s) => ({
    name: SENTIMENT_CONFIG[s.sentiment as keyof typeof SENTIMENT_CONFIG]?.label ?? s.sentiment,
    value: s.count,
    fill: SENTIMENT_CONFIG[s.sentiment as keyof typeof SENTIMENT_CONFIG]?.color ?? "#6B7280",
  }));

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            경제뉴스 인텔리전스
          </h1>
          <p className="text-muted-foreground mt-1">
            국내 5대 경제지 AI 분석 대시보드 — 고려대학교 첨단기술비즈니스 대학원
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowCrawlSettings((v) => !v)}
            className="px-3 py-2.5 bg-muted hover:bg-accent border border-border rounded-lg text-sm transition"
            title="크롤링 설정"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => requestAction("crawl")}
            disabled={crawling}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            {crawling ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                크롤링 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                뉴스 크롤링
              </>
            )}
          </button>
          <button
            onClick={() => requestAction("analyze")}
            disabled={analyzing}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                분석 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI 분석
              </>
            )}
          </button>
        </div>
      </div>

      {/* Crawl Settings Panel */}
      {showCrawlSettings && (
        <div className="bg-card rounded-xl border border-border p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">크롤링 설정</h3>
            <button onClick={() => setShowCrawlSettings(false)} className="text-muted-foreground hover:text-foreground text-sm">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 기간 설정 */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">수집 기간</label>
              <select
                value={crawlHoursBack}
                onChange={(e) => setCrawlHoursBack(Number(e.target.value))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
              >
                <option value={6}>최근 6시간</option>
                <option value={12}>최근 12시간</option>
                <option value={24}>최근 24시간</option>
                <option value={48}>최근 48시간</option>
                <option value={72}>최근 3일</option>
                <option value={168}>최근 7일</option>
              </select>
            </div>

            {/* 키워드당 최대 수집 */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">키워드당 최대 수집</label>
              <select
                value={crawlMaxPerKeyword}
                onChange={(e) => setCrawlMaxPerKeyword(Number(e.target.value))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
              >
                <option value={10}>10개</option>
                <option value={20}>20개</option>
                <option value={50}>50개</option>
                <option value={100}>100개 (최대)</option>
              </select>
            </div>

            {/* 분석 건수 */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">AI 분석 건수 (미분석 기사)</label>
              <select
                value={analyzeLimit}
                onChange={(e) => setAnalyzeLimit(Number(e.target.value))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
              >
                <option value={5}>5개</option>
                <option value={10}>10개</option>
                <option value={20}>20개</option>
                <option value={50}>50개</option>
              </select>
            </div>

            {/* 언론사 필터 */}
            <div className="md:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">대상 언론사</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={crawlTargetOnly}
                    onChange={(e) => setCrawlTargetOnly(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-[11px] text-muted-foreground">선택한 언론사만</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PUBLISHERS.map((pub) => (
                  <button
                    key={pub.id}
                    onClick={() => togglePublisher(pub.id)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition ${
                      crawlPublishers.includes(pub.id)
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {pub.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 카테고리 선택 */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-2">검색 카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition ${
                      crawlCategories.includes(cat.id)
                        ? "bg-violet-500/20 border-violet-500/40 text-violet-400"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
                <button
                  onClick={() => setCrawlCategories(ALL_CATEGORIES.map((c) => c.id))}
                  className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  전체선택
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Message */}
      {message && (
        <div className="px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm animate-fade-in">
          {message}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "총 기사", value: stats?.totalArticles ?? 0, icon: "📰", color: "from-blue-600/20 to-blue-800/5" },
          { label: "AI 분석 완료", value: stats?.analyzedArticles ?? 0, icon: "🤖", color: "from-violet-600/20 to-violet-800/5" },
          { label: "오늘 기사", value: stats?.todayArticles ?? 0, icon: "📅", color: "from-emerald-600/20 to-emerald-800/5" },
          { label: "경제지 소스", value: 5, icon: "🏢", color: "from-amber-600/20 to-amber-800/5" },
        ].map((kpi, i) => (
          <div
            key={kpi.label}
            className={`p-5 rounded-xl bg-gradient-to-br ${kpi.color} border border-border/50 animate-fade-in stagger-${i + 1}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{kpi.icon}</span>
            </div>
            <p className="text-3xl font-bold mt-3 tracking-tight">{kpi.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Distribution */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
            카테고리별 분포
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {categoryData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment Distribution */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
            감성 분석 분포
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {sentimentData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
            일별 기사 추이
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.trendData ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  name="기사 수"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Publisher & Keywords Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Publishers */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
            매체별 기사 수
          </h3>
          <div className="space-y-3">
            {(stats?.topPublishers ?? []).slice(0, 8).map((p, i) => (
              <div key={p.publisher} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{p.publisher}</span>
                    <span className="text-muted-foreground">{p.count}건</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      style={{
                        width: `${(p.count / Math.max(...(stats?.topPublishers ?? []).map((x) => x.count), 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Keywords */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
            카테고리별 핵심 키워드
          </h3>
          <div className="space-y-4">
            {(stats?.categoryBreakdown ?? []).map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: CATEGORY_CONFIG[cat.category]?.color }}
                  />
                  <span className="text-sm font-medium">
                    {CATEGORY_CONFIG[cat.category]?.label} {CATEGORY_CONFIG[cat.category]?.labelEn}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {cat.count}건
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(cat.topKeywords ?? []).slice(0, 6).map((kw) => (
                    <span
                      key={kw}
                      className="px-2 py-0.5 rounded-md text-xs border border-border bg-muted/50 text-muted-foreground"
                    >
                      {kw}
                    </span>
                  ))}
                  {(!cat.topKeywords || cat.topKeywords.length === 0) && (
                    <span className="text-xs text-muted-foreground">키워드 없음</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Articles */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            최근 분석된 기사
          </h3>
          <a
            href="/articles"
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            전체 보기 →
          </a>
        </div>
        <div className="space-y-3">
          {(stats?.recentArticles ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">아직 분석된 기사가 없습니다</p>
              <p className="text-sm">
                &ldquo;뉴스 크롤링&rdquo; 버튼으로 기사를 수집한 후, &ldquo;AI 분석&rdquo; 버튼으로 분석을 시작하세요.
              </p>
            </div>
          ) : (
            (stats?.recentArticles ?? []).map((article) => (
              <a
                key={article.id}
                href={`/articles?id=${article.id}`}
                className="block p-4 rounded-lg border border-border/50 hover:bg-accent/30 transition group"
              >
                <div className="flex items-start gap-3">
                  {article.ai_category && (
                    <span
                      className="mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white"
                      style={{
                        background: CATEGORY_CONFIG[article.ai_category]?.color ?? "#6B7280",
                      }}
                    >
                      {CATEGORY_CONFIG[article.ai_category]?.labelEn}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium group-hover:text-blue-400 transition line-clamp-1">
                      {article.title}
                    </h4>
                    {article.ai_summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {truncate(article.ai_summary, 150)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>{article.publisher}</span>
                      {article.author && <span>· {article.author}</span>}
                      <span>· {formatDate(article.published_at)}</span>
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
                    </div>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-[360px] shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold mb-1">관리자 인증</h3>
            <p className="text-sm text-muted-foreground mb-4">
              크롤링/분석을 실행하려면 비밀번호를 입력하세요.
            </p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="비밀번호 입력"
              autoFocus
              className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPasswordModal(false); setPendingAction(null); }}
                className="flex-1 px-4 py-2 bg-muted rounded-lg text-sm hover:bg-accent transition"
              >
                취소
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-6 border-t border-border">
        <p className="text-xs text-muted-foreground">
          KU BizNews v1.0 — 고려대학교 첨단기술비즈니스 대학원 · 개발자 유선화
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          매일경제 · 한국경제 · 서울경제 · 머니투데이 · 이데일리 AI 분석 플랫폼
        </p>
      </footer>
    </div>
  );
}
