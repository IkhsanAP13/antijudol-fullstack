import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Monitor, CheckCircle, XCircle, Pencil, Check, X } from 'lucide-react';
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
  const { toast } = useToast();

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  const fmtLastSeen = (s: string) => {
    if (!s) return '-';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString('id-ID');
  };

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
        <CardTitle>Registered Devices</CardTitle>
        <CardDescription>
          Klik ikon pensil untuk memberi nama & lokasi perangkat (mis. "Lab RPL-01 / PC-05")
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            {devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No devices connected yet</p>
                  <p className="text-sm">Install the extension on campus computers to see them here</p>
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => {
                const isEditing = editingId === device.deviceId;
                return (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={aliasVal}
                          onChange={(e) => setAliasVal(e.target.value)}
                          placeholder="Lab RPL-01 / PC-05"
                          className="h-8"
                        />
                      ) : (
                        device.alias || <span className="text-muted-foreground">{device.deviceName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={locVal}
                          onChange={(e) => setLocVal(e.target.value)}
                          placeholder="Lab Komputer 1"
                          className="h-8"
                        />
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
                    <TableCell>{device.extensionVersion}</TableCell>
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
                        <Button size="icon" variant="ghost" onClick={() => startEdit(device)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
