
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import type { CognitiveDataPoint, Notification } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { XIcon } from './icons/XIcon';
import { CognitiveModel, BiometricInput } from './cognitiveModel';
import { LightBulbIcon } from './icons/LightBulbIcon';
import { BellIcon } from './icons/BellIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { ZapIcon } from './icons/ZapIcon';
import { FlameIcon } from './icons/FlameIcon';
import { TrendingDownIcon } from './icons/TrendingDownIcon';

// Access global faceapi
const faceapi = (window as any).faceapi;

const MAX_DATA_POINTS = 30;
const MAX_HISTORY_POINTS = 5000;
const STORAGE_KEY = 'neuroLensHistory';
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

const HIGH_STRESS_THRESHOLD = 85;
const STRESS_ALERT_DURATION_COUNT = 4; 
const STRESS_RECOVERY_THRESHOLD = 70;
const LOW_ATTENTION_THRESHOLD = 35;
const LOW_ATTENTION_DURATION_COUNT = 4;
const LOW_ATTENTION_RECOVERY_THRESHOLD = 40;

interface SummaryState {
    text: string;
    color: string;
}

const getCognitiveSummary = (point: CognitiveDataPoint): SummaryState => {
    const { attention, stress, curiosity } = point;
    if (attention > 75 && stress > 65) return { text: "Cognitive Overload", color: "text-amber-400" };
    if (attention > 85 && stress < 30) return { text: "Deep Flow State", color: "text-cyan-300" };
    if (curiosity > 70 && attention > 60) return { text: "Active Learning", color: "text-violet-400" };
    if (stress > 70 && attention < 40) return { text: "High Stress / Anxiety", color: "text-rose-500" };
    if (attention < 30) return { text: "Distracted", color: "text-yellow-500" };
    if (stress > 60) return { text: "Elevated Stress", color: "text-red-500" };
    if (curiosity > 75) return { text: "Highly Curious", color: "text-purple-400" };
    return { text: "Nominal State", color: "text-gray-300" };
};

const getPersonalizedSuggestion = (summaryText: string): string => {
    switch (summaryText) {
        case "Cognitive Overload": return "Your cognitive load is peaking. Take a 2-minute eye-rest break.";
        case "Deep Flow State": return "Optimal performance detected. Maintain current environment.";
        case "Distracted": return "Head pose indicates distraction. Re-align with the screen.";
        case "High Stress / Anxiety": return "Blink rate volatility detected. Try box breathing (4-4-4-4).";
        case "Elevated Stress": return "Facial tension detected. Relax your jaw and shoulders.";
        default: return "Biometrics nominal. Continuing analysis.";
    }
}

type TimeRange = 'live' | 'hour' | 'day' | 'week';

interface CognitiveChartProps {
    data: CognitiveDataPoint[];
    dataKey: keyof CognitiveDataPoint;
    color: string;
    name: string;
    timeRange: TimeRange;
}

const CognitiveChart: React.FC<CognitiveChartProps> = ({ data, dataKey, color, name, timeRange }) => {
    const brushTickFormatter = (unixTime: number) => {
       const date = new Date(unixTime);
       switch (timeRange) {
           case 'week': return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
           case 'day': return date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
           case 'hour':
           case 'live':
           default: return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
       }
   };
   return (
   <div className="w-full h-56 md:h-64">
       <h3 className="text-lg font-semibold mb-2 text-center text-gray-300">{name}</h3>
       <ResponsiveContainer width="100%" height="100%">
           <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
               <XAxis dataKey="time" tick={{ fill: '#A0AEC0' }} tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()} hide={true} />
               <YAxis domain={[0, 100]} tick={{ fill: '#A0AEC0' }} axisLine={false} tickLine={false} />
               <Tooltip
                   contentStyle={{ backgroundColor: 'rgba(26, 32, 44, 0.95)', borderColor: '#4A5568', color: '#E2E8F0', borderRadius: '8px' }}
                   labelFormatter={(unixTime) => new Date(unixTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                   formatter={(value: number) => value.toFixed(1)}
               />
                <Legend verticalAlign="top" height={36}/>
               <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 6 }} isAnimationActive={false}/>
               <Brush dataKey="time" height={25} stroke={color} fill="rgba(100, 116, 139, 0.2)" travellerWidth={10} tickFormatter={brushTickFormatter}>
                   <LineChart><Line type="monotone" dataKey={dataKey} stroke={color} dot={false} /></LineChart>
               </Brush>
           </LineChart>
       </ResponsiveContainer>
   </div>
)};

const getIntensityColor = (type: Notification['type'], intensity: number): string => {
    if (type === 'stress') return intensity > 0.7 ? 'bg-red-500' : 'bg-orange-500';
    if (type === 'low-attention') return intensity > 0.7 ? 'bg-yellow-500' : 'bg-yellow-400';
    return 'bg-gray-500';
};

const CognitiveGauge: React.FC<{ value: number; label: string; colorClassName: string }> = ({ value, label, colorClassName }) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    return (
        <div className="relative w-28 h-28">
            <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle className="text-gray-800" strokeWidth="8" stroke="currentColor" fill="transparent" r={radius} cx="50" cy="50" />
                <circle className={`${colorClassName} transition-all duration-300 ease-in-out`} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" stroke="currentColor" fill="transparent" r={radius} cx="50" cy="50" transform="rotate(-90 50 50)" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{Math.round(value)}</span>
                <span className="text-xs text-gray-400">{label}</span>
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const [data, setData] = useState<CognitiveDataPoint[]>([]); 
    const [allData, setAllData] = useState<CognitiveDataPoint[]>([]); 
    const [timeRange, setTimeRange] = useState<TimeRange>('live');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cognitiveSummary, setCognitiveSummary] = useState<SummaryState>({ text: 'Initializing Biometrics...', color: 'text-gray-400' });
    const [suggestion, setSuggestion] = useState<string>('');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    
    // Biometric Stats State for UI
    const [biometrics, setBiometrics] = useState({ yaw: 0, pitch: 0, ear: 0, blinkRate: 0 });

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modelRef = useRef(new CognitiveModel());
    
    // Blink detection vars
    const blinksRef = useRef<number[]>([]); // Timestamps of blinks
    const isBlinkingRef = useRef(false);

    // Alert Logic Refs
    const highStressCounter = useRef(0);
    const lowAttentionCounter = useRef(0);
    const highStressAlertActive = useRef(false);
    const lowAttentionAlertActive = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);

    // --- SOUND ALERT ---
    const playAlertSound = useCallback((type: 'stress' | 'attention') => {
        if (!audioContextRef.current) {
            try { audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } 
            catch (e) { return; }
        }
        const audioCtx = audioContextRef.current;
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (type === 'stress') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.5);
        } else {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        }
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
    }, []);

    // --- LOAD MODELS ---
    useEffect(() => {
        const loadModels = async () => {
            if (!faceapi) {
                setCameraError("Biometric engine (FaceAPI) missing. Check connection.");
                return;
            }
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
            } catch (e) {
                setCameraError("Failed to load biometric models.");
            }
        };
        loadModels();
    }, []);

    // --- BIOMETRIC ANALYSIS LOOP ---
    const analyzeBiometrics = useCallback(async () => {
        if (!videoRef.current || !modelsLoaded || !faceapi) return;

        const video = videoRef.current;
        // Use TinyFaceDetector for performance in the loop
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
            .withFaceLandmarks()
            .withFaceExpressions();

        if (detections) {
            const landmarks = detections.landmarks;
            const expr = detections.expressions;

            // 1. Head Pose Estimation (Approximation based on landmarks)
            // Nose tip: 30, Left Eye: 36, Right Eye: 45, Jaw: 8
            const nose = landmarks.getNose()[3];
            const jaw = landmarks.getJawOutline()[8];
            const leftEye = landmarks.getLeftEye()[0];
            const rightEye = landmarks.getRightEye()[3];
            
            // Yaw (Left/Right)
            const eyeDist = rightEye.x - leftEye.x;
            const midEye = { x: leftEye.x + eyeDist/2, y: leftEye.y };
            const noseOffset = nose.x - midEye.x;
            const yaw = (noseOffset / eyeDist) * 90; // Approx degrees

            // Pitch (Up/Down)
            const jawDist = jaw.y - nose.y;
            const expectedJawDist = eyeDist * 1.2; // roughly
            const pitch = ((jawDist - expectedJawDist) / expectedJawDist) * 90;

            // 2. Eye Aspect Ratio (EAR) for blinking
            // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
            const getEAR = (eye: any[]) => {
                const A = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
                const B = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
                const C = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
                return (A + B) / (2.0 * C);
            };
            const leftEAR = getEAR(landmarks.getLeftEye());
            const rightEAR = getEAR(landmarks.getRightEye());
            const avgEAR = (leftEAR + rightEAR) / 2;

            // Blink Detection Logic
            if (avgEAR < 0.18) {
                if (!isBlinkingRef.current) {
                    isBlinkingRef.current = true;
                    blinksRef.current.push(Date.now());
                }
            } else {
                isBlinkingRef.current = false;
            }

            // Calculate Blink Rate (blinks per minute)
            const now = Date.now();
            blinksRef.current = blinksRef.current.filter(t => now - t < 60000); // Keep last 60s
            const blinkRate = blinksRef.current.length;

            setBiometrics({
                yaw: parseFloat(yaw.toFixed(1)),
                pitch: parseFloat(pitch.toFixed(1)),
                ear: parseFloat(avgEAR.toFixed(2)),
                blinkRate
            });

            // 3. Update Mathematical Model
            const input: BiometricInput = {
                yaw,
                pitch,
                roll: 0, // Simplified
                ear: avgEAR,
                blinkRate,
                expressionConfidence: {
                    neutral: expr.neutral,
                    happy: expr.happy,
                    angry: expr.angry,
                    fearful: expr.fearful,
                    surprised: expr.surprised
                },
                interactionLevel: 0 // Will rely on pure biometrics
            };

            const newPoint = modelRef.current.update(input);
            processNewDataPoint(newPoint);
        } else {
            // No face detected - penalized heavily
             const newPoint = modelRef.current.update({
                yaw: 45, pitch: 45, roll: 0, ear: 0.3, blinkRate: 15,
                expressionConfidence: { neutral: 0, happy: 0, angry: 0, fearful: 0, surprised: 0 },
                interactionLevel: 0
            });
            processNewDataPoint(newPoint);
        }
    }, [modelsLoaded]);

    const processNewDataPoint = (newPoint: CognitiveDataPoint) => {
        setData(curr => [...curr.slice(-MAX_DATA_POINTS + 1), newPoint]);
        setAllData(curr => {
            const updated = [...curr, newPoint];
            return updated.length > MAX_HISTORY_POINTS ? updated.slice(-MAX_HISTORY_POINTS) : updated;
        });

        // Update Summaries & Alerts
        const summary = getCognitiveSummary(newPoint);
        setCognitiveSummary(summary);
        setSuggestion(getPersonalizedSuggestion(summary.text));

        // Stress Logic
        if (newPoint.stress > HIGH_STRESS_THRESHOLD) highStressCounter.current++;
        else highStressCounter.current = 0;
        
        if (highStressCounter.current > STRESS_ALERT_DURATION_COUNT && !highStressAlertActive.current) {
            playAlertSound('stress');
            setNotifications(p => [...p, { id: Date.now(), type: 'stress', title: 'Stress Spike', message: 'Biometrics indicate high tension.', intensity: 1 }]);
            highStressAlertActive.current = true;
        }
        if (newPoint.stress < STRESS_RECOVERY_THRESHOLD) highStressAlertActive.current = false;

        // Attention Logic
        if (newPoint.attention < LOW_ATTENTION_THRESHOLD) lowAttentionCounter.current++;
        else lowAttentionCounter.current = 0;

        if (lowAttentionCounter.current > LOW_ATTENTION_DURATION_COUNT && !lowAttentionAlertActive.current) {
            playAlertSound('attention');
             setNotifications(p => [...p, { id: Date.now(), type: 'low-attention', title: 'Focus Lost', message: 'Head pose or eye closure detected.', intensity: 1 }]);
            lowAttentionAlertActive.current = true;
        }
        if (newPoint.attention > LOW_ATTENTION_RECOVERY_THRESHOLD) lowAttentionAlertActive.current = false;
    };


    // --- CAMERA SETUP ---
    const initializeCamera = useCallback(async () => {
        setCameraError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setCameraError("Camera access denied.");
        }
    }, []);

    // Main Loop
    useEffect(() => {
        initializeCamera();
        const interval = setInterval(() => {
            analyzeBiometrics();
        }, 300); // 3-4 FPS analysis is sufficient for stats
        return () => clearInterval(interval);
    }, [initializeCamera, analyzeBiometrics]);

    // Data Memoization
    const chartData = useMemo(() => {
        if (timeRange === 'live') return data;
        const now = Date.now();
        let startTime = now - (timeRange === 'hour' ? 3600000 : timeRange === 'day' ? 86400000 : 604800000);
        return allData.filter(p => p.time >= startTime);
    }, [timeRange, data, allData]);

    const handleDismissNotification = (id: number) => setNotifications(n => n.filter(x => x.id !== id));

    const handleExportCSV = useCallback(() => {
        if (chartData.length === 0) return;
        const rows = chartData.map(p => `"${new Date(p.time).toISOString()}",${p.attention},${p.stress},${p.curiosity}`);
        const csv = ["Time,Attention,Stress,Curiosity", ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "biometric_data.csv";
        a.click();
    }, [chartData]);

    return (
        <div className="relative bg-gray-900/50 p-4 md:p-8 rounded-2xl border border-gray-800 shadow-2xl">
            {/* Header Controls */}
            <div className="flex flex-wrap gap-2 mb-8">
                {['live', 'hour', 'day', 'week'].map(t => (
                    <button key={t} onClick={() => setTimeRange(t as TimeRange)} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 capitalize ${timeRange === t ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 bg-gray-800'}`}>
                        {t === 'live' ? <ZapIcon /> : <HistoryIcon />} {t}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LEFT: Video & Status */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] border-2 border-gray-700 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                        {!modelsLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-20">
                                <span className="text-cyan-400 font-mono animate-pulse">Initializing Biometric Engine...</span>
                            </div>
                        )}
                        {cameraError ? (
                            <div className="p-10 text-center text-red-400">{cameraError} <button onClick={initializeCamera} className="block mt-4 mx-auto bg-gray-800 px-3 py-1 rounded">Retry</button></div>
                        ) : (
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        )}
                        {/* Biometric Overlay */}
                        <div className="absolute top-2 left-2 bg-black/60 p-2 rounded text-[10px] font-mono text-green-400 space-y-1 backdrop-blur-sm border border-green-500/20">
                            <div>YAW: {biometrics.yaw}°</div>
                            <div>PITCH: {biometrics.pitch}°</div>
                            <div>BLINK RATE: {biometrics.blinkRate}/min</div>
                            <div>EAR: {biometrics.ear}</div>
                        </div>
                         {/* Live Indicator */}
                        <div className="absolute bottom-2 left-2 bg-red-600/90 text-white px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                            <span className="w-2 h-2 bg-white rounded-full animate-ping"></span> LIVE
                        </div>
                    </div>

                    {/* Notification Stack */}
                    <div className="space-y-2">
                         {notifications.map((n) => (
                             <div key={n.id} className="bg-gray-800/90 border border-gray-600 p-3 rounded flex justify-between items-start animate-fade-in-right">
                                 <div>
                                     <p className="text-white font-bold text-sm flex items-center gap-2">{n.type === 'stress' ? <FlameIcon /> : <ExclamationIcon />} {n.title}</p>
                                     <p className="text-gray-400 text-xs">{n.message}</p>
                                 </div>
                                 <button onClick={() => handleDismissNotification(n.id)}><XIcon /></button>
                             </div>
                         ))}
                    </div>

                    {/* Gauges */}
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex justify-around">
                        <CognitiveGauge value={data[data.length-1]?.attention || 0} label="Attention" colorClassName="text-cyan-400" />
                        <CognitiveGauge value={data[data.length-1]?.stress || 0} label="Stress" colorClassName="text-rose-500" />
                    </div>
                </div>

                {/* RIGHT: Charts & Suggestions */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700/50">
                        <h4 className="text-sm font-mono text-gray-500 mb-2 uppercase">Analysis Summary</h4>
                        <div className="flex items-center gap-3">
                            <div className={`text-2xl font-bold ${cognitiveSummary.color}`}>{cognitiveSummary.text}</div>
                            <div className="h-4 w-[1px] bg-gray-600"></div>
                            <div className="text-gray-300 text-sm italic">"{suggestion}"</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <CognitiveChart data={chartData} dataKey="attention" color="#22d3ee" name="Attention Level (Head Pose & Gaze)" timeRange={timeRange} />
                        <CognitiveChart data={chartData} dataKey="stress" color="#f43f5e" name="Stress Level (HRV & Micro-expressions)" timeRange={timeRange} />
                        <CognitiveChart data={chartData} dataKey="curiosity" color="#a78bfa" name="Flow/Curiosity Index" timeRange={timeRange} />
                    </div>

                    <div className="flex justify-end">
                         <button onClick={handleExportCSV} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors">
                            <DownloadIcon /> Export Analysis CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
