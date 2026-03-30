export type Category = "policy" | "economy" | "social" | "technology" | "international";

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";

export interface Article {
  id: string;
  source: "naver" | "rss" | "direct";
  source_id: string | null;
  url: string;
  original_url: string | null;
  title: string;
  body: string | null;
  excerpt: string | null;
  author: string | null;
  publisher: string;
  published_at: string | null;
  category: Category | null;
  is_analyzed: boolean;
  crawled_at: string;
}

export interface Analysis {
  id: string;
  article_id: string;
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
  analyzed_at: string;
}

export interface ArticleWithAnalysis extends Article {
  ai_summary: string | null;
  ai_explanation: string | null;
  ai_category: Category | null;
  keywords: string[] | null;
  sentiment: Sentiment | null;
  sentiment_score: number | null;
  importance_score: number | null;
  key_figures: string[] | null;
  key_organizations: string[] | null;
  related_topics: string[] | null;
  analyzed_at: string | null;
}

export interface CategoryStats {
  category: Category;
  article_count: number;
  avg_sentiment: number;
  top_keywords: string[];
  updated_at: string;
}

export interface CrawlLog {
  id: string;
  source: string;
  keyword: string | null;
  category: string | null;
  articles_found: number;
  articles_new: number;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  error_message: string | null;
}

export interface DashboardStats {
  totalArticles: number;
  analyzedArticles: number;
  todayArticles: number;
  categoryBreakdown: { category: Category; count: number }[];
  sentimentBreakdown: { sentiment: Sentiment; count: number }[];
  topPublishers: { publisher: string; count: number }[];
  recentArticles: ArticleWithAnalysis[];
  trendData: { date: string; count: number }[];
}

export const CATEGORY_CONFIG: Record<Category, { label: string; labelEn: string; color: string; icon: string }> = {
  policy: { label: "정책", labelEn: "Policy", color: "#3B82F6", icon: "Scale" },
  economy: { label: "경제", labelEn: "Economy", color: "#10B981", icon: "TrendingUp" },
  social: { label: "사회", labelEn: "Social", color: "#F59E0B", icon: "Users" },
  technology: { label: "기술", labelEn: "Technology", color: "#8B5CF6", icon: "Cpu" },
  international: { label: "국제", labelEn: "International", color: "#EF4444", icon: "Globe" },
};

export const PUBLISHER_CONFIG: Record<string, { name: string; domain: string }> = {
  "mk.co.kr": { name: "매일경제", domain: "mk.co.kr" },
  "hankyung.com": { name: "한국경제", domain: "hankyung.com" },
  "sedaily.com": { name: "서울경제", domain: "sedaily.com" },
  "mt.co.kr": { name: "머니투데이", domain: "mt.co.kr" },
  "edaily.co.kr": { name: "이데일리", domain: "edaily.co.kr" },
};

export const SENTIMENT_CONFIG: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "긍정", color: "#10B981" },
  negative: { label: "부정", color: "#EF4444" },
  neutral: { label: "중립", color: "#6B7280" },
  mixed: { label: "혼합", color: "#F59E0B" },
};
