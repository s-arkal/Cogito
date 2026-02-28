"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AccountPage() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);

  if (!user) return null;

  const handleUpdateProfile = async () => {
    setIsSavingProfile(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        toast.success("Profile updated! Please refresh to see changes globally.");
      } else {
        const data = await res.json();
        toast.error(data.detail || "Failed to update profile");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) return toast.error("Fill in all password fields");
    setIsSavingPassword(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      if (res.ok) {
        toast.success("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
      } else {
        const data = await res.json();
        toast.error(data.detail || "Failed to update password");
      }
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you absolute sure? This will delete ALL your projects, PDFs, and notes permanently.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/users/me", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Account deleted permanently");
        logout();
      } else {
        toast.error("Failed to delete account");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-gray-200 p-10 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto relative z-10">
        <header className="flex items-center gap-4 mb-12 border-b border-white/10 pb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="hover:bg-white/10 shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Button>
          <div>
            <h1 className="text-3xl font-serif text-white tracking-tight flex items-center gap-3">
              Account Settings
            </h1>
            <p className="text-sm text-gray-400 mt-2">Manage your profile, security, and data.</p>
          </div>
        </header>

        <div className="space-y-8">
          <section className="p-6 rounded-2xl border border-white/10 bg-[#111113] shadow-lg flex flex-col md:flex-row gap-8 items-start">
            <div className="shrink-0 flex flex-col items-center gap-2">
              <img src={user.avatar_url} alt="Avatar" className="w-24 h-24 rounded-full border-2 border-white/10 bg-blue-500 shadow-xl" />
              <span className="text-xs text-gray-500 font-mono">{user.email}</span>
            </div>
            <div className="flex-1 space-y-4 w-full">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" /> Public Profile
              </h2>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 transition-all"
                />
              </div>
              <Button onClick={handleUpdateProfile} disabled={isSavingProfile || username === user.username} className="bg-blue-600 hover:bg-blue-500 text-white">
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </section>

          <section className="p-6 rounded-2xl border border-white/10 bg-[#111113] shadow-lg space-y-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" /> Security
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-200 outline-none focus:border-green-500/50 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-200 outline-none focus:border-green-500/50 transition-all"
                />
              </div>
            </div>
            <Button onClick={handleUpdatePassword} disabled={isSavingPassword || !currentPassword || !newPassword} className="bg-white/10 hover:bg-white/20 text-white">
              {isSavingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
            </Button>
          </section>

          <section className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 shadow-lg space-y-4">
            <h2 className="text-lg font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Danger Zone
            </h2>
            <p className="text-sm text-red-400/80">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <Button onClick={handleDeleteAccount} disabled={isDeleting} variant="destructive" className="bg-red-600 hover:bg-red-500 text-white">
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Account
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}