import type { Metadata } from "next";
import { getCompetitions } from "@/lib/data";
import { ProfileSettings } from "@/components/profile/profile-settings";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const competitions = await getCompetitions();
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Profil</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Préférences enregistrées sur cet appareil.</p>
      <ProfileSettings competitions={competitions} />
    </>
  );
}
