import type { Metadata } from "next";
import { FavoritesView } from "@/components/favorites/favorites-view";

export const metadata: Metadata = { title: "Favoris" };

export default function FavoritesPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Favoris</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Enregistrés sur cet appareil uniquement, sans compte.</p>
      <FavoritesView />
    </>
  );
}
