"use client";

import { useEffect, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

type T = { id: number; message: string; tone: "ok" | "error" };

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<T, "id">>).detail;
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener("vestra-toast", on);
    return () => window.removeEventListener("vestra-toast", on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
      {items.map((t) => (
        <p
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="animate-rise flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-lg"
        >
          {t.tone === "ok" ? (
            <Check className="size-4 text-text" aria-hidden="true" />
          ) : (
            <TriangleAlert className="size-4 text-danger" aria-hidden="true" />
          )}
          {t.message}
        </p>
      ))}
    </div>
  );
}
