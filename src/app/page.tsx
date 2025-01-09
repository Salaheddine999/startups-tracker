"use client";

import { useState, useEffect } from "react";
import { StartupTable } from "@/components/startup-table";
import { supabase } from "@/lib/supabase";
import { Startup } from "@/types";
import StartupCount from "@/components/StartupCount";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStartups = async () => {
    try {
      const { data, error } = await supabase
        .from("startups")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStartups(data || []);
    } catch (err) {
      setError("Failed to fetch startups");
      console.error("Error fetching startups:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/scrape");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh data");
      }

      await fetchStartups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh data");
      console.error("Error refreshing data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStartups();
  }, []);

  return (
    <main className="container mx-auto py-10 px-4">
      <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold">Startup Tracker</h1>
            <StartupCount />
          </div>
          <p className="text-gray-600 mt-2">
            Tracking A16Z portfolio and YC 2024 batch startups
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="bg-blue-500 hover:bg-blue-600"
        >
          {isRefreshing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Refreshing...
            </span>
          ) : (
            "Refresh Data"
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <StartupTable data={startups} />
        </div>
      )}
    </main>
  );
}
