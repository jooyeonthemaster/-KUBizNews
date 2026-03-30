import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { readFileSync } from "fs";
import { join } from "path";

export async function POST() {
  try {
    const supabase = createServiceClient();

    // Read and execute migration SQL
    const migrationPath = join(process.cwd(), "supabase", "migration.sql");
    const sql = readFileSync(migrationPath, "utf-8");

    // Split by semicolons and execute each statement
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    const results: string[] = [];

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc("exec_sql", { sql_text: statement + ";" });
        if (error) {
          // Try direct approach via REST
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
              },
              body: JSON.stringify({ sql_text: statement + ";" }),
            }
          );
          if (!response.ok) {
            results.push(`WARN: ${statement.slice(0, 60)}... - ${error.message}`);
          } else {
            results.push(`OK: ${statement.slice(0, 60)}...`);
          }
        } else {
          results.push(`OK: ${statement.slice(0, 60)}...`);
        }
      } catch {
        results.push(`SKIP: ${statement.slice(0, 60)}...`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}
