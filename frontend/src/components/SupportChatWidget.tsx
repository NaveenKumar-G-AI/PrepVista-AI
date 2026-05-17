'use client';

import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export function SupportChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);


  const loadMessages = async () => {
    try {
      const res: any = await api.getMySupportThread();
      setMessages(res.messages || []);
    } catch (err) {
      console.error('Failed to load support thread:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMessages();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Max 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.floor(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
          setBase64Image(compressedBase64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !base64Image) return;

    setLoading(true);
    try {
      const res: any = await api.sendSupportMessage(text, base64Image);
      setMessages(prev => [...prev, res.message]);
      setText('');
      setBase64Image(null);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  // We only show the widget for logged-in users who aren't explicitly admins 
  // (Admins use the Admin Dashboard to reply)
  if (!user || user.is_admin) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 flex h-[500px] w-[350px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-3xl sm:w-[400px]" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-blue-600/10 p-4" style={{ borderColor: 'var(--border-color)' }}>
            <div>
              <h3 className="font-semibold text-primary">Support Assistant</h3>
              <p className="text-xs text-tertiary">Ask us anything or report a bug</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="rounded-full p-2 text-tertiary hover:text-primary transition-colors" style={{ background: 'var(--bg-hover)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-tertiary">
                <svg className="mb-3 h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                <p className="text-sm">No messages yet.<br/>Send us a message below!</p>
              </div>
            ) : (
              messages.map((m, i) => {
                const isUser = m.sender_role === 'user';
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                      isUser 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'rounded-tl-none border text-secondary'
                    }`} style={isUser ? undefined : { borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
                      {m.attachment_data && (
                        <img 
                          src={m.attachment_data} 
                          alt="Attachment" 
                          className="mb-2 max-h-48 rounded-lg object-contain w-full"
                        />
                      )}
                      {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input Area */}
          <div className="border-t p-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
            {base64Image && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-500/10 px-3 py-1.5 border border-blue-500/20">
                <span className="text-xs text-blue-400 truncate flex-1">Image attached</span>
                <button onClick={() => setBase64Image(null)} className="ml-2 text-rose-400 hover:text-rose-300">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            )}
            
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <input 
                type="file" 
                accept="image/*" 
                hidden 
                ref={fileInputRef} 
                onChange={handleImageFile}
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 rounded-xl bg-white/5 p-2.5 text-slate-400 hover:bg-white/10 hover:text-blue-400 transition-colors"
                title="Attach an image"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              </button>
              <textarea
                rows={1}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type your message..."
                className="max-h-24 min-h-[44px] w-full resize-none rounded-xl border px-3 py-2.5 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 select-auto"
                style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <button 
                type="submit" 
                disabled={loading || (!text.trim() && !base64Image)}
                className="flex-shrink-0 rounded-xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group flex h-14 items-center gap-3 rounded-full bg-blue-600 pl-4 pr-5 shadow-xl shadow-blue-600/30 transition-transform duration-300 hover:scale-105 active:scale-95 border border-blue-500"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <span className="font-semibold text-white">Support Chat</span>
      </button>
    </div>
  );
}
