import React from 'react';
import '@/styles/global.css';

export const metadata = {
  title: 'TemaCC Eventhub - VIP Etkinlik & Operasyon Platformu',
  description: 'Kurumsal VIP Etkinlik Operasyonları ve Kapı Giriş Kontrol Platformu',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
