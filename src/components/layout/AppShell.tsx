import { Topbar } from "./Topbar";
import { Player } from "../player/Player";
import { Outlet } from "react-router-dom";
import { Suspense } from "react";

const PageFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
);

export const AppShell = () => {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground antialiased overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          <Topbar />
          <div className="flex-1 overflow-y-auto px-4 md:px-10 pb-32 pt-6 md:pt-8">
            {/* Per-page Suspense so lazy route bodies suspend HERE, inside the
                shell — the Topbar and persistent <Player/> footer stay mounted
                (no flash, no audio interruption) while a new page chunk loads. */}
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <Player />
    </div>
  );
};
