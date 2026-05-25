import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Sparkles, Send, Menu, X, Plus, LogOut, Info, BookOpen, Trash2, Edit2, Check, ArrowLeft, Settings } from 'lucide-react';
import { ChatSession, ChatMessage } from '../types';
import MockTest from './MockTest';

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [groqKey, setGroqKey] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [viewMode, setViewMode] = useState<'chat'|'mock'>('chat');
  
  // Chat Editing
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch uploaded files context to let AI know what files exist
  const [fileContext, setFileContext] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
      if (user?.id) setUserId(user.id);
    });

    const key = import.meta.env.VITE_GROQ_API_KEY || localStorage.getItem('groq_key') || '';
    setGroqKey(key);

    const savedChats = JSON.parse(localStorage.getItem('kc_chats') || '[]');
    setChats(savedChats);
    if (savedChats.length > 0) {
      setCurrentChatId(savedChats[0].id);
    } else {
      createNewChat();
    }

    // Load available files context
    const fetchBuckets = async () => {
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (buckets) {
          let ctx = '';
          for (const b of buckets) {
            const { data: files } = await supabase.storage.from(b.name).list();
            if (files && files.length > 0) {
              const names = files.filter(f => !f.name.startsWith('.')).map(f => f.name);
              ctx += `Bucket [${b.name}]: ` + names.join(', ') + '. ';
            }
          }
          setFileContext(ctx);
        }
      } catch(e) {}
    };
    fetchBuckets();
  }, []);

  const createNewChat = () => {
    const newChat: ChatSession = {
      id: 'kc_' + Date.now(),
      title: 'Nayi baat',
      created: Date.now(),
      messages: []
    };
    const updatedChats = [newChat, ...chats].slice(0, 50);
    setChats(updatedChats);
    setCurrentChatId(newChat.id);
    localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
    setIsMobileMenuOpen(false);
    setViewMode('chat');
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);
    localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
    if(currentChatId === id) {
      if(updatedChats.length > 0) setCurrentChatId(updatedChats[0].id);
      else createNewChat();
    }
    
    // Delete from Supabase as requested
    if (userId) {
       supabase.from('chats').delete().eq('user_id', userId).eq('session_id', id).then();
    }
  };

  const startEditTitle = (e: React.MouseEvent, chat: ChatSession) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const saveTitle = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) return;
    const updatedChats = chats.map(c => c.id === id ? { ...c, title: editTitle } : c);
    setChats(updatedChats);
    localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
    setEditingChatId(null);
  };

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, viewMode]);

  const saveKey = () => {
    const k = (document.getElementById('key-input') as HTMLInputElement).value.trim();
    if (k) {
      localStorage.setItem('groq_key', k);
      setGroqKey(k);
    }
    setShowKeyModal(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    
    // API key check removed, relies on VITE_GROQ_API_KEY from env
    const text = inputValue.trim();
    setInputValue('');
    setIsTyping(true);

    const newUserMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() };
    
    let updatedChats = [...chats];
    let chatIndex = updatedChats.findIndex(c => c.id === currentChatId);
    
    if (chatIndex !== -1) {
      updatedChats[chatIndex].messages.push(newUserMsg);
      if (updatedChats[chatIndex].messages.length === 1 && updatedChats[chatIndex].title === 'Nayi baat') {
        updatedChats[chatIndex].title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
      }
      setChats(updatedChats);
      localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
    }

    try {
      const systemPrompt = `You are a helpful AI study buddy helping a student prepare for AIIMS B.Sc Nursing. 
Your name is "AIIMS Buddy". Reply concisely. Answer in the same language the student uses (English, Hindi, or Hinglish).
If the user asks questions, provide accurate explanations.

Available PDF Study Materials uploaded by the user:
${fileContext || 'No files uploaded yet.'}
(Use this context if they ask what files are available, but do not unnecessarily mention that you can see these files unless asked.)`;
      const history = (updatedChats[chatIndex]?.messages || []).slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, ...history],
          temperature: 0.6,
        })
      });

      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      const aiText = data.choices?.[0]?.message?.content || 'Sorry, ek error ho gaya.';

      if (userId) {
        supabase.from('chats').insert({ user_id: userId, role: 'assistant', content: aiText }).then();
      }

      const newAIMsg: ChatMessage = { role: 'assistant', content: aiText, ts: Date.now() };
      
      updatedChats = [...chats];
      chatIndex = updatedChats.findIndex(c => c.id === currentChatId);
      if (chatIndex !== -1) {
        updatedChats[chatIndex].messages.push(newAIMsg);
        setChats(updatedChats);
        localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
      }
    } catch (err: any) {
      console.error(err);
      const newAIMsg: ChatMessage = { role: 'assistant', content: `Error: ${err?.message || 'API connection failed'}. Please check your API key configured in env or settings.`, ts: Date.now() };
      updatedChats = [...chats];
      chatIndex = updatedChats.findIndex(c => c.id === currentChatId);
      if (chatIndex !== -1) {
        updatedChats[chatIndex].messages.push(newAIMsg);
        setChats(updatedChats);
        localStorage.setItem('kc_chats', JSON.stringify(updatedChats));
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickAction = (text: string) => {
    setInputValue(text + ": ");
  };

  if (viewMode === 'mock') {
    return (
      <div className="flex h-[100dvh] w-full bg-[#050208]">
        {/* We can optionally keep the sidebar visible on desktop, or just replace entire view. The user wanted to "add this UI to it", so let's keep the desktop sidebar */}
        <aside className="hidden md:flex w-[300px] shrink-0 glass bg-black/40 border-r border-white/10 flex-col h-full">
            <div className="p-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                    <h2 className="font-semibold leading-none">AIIMS Buddy</h2>
                    <p className="text-[11px] text-violet-300/70 mt-1">Mock Test Mode</p>
                    </div>
                </div>
                <button onClick={() => setViewMode('chat')} className="mt-4 w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-500 border border-transparent text-white text-[14px] flex items-center justify-center gap-2 transition">
                     <ArrowLeft className="w-4 h-4" /> Back to Chat
                </button>
            </div>
            
            <div className="p-4 space-y-4 text-white/50 text-sm">
                <p>Mock test section automatically uses Supabase NCERT Database.</p>
                <p>Make sure you have PDFs mapped in your Supabase storage.</p>
            </div>
        </aside>

        <main className="flex-1 overflow-hidden relative border-l border-[#1f2f3d]">
            <MockTest groqKey={groqKey} onClose={() => setViewMode('chat')} />
        </main>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex bg-[#050208] text-white overflow-hidden relative z-10 w-full">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[300px] shrink-0 glass bg-black/40 border-r border-white/10 flex-col h-full relative z-30">
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold leading-none">Kanchan</h2>
              <p className="text-[11px] text-violet-300/70 mt-1">Chat Mode</p>
            </div>
          </div>
          <button onClick={() => setViewMode('mock')} className="mt-4 w-full h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 hover:opacity-90 border border-transparent text-[14px] flex items-center justify-center gap-2 transition font-medium">
            <BookOpen className="w-4 h-4" /> Take Mock Test
          </button>
          
          <button onClick={createNewChat} className="mt-3 w-full h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[14px] flex items-center justify-center gap-2 transition">
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {chats.map(c => (
            <div
              key={c.id}
              onClick={() => setCurrentChatId(c.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition flex items-center justify-between group cursor-pointer ${c.id === currentChatId ? 'bg-white/10' : ''}`}
            >
              {editingChatId === c.id ? (
                 <form onSubmit={e => saveTitle(e, c.id)} onClick={e => e.stopPropagation()} className="flex items-center gap-2 w-full">
                    <input 
                       autoFocus
                       className="flex-1 bg-black/50 border border-violet-500 rounded px-2 py-1 text-sm outline-none text-white shadow-lg"
                       value={editTitle}
                       onChange={e => setEditTitle(e.target.value)}
                    />
                    <button type="submit" className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded transition"><Check className="w-4 h-4" /></button>
                 </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate">{c.title}</p>
                    <p className="text-[11px] text-white/40">{new Date(c.created).toLocaleDateString()}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                     <button type="button" aria-label="Edit" onClick={(e) => startEditTitle(e, c)} className="p-2 text-white/40 hover:text-white transition relative z-20"><Edit2 className="w-4 h-4" /></button>
                     <button type="button" aria-label="Delete" onClick={(e) => deleteChat(e, c.id)} className="p-2 text-white/40 hover:text-red-400 transition relative z-20"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/30 flex items-center justify-center text-[12px] font-medium text-violet-200">
              {userEmail.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-[13px] truncate leading-tight text-white/90">{userEmail}</p>
              <p className="text-[11px] text-white/40">Student</p>
            </div>
            <button onClick={() => setShowKeyModal(true)} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-red-400 transition" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative z-20 min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 glass bg-black/30">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-white/70">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('mock')} className="p-2 text-emerald-400 bg-white/5 rounded-lg border border-white/10">
                <BookOpen className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-violet-300" />
                </div>
                <h2 className="text-[26px] font-semibold mb-2">Hello there! 👋</h2>
                <p className="text-white/60 max-w-md mx-auto font-sans text-[15px]">Ready for AIIMS B.Sc Nursing? I'm your AI tutor. Ask me anything from NCERT or past year papers! 😊</p>
              </div>
            ) : (
              <div className="space-y-6 pb-20">
                {messages.map((m, i) => (
                  <div key={i} className={`msg-in flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4 text-violet-300" />
                      </div>
                    )}
                    <div className={`max-w-[85%] md:max-w-[80%] px-4 py-3 ${
                      m.role === 'user' 
                        ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-[20px] rounded-br-[6px] shadow-lg shadow-violet-900/20' 
                        : 'bg-white/[0.04] border border-white/10 rounded-[20px] rounded-bl-[6px]'
                    }`}>
                      <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="msg-in flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-violet-300" />
                    </div>
                    <div className="max-w-[80%] bg-white/[0.04] border border-white/10 rounded-[20px] rounded-bl-[6px] px-4 py-3 flex items-center gap-1">
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Action Panel */}
        <div className="shrink-0 px-4 pb-6 md:pb-8 pt-2 max-w-3xl mx-auto w-full bg-[#050208]/80 backdrop-blur-md z-30">
          {messages.length === 0 && (
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
              <button 
                onClick={() => handleQuickAction("Explain this topic simply at a 10th-grade level")}
                className="shrink-0 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[13px] text-white/80 transition whitespace-nowrap"
              >✨ Simple Explain</button>
              <button 
                onClick={() => handleQuickAction("Create 5 NCERT-based MCQs on this topic")}
                className="shrink-0 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[13px] text-white/80 transition whitespace-nowrap"
              >📝 Create Quiz</button>
              <button 
                onClick={() => handleQuickAction("Create short revision notes in bullet points")}
                className="shrink-0 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[13px] text-white/80 transition whitespace-nowrap"
              >📚 Revision Notes</button>
            </div>
          )}

          <div className="relative glass bg-white/[0.05] border border-white/15 rounded-[24px] shadow-2xl shadow-black/30">
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Ask anything..."
              className="w-full bg-transparent outline-none resize-none px-5 py-4 pr-14 text-[15px] placeholder:text-white/40 max-h-[160px] leading-relaxed"
              style={{ minHeight: '56px' }}
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !inputValue.trim()}
              className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-lg shadow-violet-900/40 disabled:opacity-40 disabled:scale-100"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </main>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <aside className="relative w-[80%] max-w-[300px] h-full glass bg-[#0a0414] border-r border-white/10 flex flex-col animate-slideIn">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h2 className="font-semibold">Chat History</h2>
              <div className="flex gap-2">
                 <button onClick={() => { setViewMode('mock'); setIsMobileMenuOpen(false); }} className="text-emerald-400 p-1"><BookOpen className="w-5 h-5"/></button>
                 <button onClick={() => setIsMobileMenuOpen(false)} className="text-white/50 hover:text-white p-1">
                   <X className="w-5 h-5" />
                 </button>
              </div>
            </div>
            
            <button onClick={createNewChat} className="mx-3 mt-3 w-auto h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[14px] flex items-center justify-center gap-2 transition">
                <Plus className="w-4 h-4" /> New Chat
            </button>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {chats.map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    setCurrentChatId(c.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 transition flex items-center justify-between group cursor-pointer ${c.id === currentChatId ? 'bg-white/10' : ''}`}
                >
                  {editingChatId === c.id ? (
                     <form onSubmit={e => saveTitle(e, c.id)} onClick={e => e.stopPropagation()} className="flex items-center gap-2 w-full">
                        <input 
                           autoFocus
                           className="flex-1 bg-black/50 border border-violet-500 rounded px-2 py-1 text-sm outline-none text-white shadow-lg"
                           value={editTitle}
                           onChange={e => setEditTitle(e.target.value)}
                        />
                        <button type="submit" className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded transition"><Check className="w-4 h-4" /></button>
                     </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] truncate">{c.title}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                         <button type="button" aria-label="Edit" onClick={(e) => startEditTitle(e, c)} className="p-2 text-white/40 hover:text-white transition relative z-20"><Edit2 className="w-4 h-4" /></button>
                         <button type="button" aria-label="Delete" onClick={(e) => deleteChat(e, c.id)} className="p-2 text-white/40 hover:text-red-400 transition relative z-20"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-white/5 mt-auto">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-violet-600/30 flex items-center justify-center text-[12px] font-medium text-violet-200">
                  {userEmail.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[13px] truncate leading-tight text-white/90">{userEmail}</p>
                  <p className="text-[11px] text-white/40">Student</p>
                </div>
                <button onClick={() => setShowKeyModal(true)} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition" title="Settings">
                  <Settings className="w-4 h-4" />
                </button>
                <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-red-400 transition" title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Groq Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass bg-[#0f061d] border border-violet-500/30 rounded-[2rem] p-7 w-full max-w-[400px] purple-glow msg-in">
            <h3 className="text-xl font-semibold mb-2">Groq API Key</h3>
            <p className="text-[13px] text-white/60 mb-4 leading-relaxed">
              Fast answers ke liye apna Groq key daalein. Ye sirf aapke browser me securely save hoga.
            </p>
            <input
              id="key-input"
              type="password"
              placeholder="gsk_..."
              defaultValue={groqKey}
              className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl outline-none focus:border-violet-500 mb-4 text-[14px]"
            />
            <div className="flex gap-2">
              <button
                onClick={saveKey}
                className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium text-[14px] transition"
              >
                Save Key
              </button>
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-5 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-[14px] transition"
              >
                Skip
              </button>
            </div>
            
            {!groqKey && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                <p className="text-[12px] text-blue-200">
                  Aap bina key ke chat nahi kar payenge. Groq.com se free API key generate karein.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-700/5 rounded-full blur-[150px]"></div>
      </div>
    </div>
  );
}
