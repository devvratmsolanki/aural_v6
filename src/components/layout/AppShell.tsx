import { Topbar } from "./Topbar";
import { Player } from "../player/Player";
import { Outlet } from "react-router-dom";

export const AppShell = () => {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground antialiased overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          <Topbar />
          <div className="flex-1 overflow-y-auto px-4 md:px-10 pb-32 pt-6 md:pt-8">
            <Outlet />
          </div>
        </main>
      </div>
      <Player />
    </div>
  );
};
