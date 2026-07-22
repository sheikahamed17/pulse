'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AuroraBackground } from '@/components/aurora-background'

export default function SettingsPage() {
  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/settings/categories">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Add, rename, archive your spend + income categories.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/projects">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Group your tasks; rename, color, and archive projects.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/recurring">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Recurring rules</CardTitle>
              <CardDescription>Manage scheduled spend + income (rent, salary, subscriptions).</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/security">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Passkeys (Face ID sign-in) and app PIN lock.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/preferences">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Primary currency, time zone, and other settings.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/insights">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Browse your weekly digests + generate this week on demand.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">← Back to Pulse</Link>
      </main>
    </>
  )
}
