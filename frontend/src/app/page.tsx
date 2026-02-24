import { ChatSidebar } from "@/components/domain/ChatSidebar";
import { Workspace } from "@/components/domain/Workspace";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function Home() {
  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        
        <ResizablePanel defaultSize={35} minSize={20}>
          <ChatSidebar />
        </ResizablePanel>

        <ResizableHandle withHandle className="w-1.5 bg-border hover:bg-primary/30 transition-colors" />

        <ResizablePanel defaultSize={65}>
          <Workspace />
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
}