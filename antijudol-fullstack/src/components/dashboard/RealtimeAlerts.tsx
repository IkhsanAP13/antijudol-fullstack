import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RealtimeAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    // TODO: Replace with WebSocket connection to your backend
    // const ws = new WebSocket('wss://your-backend-api/alerts');
    // ws.onmessage = (event) => {
    //   const alert = JSON.parse(event.data);
    //   setAlerts(prev => [alert, ...prev].slice(0, 10));
    // };
    // return () => ws.close();
  }, [enabled]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Real-time Alerts</CardTitle>
            <CardDescription>Live monitoring of violations and suspicious activity</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
            {enabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No alerts at this time. System monitoring for violations.
              </AlertDescription>
            </Alert>
          ) : (
            alerts.map((alert, index) => (
              <Alert key={index} variant={alert.severity === 'high' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>{alert.message}</span>
                  <Badge variant="outline">{alert.timestamp}</Badge>
                </AlertDescription>
              </Alert>
            ))
          )}
        </div>

        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-2">Alert Configuration</h4>
          <p className="text-sm text-muted-foreground">
            Configure alert thresholds and notification settings in your backend API.
            Alerts will be sent for repeated violations, suspicious patterns, and system issues.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
