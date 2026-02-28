"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen, Trash2, Clock, Loader2, Edit2, LogOut, Calendar, AlignLeft } from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (!token) return;
    fetchProjects();
  }, [token]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/projects", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setProjects(await res.json());
    } catch (e) {
      toast.error("Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  };

  const createProject = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const newProj = await res.json();
      router.push(`/project/${newProj.id}`);
    } catch (e) {
      toast.error("Could not create project");
    }
  };

  const deleteProject = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await fetch(`http://127.0.0.1:8000/api/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(projects.filter(p => p.id !== id));
      toast.success("Project deleted");
    } catch (err) {
      toast.error("Failed to delete project");
    }
  };

  const startEdit = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation();
    setEditingId(proj.id);
    setEditTitle(proj.title);
    setEditDescription(proj.description || "");
  };

  const saveEdit = async (e: React.MouseEvent | React.SyntheticEvent, id: number) => {
    e.stopPropagation();
    if (!editTitle.trim()) return setEditingId(null);

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/projects/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ title: editTitle, description: editDescription })
      });
      if (res.ok) {
        const updatedProj = await res.json();
        setProjects(projects.map(p => p.id === id ? updatedProj : p));
        toast.success("Project updated");
      }
    } catch (err) {
      toast.error("Failed to update project");
    }
    setEditingId(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-gray-200 p-10 relative overflow-hidden flex flex-col">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-6xl mx-auto flex justify-end items-center mb-8 relative z-10 gap-4">
        {user && (
          <button 
            onClick={() => router.push("/account")}
            className="flex items-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all px-4 py-2 rounded-full shadow-lg"
          >
            <img src={user.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full border border-white/20 bg-blue-500" />
            <span className="text-sm font-medium text-white">{user.username}</span>
          </button>
        )}
        <Button variant="ghost" size="icon" onClick={logout} className="hover:bg-red-500/20 text-gray-400 hover:text-red-400">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      <div className="max-w-6xl mx-auto w-full relative z-10 flex-1">
        <header className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-serif text-white tracking-tight flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-500" />
              Research Hub
            </h1>
            <p className="text-sm text-gray-400 mt-2">Manage your academic projects and knowledge graphs.</p>
          </div>
          <Button onClick={createProject} className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20">
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/5">
            <h3 className="text-xl font-serif text-white mb-2">No projects yet</h3>
            <p className="text-gray-400 text-sm mb-6">Initialize a new workspace to begin your research.</p>
            <Button onClick={createProject} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Create First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj) => (
              <div 
                key={proj.id} 
                onClick={() => { if (editingId !== proj.id) router.push(`/project/${proj.id}`); }}
                className="group p-6 rounded-2xl border border-white/10 bg-[#111113] hover:bg-white/5 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:border-blue-500/30 flex flex-col h-64 relative"
              >
                <div className="flex-1 overflow-hidden">
                  {editingId === proj.id ? (
                    <div className="flex flex-col gap-3 h-full pb-8" onClick={(e) => e.stopPropagation()}>
                      <input 
                        autoFocus
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="bg-black/50 border border-blue-500/50 rounded px-3 py-2 text-lg font-medium text-white w-full outline-none"
                        placeholder="Project Title"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-gray-300 w-full outline-none flex-1 resize-none"
                        placeholder="Add a brief description or tags..."
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>Cancel</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-500" onClick={(e) => saveEdit(e, proj.id)}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-1 pr-8">
                        {proj.title}
                      </h2>
                      <p className="text-sm text-gray-400 mt-3 line-clamp-3 leading-relaxed">
                        {proj.description || <span className="italic opacity-50">No description provided.</span>}
                      </p>
                    </>
                  )}
                </div>

                {editingId !== proj.id && (
                  <div className="pt-4 mt-4 border-t border-white/5 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Created</span>
                      <span>{new Date(proj.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Updated</span>
                      <span>{new Date(proj.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}

                {editingId !== proj.id && (
                  <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 bg-[#111113] pl-2 rounded-l-lg">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10" onClick={(e) => startEdit(e, proj)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-500/10" onClick={(e) => deleteProject(e, proj.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}