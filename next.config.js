/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseDomain = supabaseUrl ? new URL(supabaseUrl).hostname : '';

const nextConfig = {
  images: {
    domains: supabaseDomain ? [supabaseDomain] : [],
  },
}

module.exports = nextConfig
