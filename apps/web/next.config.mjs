/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // La cámara solo se usa en el escáner de credenciales del propio sitio.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Maqueta privada: que los buscadores no la indexen.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig = {
  transpilePackages: ["@insedu/domain", "@insedu/persistence"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // Carga masiva: archivos de hasta 4 MB (lib/bulk.ts); el valor por omisión es 1 MB.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
