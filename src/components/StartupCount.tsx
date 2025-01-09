"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StartupCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function getCount() {
      const { count } = await supabase
        .from("startups")
        .select("*", { count: "exact", head: true });

      setCount(count || 0);
    }

    getCount();
  }, []);

  return (
    <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
      {count} startups
    </div>
  );
}
