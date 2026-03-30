-- =============================================
-- Technology Entrepreneurship - News Platform
-- 고려대학교 첨단기술비즈니스 대학원
-- Tables prefixed with te_ to avoid conflicts
-- =============================================

-- 1. Raw crawled articles
CREATE TABLE IF NOT EXISTS te_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('naver', 'rss', 'direct')),
  source_id TEXT,
  url TEXT NOT NULL,
  original_url TEXT,
  title TEXT NOT NULL,
  body TEXT,
  excerpt TEXT,
  author TEXT,
  publisher TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  category TEXT CHECK (category IN ('policy', 'economy', 'social', 'technology', 'international')),
  is_analyzed BOOLEAN DEFAULT FALSE,
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(url)
);

-- 2. AI analysis results
CREATE TABLE IF NOT EXISTS te_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES te_articles(id) ON DELETE CASCADE,
  ai_summary TEXT NOT NULL,
  ai_explanation TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('policy', 'economy', 'social', 'technology', 'international')),
  keywords TEXT[] DEFAULT '{}',
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  sentiment_score FLOAT DEFAULT 0,
  importance_score FLOAT DEFAULT 0,
  key_figures TEXT[] DEFAULT '{}',
  key_organizations TEXT[] DEFAULT '{}',
  related_topics TEXT[] DEFAULT '{}',
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id)
);

-- 3. Crawl logs
CREATE TABLE IF NOT EXISTS te_crawl_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  keyword TEXT,
  category TEXT,
  articles_found INT DEFAULT 0,
  articles_new INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT
);

-- 4. Category statistics
CREATE TABLE IF NOT EXISTS te_category_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('policy', 'economy', 'social', 'technology', 'international')),
  article_count INT DEFAULT 0,
  avg_sentiment FLOAT DEFAULT 0,
  top_keywords TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category)
);

-- Initialize category stats
INSERT INTO te_category_stats (category, article_count) VALUES
  ('policy', 0),
  ('economy', 0),
  ('social', 0),
  ('technology', 0),
  ('international', 0)
ON CONFLICT (category) DO NOTHING;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_te_articles_category ON te_articles(category);
CREATE INDEX IF NOT EXISTS idx_te_articles_publisher ON te_articles(publisher);
CREATE INDEX IF NOT EXISTS idx_te_articles_published_at ON te_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_te_articles_is_analyzed ON te_articles(is_analyzed);
CREATE INDEX IF NOT EXISTS idx_te_analyses_category ON te_analyses(category);
CREATE INDEX IF NOT EXISTS idx_te_analyses_importance ON te_analyses(importance_score DESC);

-- 6. View
CREATE OR REPLACE VIEW te_articles_with_analysis AS
SELECT
  a.id,
  a.source,
  a.url,
  a.original_url,
  a.title,
  a.body,
  a.excerpt,
  a.author,
  a.publisher,
  a.published_at,
  a.category AS raw_category,
  a.is_analyzed,
  a.crawled_at,
  an.ai_summary,
  an.ai_explanation,
  an.category AS ai_category,
  an.keywords,
  an.sentiment,
  an.sentiment_score,
  an.importance_score,
  an.key_figures,
  an.key_organizations,
  an.related_topics,
  an.analyzed_at
FROM te_articles a
LEFT JOIN te_analyses an ON an.article_id = a.id
ORDER BY a.published_at DESC;

-- 7. RLS
ALTER TABLE te_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE te_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE te_crawl_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE te_category_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_articles_read') THEN
    CREATE POLICY te_articles_read ON te_articles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_analyses_read') THEN
    CREATE POLICY te_analyses_read ON te_analyses FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_crawl_logs_read') THEN
    CREATE POLICY te_crawl_logs_read ON te_crawl_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_category_stats_read') THEN
    CREATE POLICY te_category_stats_read ON te_category_stats FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_articles_service') THEN
    CREATE POLICY te_articles_service ON te_articles FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_analyses_service') THEN
    CREATE POLICY te_analyses_service ON te_analyses FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_crawl_logs_service') THEN
    CREATE POLICY te_crawl_logs_service ON te_crawl_logs FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'te_category_stats_service') THEN
    CREATE POLICY te_category_stats_service ON te_category_stats FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
