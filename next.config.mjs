/** @type {import('next').NextConfig} */
const legacyRedirects = [
  ['game-one', 'x-devil'],
  ['game-two', 'gravity-flip'],
  ['game-three', 'liar-ui'],
  ['game-four', 'control-chaos'],
  ['game-five', 'invisible-path'],
  ['game-six', 'rhythm-betrayer'],
  ['game-seven', 'mirror-twins'],
  ['game-eight', 'one-screen-boss'],
  ['game-nine', 'shrinking-world'],
  ['game-ten', 'x-devil-finale'],
]

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    // Preserve the original placeholder routes so old links keep working.
    return legacyRedirects.map(([from, to]) => ({
      source: `/games/${from}`,
      destination: `/games/${to}`,
      permanent: false,
    }))
  },
}

export default nextConfig
