import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Presentation, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Search,
  ExternalLink,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GoogleDoc {
  id: string;
  name: string;
  thumbnailLink?: string;
  modifiedTime: string;
}

interface GoogleIntegrationProps {
  onDocSelected: (text: string) => void;
  slides?: any[];
  deckTitle?: string;
}

export const GoogleIntegration: React.FC<GoogleIntegrationProps> = ({ onDocSelected, slides, deckTitle }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [docs, setDocs] = useState<GoogleDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  useEffect(() => {
    checkAuthStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsAuthenticated(true);
        // Small delay to ensure cookie is processed by the browser
        setTimeout(() => {
          fetchDocs();
        }, 1000);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      const data = await res.json();
      setIsAuthenticated(data.isAuthenticated);
      if (data.isAuthenticated) {
        fetchDocs();
      }
    } catch (err) {
      console.error('Auth check failed', err);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/google/url', { credentials: 'include' });
      const { url } = await res.json();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (err) {
      setError('Failed to get auth URL');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setIsAuthenticated(false);
    setDocs([]);
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/google/docs/list', { credentials: 'include' });
      const data = await res.json();
      
      if (res.status === 401) {
        setIsAuthenticated(false);
        throw new Error('Session expired. Please reconnect or try opening the app in a new tab.');
      }
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch docs');
      setDocs(data.files || []);
    } catch (err: any) {
      console.error('Fetch Docs Error:', err);
      setError(err.message || 'Could not load Google Docs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    await checkAuthStatus();
    fetchDocs();
  };

  const selectDoc = async (docId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/google/docs/content/${docId}`, { credentials: 'include' });
      const { text } = await res.json();
      onDocSelected(text);
    } catch (err) {
      setError('Failed to load document content');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToSlides = async () => {
    if (!slides || slides.length === 0) return;
    setIsExporting(true);
    setError(null);
    try {
      const res = await fetch('/api/google/slides/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides, title: deckTitle }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.url) {
        setExportUrl(data.url);
      } else {
        throw new Error('Export failed');
      }
    } catch (err) {
      setError('Failed to export to Google Slides');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="p-8 border border-[#E5E5E1] rounded-[32px] bg-white shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Presentation className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-serif italic">Google Workspace</h3>
            <p className="text-xs text-[#888888]">Import from Docs, Export to Slides</p>
          </div>
        </div>
        <button 
          onClick={handleConnect}
          className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
          Connect Google Account
        </button>
        <p className="mt-4 text-[10px] text-center text-[#888888]">
          Having trouble? Try opening this app in a <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">new tab</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Docs Browser */}
      {!slides && (
        <div className="p-8 border border-[#E5E5E1] rounded-[32px] bg-white shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-serif italic">Your Google Docs</h3>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleRefresh} 
                disabled={isLoading}
                className="text-[10px] font-bold uppercase text-blue-500 hover:text-blue-600 flex items-center gap-1 disabled:opacity-50"
              >
                <Loader2 className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={handleLogout} className="text-[10px] font-bold uppercase text-red-500 hover:text-red-600 flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Logout
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#888888]" />
              <p className="text-xs text-[#888888] font-bold uppercase tracking-widest">Scanning Drive...</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {docs.map(doc => (
                <button 
                  key={doc.id}
                  onClick={() => selectDoc(doc.id)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl border border-[#E5E5E1] hover:border-[#1A1A1A] hover:bg-[#FDFDFB] transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold truncate max-w-[200px]">{doc.name}</p>
                      <p className="text-[10px] text-[#888888]">Modified {new Date(doc.modifiedTime).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#E5E5E1] group-hover:text-[#1A1A1A] transition-colors" />
                </button>
              ))}
              {docs.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-[#888888]">No Google Docs found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Export to Slides */}
      {slides && slides.length > 0 && (
        <div className="p-8 border border-[#E5E5E1] rounded-[32px] bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Presentation className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-serif italic">Google Slides Export</h3>
          </div>

          {exportUrl ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-700 font-medium">Presentation created successfully!</p>
              </div>
              <a 
                href={exportUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3"
              >
                Open in Google Slides
                <ExternalLink className="w-4 h-4" />
              </a>
              <button 
                onClick={() => setExportUrl(null)}
                className="w-full text-[10px] font-bold uppercase text-[#888888] hover:text-[#1A1A1A]"
              >
                Export Again
              </button>
            </div>
          ) : (
            <button 
              onClick={exportToSlides}
              disabled={isExporting}
              className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Presentation...
                </>
              ) : (
                <>
                  <Presentation className="w-4 h-4" />
                  Export to Google Slides
                </>
              )}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};
