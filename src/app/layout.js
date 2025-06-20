import "@/app/globals.css";
import { inter } from "@/app/ui/fonts";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased relative overflow-hidden`}>
        <div className="absolute inset-0 z-[-1000] bg-gradient-to-br from-[#8B5CF6] to-[#06B6D4] opacity-60 blur-3xl" />
        {children}
      </body>
    </html>
  );
}
