"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Loader2, BookOpen, PenTool, Save, Download } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface WorkspaceProps {
  activeSessionId: string;
}

interface DocMeta {
  id: number;
  filename: string;
}

export function Workspace({ activeSessionId }: WorkspaceProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [isSaving, setIsSaving] = useState(false);


useEffect(() => {
    if (!activeSessionId) return;
    
    const loadWorkspace = async () => {
      setSelectedPdf(null); 
      setDocuments([]);

      try {
        const docRes = await fetch(`http://127.0.0.1:8000/api/sessions/${activeSessionId}/documents`);
        const docs = await docRes.json();
        setDocuments(docs);
      
        if (docs.length > 0) {
          setSelectedPdf(docs[0].filename);
        }

        const sessRes = await fetch(`http://127.0.0.1:8000/api/sessions`);
        const sessions = await sessRes.json();
        const current = sessions.find((s: any) => s.id.toString() === activeSessionId);
        if (current) setEditorText(current.notes || "");
      } catch (e) {
        console.error("Failed to load workspace data");
      }
    };
    loadWorkspace();
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || !editorText) return;

    const delayDebounceFn = setTimeout(async () => {
      setIsSaving(true);
      try {
        await fetch(`http://127.0.0.1:8000/api/sessions/${activeSessionId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: editorText }),
        });
      } catch (e) {
        console.error("Auto-save failed");
      } finally {
        setIsSaving(false);
      }
    }, 1000); 

    return () => clearTimeout(delayDebounceFn);
  }, [editorText, activeSessionId]);

  const downloadNotes = () => {
    const element = document.createElement("a");
    const file = new Blob([editorText], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `DeepCite_Notes_${activeSessionId}.md`;
    document.body.appendChild(element);
    element.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSessionId || !e.target.files?.[0]) return;
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("session_id", activeSessionId);

    setIsUploading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setDocuments(prev => [...prev, { id: Date.now(), filename: data.filename }]);
        setSelectedPdf(data.filename);
        toast.success("Document added to library");
      }
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-background relative overflow-hidden">
      {!activeSessionId && (
        <div className="absolute inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-background border shadow-2xl rounded-2xl p-6 flex flex-col items-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
            <h3 className="font-semibold">No Active Session</h3>
          </div>
        </div>
      )}

      <div className="w-1/2 flex flex-col border-r h-full bg-muted/5 min-w-0">
        <div className="h-[60px] border-b flex items-center justify-between px-4 bg-background shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-2 truncate pr-4">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Library
          </h2>
          <div className="relative">
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isUploading} />
            <Button variant="outline" size="sm" className="h-8">
              {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-2" />}
              Add PDF
            </Button>
          </div>
        </div>

        <div className="flex gap-2 p-2 border-b bg-muted/30 overflow-x-auto whitespace-nowrap">
          {documents.map((doc) => (
            <Button key={doc.id} variant={selectedPdf === doc.filename ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setSelectedPdf(doc.filename)}>
              {doc.filename}
            </Button>
          ))}
        </div>

        <div className="flex-1 bg-zinc-100">
          {selectedPdf ? (
            <iframe src={`http://127.0.0.1:8000/api/sessions/${activeSessionId}/pdf/${selectedPdf}`} className="w-full h-full border-none" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No PDF Selected</div>
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col h-full bg-background min-w-0">
        <div className="h-[60px] border-b flex items-center justify-between px-4 bg-background shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <PenTool className="w-4 h-4 text-muted-foreground" />
            Editor
            {isSaving && <span className="text-[10px] text-muted-foreground animate-pulse ml-2 font-normal">Saving...</span>}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={downloadNotes}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <textarea
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            className="flex-1 p-4 bg-[#1e1e1e] text-gray-300 font-mono text-xs outline-none resize-none"
            placeholder="Notes go here..."
          />
          <div className="flex-1 p-6 overflow-y-auto border-t">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {editorText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}