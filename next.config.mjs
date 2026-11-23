/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite (Postgres en WebAssembly) solo se usa en local, sin DATABASE_URL
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};
export default nextConfig;
