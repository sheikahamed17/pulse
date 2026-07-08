import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const _authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    // @ts-expect-error TS2322 better-auth 1.6.18 + @better-auth/passkey 1.6.23 incompatibility
    passkeyClient(),
  ],
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient = _authClient as any as ReturnType<typeof createAuthClient<{ plugins: [ReturnType<typeof magicLinkClient>] }>> & {
  passkey: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addPasskey(opts?: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listUserPasskeys(): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletePasskey(opts?: any): Promise<any>
  }
}
