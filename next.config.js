const isProd = process.env.NODE_ENV === 'production';

/**
 * TAURI_DEV_HOST is set when running on a physical device (tauri ios dev --host).
 * On simulator, it's unset — use relative assetPrefix so /_next/* stays same-origin.
 * On device, use the LAN IP so the device can reach the dev server.
 */
const internalHost = process.env.TAURI_DEV_HOST;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Next.js uses SSG instead of SSR
  // https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
  output: 'export',
  // Note: This feature is required to use the Next.js Image component in SSG mode.
  // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
  images: {
    unoptimized: true,
  },
  // Simulator: empty prefix  → /_next/* is same-origin inside Tauri WebView (no CORS)
  // Device:    absolute IP  → WebView fetches from Mac's LAN IP (cross-origin OK with --host)
  // Production: undefined  → Next.js uses its default
  assetPrefix: isProd ? undefined : (internalHost ? `http://${internalHost}:3000` : ''),
};

export default nextConfig;