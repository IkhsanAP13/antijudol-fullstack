import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Ban, ShieldCheck, CalendarClock, Globe } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AdLog {
  id: string;
  timestamp: string;
  deviceName?: string;
  deviceId?: string;
  url: string;
  reason?: string;
  selector?: string;
}

interface BlockedAdsProps {
  ads: AdLog[];
  loading: boolean;
}

// Ambil domain bersih dari sebuah URL/string
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const m = String(url).match(/([a-z0-9-]+\.[a-z]{2,})(?:[/?#]|$)/i);
    return m ? m[1] : '-';
  }
}

// Ambil "halaman asal" dari field reason berformat "label @ host"
function pageOf(reason?: string): string {
  if (!reason) return '-';
  const at = reason.lastIndexOf('@');
  return at >= 0 ? reason.slice(at + 1).trim() : '-';
}

export function BlockedAds({ ads, loading }: BlockedAdsProps) {
  const today = new Date().toDateString();
  const todayCount = ads.filter((a) => new Date(a.timestamp).toDateString() === today).length;

  // Hitung domain judol unik yang paling sering muncul
  const domainCounts: Record<string, number> = {};
  ads.forEach((a) => {
    const d = domainOf(a.url);
    if (d && d !== '-') domainCounts[d] = (domainCounts[d] || 0) + 1;
  });
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Iklan Diblokir</CardTitle>
            <Ban className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ads.length}</div>
            <p className="text-xs text-muted-foreground">Tersimpan otomatis di database</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hari Ini</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayCount}</div>
            <p className="text-xs text-muted-foreground">Iklan judol diblokir hari ini</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domain Judol Unik</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(domainCounts).length}</div>
            <p className="text-xs text-muted-foreground">Sumber iklan terdeteksi</p>
          </CardContent>
        </Card>
      </div>

      {/* Domain teratas */}
      {topDomains.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domain Judol Paling Sering Muncul</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topDomains.map(([domain, count]) => (
                <Badge key={domain} variant="destructive" className="gap-1">
                  <Globe className="h-3 w-3" />
                  {domain}
                  <span className="ml-1 rounded bg-white/20 px-1.5">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabel hasil */}
      <Card>
        <CardHeader>
          <CardTitle>Hasil Iklan Judol yang Diblokir</CardTitle>
          <CardDescription>
            Daftar iklan judi yang otomatis disembunyikan & disimpan ke database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Perangkat</TableHead>
                  <TableHead>Domain Iklan</TableHead>
                  <TableHead>Muncul di Halaman</TableHead>
                  <TableHead>Link Iklan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      <Ban className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Belum ada iklan judol yang diblokir</p>
                      <p className="text-sm">
                        Iklan akan muncul di sini saat extension memblokirnya
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  ads.map((ad) => (
                    <TableRow key={ad.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(ad.timestamp).toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell>{ad.deviceName || ad.deviceId || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{domainOf(ad.url)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{pageOf(ad.reason)}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {ad.url}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
