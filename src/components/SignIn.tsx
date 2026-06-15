import React, { useState } from "react";
import { ArrowRight, Building2, Trash2, Mail, User } from "lucide-react";
import { getAllWorkspacesList, deleteWorkspaceFromDevice } from "../utils/storage";

const logoImg = "/src/assets/images/turnaround_logo_1781464067905.jpg";

interface SignInProps {
  onSignIn: (email: string, passwordText?: string, firstName?: string, isSignUp?: boolean) => void | Promise<void>;
}

export default function SignIn({ onSignIn }: SignInProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savedAccounts, setSavedAccounts] = useState<string[]>(() => getAllWorkspacesList());
  const [loading, setLoading] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please provide a valid email address.");
      return;
    }

    // Support entering email or simple workspace ID (e.g., lowercase alpha-numeric/periods/dashes)
    const sanitizedInput = email.trim().toLowerCase();
    
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      // Determine if it is a new local workspace or loading an existing one
      const isNewWorkspace = !savedAccounts.includes(sanitizedInput);
      
      await onSignIn(
        sanitizedInput,
        undefined,
        firstName.trim() || undefined,
        isNewWorkspace
      );
      
      setSuccessMessage(isNewWorkspace ? "New local workspace created! Setting up..." : "Workspace loaded successfully!");
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || String(err));
    }
  };

  const handleSelectSaved = async (savedEmail: string) => {
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      await onSignIn(savedEmail);
      setSuccessMessage("Accessing workspace...");
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || String(err));
    }
  };

  const autofillDemoWorkspace = () => {
    setEmail("manager@turnaround.cc");
    setFirstName("Jordan");
    setError("");
  };

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex flex-col items-center justify-center p-4 sm:p-6" id="signin-root">
      {/* Floating glowing background accents */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#131627] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative z-10 flex flex-col" id="signin-card">
        
        {/* Decorative Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-indigo-500 to-amber-500 animate-gradient-xy" />

        <div className="p-6 sm:p-8">
          {/* Logo block */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative group mb-3.5 shrink-0" id="signin-logo-container">
              <div className="absolute -inset-1.5 bg-gradient-to-tr from-amber-500 to-indigo-600 rounded-2xl blur opacity-45 group-hover:opacity-75 transition duration-500" />
              <img
                src={logoImg}
                alt="TurnAround Logo"
                referrerPolicy="no-referrer"
                className="relative w-14 h-14 rounded-2xl object-cover border border-white/10 shadow-xl transition-all duration-500 hover:scale-105"
                id="signin-logo-image"
              />
            </div>
            <h1 className="font-display text-2.5xl font-extrabold tracking-tight text-white mb-1.5" id="signin-title">
              TurnAround
            </h1>
            <p className="text-slate-450 text-xs max-w-xs leading-relaxed" id="signin-subtitle">
              Turn unhappy customers into your most loyal ones. Access your device-saved workspaces instantly.
            </p>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-3 text-red-300 text-xs mb-4 flex items-start gap-2.5 animate-fadeIn" id="signin-error">
              <span className="p-0.5 mt-0.5 rounded-full bg-red-500/20 text-red-400">✕</span>
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3 text-emerald-300 text-xs mb-4 flex items-center gap-2.5 animate-fadeIn" id="signin-success">
              <span className="p-0.5 rounded-full bg-emerald-500/20 text-emerald-400">✓</span>
              <p>{successMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" id="signin-form">
            
            <div className="space-y-1.5">
              <label htmlFor="email-input" className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  id="email-input"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@turnaround.cc"
                  className="w-full bg-[#1b1f38] border border-slate-700/60 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition duration-200"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="name-input" className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                Your Name (Optional)
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  id="name-input"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jordan"
                  className="w-full bg-[#1b1f38] border border-slate-700/60 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition duration-200"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={autofillDemoWorkspace}
                className="text-[10px] bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 px-2.5 py-1 rounded-md hover:bg-indigo-500/20 active:scale-95 transition cursor-pointer"
              >
                Autofill Demo Workspace
              </button>
            </div>

            <button
              type="submit"
              id="signin-submit-btn"
              disabled={loading}
              className={`w-full font-bold rounded-xl px-4 py-3.5 mt-3 flex items-center justify-center gap-2 transition duration-150 text-sm shadow-md cursor-pointer ${
                loading
                  ? "bg-amber-600/50 text-slate-400 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-600 active:translate-y-px text-slate-950 shadow-amber-500/10"
              }`}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mr-1" />
                  Entering Workspace...
                </>
              ) : (
                <>
                  Access Workspace
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Saved Accounts list matching lightweight partition instruction */}
          {savedAccounts.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800/80" id="signin-saved-containers">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
                  Saved Emails
                </h2>
                <div className="flex items-center gap-2">
                  {confirmClearAll ? (
                    <div className="flex items-center gap-1.5 font-mono text-[9px] bg-slate-900 border border-slate-800 p-1 rounded-lg shadow-inner" onClick={(e) => e.stopPropagation()}>
                      <span className="text-red-400 ml-1 font-semibold">Clear all?</span>
                      <button
                        type="button"
                        onClick={() => {
                          savedAccounts.forEach((savedEmail) => {
                            deleteWorkspaceFromDevice(savedEmail);
                          });
                          setSavedAccounts([]);
                          setConfirmClearAll(false);
                          setSuccessMessage("All local workspace accounts have been cleared successfully.");
                          setError("");
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white font-semibold px-2 py-0.5 rounded transition shadow-sm cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(false)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-350 px-2 py-0.5 rounded transition cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmClearAll(true);
                      }}
                      className="text-[9px] text-[#EF4444] hover:text-red-400 transition font-mono border border-red-500/20 bg-red-500/10 hover:bg-red-500/15 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                      id="clear-all-saved-accounts-btn"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>Clear All</span>
                    </button>
                  )}
                  <span className="text-[9px] bg-indigo-500/15 text-indigo-400 font-mono px-1.5 py-0.5 rounded">
                    Device Native
                  </span>
                </div>
              </div>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1" id="signin-saved-list">
                {savedAccounts.map((savedEmail) => (
                  <div
                    key={savedEmail}
                    onClick={() => handleSelectSaved(savedEmail)}
                    className="w-full bg-[#171a2e] hover:bg-[#1f233e] border border-slate-800 hover:border-slate-700/60 rounded-xl p-2.5 flex items-center justify-between text-left cursor-pointer group transition duration-150"
                    id={`saved-item-${savedEmail.replace(/[@.]/g, "-")}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-slate-300 truncate">
                          {savedEmail}
                        </p>
                        <span className="text-[9px] font-sans text-slate-500 block">
                          Tap to open workspace files
                        </span>
                      </div>
                    </div>
                    {confirmDeleteEmail === savedEmail ? (
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            deleteWorkspaceFromDevice(savedEmail);
                            setSavedAccounts(getAllWorkspacesList());
                            setConfirmDeleteEmail(null);
                          }}
                          className="bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white text-[10px] font-mono px-2 py-1 rounded border border-red-500/30 transition shadow-sm cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteEmail(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono px-2 py-1 rounded border border-slate-700 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteEmail(savedEmail);
                        }}
                        className="p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800/40 transition duration-150 cursor-pointer"
                        title="Remove Account"
                        id={`delete-saved-${savedEmail.replace(/[@.]/g, "-")}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Decorative footer */}
      <div className="flex items-center gap-1.5 text-slate-600 text-xs mt-6 font-mono text-center px-4" id="signin-footer-disclaimer">
        <span>TurnAround secure local workspace Created by Khaled Morsy</span>
      </div>
    </div>
  );
}
