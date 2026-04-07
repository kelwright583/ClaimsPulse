import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy routes → new pillar-based paths
      { source: '/dashboard',           destination: '/claims',                    permanent: false },
      { source: '/sla',                 destination: '/claims/sla',                permanent: false },
      { source: '/delta',               destination: '/claims/delta',              permanent: false },
      { source: '/productivity',        destination: '/claims/productivity',       permanent: false },
      { source: '/integrity',           destination: '/claims/integrity',          permanent: false },
      { source: '/workbenches/tp',      destination: '/claims/workbenches/tp',     permanent: false },
      { source: '/workbenches/salvage', destination: '/claims/workbenches/salvage',permanent: false },
      { source: '/financial',           destination: '/finance',                   permanent: false },
      { source: '/settings',            destination: '/settings/general',          permanent: false },
      // /claims was the old register — now it's the pillar landing, register is at /claims/register
      // Old bookmarks to /claims will land on the pillar landing which is correct
    ];
  },
};

export default nextConfig;
