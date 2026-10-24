"use client";

import { TriangleAlert } from "lucide-react";
import { btn, EmptyState } from "@/components/ui/bits";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mt-10">
      <EmptyState icon={TriangleAlert} title="Les données n'ont pas pu être chargées.">
        <p>Le service de données ne répond pas. Réessayez dans un instant.</p>
        <button type="button" onClick={reset} className={`${btn.base} ${btn.primary} mt-4`}>Réessayer</button>
      </EmptyState>
    </div>
  );
}
