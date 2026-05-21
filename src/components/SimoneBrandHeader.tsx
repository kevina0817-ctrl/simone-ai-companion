/** Official Simone logo — `public/simone-logo.png` (user-provided brand asset). */
const SIMONE_LOGO = "/simone-logo.png";

const EMPATHY_LINE =
  "I listen with care — here to understand your day, not just manage it.";

type SimoneBrandHeaderProps = {
  showTagline?: boolean;
  logoClassName?: string;
};

export function SimoneBrandHeader({
  showTagline = true,
  logoClassName = "h-28 w-28",
}: SimoneBrandHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <img
        src={SIMONE_LOGO}
        alt="Simone"
        width={112}
        height={112}
        className={`object-contain ${logoClassName}`}
      />
      <div>
        <h1 className="font-display text-xl text-foreground">Welcome to Simone</h1>
        {showTagline && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{EMPATHY_LINE}</p>
        )}
      </div>
    </div>
  );
}

export function SimoneLogoMark({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <img src={SIMONE_LOGO} alt="Simone" width={48} height={48} className={`object-contain ${className}`} />
  );
}
