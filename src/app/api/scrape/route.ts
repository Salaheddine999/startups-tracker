import { NextResponse } from "next/server";
import { scrapeStartups } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import type { Startup } from "@/types";

export const maxDuration = 60;

export async function GET() {
  try {
    const results = await scrapeStartups();
    console.log(`Scraped ${results.length} startups`);

    if (results.length > 0) {
      const startupsToInsert: Partial<Startup>[] = results.map((startup) => ({
        name: startup.name || "Unknown",
        website: startup.website || "not found",
        linkedin_url: startup.linkedin_url || "not found",
        created_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("startups")
        .upsert(startupsToInsert, {
          onConflict: "name",
          ignoreDuplicates: true,
        });

      if (upsertError) throw upsertError;
    }

    // Get total count after insertion
    const { count: totalCount } = await supabase
      .from("startups")
      .select("*", { count: "exact", head: true });

    return NextResponse.json(
      {
        success: true,
        newCount: results.length,
        totalCount,
        message:
          results.length === 0
            ? "No new startups found"
            : "Scrape completed successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      {
        error: "Operation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
