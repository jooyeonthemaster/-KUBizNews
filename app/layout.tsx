import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KU BizNews | 고려대학교 첨단기술비즈니스 대학원",
  description:
    "AI 기반 국내 주요 경제뉴스 분석 플랫폼 — 매일경제, 한국경제, 서울경제, 머니투데이, 이데일리",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col w-72 border-r border-border bg-card/50 backdrop-blur-sm">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg">
                  K
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">KU BizNews</h1>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    고려대 첨단기술비즈니스
                  </p>
                </div>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              <a
                href="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-accent/60 text-foreground"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                대시보드
              </a>
              <a
                href="/articles"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                기사 목록
              </a>
              {["policy", "economy", "social", "technology", "international"].map(
                (cat) => {
                  const config: Record<string, { label: string; color: string }> = {
                    policy: { label: "정책 Policy", color: "bg-blue-500" },
                    economy: { label: "경제 Economy", color: "bg-emerald-500" },
                    social: { label: "사회 Social", color: "bg-amber-500" },
                    technology: { label: "기술 Technology", color: "bg-violet-500" },
                    international: { label: "국제 International", color: "bg-red-500" },
                  };
                  const c = config[cat];
                  return (
                    <a
                      key={cat}
                      href={`/category/${cat}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground transition"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${c.color}`} />
                      {c.label}
                    </a>
                  );
                }
              )}
            </nav>
            <div className="p-4 border-t border-border">
              <div className="px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Developed by</p>
                <p className="text-sm font-semibold text-foreground">유선화</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  고려대학교 첨단기술비즈니스 대학원
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {/* Mobile Header */}
            <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
                  K
                </div>
                <span className="font-bold">KU BizNews</span>
              </div>
            </header>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
