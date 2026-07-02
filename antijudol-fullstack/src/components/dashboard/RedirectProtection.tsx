import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ShieldAlert, Plus, Trash2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RedirectLog {
  id: string;
  deviceId?: string;
  deviceName?: string;
  target: string;
  from: string;
  reason: string;
  method: string;
  timestamp: string;
}

interface RedirectProtectionProps {
  token: string;
}

const SENS_LABEL: Record<string, string> = {
  low: 'Low — hanya redirect otomatis murni',
  medium: 'Medium — + klik area kosong/overlay',
  high: 'High — wajib klik elemen navigasi',
};

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '-';
  }
}

export function RedirectProtection({ token }: RedirectProtectionProps) {
  const [enabled, setEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState('medium');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [logs, setLogs] = useState<RedirectLog[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/redirect/config');
      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled !== false);
        setSensitivity(data.sensitivity || 'medium');
        setWhitelist(Array.isArray(data.whitelist) ? data.whitelist : []);
      }
    } catch {
      /* abaikan */
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/redirect/logs?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setLogs(await res.json());
    } catch {
      /* abaikan */
    }
  }, [token]);

  useEffect(() => {
    fetchConfig();
    fetchLogs();
    const t = setInterval(fetchLogs, 15000);
    return () => clearInterval(t);
  }, [fetchConfig, fetchLogs]);

  const saveConfig = async (nextEnabled: boolean, nextSens: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/redirect/config', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ enabled: nextEnabled, sensitivity: nextSens }),
      });
      if (res.ok) {
        toast({ title: 'Tersimpan', description: 'Konfigurasi proteksi redirect diperbarui.' });
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menyimpan konfigurasi.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (val: boolean) => {
    setEnabled(val);
    saveConfig(val, sensitivity);
  };

  const onSensitivity = (val: string) => {
    setSensitivity(val);
    saveConfig(enabled, val);
  };

  const addDomain = async () => {
    const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!d) return;
    if (whitelist.includes(d)) {
      toast({ title: 'Sudah ada', description: `"${d}" sudah di whitelist.` });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/redirect/whitelist', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ domains: [d], action: 'add' }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhitelist(data.whitelist || []);
        setInput('');
      }
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (d: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/redirect/whitelist', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ domains: [d], action: 'remove' }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhitelist(data.whitelist || []);
      }
    } finally {
      setSaving(false);
    }
  };

  const todayCount = logs.filter(
    (l) => new Date(l.timestamp).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="space-y-4">
      {/* Ringkasan + kontrol */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Proteksi Redirect</CardTitle>
            <ShieldAlert className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch checked={enabled} onCheckedChange={onToggle} disabled={saving} />
              <span className={enabled ? 'text-sm font-medium text-green-500' : 'text-sm text-muted-foreground'}>
                {enabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Berlaku di semua perangkat</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sensitivitas Deteksi</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={sensitivity} onValueChange={onSensitivity} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{SENS_LABEL[sensitivity]}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redirect Diblokir</CardTitle>
            <ExternalLink className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
            <p className="text-xs text-muted-foreground">{todayCount} hari ini</p>
          </CardContent>
        </Card>
      </div>

      {/* Whitelist */}
      <Card>
        <CardHeader>
          <CardTitle>Whitelist Domain</CardTitle>
          <CardDescription>
            Domain di sini tidak akan pernah diblokir saat menjadi tujuan redirect (mis. gateway
            pembayaran atau SSO internal). Login/OAuth/CAPTCHA umum sudah dikecualikan otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="contoh: payment.gateway.co.id"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDomain()}
              disabled={saving}
            />
            <Button onClick={addDomain} disabled={saving || !input.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah
            </Button>
          </div>
          {whitelist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada domain di whitelist.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {whitelist.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 pr-1">
                  {d}
                  <button
                    onClick={() => removeDomain(d)}
                    className="ml-1 rounded hover:bg-destructive/20 p-0.5"
                    aria-label={`Hapus ${d}`}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log */}
      <Card>
        <CardHeader>
          <CardTitle>Log Redirect Diblokir</CardTitle>
          <CardDescription>Percobaan forced redirect yang dicegah di semua perangkat</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Perangkat</TableHead>
                <TableHead>Tujuan</TableHead>
                <TableHead>Dari</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Alasan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Belum ada redirect yang diblokir</p>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell>{l.deviceName || l.deviceId || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{domainOf(l.target)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{domainOf(l.from)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.method}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs text-muted-foreground">{l.reason}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
