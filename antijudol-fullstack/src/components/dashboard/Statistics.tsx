import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface LogItem {
  timestamp: string;
  type: 'site' | 'ad' | string;
}

interface StatisticsProps {
  logs: LogItem[];
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function Statistics({ logs }: StatisticsProps) {
  // ─── Daily blocked: 7 hari terakhir dari data log asli ───────────
  const dailyData = (() => {
    const days: { day: string; blocked: number }[] = [];
    const counts: Record<string, number> = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      counts[key] = 0;
      days.push({ day: DAY_LABELS[d.getDay()], blocked: 0 });
    }

    logs.forEach((log) => {
      const key = new Date(log.timestamp).toDateString();
      if (key in counts) counts[key]++;
    });

    let idx = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[idx].blocked = counts[d.toDateString()] || 0;
      idx++;
    }
    return days;
  })();

  // ─── Distribusi tipe konten dari data asli ───────────────────────
  const siteCount = logs.filter((l) => l.type === 'site').length;
  const adCount = logs.filter((l) => l.type === 'ad').length;
  const typeData = [
    { name: 'Situs Judi', value: siteCount, color: 'hsl(var(--destructive))' },
    { name: 'Iklan', value: adCount, color: 'hsl(var(--primary))' },
  ];

  const hasTypeData = siteCount + adCount > 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Konten Diblokir per Hari</CardTitle>
          <CardDescription>Jumlah item diblokir 7 hari terakhir</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" className="text-muted-foreground" />
              <YAxis allowDecimals={false} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <Bar dataKey="blocked" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribusi Jenis Konten</CardTitle>
          <CardDescription>Perbandingan situs judi vs iklan</CardDescription>
        </CardHeader>
        <CardContent>
          {hasTypeData ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Belum ada data pemblokiran
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
