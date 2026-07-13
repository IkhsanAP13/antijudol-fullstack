// Base URL untuk semua panggilan API.
//  - Kosong ("")  → path relatif "/api/..." (mode lokal: frontend & backend satu server Express).
//  - Diisi        → mis. "https://xxx.up.railway.app" (mode produksi: backend terpisah).
// Set lewat variabel lingkungan Vite: VITE_API_URL (di Vercel: Project Settings → Environment Variables).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Bentuk URL penuh dari sebuah path API.
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
