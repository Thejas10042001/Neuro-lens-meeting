
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as toxicity from '@tensorflow-models/toxicity';
import '@tensorflow/tfjs';
import { CameraIcon } from './icons/CameraIcon';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { ZapIcon } from './icons/ZapIcon';

// Access global faceapi from CDN
const faceapi = (window as any).faceapi;

// --- TYPES ---
interface ParticipantAnalysis {
    id: string; // "Person 1", "Person 2"
    attention: number;
    stress: number;
    curiosity: number;
    expressions: any; // faceapi.FaceExpressions
    badSign: boolean;
}

interface LogEntry {
    date: string;
    time: string;
    participant: string;
    attention: number;
    stress: number;
    curiosity: number;
    badSign: string;
    toxicLabels: string;
}

interface ToxicityEvent {
    id: number;
    time: string;
    transcript: string;
    labels: string[];
}

// --- CONSTANTS ---
// Using rawgit or jsdelivr for models can be CORS sensitive. 
// We use a known working model path or a relative one if available.
// For this MVP, we use the Justadudewhohacks repo via JSDelivr/Github Pages.
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const TOXICITY_THRESHOLD = 0.85;

const MeetingGuardian: React.FC = () => {
    // --- STATE ---
    // Setup
    const [selectedPlatform, setSelectedPlatform] = useState<"Google Meet" | "Zoom" | "Microsoft Teams">("Google Meet");
    const [createMode, setCreateMode] = useState<boolean>(false); // false = existing, true = create
    const [meetingLink, setMeetingLink] = useState("");
    const [meetingCode, setMeetingCode] = useState("");
    const [generatedMeeting, setGeneratedMeeting] = useState<{link: string, id: string, pin: string} | null>(null);
    const [aiStatus, setAiStatus] = useState<"Not connected" | "Waiting for screen share..." | "Connected to meeting ✅" | "Loading Models...">("Loading Models...");
    
    // Models
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const toxicityModelRef = useRef<toxicity.ToxicityClassifier | null>(null);

    // Analysis
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [participants, setParticipants] = useState<ParticipantAnalysis[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(true);
    const [toxicityEvents, setToxicityEvents] = useState<ToxicityEvent[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analysisIntervalRef = useRef<any>(null);
    const speechRecognitionRef = useRef<any>(null);

    // --- INITIALIZATION ---
    useEffect(() => {
        const loadModels = async () => {
            if (!faceapi) {
                console.error("FaceAPI script not loaded");
                setAiStatus("Error: ML Script Missing");
                return;
            }

            try {
                console.log("Loading FaceAPI models...");
                await Promise.all([
                    // Loading SsdMobilenetv1 for high accuracy detection
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
                    // Keep tiny loaded just in case of fallback needs
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
                ]);
                console.log("FaceAPI loaded. Loading Toxicity...");
                const model = await toxicity.load(TOXICITY_THRESHOLD, ['identity_attack', 'insult', 'obscene', 'severe_toxicity', 'sexual_explicit', 'threat', 'toxicity']);
                toxicityModelRef.current = model;
                console.log("All models loaded.");
                setModelsLoaded(true);
                setAiStatus("Not connected");
            } catch (err) {
                console.error("Model load error:", err);
                // Allow UI to show even if models fail (graceful degradation)
                setAiStatus("Not connected (Model Error)");
            }
        };
        
        // Wait for script to load if strictly necessary, but useEffect usually runs after DOM
        if ((window as any).faceapi) {
            loadModels();
        } else {
            const checkInterval = setInterval(() => {
                if ((window as any).faceapi) {
                    clearInterval(checkInterval);
                    loadModels();
                }
            }, 500);
            return () => clearInterval(checkInterval);
        }

        return () => {
            stopScreenShare();
        };
    }, []);

    // --- MEETING SETUP LOGIC ---
    const handleGenerateMeeting = () => {
        const randId = Math.random().toString(36).substring(2, 11); // random string
        const link = selectedPlatform === "Google Meet" ? `meet.google.com/${randId}` : 
                     selectedPlatform === "Zoom" ? `zoom.us/j/${Math.floor(Math.random() * 1000000000)}` :
                     `teams.microsoft.com/l/meetup-join/${randId}`;
        
        setGeneratedMeeting({
            link: link,
            id: randId.toUpperCase(),
            pin: Math.floor(Math.random() * 9000 + 1000).toString()
        });
    };

    const handleConnectExisting = () => {
        if (!meetingLink) return;
        setAiStatus("Waiting for screen share...");
    };

    // --- SCREEN SHARE & VISION ANALYSIS ---
    const startScreenShare = async () => {
        try {
            // @ts-ignore
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true, 
                audio: true 
            });
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            
            setIsScreenSharing(true);
            setAiStatus("Connected to meeting ✅");
            
            // Start Audio Analysis
            startAudioAnalysis(stream);

            // Start Video Loop
            analysisIntervalRef.current = setInterval(analyzeFrame, 1500); // Check every 1.5s
            
            // Handle Stop
            stream.getVideoTracks()[0].onended = () => {
                stopScreenShare();
            };

        } catch (err) {
            console.error("Screen share error:", err);
            setAiStatus("Not connected");
        }
    };

    const stopScreenShare = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
        if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
        
        setIsScreenSharing(false);
        setAiStatus("Not connected");
    };

    const analyzeFrame = async () => {
        if (!videoRef.current || !canvasRef.current || !modelsLoaded || !faceapi) return;
        
        // 1. Detect Faces
        // Using SsdMobilenetv1 for enhanced accuracy in low light and better occlusion handling
        // MinConfidence set to 0.4 to pick up faces in dimmer meeting conditions
        let detections;
        try {
            detections = await faceapi.detectAllFaces(
                videoRef.current, 
                new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })
            ).withFaceExpressions();
        } catch (e) {
            // Fallback to TinyFaceDetector if SSD fails (e.g., memory issues)
            console.warn("SSD Detection failed, falling back to TinyFace", e);
            detections = await faceapi.detectAllFaces(
                videoRef.current, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceExpressions();
        }

        if (!detections || detections.length === 0) {
            return;
        }

        const currentParticipants: ParticipantAnalysis[] = [];
        const currentLogs: LogEntry[] = [];
        const newSuggestions: string[] = [];

        // 2. Compute Metrics
        detections.forEach((d: any, index: number) => {
            const expr = d.expressions;
            
            // Attention: Neutral + Surprised - (Sad + Fearful/Disgusted)
            // Normalized roughly 0-100
            let attention = (expr.neutral * 0.8 + expr.surprised * 0.5 + expr.happy * 0.2) * 100;
            // Penalize for negative/distracted emotions
            attention -= (expr.sad * 30 + expr.fearful * 30 + expr.disgusted * 20); 
            attention = Math.max(0, Math.min(100, attention));

            // Stress: Angry + Fearful + Disgusted + Sad
            let stress = (expr.angry + expr.fearful + expr.disgusted + expr.sad * 0.5) * 100;
            stress = Math.max(0, Math.min(100, stress));

            // Curiosity: Surprised + Happy (eager)
            let curiosity = (expr.surprised + expr.happy) * 100;
            curiosity = Math.max(0, Math.min(100, curiosity));

            // Heuristic Rule for Bad Sign
            const badSign = stress > 75 && attention < 35;
            const pId = `Person ${index + 1}`;

            // Add suggestions
            if (aiSuggestionsEnabled) {
                if (attention < 35) newSuggestions.push(`⚠️ ${pId} attention is dropping. Ask a question.`);
                if (stress > 75) newSuggestions.push(`🚨 ${pId} looks stressed. Suggest a break?`);
                if (curiosity < 20 && attention > 50) newSuggestions.push(`💡 ${pId} seems bored. Switch topics.`);
            }

            currentParticipants.push({
                id: pId,
                attention,
                stress,
                curiosity,
                expressions: expr,
                badSign
            });

            // Log Data
            currentLogs.push({
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                participant: pId,
                attention: Number(attention.toFixed(1)),
                stress: Number(stress.toFixed(1)),
                curiosity: Number(curiosity.toFixed(1)),
                badSign: badSign ? 'Yes' : 'No',
                toxicLabels: ''
            });
        });

        setParticipants(currentParticipants);
        if (newSuggestions.length > 0) setSuggestions(prev => [...newSuggestions.slice(-4), ...prev].slice(0, 10)); // Keep last 10
        setLogs(prev => [...prev, ...currentLogs].slice(-50)); // Keep last 50 logs in memory
    };

    // --- AUDIO & TOXICITY ---
    const startAudioAnalysis = (stream: MediaStream) => {
        // We need SpeechRecognition. 
        if ('webkitSpeechRecognition' in window) {
            const recognition = new (window as any).webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            
            recognition.onresult = async (event: any) => {
                const results = event.results;
                const transcript = results[results.length - 1][0].transcript;
                
                // Run Toxicity Classification
                if (toxicityModelRef.current) {
                    const predictions = await toxicityModelRef.current.classify([transcript]);
                    // predictions is array of { label, results: [{ match: boolean, probabilities: [...] }] }
                    
                    const detectedLabels = predictions
                        .filter(p => p.results[0].match === true)
                        .map(p => p.label);
                    
                    if (detectedLabels.length > 0) {
                        const evt: ToxicityEvent = {
                            id: Date.now(),
                            time: new Date().toLocaleTimeString(),
                            transcript: transcript, // Censoring could be added here
                            labels: detectedLabels
                        };
                        setToxicityEvents(prev => [evt, ...prev]);
                        
                        // Add to log
                        setLogs(prev => [...prev, {
                            date: new Date().toLocaleDateString(),
                            time: new Date().toLocaleTimeString(),
                            participant: "Audio",
                            attention: 0,
                            stress: 0,
                            curiosity: 0,
                            badSign: "Yes",
                            toxicLabels: detectedLabels.join("; ")
                        }]);
                    }
                }
            };
            
            try {
                recognition.start();
                speechRecognitionRef.current = recognition;
            } catch (e) {
                console.warn("Speech recognition failed to start", e);
            }
        }
    };

    // --- CSV EXPORT ---
    const downloadCSV = () => {
        if (logs.length === 0) return;
        const header = ["Date", "Time", "Participant", "Attention", "Stress", "Curiosity", "BadSign", "ToxicLabels"];
        const rows = logs.map(l => [
            l.date, l.time, l.participant, l.attention, l.stress, l.curiosity, l.badSign, `"${l.toxicLabels}"`
        ]);
        const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_meeting_guardian_logs_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const toggleMute = () => {
        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
    };

    return (
        <div className="flex flex-col gap-6 animate-fade-in-right">
            
            {/* Header / Title Area */}
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <ShieldCheckIcon className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">AI Meeting Guardian</h2>
                    <p className="text-gray-400 text-sm">Real-time protection & analytics for Zoom, Teams, and Meet.</p>
                </div>
                <div className="ml-auto">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        modelsLoaded ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'
                    }`}>
                        {modelsLoaded ? "ML Models Loaded" : "Loading ML Models..."}
                    </span>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1️⃣ LEFT SIDE - SETUP & VIDEO */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    
                    {/* A. Platform Selector */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider">1. Choose Platform</h3>
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {["Google Meet", "Zoom", "Microsoft Teams"].map(p => (
                                <button 
                                    key={p} 
                                    onClick={() => setSelectedPlatform(p as any)}
                                    className={`py-3 px-2 rounded-lg border text-sm font-medium transition-all ${
                                        selectedPlatform === p 
                                        ? 'bg-emerald-600/20 border-emerald-500 text-white' 
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-700 mb-4">
                            <button onClick={() => setCreateMode(true)} className={`pb-2 px-4 text-sm font-medium ${createMode ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400'}`}>AI Create Meeting</button>
                            <button onClick={() => setCreateMode(false)} className={`pb-2 px-4 text-sm font-medium ${!createMode ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400'}`}>Use Existing</button>
                        </div>

                        {createMode ? (
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <button onClick={handleGenerateMeeting} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                                        ✨ Generate Meeting with AI
                                    </button>
                                </div>
                                {generatedMeeting && (
                                    <div className="bg-black/40 p-3 rounded border border-gray-700 font-mono text-sm text-gray-300">
                                        <p>Link: <span className="text-blue-400">{generatedMeeting.link}</span></p>
                                        <p>ID: {generatedMeeting.id}</p>
                                        <p>Pin: {generatedMeeting.pin}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <input 
                                    type="text" 
                                    placeholder="Paste Meeting Link" 
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm focus:border-emerald-500 focus:outline-none"
                                    value={meetingLink}
                                    onChange={e => setMeetingLink(e.target.value)}
                                />
                                <div className="flex gap-3">
                                    <input type="text" placeholder="Code" className="w-1/2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 text-sm" value={meetingCode} onChange={e => setMeetingCode(e.target.value)} />
                                    <button onClick={handleConnectExisting} className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold">
                                        Connect AI
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        <div className="mt-4 flex items-center gap-2 text-sm">
                            <span className="text-gray-500">AI Agent Status:</span>
                            <span className={`font-semibold ${aiStatus.includes("Connected") ? "text-emerald-400" : "text-amber-400"}`}>
                                {aiStatus}
                            </span>
                        </div>
                    </div>

                    {/* B. Live Meeting Area */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
                                <CameraIcon /> Live Screen Analysis
                            </h3>
                            {isScreenSharing && (
                                <span className="flex items-center gap-2 text-xs text-red-400 font-bold bg-red-900/20 px-2 py-1 rounded animate-pulse">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> LIVE
                                </span>
                            )}
                        </div>
                        
                        <div className="aspect-video bg-black rounded-lg border border-gray-700 overflow-hidden relative group">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                            {/* Hidden canvas for face-api */}
                            <canvas ref={canvasRef} className="hidden" />
                            
                            {!isScreenSharing && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80">
                                    <p className="text-gray-500 text-sm mb-4">Share the meeting window to start analysis</p>
                                    <button 
                                        onClick={startScreenShare}
                                        disabled={!modelsLoaded}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Start Screen Share for AI
                                    </button>
                                </div>
                            )}

                            {isScreenSharing && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur px-4 py-2 rounded-full text-xs text-gray-300 pointer-events-none">
                                    Analyzing participants’ faces & audio in real-time...
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <div className="flex gap-3 mt-4">
                            <button onClick={toggleMute} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 text-sm border border-gray-700">
                                Mute/Unmute Preview
                            </button>
                            <button onClick={() => setAiSuggestionsEnabled(!aiSuggestionsEnabled)} className={`px-4 py-2 rounded text-sm border transition-colors ${aiSuggestionsEnabled ? 'bg-violet-900/30 text-violet-300 border-violet-500/30' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                                AI Suggestions: {aiSuggestionsEnabled ? 'ON' : 'OFF'}
                            </button>
                            <button onClick={stopScreenShare} className="ml-auto px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-sm border border-red-500/30">
                                End Session
                            </button>
                        </div>
                    </div>

                </div>

                {/* 2️⃣ RIGHT SIDE - INSIGHTS */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    
                    {/* A. Cognitive State Table */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 min-h-[250px]">
                        <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                            <ZapIcon /> Real-Time Cognitive State
                        </h3>
                        {participants.length === 0 ? (
                            <div className="text-center text-gray-500 py-10 text-sm">
                                No faces detected in stream yet.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-700">
                                            <th className="py-2">User</th>
                                            <th className="py-2">Attn</th>
                                            <th className="py-2">Stress</th>
                                            <th className="py-2">Sign</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {participants.map(p => (
                                            <tr key={p.id} className="border-b border-gray-800 last:border-0">
                                                <td className="py-2 font-medium text-gray-300">{p.id}</td>
                                                <td className="py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                                        p.attention > 70 ? 'text-emerald-400 bg-emerald-900/20' : 
                                                        p.attention > 40 ? 'text-yellow-400 bg-yellow-900/20' : 'text-red-400 bg-red-900/20'
                                                    }`}>
                                                        {Math.round(p.attention)}%
                                                    </span>
                                                </td>
                                                <td className="py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                                        p.stress < 40 ? 'text-gray-400' : 
                                                        p.stress < 70 ? 'text-orange-400 bg-orange-900/20' : 'text-red-400 bg-red-900/20'
                                                    }`}>
                                                        {Math.round(p.stress)}%
                                                    </span>
                                                </td>
                                                <td className="py-2">
                                                    {p.badSign ? (
                                                        <span className="text-xs text-red-500 font-bold flex items-center gap-1">
                                                            <ExclamationIcon /> BAD
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-600">OK</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* B. AI Suggestions */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex-grow">
                        <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider">AI Suggestions to Host</h3>
                        {aiSuggestionsEnabled ? (
                            <ul className="space-y-3">
                                {suggestions.length === 0 && (
                                    <li className="text-gray-500 text-sm italic">Analysis running... suggestions will appear here.</li>
                                )}
                                {suggestions.map((s, i) => (
                                    <li key={i} className="text-sm bg-gray-800/50 p-2 rounded border border-gray-700 text-gray-300 animate-fade-in-right">
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-gray-500 text-sm italic">Suggestions disabled.</div>
                        )}
                    </div>

                    {/* C. Toxicity Monitor */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                        <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                            <ExclamationIcon /> Toxic / Misbehavior
                        </h3>
                        <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
                            {toxicityEvents.length === 0 && (
                                <p className="text-gray-500 text-sm">No toxic language detected.</p>
                            )}
                            {toxicityEvents.map(t => (
                                <div key={t.id} className="bg-red-900/10 border border-red-500/20 p-2 rounded">
                                    <div className="flex justify-between text-xs text-red-400 font-bold mb-1">
                                        <span>{t.time}</span>
                                        <span>FLAGGED</span>
                                    </div>
                                    <p className="text-gray-300 text-xs italic">"{t.transcript}"</p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {t.labels.map(l => (
                                            <span key={l} className="text-[10px] bg-red-500/20 text-red-300 px-1 rounded uppercase">{l}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>

            {/* 3️⃣ BOTTOM - LOGS & EXPORT */}
            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider">Session Logs</h3>
                    <button onClick={downloadCSV} className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded border border-gray-700 transition-colors">
                        <DownloadIcon /> Export CSV
                    </button>
                </div>
                <div className="overflow-x-auto max-h-60 custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs md:text-sm">
                        <thead className="text-gray-500 bg-gray-800/50 sticky top-0">
                            <tr>
                                <th className="p-2">Time</th>
                                <th className="p-2">Participant</th>
                                <th className="p-2">Attention</th>
                                <th className="p-2">Stress</th>
                                <th className="p-2">Curiosity</th>
                                <th className="p-2">Bad Sign?</th>
                                <th className="p-2">Toxic Labels</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-400">
                            {logs.slice().reverse().map((l, i) => (
                                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30">
                                    <td className="p-2 font-mono">{l.time}</td>
                                    <td className="p-2">{l.participant}</td>
                                    <td className="p-2">{l.attention}</td>
                                    <td className="p-2">{l.stress}</td>
                                    <td className="p-2">{l.curiosity}</td>
                                    <td className={`p-2 font-bold ${l.badSign === 'Yes' ? 'text-red-400' : 'text-gray-600'}`}>{l.badSign}</td>
                                    <td className="p-2 text-red-300">{l.toxicLabels}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default MeetingGuardian;
