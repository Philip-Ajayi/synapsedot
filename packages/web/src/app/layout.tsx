import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SynapseDOT | Cross-Runtime Interoperability Engine',
  description: 'Unifying Portaldot V3.0 Divided Runtimes (EVM & WASM)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#08090e] text-slate-100 antialiased selection:bg-[#e6007a] selection:text-white">
        {children}
      </body>
    </html>
  );
}
