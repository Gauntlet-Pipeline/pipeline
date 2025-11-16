"use client";

import { usePathname } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatPreview } from "@/components/layout/chat-preview";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export function DashboardLayoutClient({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  // Show double-sided panel for create and history routes
  const showDoublePanel =
    pathname === "/dashboard/create" ||
    pathname.startsWith("/dashboard/history/");

  return (
    <SidebarInset className="flex-1">
      {showDoublePanel ? (
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={20} minSize={20}>
            <div className="m-2 flex h-full rounded-xl border">
              <ChatPreview />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={80} minSize={70}>
            <div className="flex h-full flex-col">{children}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full flex-col">{children}</div>
      )}
    </SidebarInset>
  );
}
