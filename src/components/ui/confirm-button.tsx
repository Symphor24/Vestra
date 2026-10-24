"use client";

import { useEffect, useState } from "react";
import { btn } from "./bits";

/** Two-step destructive action: first press arms it, second confirms. No modal, keyboard friendly. */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Confirmer", className = "" }: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      className={`${btn.base} ${armed ? "bg-danger text-white" : btn.danger} ${className}`}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
