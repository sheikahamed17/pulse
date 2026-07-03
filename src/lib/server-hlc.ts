export function serverHlcFor(iso: string): string {
  const ms = new Date(iso).getTime().toString().padStart(16, '0')
  return `${ms}-000000-cron`
}
