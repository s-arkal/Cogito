"use client";

import { useParams } from "next/navigation";
import { ChatSidebar } from "@/components/domain/ChatSidebar";
import { Workspace } from "@/components/domain/Workspace";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export default function ProjectWorkspace() {
  const params = useParams();
  const projectId = params?.id as string;

  if (!projectId) return null;

  return (
    <main className="h-screen w-full overflow-hidden bg-[#0a0a0c]">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        
        <ResizablePanel defaultSize={20} minSize={15} className="flex flex-col min-w-0">
          <ChatSidebar activeProjectId={projectId} />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-white/5 hover:bg-blue-500/50 transition-colors border-0" />

        <ResizablePanel defaultSize={80} className="flex flex-col min-w-0">
          <Workspace activeProjectId={projectId} />
        </ResizablePanel>
        
      </ResizablePanelGroup>
    </main>
  );
}