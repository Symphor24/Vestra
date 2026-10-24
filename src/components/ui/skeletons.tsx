const S = ({ className }: { className: string }) => <div className={`skeleton ${className}`} />;

export function DashboardSkeleton() {
  return (
    <div className="space-y-9" aria-busy="true" aria-label="Chargement">
      <div className="space-y-2">
        <S className="h-4 w-32" />
        <S className="h-8 w-64" />
        <S className="h-4 w-72" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <S className="h-44 rounded-card" />
        <S className="h-44 rounded-card" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <S key={i} className="h-60 rounded-card" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <S key={i} className="h-48 rounded-card" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <S className="h-64 rounded-card" />
      <div className="grid grid-cols-3 gap-2">
        <S className="h-24" />
        <S className="h-24" />
        <S className="h-24" />
      </div>
      <S className="h-56 rounded-card" />
    </div>
  );
}
