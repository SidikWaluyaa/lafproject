import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import ClientLayout from "@/components/ClientLayout";

export const metadata = {
  title: "LAF Stock Management System",
  description: "High-performance real-time stock management system for LAF Project Official.",
  icons: {
    icon: '/logo.png'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" />
      </head>
      <body>
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
