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
  Monitor, CheckCircle, XCircle, Pencil, Check, X, KeyRound, Trash2, Plus, Search, Download,
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
        toast({ title: 'Gagal', description: 'Tidak bisa menambah perangkat.', var