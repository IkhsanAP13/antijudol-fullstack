import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Log {
  id: string;
  timestamp: string;
  deviceName: string;
  url: string;
  type: 'site' | 'ad';
  category: string;
}

interface BlockedContentProps {
  logs: Log[];
  loading: boolean;
}

export function BlockedContent({ logs, loading }: BlockedContentProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Blocked Content Log</CardTitle>
          <CardDescription>Recent gambling content blocked across all devices</CardDescription>
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
        <CardTitle>Blocked Content Log</CardTitle>
        <CardDescription>Recent gambling content blocked across all devices</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No blocked content yet</p>
                  <p className="text-sm">Logs will appear here when content is blocked</p>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">{log.timestamp}</TableCell>
                  <TableCell>{log.deviceName}</TableCell>
                  <TableCell>
                    <Badge variant={log.type === 'site' ? 'destructive' : 'secondary'}>
                      {log.type === 'site' ? (
                        <AlertTriangle className="h-3 w-3 mr-1" />
                      ) : (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      {log.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.category}</TableCell>
                  <TableCell className="max-w-md truncate">{log.url}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
