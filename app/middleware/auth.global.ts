export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/setup' || to.path === '/login') return

  const { request } = useApi()
  try {
    await request('/auth/me')
  } catch {
    try {
      const status = await request<{ firstRun: boolean }>('/status')
      return navigateTo(status.firstRun ? '/setup' : '/login', { replace: true })
    } catch {
      // Server unreachable — land on the login gate.
      return navigateTo('/login', { replace: true })
    }
  }
})
