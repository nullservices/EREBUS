/** Last line of defense: surface unexpected client errors in the console. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
    console.error('[erebus] vue error:', info, err)
  }
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[erebus] unhandled rejection:', event.reason)
  })
})
