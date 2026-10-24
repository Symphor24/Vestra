"use client";

import { useState } from "react";
import { Layers, TrendingDown } from "lucide-react";
import { Field } from "@/components/ui/pitch";
import { LogoMark } from "@/components/ui/logo";
import { btn } from "@/components/ui/bits";

const SLIDES = [
  {
    title: "Comprenez les cotes. Analysez les matchs. Construisez vos combinés.",
    body: "Vestra suit les cotes des grands championnats européens et vous montre comment elles évoluent.",
    cta: "Découvrir Vestra",
  },
  {
    title: "Suivez les mouvements de cotes",
    body: "Chaque cote est horodatée. Vestra calcule sa variation depuis la première observation et la probabilité implicite. Une baisse décrit le marché ; elle ne prédit pas le résultat.",
    cta: "Continuer",
  },
  {
    title: "Des combinés expliqués",
    body: "Trois niveaux de cote, du modéré au spéculatif, avec la justification de chaque sélection. Ce sont des estimations : aucun résultat n'est garanti.",
    cta: "Commencer sans compte",
  },
];

export function finishOnboarding() {
  try {
    localStorage.setItem("vestra-onboarded", "true");
  } catch {}
  document.documentElement.dataset.onboarded = "1";
}

export function replayOnboarding() {
  try {
    localStorage.removeItem("vestra-onboarded");
  } catch {}
  delete document.documentElement.dataset.onboarded;
}

function Visual({ step }: { step: number }) {
  if (step === 0) return <LogoMark className="size-20 drop-shadow-[0_10px_30px_rgb(200_241_105/0.25)]" tile={false} />;
  if (step === 1)
    return (
      <div className="w-64 rounded-card border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
        <p className="mb-3 flex items-center gap-1.5 text-xs text-hero-muted">
          <TrendingDown className="size-3.5" aria-hidden="true" /> Exemple illustratif
        </p>
        <svg viewBox="0 0 220 70" className="w-full" aria-hidden="true">
          <polyline points="0,14 55,18 110,30 165,46 220,54" fill="none" stroke="#C8F169" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {[0, 55, 110, 165, 220].map((x, i) => (
            <circle key={x} cx={x} cy={[14, 18, 30, 46, 54][i]} r="3.5" fill="#0B1220" stroke="#C8F169" strokeWidth="2" />
          ))}
        </svg>
      </div>
    );
  return (
    <div className="relative h-36 w-60" aria-hidden="true">
      {["Spéculatif", "Intermédiaire", "Modéré"].map((l, i) => (
        <div
          key={l}
          className="absolute inset-x-0 flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.07] px-4 py-3 text-sm backdrop-blur-sm"
          style={{ top: i * 34, transform: `scale(${0.9 + i * 0.05})` }}
        >
          <Layers className="size-4 text-lime" /> Combiné {l.toLowerCase()}
        </div>
      ))}
    </div>
  );
}

/** Rendered on every page; CSS hides it once html[data-onboarded] is set. */
export function Onboarding() {
  const [step, setStep] = useState(0);
  const s = SLIDES[step];
  const last = step === SLIDES.length - 1;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="onb-title" className="onboarding fixed inset-0 z-50">
      <Field className="flex h-full flex-col">
        <div className="flex justify-end p-4">
          <button type="button" onClick={finishOnboarding} className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-medium backdrop-blur hover:bg-white/15">
            Passer
          </button>
        </div>
        <div className="grid flex-1 place-items-center px-6">
          <div key={step} className="animate-rise">
            <Visual step={step} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-md bg-gradient-to-t from-midnight via-midnight/80 to-transparent px-6 pt-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div key={step} className="animate-rise">
            <h1 id="onb-title" className={`font-semibold tracking-[-0.03em] text-balance ${step === 0 ? "text-[32px] leading-[1.08]" : "text-[26px] leading-tight"}`}>
              {s.title}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-hero-muted">{s.body}</p>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex gap-1.5" aria-label={`Étape ${step + 1} sur ${SLIDES.length}`} role="img">
              {SLIDES.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? "w-6 bg-lime" : "w-1.5 bg-white/30"}`} />
              ))}
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => (last ? finishOnboarding() : setStep(step + 1))}
              className={`${btn.base} ${btn.primary} ml-auto px-5`}
            >
              {s.cta}
            </button>
          </div>
        </div>
      </Field>
    </div>
  );
}
