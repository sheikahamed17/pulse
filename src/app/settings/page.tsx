'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Link href="/settings/categories">
        <Card className="hover:bg-accent transition">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Add, rename, archive your spend + income categories.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/settings/recurring">
        <Card className="hover:bg-accent transition">
          <CardHeader>
            <CardTitle>Recurring rules</CardTitle>
            <CardDescription>Manage scheduled spend + income (rent, salary, subscriptions).</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link href="/app" className="text-sm text-muted-foreground hover:underline">← Back to Pulse</Link>
    </main>
  )
}
