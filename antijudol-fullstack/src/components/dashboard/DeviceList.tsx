import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Monitor, CheckCircle, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Device {
  id: string;
  deviceName: string;
  location: string;
  lastSeen: string;
  status: 'online' | 'offline';
  extensionVersion: string;
  blockedToday: number;
}

interface DeviceListProps {
  devices: Device[];
  loading: boolean;
}

export function DeviceList({ devices, loading }: DeviceListProps) {
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
        <CardDescription>All campus computers with extension installed</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Blocked Today</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No devices connected yet</p>
                  <p className="text-sm">Install the extension on campus computers to see them here</p>
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.deviceName}</TableCell>
                  <TableCell>{device.location}</TableCell>
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
                  <TableCell>{device.extensionVersion}</TableCell>
                  <TableCell>{device.blockedToday}</TableCell>
                  <TableCell className="text-muted-foreground">{device.lastSeen}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
