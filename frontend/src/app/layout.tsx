import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drift — Meet New People Around the World",
  description:
    "Anonymous one-to-one video and text chat with strangers. Real WebRTC, real matchmaking, no recordings.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23FF6A3D'/%3E%3Cpath d='M8 16a8 8 0 0 1 8-8 8 8 0 0 1 6.9 4' stroke='%230B1017' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3Cpath d='M24 16a8 8 0 0 1-8 8 8 8 0 0 1-6.9-4' stroke='%230B1017' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: "#070B10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: '(function(){try{var t=localStorage.getItem("drift-theme");if(t!=="light"&&t!=="dark"){t="dark";}document.documentElement.classList.toggle("dark",t==="dark");}catch(e){document.documentElement.classList.add("dark");}})();',
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-fog font-sans antialiased">{children}</body>
    </html>
  );
}
