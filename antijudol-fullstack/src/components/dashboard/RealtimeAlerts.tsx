import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Bell, BellOff, Globe, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LogItem {
  id?: string;
  deviceName?: string;
  deviceId?: string;
  timestamp: string;
  type: 'site' | 'ad' | string;
  url: string;
}

interface RealtimeAlertsProps {
  logs: LogItem[];
}

export function RealtimeAlerts({ logs }: RealtimeAlertsProps) {
  const [enabled, setEnabled] = useState(true);

  // Ambil 10 aktivitas terbaru sebagai "alert" langsung
  const recent = enabled ? logs.slice(0, 10) : [];

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'baru saja';
    if (min < 60) return `${min} mnt lalu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} jam lalu`;
    return new Date(ts).toLocaleString('id-ID');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Real-time Alerts</CardTitle>
            <CardDescription>
              Aktivitas pemblokiran terbaru dari semua perangkat
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEnabled(!enabled)}>
            {enabled ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
            {enabled ? 'Aktif' : 'Nonaktif'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recent.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {enabled
                  ? 'Belum ada aktivitas. Sistem memantau pelanggaran secara real-time.'
                  : 'Notifikasi dinonaktifkan.'}
              </AlertDescription>
            </Alert>
          ) : (
            recent.map((log, index) => (
              <Alert
                key={log.id || index}
                variant={log.type === 'site' ? 'destructive' : 'default'}
              >
                {log.type === 'site' ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    <b>{log.type === 'site' ? 'Situs judi diblokir' : 'Iklan diblokir'}</b>
                    {' '}pada {log.deviceName || log.deviceId || 'perangkat'} —{' '}
                    <span className="text-muted-foreground break-all">{log.url}</span>
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {timeAgo(log.timestamp)}
                  </Badge>
                </AlertDescription>
              </Alert>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
