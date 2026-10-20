// Dukungan HP: di HP tidak ada ekstensi Phantom. Web harus dibuka dari browser bawaan
// aplikasi Phantom, yang menyuntikkan wallet sama seperti ekstensi di laptop.

/** true bila dibuka di HP/tablet (Android, iPhone, iPad). */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS modern mengaku "Macintosh" tetapi punya layar sentuh.
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}

/** Deeplink resmi Phantom: membuka halaman ini di browser bawaan aplikasi Phantom. */
export function phantomBrowseUrl(href = window.location.href, origin = window.location.origin) {
  return `https://phantom.com/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
}

/** localhost/127.0.0.1 tidak bisa dibuka dari HP — perlu alamat online (Vercel). */
export const isLocalHost = () =>
  typeof window !== "undefined" && /^(localhost|127\.|\[::1\])/.test(window.location.hostname);
