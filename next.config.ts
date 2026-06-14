import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
})

export default withSerwist({
  reactStrictMode: true,
  turbopack: {},
  webpack(config, { isServer }) {
    return config
  },
})
