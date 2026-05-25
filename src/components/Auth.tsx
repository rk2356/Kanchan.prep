import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, Sparkles, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (session: any) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) onAuthSuccess(session);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onAuthSuccess(session);
    });
    
    return () => subscription.unsubscribe();
  }, [onAuthSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!isLogin && password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Kshamata se adhik samay lag raha hai. Network/Database me issue hai.')), 5000)
      );

      if (isLogin) {
        const result = await Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          timeoutPromise
        ]) as any;
        if (result?.error) throw result.error;
      } else {
        const signUpResult = await Promise.race([
          supabase.auth.signUp({ email, password }),
          timeoutPromise
        ]) as any;
        if (signUpResult?.error) throw signUpResult.error;
        
        // Try instant login directly if confirm email is off
        const signInResult = await Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          timeoutPromise
        ]) as any;
        if (signInResult?.error) throw signInResult.error;
      }
    } catch (err: any) {
      let msg = err.message || 'An error occurred';
      if (msg.includes('Failed to fetch')) {
        msg = "Network Error: Kripya apna ad-blocker disable karein ya connection check karein.";
      } else if (msg.includes('Invalid login credentials')) {
        msg = "Invalid credentials: Aapne galat Email ya Password dala hai.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[360px]">
        <div className="glass bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 md:p-10 purple-glow">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-600/30 rotate-3">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-[28px] font-semibold tracking-tight text-white">AIIMS Prep Buddy</h1>
            <p className="text-violet-200/60 mt-1.5 font-sans text-sm">Your personal AI study buddy</p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl mb-6 border border-white/5">
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(null); }}
              className={`flex-1 py-2.5 px-4 text-[14px] font-medium rounded-lg transition-all duration-200 ${!isLogin ? 'bg-white/10 text-white shadow-sm' : 'text-white/60 hover:text-white/80'}`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(null); }}
              className={`flex-1 py-2.5 px-4 text-[14px] font-medium rounded-lg transition-all duration-200 ${isLogin ? 'bg-white/10 text-white shadow-sm' : 'text-white/60 hover:text-white/80'}`}
            >
              Login
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[12px] text-violet-200/70 mb-1.5 block font-medium">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-300/50" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="naam@email.com"
                  className="w-full h-[46px] pl-[38px] pr-4 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-violet-500/50 text-white text-[14px] placeholder:text-white/30"
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] text-violet-200/70 mb-1.5 block font-medium">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-300/50" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-[46px] pl-[38px] pr-10 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-violet-500/50 text-white text-[14px] placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="text-[12px] text-violet-200/70 mb-1.5 block font-medium">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-300/50" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-[46px] pl-[38px] pr-10 bg-white/[0.04] border border-white/10 rounded-xl outline-none focus:border-violet-500/50 text-white text-[14px] placeholder:text-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[46px] mt-2 rounded-xl bg-white text-black font-medium text-[14px] hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Processing...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-red-300 leading-snug">{error}</p>
            </div>
          )}
          {success && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-emerald-300 leading-snug">{success}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
