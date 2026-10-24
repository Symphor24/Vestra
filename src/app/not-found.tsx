import Link from "next/link";
import { SearchX } from "lucide-react";
import { btn, EmptyState } from "@/components/ui/bits";

export default function NotFound() {
  return (
    <div className="mt-10">
      <EmptyState icon={SearchX} title="Cette page n'existe pas ou ce match n'est plus suivi.">
        <Link href="/matches" className={`${btn.base} ${btn.primary} mt-4`}>Voir les matchs</Link>
      </EmptyState>
    </div>
  );
}
