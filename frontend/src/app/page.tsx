"use client";

import { useState } from "react";
import { ChatSidebar } from "@/components/domain/ChatSidebar";
import { Workspace } from "@/components/domain/Workspace";

export default function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background">
      
      {/* LEFT: The Chat & History - Locked to 45% width so it doesn't crush the workspace */}
      <div className="w-[45%] min-w-[400px] flex shrink-0 border-r">
        <ChatSidebar 
          activeSessionId={activeSessionId} 
          setActiveSessionId={setActiveSessionId} 
        />
      </div>

      {/* RIGHT: The PDF & Editor Workspace - Takes up all remaining space */}
      <div className="flex-1 flex flex-col min-w-0 bg-muted/5">
        <Workspace activeSessionId={activeSessionId} />
      </div>

    </main>
  );
}