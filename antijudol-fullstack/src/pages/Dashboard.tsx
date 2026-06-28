import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  AlertTriangle,
  Monitor,
  Activity,
  Download,
  RefreshCw,
  LogOut,
  User,
} from "lucide-react";
import { DeviceList } from "@/components/dashboard/DeviceList";
import { BlockedContent } from "@/components/dashboard/BlockedContent";
import { Statistics } from "@/components/dashboard/Statistics";
import { RealtimeAlerts } from "@/components/dashboard/RealtimeAlerts";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalBlocked: 0,
    activeDevices: 0,
    violations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const { admin, token, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [devicesRes, logsRes, statsRes] = await Promise.all([
        fetch("/api/devices", { headers: authHeaders }),
        fetch("/api/logs", { headers: authHeaders }),
        fetch("/api/statistics", { headers: authHeaders }),
      ]);
      if (devicesRes.status === 401) {
        logout();
        navigate("/login");
        return;
      }
      if (devicesRes.ok) setDevices(await devicesRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      toast({
        title: "Connection Error",
        description: "Tidak bisa terhubung ke backend API",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ─── Export PDF ────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting(true);
    toast({ title: "Membuat PDF...", description: "Mohon tunggu sebentar." });

    try {
      const now = new Date();
      const tanggal = now.toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const jam = now.toLocaleTimeString("id-ID");
      const namaAdmin = admin?.name || "Administrator";

      // Buat konten HTML laporan
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8"/>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 32px; }
            .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #6d4fe8; padding-bottom: 16px; margin-bottom: 24px; }
            .logo { width: 48px; height: 48px; background: #6d4fe8; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; font-weight: bold; }
            .header-text h1 { font-size: 22px; font-weight: bold; color: #6d4fe8; }
            .header-text p  { font-size: 11px; color: #666; margin-top: 2px; }
            .meta { font-size: 11px; color: #555; margin-bottom: 24px; line-height: 1.6; }
            .meta span { margin-right: 24px; }
            .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
            .stat-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 16px; }
            .stat-card .label { font-size: 11px; color: #666; margin-bottom: 6px; }
            .stat-card .value { font-size: 26px; font-weight: bold; color: #6d4fe8; }
            .stat-card.red .value { color: #e53e3e; }
            .stat-card.green .value { color: #38a169; }
            .section-title { font-size: 14px; font-weight: bold; color: #6d4fe8; border-left: 4px solid #6d4fe8; padding-left: 10px; margin: 24px 0 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #6d4fe8; color: white; padding: 8px 10px; text-align: left; }
            td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
            tr:nth-child(even) td { background: #f9f7ff; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
            .badge-online  { background: #c6f6d5; color: #276749; }
            .badge-offline { background: #e2e8f0; color: #4a5568; }
            .badge-site    { background: #fed7d7; color: #9b2c2c; }
            .badge-ad      { background: #e9d8fd; color: #553c9a; }
            .empty { color: #999; font-style: italic; padding: 16px; text-align: center; }
            .footer { margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 12px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">🛡</div>
            <div class="header-text">
              <h1>ANTI-JUDOL</h1>
              <p>Laporan Monitoring & Pemblokiran Konten Judi</p>
            </div>
          </div>

          <div class="meta">
            <span><b>Tanggal:</b> ${tanggal}</span>
            <span><b>Jam:</b> ${jam}</span>
            <span><b>Dibuat oleh:</b> ${namaAdmin}</span>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="label">Active Devices</div>
              <div class="value">${stats.activeDevices}</div>
              <div class="label" style="margin-top:4px">Extensions terpasang</div>
            </div>
            <div class="stat-card">
              <div class="label">Total Blocked Hari Ini</div>
              <div class="value">${stats.totalBlocked}</div>
              <div class="label" style="margin-top:4px">Konten diblokir</div>
            </div>
            <div class="stat-card red">
              <div class="label">Violations</div>
              <div class="value">${stats.violations}</div>
              <div class="label" style="margin-top:4px">Percobaan akses</div>
            </div>
          </div>

          <div class="section-title">Daftar Perangkat Terdaftar</div>
          <table>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Location</th>
                <th>Status</th>
                <th>Versi</th>
                <th>Blocked Hari Ini</th>
                <th>Terakhir Online</th>
              </tr>
            </thead>
            <tbody>
              ${
                devices.length === 0
                  ? `<tr><td colspan="6" class="empty">Belum ada perangkat terdaftar</td></tr>`
                  : devices
                      .map(
                        (d: any) => `
                  <tr>
                    <td>${d.deviceName || d.deviceId}</td>
                    <td>${d.location || "-"}</td>
                    <td><span class="badge badge-${d.status}">${d.status}</span></td>
                    <td>${d.extensionVersion || "-"}</td>
                    <td>${d.blockedToday || 0}</td>
                    <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString("id-ID") : "-"}</td>
                  </tr>`,
                      )
                      .join("")
              }
            </tbody>
          </table>

          <div class="section-title">Log Konten yang Diblokir (50 Terbaru)</div>
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Device</th>
                <th>Tipe</th>
                <th>Kategori</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              ${
                logs.length === 0
                  ? `<tr><td colspan="5" class="empty">Belum ada log pemblokiran</td></tr>`
                  : logs
                      .map(
                        (l: any) => `
                  <tr>
                    <td>${new Date(l.timestamp).toLocaleString("id-ID")}</td>
                    <td>${l.deviceName || l.deviceId}</td>
                    <td><span class="badge badge-${l.type}">${l.type}</span></td>
                    <td>${l.category || "gambling"}</td>
                    <td style="max-width:200px;word-break:break-all">${l.url}</td>
                  </tr>`,
                      )
                      .join("")
              }
            </tbody>
          </table>

          <div class="footer">
            <span>ANTI-JUDOL — Sistem Monitoring Konten Judi Kampus</span>
            <span>Dicetak: ${tanggal} ${jam}</span>
          </div>
        </body>
        </html>
      `;

      // Buka di tab baru lalu trigger print/save as PDF
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast({
          title: "Error",
          description: "Pop-up diblokir browser. Izinkan pop-up dulu.",
          variant: "destructive",
        });
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };

      toast({
        title: "PDF siap!",
        description: 'Pilih "Save as PDF" di dialog print.',
      });
    } catch (err) {
      toast({
        title: "Gagal export",
        description: "Terjadi kesalahan saat membuat PDF.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">ANTI-JUDOL Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Campus Gambling Content Monitoring System
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {admin && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
                  <User className="h-4 w-4" />
                  <span>{admin.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {admin.role}
                  </Badge>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Memproses..." : "Export PDF"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Devices
              </CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeDevices}</div>
              <p className="text-xs text-muted-foreground">
                Extensions installed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Blocked
              </CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBlocked}</div>
              <p className="text-xs text-muted-foreground">
                Content items blocked today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Violations</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {stats.violations}
              </div>
              <p className="text-xs text-muted-foreground">Attempted access</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                System Status
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Badge variant="default" className="bg-green-500">
                Operational
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                All systems running
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="devices" className="space-y-4">
          <TabsList>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="logs">Blocked Content</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="alerts">Real-time Alerts</TabsTrigger>
          </TabsList>
          <TabsContent value="devices">
            <DeviceList devices={devices} loading={loading} />
          </TabsContent>
          <TabsContent value="logs">
            <BlockedContent logs={logs} loading={loading} />
          </TabsContent>
          <TabsContent value="statistics">
            <Statistics logs={logs} />
          </TabsContent>
          <TabsContent value="alerts">
            <RealtimeAlerts />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
