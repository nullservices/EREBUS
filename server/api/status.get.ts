import { userCount } from '../utils/auth'

/** Public bootstrap endpoint: tells the client whether first-run setup is needed. */
export default defineEventHandler(() => {
  const config = useRuntimeConfig()
  return {
    firstRun: userCount() === 0,
    version: config.public.version,
  }
})
