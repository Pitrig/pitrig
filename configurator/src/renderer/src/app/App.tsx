import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { AppInfo } from '../../../shared/ipc'

export function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.simcore.getAppInfo().then(setAppInfo)
  }, [])

  return (
    <div className="grid min-h-screen grid-rows-[3.5rem_1fr_2.5rem] bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-5">
        <div>
          <h1 className="text-sm font-semibold">SimCore Configurator</h1>
          <p className="text-xs text-muted-foreground">Desktop configuration workspace</p>
        </div>
        <Badge variant="outline">Device disconnected</Badge>
      </header>

      <main className="grid min-h-0 grid-cols-[14rem_minmax(0,1fr)_18rem]">
        <aside className="border-r p-3">
          <Card>
            <CardHeader>
              <CardTitle>Components</CardTitle>
              <CardDescription>Available widgets will appear here.</CardDescription>
            </CardHeader>
          </Card>
        </aside>

        <section className="flex min-w-0 items-center justify-center bg-muted/30 p-6">
          <Card className="w-full max-w-2xl border-dashed bg-background/70">
            <CardHeader className="text-center">
              <CardTitle>Display editor</CardTitle>
              <CardDescription>
                The application foundation is ready. Editor behavior is intentionally not part of this phase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video rounded-md border bg-black" />
            </CardContent>
          </Card>
        </section>

        <aside className="border-l p-3">
          <Card>
            <CardHeader>
              <CardTitle>Properties</CardTitle>
              <CardDescription>Select an editor element to inspect it.</CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </main>

      <footer className="flex items-center justify-between border-t px-5 text-xs text-muted-foreground">
        <span>Application ready</span>
        <span>{appInfo ? `${appInfo.name} ${appInfo.version}` : 'Loading application info…'}</span>
      </footer>
    </div>
  )
}
