"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css"; 

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, UploadCloud, FileText } from "lucide-react"; 

export function Workspace() {
  const [docCode, setDocCode] = useState(
    "### Introduction to DeepCite\n\nDeepCite allows you to mix standard text with **LaTeX** equations seamlessly.\n\n#### The Schrodinger Equation\n\n$$ i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r},t) = \\left[ \\frac{-\\hbar^2}{2m}\\nabla^2 + V(\\mathbf{r},t) \\right] \\Psi(\\mathbf{r},t) $$\n\nYou can also write inline math like $E = mc^2$ without breaking the paragraph."
  );

  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); 
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setUploadedFile(data.filename);
      
        const fileUrl = URL.createObjectURL(file);
        setPdfUrl(fileUrl);
      } else {
        alert("Failed to read PDF. Make sure it is a valid document and not an HTML link: " + data.error);
      }
    } catch (error) {
      alert("Network error uploading PDF.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">

      <input 
        type="file" 
        accept="application/pdf" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
      />
      
      <div className="p-4 border-b flex justify-between items-center bg-background shadow-sm z-10">
        <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <span className="animate-pulse">Uploading...</span>
            ) : (
              <><UploadCloud className="w-4 h-4" /> Upload PDF</>
            )}
          </Button>
          <Button size="sm" className="gap-2">
            <FileDown className="w-4 h-4" /> Export Document
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <Tabs defaultValue="editor" className="w-full h-full flex flex-col">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="editor">Math & Text Editor</TabsTrigger>
            <TabsTrigger value="research">Research Report</TabsTrigger>
            <TabsTrigger value="pdf">PDF Viewer</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="flex-1 mt-4 flex gap-4 h-full overflow-hidden">
            <div className="flex-1 flex flex-col border rounded-md overflow-hidden bg-muted/10">
              <div className="bg-muted p-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Source Code
              </div>
              <Textarea 
                value={docCode}
                onChange={(e) => setDocCode(e.target.value)}
                className="flex-1 font-mono text-sm resize-none border-0 focus-visible:ring-0 p-4 rounded-none bg-transparent"
                placeholder="Type your markdown and LaTeX math here..."
              />
            </div>
            
            <div className="flex-1 flex flex-col border rounded-md overflow-hidden bg-background shadow-inner">
              <div className="bg-muted p-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Live Preview
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                  >
                    {docCode}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="research" className="flex-1 mt-4 border rounded-md bg-card overflow-hidden">
            <ScrollArea className="h-full p-6 prose dark:prose-invert max-w-none">
              <h3>Comparative Analysis Report</h3>
              <p className="text-muted-foreground text-sm mb-4">Generated by DeepCite Research Agent</p>
              <p>This space will hold your structured multi-document comparisons later.</p>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="pdf" className="flex-1 mt-4 border rounded-md bg-muted/20 flex flex-col overflow-hidden">
            {pdfUrl ? (
              <div className="flex flex-col h-full w-full">
                <div className="bg-muted p-2 border-b flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground tracking-wider truncate max-w-[70%]" title={uploadedFile || ""}>
                    {uploadedFile}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => { setPdfUrl(null); setUploadedFile(null); }} 
                    className="h-6 text-xs px-2"
                  >
                    Close PDF
                  </Button>
                </div>
                <iframe src={pdfUrl} className="w-full flex-1 border-0" title="PDF Viewer" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground p-4">
                <FileText className="w-12 h-12 mx-auto opacity-30 mb-4" />
                <p>No PDF uploaded yet.</p>
                <Button variant="link" onClick={() => fileInputRef.current?.click()}>
                  Select a file from your computer
                </Button>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}