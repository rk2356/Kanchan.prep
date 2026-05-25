import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Clock, Info, CheckCircle, XCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Setup pdf-js worker from cdn to match the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const sections = [
  { id: 'Physics', name: 'Physics', hindi: 'भौतिकी', count: 30, time: 45, icon: 'ri-flashlight-line', color: 'from-violet-600 to-blue-500' },
  { id: 'Chemistry', name: 'Chemistry', hindi: 'रसायन', count: 30, time: 45, icon: 'ri-flask-line', color: 'from-emerald-600 to-teal-500' },
  { id: 'Biology', name: 'Biology', hindi: 'जीव विज्ञान', count: 30, time: 45, icon: 'ri-leaf-line', color: 'from-pink-600 to-rose-500' },
];

export default function MockTest({ groqKey, onClose }: { groqKey: string, onClose: () => void }) {
  const [screen, setScreen] = useState<'home' | 'loading' | 'quiz' | 'result'>('home');
  const [loadingText, setLoadingText] = useState('Initializing Mock Test...');
  const [currentQuiz, setCurrentQuiz] = useState<any>(null);
  const [timer, setTimer] = useState(0);
  const [answeredIdx, setAnsweredIdx] = useState<number | null>(null);

  const startMockTest = async (section: any) => {
    if (!groqKey) {
      alert("Please save your Groq API key in the Chat view to use the AI Generator.");
      return;
    }
    setScreen('loading');
    setLoadingText(`Connecting to Supabase Storage (${section.name})...`);

    try {
      // 1. Fetch Chapters / Context from Supabase Storage
      let chapterNames = '';
      let pdfContextText = '';
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (buckets) {
           const subjectBuckets = buckets.filter(b => b.name.toLowerCase().includes(section.name.toLowerCase()));
           for (const bucket of subjectBuckets) {
              const { data: files } = await supabase.storage.from(bucket.name).list();
              if (files) {
                 const pdfFiles = files.filter(f => f.name.endsWith('.pdf'));
                 const names = files.filter(f => f.name.endsWith('.pdf') || f.name.endsWith('.md')).map(f => f.name.replace('.pdf', '').replace('.md', ''));
                 if (names.length > 0) {
                    chapterNames += `[${bucket.name}]: ` + names.join(', ') + '.\n';
                 }

                 // Safely try to read text from the first PDF
                 if (pdfFiles.length > 0 && pdfContextText.length < 5000) {
                    const pdfName = pdfFiles[0].name;
                    setLoadingText(`Reading PDF Document: ${pdfName}...`);
                    await new Promise(r => setTimeout(r, 50));
                    
                    try {
                        const { data: urlData, error } = await supabase.storage.from(bucket.name).createSignedUrl(pdfName, 300);
                        if (urlData && urlData.signedUrl) {
                            const loadingTask = pdfjsLib.getDocument(urlData.signedUrl);
                            const pdf = await loadingTask.promise;
                            // Parse a random chunk of up to 10 pages to ensure AI discovers different topics every time
                            const maxPages = pdf.numPages;
                            const span = Math.min(10, maxPages);
                            const startPage = Math.floor(Math.random() * (maxPages - span + 1)) || 1;
                            
                            for (let i = startPage; i < startPage + span; i++) {
                               if (i > maxPages) break;
                               const page = await pdf.getPage(i);
                               const textContent = await page.getTextContent();
                               const pageText = textContent.items.map((item: any) => item.str).join(' ');
                               pdfContextText += pageText + ' \n';
                            }
                        }
                    } catch (e) {
                        console.log("PDF parse error:", e);
                    }
                 }
              }
           }
        }
      } catch (err) {
        console.error("Storage list error:", err);
      }

      setLoadingText('AI is scanning documents and generating questions...');
      
      // Allow UI to flush the loading text update before blocking the thread
      await new Promise(r => setTimeout(r, 100));

      // 2. Build AI Request for JSON output
      const prompt = `Generate exactly ${section.count} high-quality, completely unique multiple choice questions for ${section.name} based on the NCERT syllabus for AIIMS B.Sc Nursing Exam.
IMPORTANT: Do NOT generate the same standard questions. I need a diverse, unseen set of questions every time. Seed: ${Math.random().toString(36).substring(7)}
${chapterNames ? `\nCRITICAL: The user has uploaded specific document chapters. You MUST base your questions primarily on these topics/chapters to prove you read them:\n${chapterNames}\n` : ''}
${pdfContextText ? `\nHere is extracted text directly from a random section of one of their uploaded PDFs to use as context for generating accurate questions:\n"""${pdfContextText.substring(0, 10000)}"""\n` : ''}
Ensure the difficulty is medium to hard, matching the AIIMS competitive exam level.

Follow this schema EXACTLY. You MUST provide detailed text for the "explanation" field for EVERY question.
{
  "questions": [
    {
      "q": "Question text here",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "ans": 0,
      "explanation": "Ensure this string contains a detailed explanation of why the answer is correct."
    }
  ]
}`; 

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: 'You are an educational bot that strictly outputs raw JSON array of questions, nothing else. Provide completely new and difficult questions.' }, { role: 'user', content: prompt }],
          temperature: 0.85,
          response_format: { type: "json_object" } // try to enforce json if supported, or just trust the prompt
        })
      });

      if (!res.ok) throw new Error("API error. Usually this means the Groq API Key is invalid or rate limited.");
      const data = await res.json();
      let rawJson = data.choices[0].message.content;

      // Ensure clean parsing
      if (rawJson.startsWith('```json')) rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '');
      if (rawJson.startsWith('```')) rawJson = rawJson.replace(/```/g, '');
      
      let parsed = [];
      try {
        parsed = JSON.parse(rawJson.trim());
      } catch (e) {
        // Fallback robust json extraction
        const jsonMatch = rawJson.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        else throw new Error("AI did not return a valid JSON format.");
      }
      
      let questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      if (questions.length === 0) throw new Error("No questions generated. Please try again.");

      setCurrentQuiz({
        sec: section,
        questions,
        index: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now()
      });
      setTimer(section.time * 60);
      setScreen('quiz');
      setAnsweredIdx(null);
    } catch (e: any) {
      alert("Question generation failed: " + e.message);
      setScreen('home');
    }
  };

  useEffect(() => {
    let interval: any;
    if (screen === 'quiz' && timer > 0) {
      interval = setInterval(() => {
        setTimer(t => {
          if (t <= 1) {
             setScreen('result');
             return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [screen, timer]);

  const handleOptionSelect = (idx: number) => {
    if (answeredIdx !== null) return;
    setAnsweredIdx(idx);
    const correctIdx = currentQuiz.questions[currentQuiz.index].ans;
    setCurrentQuiz((prev: any) => ({
      ...prev,
      correct: prev.correct + (idx === correctIdx ? 1 : 0),
      wrong: prev.wrong + (idx !== correctIdx ? 1 : 0)
    }));
  };

  const handleNext = () => {
    if (currentQuiz.index < currentQuiz.questions.length - 1) {
      setCurrentQuiz((prev: any) => ({ ...prev, index: prev.index + 1 }));
      setAnsweredIdx(null);
    } else {
      setScreen('result');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[100dvh] md:h-full w-full bg-[#0e1621] text-[#e1e3e6] z-50">
      
      {/* Home Screen */}
      {screen === 'home' && (
        <div className="flex-1 flex flex-col overflow-y-auto w-full max-w-3xl mx-auto px-4 py-8 h-full">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-2xl font-bold text-white">AIIMS Topic Quiz</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map(s => (
              <button 
                key={s.id} 
                onClick={() => startMockTest(s)}
                className={`bg-[#182533] rounded-[24px] p-6 text-left hover:bg-[#1f2f3d] border border-transparent hover:border-white/10 active:scale-95 transition-all relative overflow-hidden group`}
              >
                 <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <Clock className="w-6 h-6 text-white" />
                 </div>
                 <h3 className="font-bold text-[18px] text-white group-hover:text-[#5288c1] transition-colors">{s.name}</h3>
                 <p className="text-[#7d8b99] mt-1">{s.count} AI Generated Qs • {s.time} mins</p>
                 <p className="text-[12px] text-[#5288c1] mt-3 font-semibold uppercase opacity-80 group-hover:opacity-100">Start Live Test &rarr;</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading Screen */}
      {screen === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-[#2b5278] border-t-[#5288c1] animate-spin mb-6"></div>
            <p className="text-[#7d8b99] font-medium text-lg text-center max-w-sm">{loadingText}</p>
        </div>
      )}

      {/* Quiz Screen */}
      {screen === 'quiz' && currentQuiz && currentQuiz.questions[currentQuiz.index] && (
        <div className="flex-1 flex flex-col w-full h-full bg-[#0e1621]">
            {/* Header */}
            <div className="shrink-0 bg-[#0e1621]/90 backdrop-blur-md px-4 py-3 border-b border-[#1f2f3d]">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="flex justify-between items-center">
                        <button onClick={() => setScreen('home')} className="flex items-center text-red-400 hover:text-red-300 text-xs font-medium tracking-wide uppercase">Exit Test</button>
                        <div className="flex items-center gap-2">
                            <div className="bg-[#182533] px-3 py-1.5 rounded-full font-mono text-white text-xs border border-white/5">
                                {Math.floor(timer/60)}:{(timer%60).toString().padStart(2,'0')}
                            </div>
                            <div className="bg-[#2b5278] px-3 py-1.5 rounded-full font-bold text-white text-xs shadow-md">
                                {currentQuiz.index + 1}/{currentQuiz.questions.length}
                            </div>
                        </div>
                    </div>
                    <div className="h-1.5 w-full bg-[#182533] mt-3 rounded-full overflow-hidden">
                        <div className="h-full bg-[#5288c1] transition-all duration-300" style={{ width: `${((currentQuiz.index + 1) / currentQuiz.questions.length) * 100}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                <div className="max-w-4xl mx-auto w-full pb-4">
                    <div className="bg-[#182533] rounded-xl p-5 mb-6 border border-white/5 shadow-lg">
                        <p className="text-base md:text-lg leading-relaxed text-white">
                            <span className="font-bold text-[#5288c1] mr-2">Q{currentQuiz.index + 1}.</span>
                            {currentQuiz.questions[currentQuiz.index].q}
                        </p>
                    </div>

                    <div className="space-y-3">
                        {currentQuiz.questions[currentQuiz.index].options.map((opt: string, i: number) => {
                            const correctIdx = currentQuiz.questions[currentQuiz.index].ans;
                            let btnClass = "bg-[#182533] border border-[#1f2f3d] hover:border-[#5288c1]";
                            if (answeredIdx !== null) {
                                if (i === correctIdx) btnClass = "bg-[#0d2818] border-[#22c55e]";
                                else if (i === answeredIdx) btnClass = "bg-[#2d1414] border-[#ef4444]";
                                else btnClass = "bg-[#1f2f3d] border-transparent opacity-50";
                            }
                            return (
                                <button 
                                    key={i}
                                    onClick={() => handleOptionSelect(i)}
                                    disabled={answeredIdx !== null}
                                    className={`w-full text-left p-4 rounded-xl transition duration-200 ${btnClass}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="shrink-0 w-7 h-7 rounded-md bg-[#2b5278]/30 flex items-center justify-center font-bold text-sm text-[#5288c1]">{String.fromCharCode(65 + i)}</span>
                                        <span className="text-sm md:text-base text-white/90 pt-0.5 leading-snug">{opt}</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {answeredIdx !== null && (currentQuiz.questions[currentQuiz.index].explanation || currentQuiz.questions[currentQuiz.index].Explanation) && (
                        <div className="mt-6 bg-emerald-500/10 border-l-4 border-emerald-500 rounded-r-lg p-4 xs:p-5 fade-in shadow-sm">
                            <p className="text-emerald-400 font-bold text-sm mb-1.5 uppercase tracking-wide">Explanation:</p>
                            <p className="text-white/80 leading-relaxed text-sm">{currentQuiz.questions[currentQuiz.index].explanation || currentQuiz.questions[currentQuiz.index].Explanation}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 pt-4 px-4 pb-6 md:pb-4 bg-[#0e1621] border-t border-[#1f2f3d] shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                <div className="max-w-4xl mx-auto w-full">
                    <button 
                        onClick={handleNext}
                        disabled={answeredIdx === null}
                        className="w-full max-w-sm mx-auto block h-12 md:h-14 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:text-white/30 text-white font-bold rounded-xl transition text-base active:scale-[0.98] shadow-lg disabled:shadow-none"
                    >
                        {currentQuiz.index === currentQuiz.questions.length - 1 ? 'Finish & Check Score' : 'Next Question'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Result Screen */}
      {screen === 'result' && currentQuiz && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto h-full overflow-y-auto">
            <h2 className="text-3xl font-extrabold text-white mb-2">Quiz Complete!</h2>
            <p className="text-[#aeb9c4] mb-8">AIIMS revision session finished.</p>

            <div className="relative w-36 h-36 mb-8">
                <svg className="w-full h-full -rotate-90">
                    <circle cx="72" cy="72" r="66" stroke="#1f2f3d" strokeWidth="8" fill="none" />
                    <circle cx="72" cy="72" r="66" stroke="#22c55e" strokeWidth="8" fill="none" strokeDasharray="414" strokeDashoffset={414 - (414 * (currentQuiz.correct / currentQuiz.questions.length))} strokeLinecap="round" className="transition-all duration-1000" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-extrabold text-white">{Math.round((currentQuiz.correct / currentQuiz.questions.length) * 100)}%</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full mb-8">
                <div className="bg-[#182533] p-4 rounded-2xl">
                    <span className="block text-2xl font-bold text-[#22c55e]">{currentQuiz.correct}</span>
                    <span className="text-sm text-[#7d8b99]">Correct</span>
                </div>
                <div className="bg-[#182533] p-4 rounded-2xl">
                    <span className="block text-2xl font-bold text-[#ef4444]">{currentQuiz.wrong}</span>
                    <span className="text-sm text-[#7d8b99]">Wrong</span>
                </div>
            </div>

            <button onClick={() => setScreen('home')} className="w-full h-14 bg-[#2b5278] hover:bg-[#326190] text-white font-bold rounded-2xl transition text-lg active:scale-95">
                Back to Topics
            </button>
        </div>
      )}

    </div>
  );
}
