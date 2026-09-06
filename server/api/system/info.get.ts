import { getDataDir } from '../../db'
import { requireUser } from '../../utils/auth'
import type { SystemInfo } from '../../../shared/types'

export default defineEventHandler((event): SystemInfo => {
  requireUser(event)
  const config = useRuntimeConfig()
  return {
    version: config.public.version,
    dataDir: getDataDir(),
    host: config.host,
    port: Number(config.port),
  }
})
