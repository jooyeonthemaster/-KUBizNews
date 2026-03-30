// =============================================
// 경제 뉴스 크롤링 대상 및 키워드 설정
// =============================================

/** 대상 경제지 도메인 */
export const TARGET_PUBLISHERS = [
  "mk.co.kr",       // 매일경제
  "hankyung.com",    // 한국경제
  "sedaily.com",     // 서울경제
  "mt.co.kr",        // 머니투데이
  "edaily.co.kr",    // 이데일리
] as const;

/** 경제지 RSS 피드 */
export const ECONOMY_RSS_FEEDS = [
  { name: "매일경제", url: "https://www.mk.co.kr/rss/30000001/" },
  { name: "매일경제 증권", url: "https://www.mk.co.kr/rss/30100041/" },
  { name: "한국경제", url: "https://www.hankyung.com/feed/all-news" },
  { name: "서울경제", url: "https://www.sedaily.com/RSS/Economy" },
  { name: "머니투데이", url: "https://rss.mt.co.kr/mt_news.xml" },
  { name: "이데일리 경제", url: "https://rss.edaily.co.kr/edaily_Economy.xml" },
  { name: "이데일리 국제", url: "https://rss.edaily.co.kr/edaily_International.xml" },
  { name: "이데일리 IT", url: "https://rss.edaily.co.kr/edaily_IT.xml" },
] as const;

/** 카테고리별 검색 키워드 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  policy: [
    "정부 정책 경제",
    "금융 규제",
    "통화정책 한국은행",
    "재정정책",
    "부동산 정책",
    "세제 개편",
    "규제 완화",
    "산업 정책",
  ],
  economy: [
    "GDP 경제성장",
    "금리 인상 인하",
    "환율 원달러",
    "코스피 증시",
    "부동산 시장",
    "물가 인플레이션",
    "수출 무역수지",
    "기업 실적",
  ],
  social: [
    "고용 실업률",
    "청년 일자리",
    "인구 고령화",
    "소비 트렌드",
    "가계부채",
    "복지 정책",
    "교육 경제",
    "노동 시장",
  ],
  technology: [
    "AI 인공지능 산업",
    "반도체 산업",
    "스타트업 투자",
    "디지털 전환",
    "바이오 산업",
    "전기차 배터리",
    "핀테크 금융기술",
    "클라우드 데이터",
  ],
  international: [
    "미국 경제 연준",
    "중국 경제 무역",
    "글로벌 금융시장",
    "국제 유가",
    "한미 경제",
    "무역 관세",
    "글로벌 공급망",
    "신흥국 경제",
  ],
};

/** 퍼블리셔 도메인 → 한글 이름 매핑 */
export const PUBLISHER_NAMES: Record<string, string> = {
  "mk.co.kr": "매일경제",
  "www.mk.co.kr": "매일경제",
  "hankyung.com": "한국경제",
  "www.hankyung.com": "한국경제",
  "sedaily.com": "서울경제",
  "www.sedaily.com": "서울경제",
  "mt.co.kr": "머니투데이",
  "www.mt.co.kr": "머니투데이",
  "news.mt.co.kr": "머니투데이",
  "edaily.co.kr": "이데일리",
  "www.edaily.co.kr": "이데일리",
};
