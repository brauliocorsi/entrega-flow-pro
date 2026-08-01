/** Abre o GPS nativo do dispositivo (Google Maps / Apple Maps) para uma morada. */
export function buildNavUrl(address: string) {
  const q = encodeURIComponent(address);
  if (typeof navigator === "undefined") {
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    // Apple Maps abre a app nativa diretamente
    return `maps://?daddr=${q}&dirflg=d`;
  }
  if (/Android/i.test(ua)) {
    // Intent geo: abre o seletor de apps de navegação (Google Maps, Waze…)
    return `geo:0,0?q=${q}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export function openNavigation(address: string) {
  const url = buildNavUrl(address);
  if (url.startsWith("http")) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    // deep link nativo: navegação direta na mesma aba evita bloqueio de popup
    window.location.href = url;
  }
}

/** Estado visual da entrega para o entregador. */
export function deliveryOutcomeTone(outcome?: string | null, status?: string | null) {
  if (outcome === "entregue")
    return {
      label: "Entregue",
      badge: "bg-emerald-600 text-white border-emerald-600",
      card: "bg-emerald-50/70 dark:bg-emerald-950/30",
      bar: "bg-emerald-600",
    };
  if (outcome === "entregue_parcial")
    return {
      label: "Entrega parcial",
      badge: "bg-sky-600 text-white border-sky-600",
      card: "bg-sky-50/70 dark:bg-sky-950/30",
      bar: "bg-sky-600",
    };
  if (outcome === "nao_entregue")
    return {
      label: status === "cancelado" ? "Cancelada" : "Não entregue",
      badge: "bg-rose-600 text-white border-rose-600",
      card: "bg-rose-50/70 dark:bg-rose-950/30",
      bar: "bg-rose-600",
    };
  return {
    label: "Pendente",
    badge: "bg-muted text-muted-foreground border-border",
    card: "",
    bar: "bg-muted-foreground/30",
  };
}
