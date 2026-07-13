import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Monitor, CheckCircle, XCircle, Pencil, Check, X, KeyRound, Trash2, Plus, Search,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiUrl } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Device {
  id: string;
  deviceId: string;
  alias?: string | null;
  deviceName: string;
  location?: string | null;
  os?: string | null;
  osVersion?: string | null;
  lastSeen: string;
  status: 'online' | 'offline';
  extensionVersion: string;
  blockedToday: number;
}

interface DeviceListProps {
  devices: Device[];
  loading: boolean;
  token: string;
  onUpdated: () => void;
}

export function DeviceList({ devices, loading, token, onUpdated }: DeviceListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aliasVal, setAliasVal] = useState('');
  const [locVal, setLocVal] = useState('');
  const [saving, setSaving] = useState(false);
  // Cari & filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Tambah perangkat
  const [adding, setAdding] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const { toast } = useToast();

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const startEdit = (d: Device) => {
    setEditingId(d.deviceId);
    setAliasVal(d.alias || '');
    setLocVal(d.location || '');
  };
  const cancel = () => setEditingId(null);

  const save = async (deviceId: string) => {
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/devices/${encodeURIComponent(deviceId)}`), {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ alias: aliasVal, location: locVal }),
      });
      if (res.ok) {
        toast({ title: 'Tersimpan', description: 'Nama & lokasi perangkat diperbarui.' });
        setEditingId(null);
        onUpdated();
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menyimpan.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createDevice = async () => {
    if (!newAlias.trim() && !newLoc.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/devices'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ alias: newAlias, location: newLoc }),
      });
      if (res.ok) {
        toast({ title: 'Perangkat ditambahkan', description: 'Entri inventaris dibuat.' });
        setAdding(false);
        setNewAlias('');
        setNewLoc('');
        onUpdated();
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menambah perangkat.', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteDevice = async (deviceId: string, label: string) => {
    if (!window.confirm(`Hapus perangkat "${label}"? Log terkait perangkat ini juga akan terhapus.`)) return;
    try {
      const res = await fetch(apiUrl(`/api/devices/${encodeURIComponent(deviceId)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: 'Dihapus', description: 'Perangkat dihapus dari daftar.' });
        onUpdated();
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa menghapus.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    }
  };

  const resetToken = async (deviceId: string) => {
    if (!window.confirm('Reset token perangkat ini? Perangkat akan mendaftar ulang token saat aktif berikutnya.')) return;
    try {
      const res = await fetch(apiUrl(`/api/devices/${encodeURIComponent(deviceId)}/reset-token`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: 'Token direset', description: 'Perangkat dapat mendaftar ulang token.' });
        onUpdated();
      } else {
        toast({ title: 'Gagal', description: 'Tidak bisa mereset token.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Koneksi ke server gagal.', variant: 'destructive' });
    }
  };

  const fmtLastSeen = (s: string) => {
    if (!s) return '-';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString('id-ID');
  };

  const q = search.trim().toLowerCase();
  const filtered = devices.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (!q) return true;
    return (
      (d.alias || '').toLowerCase().includes(q) ||
      (d.location || '').toLowerCase().includes(q) ||
      (d.deviceId || '').toLowerCase().includes(q) ||
      (d.deviceName || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registered Devices</CardTitle>
          <CardDescription>All campus computers with extension installed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle>Registered Devices</CardTitle>
            <CardDescription>
              Klik pensil untuk memberi nama & lokasi (mis. "Lab RPL-01 / PC-05")
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama/lokasi/ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-48"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded-lg border bg-muted/40">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground">Nama / Alias</label>
              <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Lab RPL-01 / PC-05" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground">Lokasi</label>
              <Input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="Lab Komputer 1" />
            </div>
            <Button onClick={createDevice} disabled={saving || (!newAlias.trim() && !newLoc.trim())}>
              Simpan
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>
              Batal
            </Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama / Alias</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Versi</TableHead>
              <TableHead>Blocked</TableHead>
              <TableHead>Terakhir Aktif</TableHead>
              <TableHead>Device ID</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{devices.length === 0 ? 'No devices connected yet' : 'Tidak ada perangkat yang cocok'}</p>
                  {devices.length === 0 && (
                    <p className="text-sm">Install the extension on campus computers to see them here</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((device) => {
                const isEditing = editingId === device.deviceId;
                const label = device.alias || device.deviceName;
                return (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input value={aliasVal} onChange={(e) => setAliasVal(e.target.value)} placeholder="Lab RPL-01 / PC-05" className="h-8" />
                      ) : (
                        device.alias || <span className="text-muted-foreground">{device.deviceName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={locVal} onChange={(e) => setLocVal(e.target.value)} placeholder="Lab Komputer 1" className="h-8" />
                      ) : (
                        device.location || <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={device.status === 'online' ? 'default' : 'secondary'}>
                        {device.status === 'online' ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {device.os || '-'}
                      {device.osVersion ? (
                        <span className="text-muted-foreground text-xs"> {device.osVersion}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{device.extensionVersion || '-'}</TableCell>
                    <TableCell>{device.blockedToday}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {fmtLastSeen(device.lastSeen)}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground max-w-[140px] truncate"
                      title={device.deviceId}
                    >
                      {device.deviceId}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => save(device.deviceId)} disabled={saving} aria-label="Simpan">
                            <Check className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancel} disabled={saving} aria-label="Batal">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(device)} aria-label="Edit nama/lokasi">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => resetToken(device.deviceId)} aria-label="Reset token" title="Reset token perangkat">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteDevice(device.deviceId, label)} aria-label="Hapus" title="Hapus perangkat">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <p className="text-xs text-muted-foreground mt-3">
          Menampilkan {filtered.length} dari {devices.length} perangkat
        </p>
      </CardContent>
    </Card>
  );
}
