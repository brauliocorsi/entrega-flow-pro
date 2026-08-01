import * as React from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 767;
const TABLET_MAX = 1279;

function read(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w <= MOBILE_MAX) return "mobile";
  if (w <= TABLET_MAX) return "tablet";
  return "desktop";
}

/**
 * Deteta automaticamente o formato do ecrã (telemóvel / tablet / desktop).
 * Durante o SSR devolve "desktop" e `ready: false` para evitar mismatch.
 */
export function useBreakpoint(): { bp: Breakpoint; ready: boolean } {
  const [bp, setBp] = React.useState<Breakpoint>("desktop");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setBp(read());
    onChange();
    setReady(true);
    window.addEventListener("resize", onChange, { passive: true });
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return { bp, ready };
}
