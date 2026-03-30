import { PUBLISHER_NAMES } from "@/lib/constants";

export interface RssArticle {
  source: "rss";
  feedName: string;
  url: string;
  originalUrl: string | null;
  title: string;
  excerpt: string;
  author: string | null;
  publisher: string;
  publisherDomain: string;
  publishedAt: string;
}

interface RssFeedInput {
  name: string;
  url: string;
}

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function getPublisherName(url: string, feedName: string): string {
  const hostname = extractDomain(url);
  for (const [domain, name] of Object.entries(PUBLISHER_NAMES)) {
    if (hostname.includes(domain.replace("www.", ""))) {
      return name;
    }
  }
  // Fallback to feed name
  return feedName.split(" ")[0];
}

export async function crawlRssFeeds(options: {
  feeds: RssFeedInput[];
  hoursBack?: number;
}): Promise<RssArticle[]> {
  const { feeds, hoursBack = 48 } = options;
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const allArticles: RssArticle[] = [];

  // Dynamic import for rss-parser (server-only)
  const RssParser = (await import("rss-parser")).default;
  const parser = new RssParser({
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KoreaBizNewsBot/1.0)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    customFields: {
      item: [
        ["dc:creator", "creator"],
        ["content:encoded", "contentEncoded"],
      ],
    },
  });

  const BATCH_SIZE = 4;

  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    const batch = feeds.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (feed) => {
        try {
          const parsed = await parser.parseURL(feed.url);
          const articles: RssArticle[] = [];

          for (const item of parsed.items ?? []) {
            const pubDateStr = item.pubDate ?? item.isoDate ?? "";
            let publishedAt: Date;
            try {
              publishedAt = new Date(pubDateStr);
              if (isNaN(publishedAt.getTime())) continue;
            } catch {
              continue;
            }

            if (publishedAt < cutoff) continue;

            const url = item.link ?? item.guid ?? "";
            if (!url) continue;

            const title = stripHtml(item.title);
            const excerpt = stripHtml(
              item.contentSnippet ?? item.content ?? item.summary ?? ""
            ).slice(0, 500);

            const author = stripHtml(
              (item as unknown as Record<string, string>).creator ?? (item as unknown as Record<string, string>).author ?? ""
            );

            articles.push({
              source: "rss",
              feedName: feed.name,
              url,
              originalUrl: url,
              title,
              excerpt,
              author: author || null,
              publisher: getPublisherName(url, feed.name),
              publisherDomain: extractDomain(url),
              publishedAt: publishedAt.toISOString(),
            });
          }

          return articles;
        } catch {
          console.warn(`RSS feed "${feed.name}" failed`);
          return [];
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allArticles.push(...result.value);
      }
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allArticles
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}
