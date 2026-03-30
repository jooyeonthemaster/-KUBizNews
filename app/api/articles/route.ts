import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const publisher = searchParams.get("publisher");
    const sentiment = searchParams.get("sentiment");
    const analyzed = searchParams.get("analyzed");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    const supabase = createServiceClient();

    // Use the view for articles with analysis
    let query = supabase
      .from("te_articles_with_analysis")
      .select("*", { count: "exact" });

    if (category) {
      query = query.or(`raw_category.eq.${category},ai_category.eq.${category}`);
    }
    if (publisher) {
      query = query.ilike("publisher", `%${publisher}%`);
    }
    if (sentiment) {
      query = query.eq("sentiment", sentiment);
    }
    if (analyzed === "true") {
      query = query.eq("is_analyzed", true);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,ai_summary.ilike.%${search}%`);
    }

    query = query
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      articles: data ?? [],
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch articles" },
      { status: 500 }
    );
  }
}
