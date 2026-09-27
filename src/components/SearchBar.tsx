"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  // Keep the input in sync if the URL query changes (e.g. back button).
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search movies & TV..."
        className="w-full rounded border border-neutral-700 bg-black/60 px-3 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand"
      />
    </form>
  );
}
