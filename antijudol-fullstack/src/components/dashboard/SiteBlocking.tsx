import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ban, Plus, Trash2, ShieldX, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/api';

interface SiteBlockingProps {
  token: string;
}

// Bersihkan input jadi domain/keyword sederhana (buang protokol, path, www)
function normalizeInput(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '');
  v = v.replace(/^www\./, '');
  v = v.split('/')[0];
  v = v.split('?')[0];
  return v.trim();
}

export function SiteBlocking({ token }: SiteBlockingProps) {
  const [patterns, setPatterns] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const fetchBlocklist = async () => {
    try {
      const res = await fetch(apiUrl('/api/blocklist'));
      if (res.ok) setPatterns(await res.json());
    } catch {
      toast({
        title: 'Gagal memuat',
        description: 'Tidak bisa mengambil daftar blokir.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocklist();
  }, []);

  const addDomain = async () => {
    const domain = normalizeInput(input);
    if (!domain) return;
    if (patterns.includes(domain)) {
      toast({ title: 'Sudah ada', description: `"${domain}" sudah diblokir.` });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/blocklist'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ domains: [domain], action: 'add' }),
      });
      if (res.ok) {
        setInput('');
        await fetchBlocklist();
        toast({ title: 'Situs diblokir', description: `"${domain}" ditambahkan ke daftar blokir.` });
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menambah domain.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (domain: string) => {
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/blocklist'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ domains: [domain], action: 'remove' }),
      });
      if (res.ok) {
        await fetchBlocklist();
        toast({ title: 'Dihapus', description: `"${domain}" tidak lagi diblokir.` });
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menghapus domain.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Situs Diblokir</CardTitle>
            <ShieldX className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patterns.length}</div>
            <p className="text-xs text-muted-foreground">
              Domain judi yang otomatis diblokir di semua perangkat
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Penerapan</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium text-green-500">Otomatis</div>
            <p className="text-xs text-muted-foreground">
              Extension menyinkronkan daftar ini secara berkala
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Blokir Situs Judi Online</CardTitle>
          <CardDescription>
            Tambahkan domain (mis. <code>judisite88.com</code>) atau kata kunci. Semua perangkat
            akan otomatis memblokir situs tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="contoh: judisite88.com atau slotgacor"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addDomain();
              }}
              disabled={saving}
            />
            <Button onClick={addDomain} disabled={saving || !input.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Blokir
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Memuat daftar...</p>
          ) : patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Ban className="h-12 w-12 mb-2 opacity-50" />
              <p>Belum ada situs yang diblokir</p>
              <p className="text-sm">Tambahkan domain judi di atas untuk mulai memblokir</p>
            </div>
          ) : (
            <div className="space-y-2">
              {patterns.map((p) => (
                <div
                  key={p}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="destructive" className="shrink-0">
                      <Ban className="h-3 w-3 mr-1" />
                      Blokir
                    </Badge>
                    <span className="font-mono text-sm truncate">{p}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDomain(p)}
                    disabled={saving}
                    aria-label={`Hapus ${p}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
