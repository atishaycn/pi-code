import { ListTodoIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";

import { RoadmapDashboard } from "../components/RoadmapDashboard";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

function RoadmapRouteView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0" />
              <ListTodoIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Parity control center</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-5">
            <SidebarTrigger className="no-drag size-7 shrink-0" />
            <ListTodoIcon className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Parity control center
            </span>
          </div>
        )}

        <RoadmapDashboard />
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/roadmap")({
  component: RoadmapRouteView,
});
