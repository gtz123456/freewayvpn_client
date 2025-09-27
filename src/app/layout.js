import "@/app/globals.css";
import { inter } from "@/app/ui/fonts";
import { I18nProvider } from "@/app/i18n";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <I18nProvider>
        <body className={`${inter.className} antialiased relative overflow-hidden`}>
          <div
            className="
              absolute inset-0 z-[-1000] 
              bg-gradient-to-br from-[#8B5CF6] to-[#06B6D4] 
              dark:from-[#4568DC] dark:to-[#B06AB3] 
              opacity-90 blur-3xl
            "
          />

          {children}
        </body>
      </I18nProvider>
    </html>
  );
}
