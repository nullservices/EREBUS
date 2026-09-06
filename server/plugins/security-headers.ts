/** Baseline security headers on every response. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.node.res.setHeader('X-Content-Type-Options', 'nosniff')
    event.node.res.setHeader('X-Frame-Options', 'DENY')
    event.node.res.setHeader('Referrer-Policy', 'no-referrer')
    event.node.res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  })
})
