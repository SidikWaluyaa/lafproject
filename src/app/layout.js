import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import ClientLayout from "@/components/ClientLayout";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export const metadata = {
  title: "LAF Stock Management System",
  description: "High-performance real-time stock management system for LAF Project Official.",
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LAF Project',
  },
};

export const viewport = {
  themeColor: '#FFB22C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
