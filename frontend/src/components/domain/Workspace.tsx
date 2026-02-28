"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  FileText, Loader2, BookOpen, PenTool, 
  Folder as FolderIcon, ChevronRight, ChevronDown, FolderPlus, FilePlus, ArrowLeft, Trash2, Edit2, Download 
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface WorkspaceProps {
  activeProjectId: string | null;
}
interface DocMeta {
  id: number;
  filename: string;
  folder_id: number | null;
}
interface FolderMeta {
  id: number;
  name: string;
  parent_id: number | null;
}

export function Workspace({ activeProjectId }: WorkspaceProps) {
  const { token } = useAuth();
  
  const [projectTitle, setProjectTitle] = useState<string>("Loading Workspace...");
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [editorText, setEditorText] = useState("");
  
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"Saving..." | "Saved" | "">("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorTextRef = useRef(editorText);
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | 'root' | null>(null);

  useEffect(() => {
    editorTextRef.current = editorText;
  }, [editorText]);

  useEffect(() => {
    if (!activeProjectId || !token) return;
    const loadWorkspace = async () => {
      setSelectedPdf(null);
      setDocuments([]);
      setFolders([]);
      setPdfBlobUrl(null);
      try {
        const docRes = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/documents`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (docRes.ok) {
          const docs = await docRes.json();
          setDocuments(docs);
        }

        const folderRes = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (folderRes.ok) setFolders(await folderRes.json());

        const projRes = await fetch(`http://127.0.0.1:8000/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (projRes.ok) {
          const projects = await projRes.json();
          const current = projects.find((p: any) => p.id.toString() === activeProjectId);
          if (current) {
            setEditorText(current.notes || "");
            setProjectTitle(current.title || "Untitled Project");
          }
        }
      } catch (e) {
        toast.error("Failed to load workspace data");
      }
    };
    loadWorkspace();
  }, [activeProjectId, token]);

  useEffect(() => {
    if (!activeProjectId || !selectedPdf || !token) return;
    let objectUrl: string;
    const fetchPdf = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/pdf/${selectedPdf}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setPdfBlobUrl(objectUrl);
        }
      } catch (e) {
        toast.error("PDF load error");
      }
    };
    fetchPdf();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeProjectId, selectedPdf, token]);

  useEffect(() => {
    if (!activeProjectId || !token || editorText === undefined) return;
    const delayDebounceFn = setTimeout(async () => {
      setSaveStatus("Saving...");
      try {
        await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ notes: editorText }),
        });
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000); 
      } catch (e) {
        setSaveStatus("");
      }
    }, 1000);
    return () => clearTimeout(delayDebounceFn);
  }, [editorText, activeProjectId, token]);

useEffect(() => {
    const handleAgentNotesUpdate = async () => {
      if (!activeProjectId || !token) return;
      try {
        const projRes = await fetch(`http://127.0.0.1:8000/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (projRes.ok) {
          const projects = await projRes.json();
          const current = projects.find((p: any) => p.id.toString() === activeProjectId);

          if (current && current.notes !== undefined && current.notes !== editorTextRef.current) {
            
            const newText = current.notes;
            const chunkSize = Math.max(1, Math.ceil(newText.length / 30)); 
            let currentLength = 0;
            
            setEditorText(""); 
            
            const interval = setInterval(() => {
              currentLength += chunkSize;
              if (currentLength >= newText.length) {
                setEditorText(newText); 
                clearInterval(interval);
                toast.success("Agent updated your notes!");
              } else {
                setEditorText(newText.substring(0, currentLength));
              }
            }, 30); 
          }
        }
      } catch (e) {
        console.error("Failed to sync notes from agent");
      }
    };

    window.addEventListener("notesUpdated", handleAgentNotesUpdate);
    return () => window.removeEventListener("notesUpdated", handleAgentNotesUpdate);
  }, [activeProjectId, token]);

  const triggerUpload = (folderId: number | null) => {
    setTargetFolderId(folderId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeProjectId || !e.target.files?.[0] || !token) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    if (targetFolderId) formData.append("folder_id", targetFolderId.toString());

    setIsUploading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/upload`, { 
        method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData 
      });
      const data = await res.json();
      if (data.success) {
        setDocuments(prev => [...prev, { id: data.id, filename: data.filename, folder_id: targetFolderId }]);
        setSelectedPdf(data.filename);
        
        if (targetFolderId) {
          setExpandedFolders(prev => new Set(prev).add(targetFolderId));
        }
        toast.success("Document added");
      }
    } finally {
      setIsUploading(false);
      setTargetFolderId(null); 
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  };

  const handleCreateFolder = async (parentId: number | null = null) => {
    const name = window.prompt("Enter new folder name:");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        const newFolder = await res.json();
        if (parentId) {
          await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders/${newFolder.id}/move`, {
            method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ parent_id: parentId })
          });
        }
        setFolders(prev => [...prev, { ...newFolder, parent_id: parentId }]);
        if (parentId) setExpandedFolders(prev => new Set(prev).add(parentId));
      }
    } catch (e) {
      toast.error("Failed to create folder");
    }
  };

  const handleRenameFolder = async (folderId: number, currentName: string) => {
    const newName = window.prompt("Rename folder:", currentName);
    if (!newName || !newName.trim() || newName === currentName) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
      }
    } catch (e) {
      toast.error("Failed to rename folder");
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (!confirm("Delete this folder? PDFs inside will be moved to the root library.")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders/${folderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== folderId));
        setDocuments(prev => prev.map(d => d.folder_id === folderId ? { ...d, folder_id: null } : d));
      }
    } catch (e) {
      toast.error("Failed to delete folder");
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!confirm("Permanently delete this file? This will wipe the vector database embeddings.")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/documents/${docId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
        if (selectedPdf === documents.find(d => d.id === docId)?.filename) setSelectedPdf(null);
        toast.success("File deleted");
      }
    } catch (e) { 
      toast.error("Failed to delete document"); 
    }
  };

  const handleMoveItem = async (type: "doc" | "folder", itemId: number, targetFolderId: number | null) => {
    try {
      if (type === "doc") {
        setDocuments(prev => prev.map(d => d.id === itemId ? { ...d, folder_id: targetFolderId } : d));
        await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/documents/${itemId}/move`, {
          method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ folder_id: targetFolderId })
        });
      } else if (type === "folder") {
        if (itemId === targetFolderId) return; 
        setFolders(prev => prev.map(f => f.id === itemId ? { ...f, parent_id: targetFolderId } : f));
        await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/folders/${itemId}/move`, {
          method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ parent_id: targetFolderId })
        });
      }
      if (targetFolderId) setExpandedFolders(prev => new Set(prev).add(targetFolderId));
    } catch (e) { 
      toast.error("Move failed"); 
    }
  };

  const toggleFolder = (id: number) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };
  
  const handleDownloadNotes = () => {
    if (!editorText) {
      toast.error("Notes are empty!");
      return;
    }
    const element = document.createElement("a");
    const file = new Blob([editorText], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `${projectTitle.replace(/\s+/g, '_')}_Notes.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const renderTree = (parentId: number | null, depth: number = 0) => {
    const childFolders = folders.filter(f => f.parent_id === parentId);
    const childDocs = documents.filter(d => d.folder_id === parentId);
    const paddingLeft = `${depth * 16 + 8}px`;

    return (
      <div className="flex flex-col gap-0.5">
        
        {childFolders.map(folder => (
          <div key={`folder-${folder.id}`} className="flex flex-col">
            <div 
              draggable
              onDragStart={(e) => { e.dataTransfer.setData("type", "folder"); e.dataTransfer.setData("id", folder.id.toString()); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverTarget(folder.id); }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation(); setDragOverTarget(null);
                const type = e.dataTransfer.getData("type") as "doc" | "folder";
                const id = e.dataTransfer.getData("id");
                if (id) handleMoveItem(type, parseInt(id), folder.id);
              }}
              className={`group flex items-center justify-between py-1.5 mx-2 rounded-md text-sm transition-all select-none ${
                dragOverTarget === folder.id ? 'bg-blue-500/20 border border-blue-500/50 text-blue-100' : 'hover:bg-white/5 text-gray-300 border border-transparent'
              }`}
              style={{ paddingLeft }}
            >
              <div className="flex items-center gap-1.5 cursor-pointer flex-1 overflow-hidden" onClick={() => toggleFolder(folder.id)}>
                {expandedFolders.has(folder.id) ? <ChevronDown className="w-4 h-4 shrink-0 opacity-70" /> : <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />}
                <FolderIcon className="w-4 h-4 text-blue-400 fill-blue-500/20 shrink-0" />
                <span className="truncate font-medium">{folder.name}</span>
              </div>
              
              <div className="hidden group-hover:flex items-center shrink-0 gap-0.5 pr-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-white hover:bg-white/10" onClick={(e) => { e.stopPropagation(); handleCreateFolder(folder.id); }}>
                  <FolderPlus className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-white hover:bg-white/10" onClick={(e) => { e.stopPropagation(); triggerUpload(folder.id); }}>
                  {isUploading && targetFolderId === folder.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FilePlus className="w-3 h-3" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10" onClick={(e) => { e.stopPropagation(); handleRenameFolder(folder.id, folder.name); }}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400/70 hover:text-red-400 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            
            {expandedFolders.has(folder.id) && renderTree(folder.id, depth + 1)}
          </div>
        ))}

        {childDocs.map(doc => (
          <div 
            key={`doc-${doc.id}`}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("type", "doc"); e.dataTransfer.setData("id", doc.id.toString()); }}
            className="group flex items-center justify-between py-1.5 mx-2 rounded-md cursor-grab active:cursor-grabbing text-sm transition-colors select-none hover:bg-white/5"
            style={{ paddingLeft: `${depth * 16 + 28}px` }}
          >
            <div className="flex items-center gap-2 flex-1 overflow-hidden" onClick={() => setSelectedPdf(doc.filename)}>
              <FileText className={`w-4 h-4 shrink-0 opacity-70 ${selectedPdf === doc.filename ? 'text-blue-400' : 'text-gray-400'}`} />
              <span className={`truncate ${selectedPdf === doc.filename ? 'text-blue-400 font-medium' : 'text-gray-300'}`}>{doc.filename}</span>
            </div>
            <div className="hidden group-hover:flex items-center shrink-0 pr-2">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400/70 hover:text-red-400 hover:bg-red-500/10" onClick={() => handleDeleteDocument(doc.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };


  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0c] text-gray-200 relative overflow-hidden">
      
      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      {activeProjectId && (
        <div className="h-[56px] border-b border-white/10 flex items-center px-6 bg-[#0a0a0c] shrink-0 z-10 shadow-sm">
          <h1 className="text-lg font-serif font-medium text-white tracking-tight">
            {projectTitle}
          </h1>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 relative">
        {!activeProjectId && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center">
            <div className="bg-[#111113] border border-white/10 shadow-2xl rounded-2xl p-8 flex flex-col items-center">
              <BookOpen className="w-12 h-12 text-blue-500 mb-4 opacity-80" />
              <h3 className="font-serif text-xl font-medium text-white">No Project Selected</h3>
              <p className="text-sm text-gray-400 mt-2">Create or select a project from the dashboard.</p>
            </div>
          </div>
        )}

        <ResizablePanelGroup orientation="horizontal" className="h-full w-full rounded-none border-none">
          
          <ResizablePanel defaultSize={50} minSize={25} className="flex flex-col h-full bg-[#0a0a0c] border-r border-white/10 min-w-0 overflow-hidden">
            
            {!selectedPdf ? (
              <div className="flex flex-col h-full w-full">
                
                <div className="h-[60px] border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-[#111113]">
                  <h2 className="text-sm font-semibold flex items-center gap-2 text-white overflow-hidden">
                    <FolderIcon className="w-4 h-4 text-blue-400 shrink-0" /> 
                    <span className="truncate">Library</span>
                  </h2>
                  <div className="flex items-center shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white shrink-0" onClick={() => handleCreateFolder(null)}>
                      <FolderPlus className="w-4 h-4 shrink-0" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white shrink-0" onClick={() => triggerUpload(null)}>
                      {isUploading && targetFolderId === null ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <FilePlus className="w-4 h-4 shrink-0" />}
                    </Button>
                  </div>
                </div>

                <div 
                  className={`flex-1 overflow-y-auto py-3 ${dragOverTarget === 'root' ? 'bg-white/5' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverTarget('root'); }}
                  onDragLeave={() => setDragOverTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverTarget(null);
                    const type = e.dataTransfer.getData("type") as "doc" | "folder";
                    const id = e.dataTransfer.getData("id");
                    if (id) handleMoveItem(type, parseInt(id), null);
                  }}
                >
                  
                  {renderTree(null, 0)}

                  {documents.length === 0 && folders.length === 0 && (
                    <div className="text-center text-xs text-gray-500 italic mt-10 pointer-events-none">
                      Upload a PDF to begin building your library.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full w-full bg-[#1a1a1c]">
                <div className="h-[60px] border-b border-white/10 flex items-center px-4 shrink-0 bg-[#111113] gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10 shrink-0" 
                    onClick={() => setSelectedPdf(null)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    <h2 className="text-sm font-semibold text-white truncate pr-4">{selectedPdf}</h2>
                  </div>
                </div>
                <div className="flex-1 relative min-h-0 overflow-hidden">
                  {pdfBlobUrl ? (
                    <iframe src={pdfBlobUrl} className="w-full h-full border-none shadow-2xl" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-white/5 hover:bg-purple-500/50 transition-colors border-0 w-[2px] cursor-col-resize z-50" />

          <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col h-full bg-[#0a0a0c] min-w-0 overflow-hidden">
            <div className="h-[60px] border-b border-white/10 flex items-center justify-between px-4 bg-[#111113] shrink-0">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-white truncate">
                <PenTool className="w-4 h-4 text-purple-400 shrink-0" /> 
                <span className="truncate">Co-Author Editor</span>
                {saveStatus === "Saving..." && <span className="text-[10px] text-blue-400 ml-2 animate-pulse font-normal tracking-widest uppercase">Saving...</span>}
                {saveStatus === "Saved" && <span className="text-[10px] text-green-400 ml-2 font-normal tracking-widest uppercase">Saved</span>}
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white shrink-0" onClick={handleDownloadNotes} title="Download as Markdown">
                <Download className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                className="flex-1 p-6 bg-transparent text-gray-300 font-mono text-sm outline-none resize-none leading-relaxed min-h-0 placeholder:opacity-30"
                placeholder="# Start drafting your paper here..."
              />
              <div className="h-[45%] p-6 overflow-y-auto border-t border-white/10 bg-[#111113] shrink-0">
                <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                  <ReactMarkdown 
                    remarkPlugins={[remarkMath, remarkGfm]} 
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto w-full my-4 rounded-lg border border-white/10 bg-black/20">
                          <table className="w-full text-sm text-left border-collapse" {...props} />
                        </div>
                      ),
                      th: ({node, ...props}) => <th className="px-4 py-2 font-semibold border-b border-white/10 whitespace-nowrap" {...props} />,
                      td: ({node, ...props}) => <td className="px-4 py-2 border-b border-white/5 whitespace-nowrap" {...props} />
                    }}
                  >
                    {editorText}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </ResizablePanel>

        </ResizablePanelGroup>
      </div>
    </div>
  );
}