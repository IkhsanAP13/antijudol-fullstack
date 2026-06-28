import { Link } from 'react-router-dom';
import { Shield, Monitor, Activity, BarChart3, Lock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Hero Section */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">ANTI-JUDOL</span>
            </div>
            <Link to="/dashboard">
              <Button>
                <Monitor className="mr-2 h-4 w-4" />
                Admin Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Shield className="h-4 w-4" />
              Campus Security System
            </div>
            <h1 className="mb-6 text-5xl font-bold tracking-tight">
              Sistem Monitoring & Pemblokiran Konten Judi
            </h1>
            <p className="mb-8 text-xl text-muted-foreground">
              Melindungi lingkungan kampus dari konten perjudian dengan monitoring terpusat, 
              pemblokiran otomatis, dan analitik real-time untuk administrator.
            </p>
            <div className="flex gap-4 justify-center">
              <Link to="/dashboard">
                <Button size="lg" className="gap-2">
                  <Activity className="h-5 w-5" />
                  Lihat Dashboard
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                <Shield className="mr-2 h-5 w-5" />
                Download Extension
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Fitur Utama</h2>
            <p className="text-muted-foreground">
              Sistem komprehensif untuk melindungi mahasiswa dari konten perjudian
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Shield className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Auto-Block Situs Judi</CardTitle>
                <CardDescription>
                  Memblokir otomatis situs gambling berdasarkan database domain yang selalu diperbarui
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Lock className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Blokir Iklan Gambling</CardTitle>
                <CardDescription>
                  Deteksi dan sembunyikan iklan perjudian secara otomatis di semua website
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Monitor className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Monitoring Terpusat</CardTitle>
                <CardDescription>
                  Dashboard admin untuk memantau semua komputer kampus yang terinstal extension
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <Activity className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Real-time Alerts</CardTitle>
                <CardDescription>
                  Notifikasi langsung ke admin ketika terdeteksi aktivitas mencurigakan
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <BarChart3 className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Statistik & Laporan</CardTitle>
                <CardDescription>
                  Analitik lengkap dengan grafik, timeline, dan export laporan untuk dokumentasi
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <CheckCircle2 className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Tamper Protection</CardTitle>
                <CardDescription>
                  Extension dilindungi dari modifikasi dan tidak bisa dinonaktifkan oleh mahasiswa
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-primary text-primary-foreground py-20">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-5xl font-bold mb-2">100%</div>
                <div className="text-primary-foreground/80">Proteksi Otomatis</div>
              </div>
              <div>
                <div className="text-5xl font-bold mb-2">24/7</div>
                <div className="text-primary-foreground/80">Monitoring Real-time</div>
              </div>
              <div>
                <div className="text-5xl font-bold mb-2">∞</div>
                <div className="text-primary-foreground/80">Device Support</div>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section className="container mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Cara Kerja</h2>
            <p className="text-muted-foreground">
              Sistem bekerja secara otomatis di background untuk melindungi kampus
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Install Extension</h3>
                <p className="text-muted-foreground">
                  Admin menginstall Chrome extension di semua komputer lab kampus melalui Group Policy atau manual
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Auto Registration</h3>
                <p className="text-muted-foreground">
                  Extension otomatis mendaftarkan device ke server dan mulai melakukan monitoring
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Real-time Protection</h3>
                <p className="text-muted-foreground">
                  Sistem memblokir situs gambling dan iklan, sambil mengirim log ke dashboard admin
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Monitor & Analyze</h3>
                <p className="text-muted-foreground">
                  Admin memantau semua aktivitas melalui dashboard dengan statistik dan alert real-time
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-20">
          <Card className="border-2 border-primary bg-primary/5">
            <CardContent className="p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Siap Melindungi Kampus Anda?</h2>
              <p className="text-muted-foreground mb-8 text-lg">
                Hubungkan backend API Anda dan mulai monitoring seluruh komputer kampus
              </p>
              <div className="flex gap-4 justify-center">
                <Link to="/dashboard">
                  <Button size="lg">
                    <Monitor className="mr-2 h-5 w-5" />
                    Akses Dashboard
                  </Button>
                </Link>
                <Button size="lg" variant="outline">
                  Lihat Dokumentasi
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">ANTI-JUDOL</span>
          </div>
          <p className="text-sm">
            Sistem Monitoring & Pemblokiran Konten Judi untuk Kampus
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
