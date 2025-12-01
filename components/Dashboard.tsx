
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import type { CognitiveDataPoint, Notification } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { XIcon } from './icons/XIcon';
import { CognitiveModel } from './cognitiveModel';
import { LightBulbIcon } from './icons/LightBulbIcon';
import { BellIcon } from './icons/BellIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { ZapIcon } from './icons/ZapIcon';
import { FlameIcon } from './icons/FlameIcon';
import { TrendingDownIcon } from './icons/TrendingDownIcon';

const MAX_DATA_POINTS = 30;
const MAX_HISTORY_POINTS = 5000;
const STORAGE_KEY = 'neuroLensHistory';

const HIGH_STRESS_THRESHOLD = 85;
const STRESS_ALERT_DURATION_COUNT = 4; // Approx 6 seconds (4 * 1.5s interval)
const STRESS_SPIKE_THRESHOLD = 30; // Increase over the window
const STRESS_SPIKE_WINDOW = 7; // Approx 10.5 seconds (7 * 1.5s interval)
const STRESS_RECOVERY_THRESHOLD = 70; // Stress must drop below this to clear an alert
const ATTENTION_DROP_THRESHOLD = 35; // Drop from recent average
const RECENT_ATTENTION_WINDOW = 5; // Number of data points for average
const ATTENTION_RECOVERY_FACTOR = 0.5; // Attention must recover above (avg - threshold * factor) to dismiss alert
const LOW_ATTENTION_THRESHOLD = 35;
const LOW_ATTENTION_DURATION_COUNT = 4;
const LOW_ATTENTION_RECOVERY_THRESHOLD = 40;
const LOW_CURIOSITY_THRESHOLD = 40;
const LOW_CURIOSITY_DURATION_COUNT = 5;
const LOW_CURIOSITY_RECOVERY_THRESHOLD = 45;


interface SummaryState {
    text: string;
    color: string;
}

const getCognitiveSummary = (point: CognitiveDataPoint): SummaryState => {
    const { attention, stress, curiosity } = point;

    if (attention > 75 && stress > 65) {
        return { text: "Cognitive Load", color: "text-amber-400" };
    }
    if (attention > 80 && stress < 30) {
        return { text: "Flow State", color: "text-cyan-300" };
    }
    if (curiosity > 70 && attention > 60) {
        return { text: "Engaged & Curious", color: "text-violet-400" };
    }
    if (stress > 70 && attention < 40) {
        return { text: "Stressed & Distracted", color: "text-rose-500" };
    }
    if (attention < 30) {
        return { text: "Attention Waning", color: "text-yellow-500" };
    }
    if (stress > 60) {
        return { text: "High Stress", color: "text-red-500" };
    }
    if (curiosity > 75) {
        return { text: "High Curiosity", color: "text-purple-400" };
    }
    return { text: "Nominal Engagement", color: "text-gray-300" };
};

const getPersonalizedSuggestion = (summaryText: string): string => {
    switch (summaryText) {
        case "Cognitive Load":
            return "Consider a 2-minute mindfulness exercise to reset your focus.";
        case "Flow State":
            return "You're in the zone! Minimize distractions to maintain this high-performance state.";
        case "Attention Waning":
            return "Try the Pomodoro Technique: 25 minutes of focused work followed by a 5-minute break.";
        case "Stressed & Distracted":
            return "Step away for a moment. A short walk can help clear your mind and reduce stress.";
        case "High Stress":
            return "Your stress levels are high. It's a good time for a short break or some deep breathing exercises.";
        default:
            return "Stay engaged and monitor your cognitive state for optimal performance.";
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
            case 'week':
                return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
            case 'day':
                return date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
            case 'hour':
            case 'live':
            default:
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
                    contentStyle={{
                        backgroundColor: 'rgba(26, 32, 44, 0.8)',
                        borderColor: '#4A5568',
                        color: '#E2E8F0',
                    }}
                    labelFormatter={(unixTime) => new Date(unixTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                    formatter={(value: number) => value.toFixed(1)}
                />
                 <Legend verticalAlign="top" height={36}/>
                <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 6 }} isAnimationActive={false}/>
                <Brush 
                    dataKey="time" 
                    height={25} 
                    stroke={color} 
                    fill="rgba(100, 116, 139, 0.2)" 
                    travellerWidth={10}
                    tickFormatter={brushTickFormatter}
                >
                    <LineChart>
                        <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} />
                    </LineChart>
                </Brush>
            </LineChart>
        </ResponsiveContainer>
    </div>
)};

const getIntensityColor = (type: Notification['type'], intensity: number): string => {
    if (type === 'stress') {
        if (intensity > 0.7) return 'bg-red-500';
        if (intensity > 0.4) return 'bg-orange-500';
        return 'bg-amber-500';
    }
    if (type === 'attention-drop' || type === 'low-attention') {
        if (intensity > 0.7) return 'bg-orange-400';
        if (intensity > 0.4) return 'bg-yellow-400';
        return 'bg-sky-400';
    }
    if (type === 'low-curiosity') {
        if (intensity > 0.7) return 'bg-fuchsia-500';
        if (intensity > 0.4) return 'bg-purple-500';
        return 'bg-violet-400';
    }
    return 'bg-gray-500';
};

interface CognitiveGaugeProps {
    value: number;
    label: string;
    colorClassName: string;
}

const CognitiveGauge: React.FC<CognitiveGaugeProps> = ({ value, label, colorClassName }) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="relative w-28 h-28">
            <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                    className="text-gray-700"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="50"
                    cy="50"
                />
                <circle
                    className={`${colorClassName} transition-all duration-300 ease-in-out`}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="50"
                    cy="50"
                    transform="rotate(-90 50 50)"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{Math.round(value)}</span>
                <span className="text-xs text-gray-400">{label}</span>
            </div>
        </div>
    );
};


const Dashboard: React.FC = () => {
    const [data, setData] = useState<CognitiveDataPoint[]>([]); // For live view
    const [allData, setAllData] = useState<CognitiveDataPoint[]>([]); // For historical view
    const [timeRange, setTimeRange] = useState<TimeRange>('live');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cognitiveSummary, setCognitiveSummary] = useState<SummaryState>({ text: 'Initializing AI...', color: 'text-gray-400' });
    const [suggestion, setSuggestion] = useState<string>('');
    const [displayedCognitiveSummary, setDisplayedCognitiveSummary] = useState(cognitiveSummary);
    const [displayedSuggestion, setDisplayedSuggestion] = useState(suggestion);
    const [isFading, setIsFading] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastInteractionTimeRef = useRef<number>(Date.now());
    const highStressCounter = useRef(0);
    const lowAttentionCounter = useRef(0);
    const lowCuriosityCounter = useRef(0);
    const highStressAlertActive = useRef(false);
    const attentionDropAlertActive = useRef(false);
    const lowAttentionAlertActive = useRef(false);
    const lowCuriosityAlertActive = useRef(false);
    const modelRef = useRef(new CognitiveModel());
    const attentionHistoryRef = useRef<number[]>([]);
    const stressHistoryRef = useRef<number[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    
    // Vision Processing Refs
    const gazeScoreRef = useRef<number>(0.5);
    const scanningScoreRef = useRef<number>(0.1);
    const isProcessingRef = useRef<boolean>(false);

    const playAlertSound = useCallback((type: 'stress' | 'attention') => {
        if (!audioContextRef.current) {
            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser.");
                return;
            }
        }
        const audioCtx = audioContextRef.current;
        if (!audioCtx) return;

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (type === 'stress') {
            // A more urgent, descending square wave for stress
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(660, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(330, audioCtx.currentTime + 0.2);
            gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        } else { // 'attention'
            // A softer, higher-pitched sine wave for attention drops
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        }

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
    }, []);

    const startVideoProcessing = useCallback(() => {
        if (isProcessingRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        isProcessingRef.current = true;
        
        // Low res for performance
        const width = 64;
        const height = 48;
        canvas.width = width;
        canvas.height = height;

        let prevFrame: Uint8ClampedArray | null = null;
        let lastFrameTime = 0;
        const FPS = 15; // Limit processing rate
        const interval = 1000 / FPS;

        const processLoop = (timestamp: number) => {
             if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
                 isProcessingRef.current = false;
                 return;
             }
             
             if (timestamp - lastFrameTime >= interval) {
                 lastFrameTime = timestamp;
                 
                 try {
                     ctx.drawImage(video, 0, 0, width, height);
                     const frameData = ctx.getImageData(0, 0, width, height);
                     const data = frameData.data;

                     let movement = 0;
                     let brightness = 0;

                     // Simple pixel analysis
                     for (let i = 0; i < data.length; i += 4) {
                         const r = data[i];
                         const g = data[i + 1];
                         const b = data[i + 2];
                         const gray = (r + g + b) / 3;
                         
                         brightness += gray;

                         if (prevFrame) {
                             const pr = prevFrame[i];
                             const pg = prevFrame[i + 1];
                             const pb = prevFrame[i + 2];
                             const pGray = (pr + pg + pb) / 3;
                             movement += Math.abs(gray - pGray);
                         }
                     }

                     const pixelCount = width * height;
                     brightness /= pixelCount; // 0-255
                     movement /= pixelCount; // Average change per pixel

                     // Store current frame for next comparison (must copy)
                     prevFrame = new Uint8ClampedArray(data);

                     // Heuristic Logic:
                     // 1. Low brightness = Low Attention (User away/dark)
                     // 2. High movement = Low Attention/High Interaction (Restless)
                     // 3. Low movement = High Focus (Steady gaze)
                     // 4. Moderate movement = Scanning/Reading (Curiosity)
                     
                     let currentGaze = 0.5;
                     let currentScanning = 0;
                     
                     if (brightness < 30) {
                         currentGaze = 0.1; // Too dark
                         currentScanning = 0;
                     } else {
                         // Movement usually ranges 0-20 for subtle, >20 for big moves
                         // We want stability to equal focus (Low movement)
                         const stability = Math.max(0, 1 - (movement / 15)); 
                         currentGaze = stability;

                         // Scanning behavior involves moderate eye/head movement (reading text, checking details)
                         // We detect this as movement falling into a specific "active" range (approx 2-12)
                         // Peak scanning score around movement 7
                         if (movement > 2 && movement < 12) {
                            const dist = Math.abs(movement - 7);
                            currentScanning = Math.max(0, 1 - (dist / 5)); // Normalize to 0-1
                         }
                     }

                     // Smooth the value
                     gazeScoreRef.current = (gazeScoreRef.current * 0.7) + (currentGaze * 0.3);
                     scanningScoreRef.current = (scanningScoreRef.current * 0.7) + (currentScanning * 0.3);

                 } catch (e) {
                     // Canvas error (e.g., context lost), ignore frame
                 }
             }

             requestAnimationFrame(processLoop);
        };
        requestAnimationFrame(processLoop);
    }, []);

    const initializeCamera = useCallback(async () => {
        setCameraError(null);
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Request slightly lower res to be performant
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } 
                });
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play().catch(e => console.log("Play failed", e));
                        startVideoProcessing();
                    };
                }
            } else {
                setCameraError("Camera API not supported in this browser.");
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            setCameraError("Permission denied. Please check your browser's camera permissions icon (usually in the address bar).");
        }
    }, [startVideoProcessing]);
    
    useEffect(() => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                const parsedData = JSON.parse(storedData) as CognitiveDataPoint[];
                setAllData(parsedData);
            } catch (e) {
                console.error("Failed to parse historical data", e);
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        initializeCamera();
        
        return () => {
            // Cleanup stream tracks on unmount
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            isProcessingRef.current = false;
        }
    }, [initializeCamera]);

    useEffect(() => {
        const handleInteraction = () => { lastInteractionTimeRef.current = Date.now(); };
        window.addEventListener('mousemove', handleInteraction);
        window.addEventListener('click', handleInteraction);
        return () => {
          window.removeEventListener('mousemove', handleInteraction);
          window.removeEventListener('click', handleInteraction);
        };
      }, []);

    const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        setNotifications(currentNotifications => {
            if (currentNotifications.some(n => n.type === notification.type)) {
                return currentNotifications;
            }
            return [...currentNotifications, { ...notification, id: Date.now() }];
        });
    }, []);

    const handleDismissNotification = useCallback((id: number) => {
        setNotifications(currentNotifications =>
            currentNotifications.filter(n => n.id !== id)
        );
    }, []);


    useEffect(() => {
        const interval = setInterval(() => {
            const timeSinceInteraction = Date.now() - lastInteractionTimeRef.current;
            const interactionLevel = timeSinceInteraction < 1500 ? Math.random() * 0.3 + 0.6 : 0; // Spike on interaction
            
            // Use real vision data mixed with simulated interaction
            // gazeScoreRef is updated by the video processing loop (0.0 - 1.0)
            const realGaze = gazeScoreRef.current;
            const realScanning = scanningScoreRef.current;
            
            // If interaction is high, we assume focus is on screen even if head moves
            const effectiveGaze = Math.max(realGaze, interactionLevel * 0.8);
            
            let simulatedValence: 'positive' | 'negative' | 'neutral' = 'neutral';
            // Randomly simulate micro-expressions occasionally if gaze is steady
            if (effectiveGaze > 0.6 && Math.random() < 0.1) {
                 const valenceRoll = Math.random();
                 if (valenceRoll < 0.4) simulatedValence = 'negative';
                 else if (valenceRoll < 0.8) simulatedValence = 'positive';
            }

            const newPoint = modelRef.current.update({ 
                interactionLevel, 
                simulatedGazeFocus: effectiveGaze, 
                simulatedValence,
                visualScanning: realScanning
            });
            
            setData(currentData => {
                const newData = [...currentData, newPoint];
                return newData.length > MAX_DATA_POINTS ? newData.slice(-MAX_DATA_POINTS) : newData;
            });

            setAllData(currentAllData => {
                const updatedHistory = [...currentAllData, newPoint];
                const finalHistory = updatedHistory.length > MAX_HISTORY_POINTS ? updatedHistory.slice(-MAX_HISTORY_POINTS) : updatedHistory;
                setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(finalHistory)), 0);
                return finalHistory;
            });
            
            setCognitiveSummary(getCognitiveSummary(newPoint));
            
            const stressHistory = stressHistoryRef.current;
            stressHistory.push(newPoint.stress);
            if (stressHistory.length > STRESS_SPIKE_WINDOW) stressHistory.shift();
            if (newPoint.stress < STRESS_RECOVERY_THRESHOLD && highStressAlertActive.current) {
                setNotifications(curr => curr.filter(n => n.type !== 'stress'));
                highStressAlertActive.current = false;
                highStressCounter.current = 0;
            }
            if (stressHistory.length === STRESS_SPIKE_WINDOW && !highStressAlertActive.current) {
                const stressIncrease = newPoint.stress - stressHistory[0];
                if (stressIncrease >= STRESS_SPIKE_THRESHOLD) {
                    addNotification({ type: 'stress', title: 'Rapid Stress Spike', message: 'A sudden increase in stress was detected.', intensity: Math.max(0, Math.min(1, (stressIncrease - STRESS_SPIKE_THRESHOLD) / STRESS_SPIKE_THRESHOLD)) });
                    playAlertSound('stress');
                    highStressAlertActive.current = true;
                    highStressCounter.current = 0;
                }
            }
            if (newPoint.stress > HIGH_STRESS_THRESHOLD) highStressCounter.current += 1;
            else highStressCounter.current = 0;
            if (highStressCounter.current >= STRESS_ALERT_DURATION_COUNT && !highStressAlertActive.current) {
                addNotification({ type: 'stress', title: 'High Stress Detected', message: 'Consider taking a short break to refocus.', intensity: Math.max(0, Math.min(1, (newPoint.stress - HIGH_STRESS_THRESHOLD) / (100 - HIGH_STRESS_THRESHOLD))) });
                playAlertSound('stress');
                highStressAlertActive.current = true;
            }

            const attentionHistory = attentionHistoryRef.current;
            if (attentionDropAlertActive.current) {
                const averageAttention = attentionHistory.reduce((a, b) => a + b, 0) / attentionHistory.length;
                if (newPoint.attention > averageAttention - (ATTENTION_DROP_THRESHOLD * ATTENTION_RECOVERY_FACTOR)) {
                   setNotifications(curr => curr.filter(n => n.type !== 'attention-drop'));
                   attentionDropAlertActive.current = false;
                }
            }
            if (attentionHistory.length >= RECENT_ATTENTION_WINDOW && !attentionDropAlertActive.current) {
                const averageAttention = attentionHistory.reduce((a, b) => a + b, 0) / attentionHistory.length;
                const attentionDrop = averageAttention - newPoint.attention;
                if (attentionDrop > ATTENTION_DROP_THRESHOLD) {
                    addNotification({ type: 'attention-drop', title: 'Sudden Drop in Attention', message: 'A significant distraction may have occurred.', intensity: Math.max(0, Math.min(1, (attentionDrop - ATTENTION_DROP_THRESHOLD) / (100 - ATTENTION_DROP_THRESHOLD))) });
                    playAlertSound('attention');
                    attentionDropAlertActive.current = true;
                }
            }
            if (newPoint.attention > LOW_ATTENTION_RECOVERY_THRESHOLD && lowAttentionAlertActive.current) {
                setNotifications(curr => curr.filter(n => n.type !== 'low-attention'));
                lowAttentionAlertActive.current = false;
                lowAttentionCounter.current = 0;
            }
            if (newPoint.attention < LOW_ATTENTION_THRESHOLD) lowAttentionCounter.current += 1;
            else lowAttentionCounter.current = 0;
            if (lowAttentionCounter.current >= LOW_ATTENTION_DURATION_COUNT && !lowAttentionAlertActive.current) {
                 addNotification({ type: 'low-attention', title: 'Low Attention Span', message: 'Focus appears to be consistently low.', intensity: Math.max(0, Math.min(1, (LOW_ATTENTION_THRESHOLD - newPoint.attention) / LOW_ATTENTION_THRESHOLD)) });
                lowAttentionAlertActive.current = true;
            }

            if (newPoint.curiosity > LOW_CURIOSITY_RECOVERY_THRESHOLD && lowCuriosityAlertActive.current) {
                setNotifications(curr => curr.filter(n => n.type !== 'low-curiosity'));
                lowCuriosityAlertActive.current = false;
                lowCuriosityCounter.current = 0;
            }
            if (newPoint.curiosity < LOW_CURIOSITY_THRESHOLD) lowCuriosityCounter.current += 1;
            else lowCuriosityCounter.current = 0;
            if (lowCuriosityCounter.current >= LOW_CURIOSITY_DURATION_COUNT && !lowCuriosityAlertActive.current) {
                 addNotification({ type: 'low-curiosity', title: 'Low Curiosity', message: 'Interest appears to be waning. A new topic might help.', intensity: Math.max(0, Math.min(1, (LOW_CURIOSITY_THRESHOLD - newPoint.curiosity) / LOW_CURIOSITY_THRESHOLD)) });
                lowCuriosityAlertActive.current = true;
            }

            attentionHistoryRef.current.push(newPoint.attention);
            if (attentionHistoryRef.current.length > RECENT_ATTENTION_WINDOW) attentionHistoryRef.current.shift();
            
        }, 1500);

        return () => clearInterval(interval);
    }, [addNotification, playAlertSound]);
    
    useEffect(() => {
        setSuggestion(getPersonalizedSuggestion(cognitiveSummary.text));
    }, [cognitiveSummary]);

    useEffect(() => {
        if (cognitiveSummary.text !== displayedCognitiveSummary.text) {
            setIsFading(true);
            const timer = setTimeout(() => {
                setDisplayedCognitiveSummary(cognitiveSummary);
                setDisplayedSuggestion(suggestion);
                setIsFading(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [cognitiveSummary, suggestion, displayedCognitiveSummary.text]);

    const chartData = useMemo(() => {
        if (timeRange === 'live') {
            return data;
        }
        const now = Date.now();
        let startTime = now;
        if (timeRange === 'hour') startTime -= 60 * 60 * 1000;
        if (timeRange === 'day') startTime -= 24 * 60 * 60 * 1000;
        if (timeRange === 'week') startTime -= 7 * 24 * 60 * 60 * 1000;

        return allData.filter(p => p.time >= startTime);
    }, [timeRange, data, allData]);

     const historicalInsights = useMemo(() => {
        if (timeRange === 'live' || chartData.length < 2) {
            return null;
        }
        const avg = (key: keyof Omit<CognitiveDataPoint, 'time'>) => chartData.reduce((acc, p) => acc + (p[key] as number), 0) / chartData.length;
        const avgAttention = avg('attention');
        const avgStress = avg('stress');
        const avgCuriosity = avg('curiosity');
        const highStressEvents = chartData.filter(p => p.stress > HIGH_STRESS_THRESHOLD).length;
        const flowStatePeriods = chartData.filter(p => getCognitiveSummary(p).text === "Flow State").length;
        let insightText = `Your average attention was ${avgAttention.toFixed(1)}%.`;
        if (highStressEvents / chartData.length > 0.1) insightText += ` There were several instances of high stress.`;
        else if (flowStatePeriods / chartData.length > 0.2) insightText += ` You spent a significant amount of time in a "flow state."`;
        else insightText += ` Stress levels remained manageable.`;
        return { avgAttention, avgStress, avgCuriosity, insightText };
    }, [timeRange, chartData]);

    const borderColorClass = useMemo(() => {
        const colorMap: { [key: string]: string } = {
            "text-amber-400": "border-amber-400/60",
            "text-cyan-300": "border-cyan-300/60",
            "text-violet-400": "border-violet-400/60",
            "text-rose-500": "border-rose-500/60",
            "text-yellow-500": "border-yellow-500/60",
            "text-red-500": "border-red-500/60",
            "text-purple-400": "border-purple-400/60",
            "text-gray-300": "border-gray-700",
            "text-gray-400": "border-gray-700",
        };
        return colorMap[displayedCognitiveSummary.color] || 'border-gray-700';
    }, [displayedCognitiveSummary.color]);

    const handleExportCSV = useCallback(() => {
        if (chartData.length === 0) {
            alert("No data to export.");
            return;
        }

        const formatTimestamp = (unixTime: number): string => {
            const date = new Date(unixTime);
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateString = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            const timeString = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
            return `${dateString} ${timeString}`;
        };

        const headers = ["Time", "Attention", "Stress", "Curiosity"];
        const rows = chartData.map(point => [ `"${formatTimestamp(point.time)}"`, point.attention.toFixed(2), point.stress.toFixed(2), point.curiosity.toFixed(2) ].join(','));
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `neuro_lens_data_${timeRange}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [chartData, timeRange]);

    const isStressActive = notifications.some(n => n.type === 'stress');
    const isAttentionActive = notifications.some(n => n.type === 'attention-drop' || n.type === 'low-attention');

    const TimeRangeButton: React.FC<{label: string, value: TimeRange, icon: React.ReactNode}> = ({label, value, icon}) => (
        <button onClick={() => setTimeRange(value)} className={`px-3 py-1.5 md:px-4 md:py-2 text-sm font-semibold rounded-md flex items-center transition-colors ${timeRange === value ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-700/50'}`}>
            {icon}
            {label}
        </button>
    );
    
    const latestDataPoint = data[data.length - 1];
    const currentAttention = latestDataPoint ? latestDataPoint.attention : 0;
    const currentStress = latestDataPoint ? latestDataPoint.stress : 0;
    const currentCuriosity = latestDataPoint ? latestDataPoint.curiosity : 0;


    return (
        <div className="relative bg-gray-900/50 p-4 md:p-8 rounded-2xl border border-gray-800 shadow-2xl shadow-cyan-500/10">
            {/* Hidden canvas for processing video frames */}
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-wrap justify-center gap-2 mb-8">
                <TimeRangeButton label="Live" value="live" icon={<ZapIcon />} />
                <TimeRangeButton label="Last Hour" value="hour" icon={<HistoryIcon />} />
                <TimeRangeButton label="Last 24H" value="day" icon={<HistoryIcon />} />
                <TimeRangeButton label="Last 7D" value="week" icon={<HistoryIcon />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className={`flex flex-col items-center justify-center bg-black rounded-lg overflow-hidden border-2 aspect-video lg:aspect-[4/3] relative transition-colors duration-500 ${borderColorClass}`}>
                        {cameraError ? (
                            <div className="p-4 text-center text-red-400">
                                <ExclamationIcon />
                                <p className="font-semibold mt-2">Camera Error</p>
                                <p className="text-sm mt-1">{cameraError}</p>
                                <button 
                                    onClick={() => initializeCamera()}
                                    className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors"
                                >
                                    Retry Access
                                </button>
                            </div>
                        ) : (
                            <>
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]"></video>
                                {/* UI Overlay for "Scanning" effect */}
                                <div className="absolute inset-0 border-[1px] border-cyan-500/30 m-4 rounded pointer-events-none flex flex-col justify-between">
                                    <div className="flex justify-between p-2">
                                        <div className="w-2 h-2 border-t-2 border-l-2 border-cyan-400"></div>
                                        <div className="w-2 h-2 border-t-2 border-r-2 border-cyan-400"></div>
                                    </div>
                                     <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-400/20 animate-pulse"></div>
                                    <div className="flex justify-between p-2">
                                        <div className="w-2 h-2 border-b-2 border-l-2 border-cyan-400"></div>
                                        <div className="w-2 h-2 border-b-2 border-r-2 border-cyan-400"></div>
                                    </div>
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-cyan-500/70 tracking-widest bg-black/40 px-2 rounded">
                                        AI VISION ACTIVE
                                    </div>
                                </div>
                            </>
                        )}
                        <div className={`absolute inset-0 transition-all duration-500 pointer-events-none rounded-lg ${isAttentionActive ? 'backdrop-brightness-75 backdrop-blur-sm' : ''} ${isStressActive ? 'animate-pulse-red' : ''}`}></div>
                        
                        <div className="absolute top-3 right-3 z-20 flex flex-col gap-3 w-72">
                            {notifications.map((n) => {
                                const isStress = n.type === 'stress';
                                const isAttentionDrop = n.type === 'attention-drop';
                                const iconColor = isStress ? 'text-red-400' : isAttentionDrop ? 'text-yellow-400' : n.type === 'low-attention' ? 'text-sky-400' : 'text-violet-400';
                                const bgColor = getIntensityColor(n.type, n.intensity);

                                let AlertIcon = null;
                                if (isStress) AlertIcon = <FlameIcon className="h-4 w-4 text-orange-500" />;
                                else if (isAttentionDrop) AlertIcon = <TrendingDownIcon className="h-4 w-4 text-yellow-500" />;

                                return (
                                <div key={n.id} className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/80 rounded-lg shadow-lg p-3 animate-fade-in-right">
                                    <div className="flex items-start gap-3">
                                        <div className={`flex-shrink-0 mt-1 ${iconColor}`}>{isStress || isAttentionDrop ? <ExclamationIcon /> : <BellIcon />}</div>
                                        <div className="flex-grow">
                                            <p className="font-semibold text-gray-200 flex items-center gap-2">
                                                {AlertIcon}
                                                {n.title}
                                            </p>
                                            <p className="text-sm text-gray-400">{n.message}</p>
                                        </div>
                                        <button onClick={() => handleDismissNotification(n.id)} className="p-1 -m-1 text-gray-500 hover:text-gray-200 transition-colors"><XIcon /></button>
                                    </div>
                                    <div className="mt-2" title={`Intensity: ${(n.intensity * 100).toFixed(0)}%`}>
                                        <div className="w-full bg-gray-600/50 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-1.5 rounded-full transition-all duration-300 ${bgColor}`} style={{ width: `${n.intensity * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                        {timeRange === 'live' && !cameraError && (
                            <div className="absolute bottom-2 left-2 bg-red-600 text-white px-2 py-0.5 rounded-md text-sm font-bold flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                LIVE
                            </div>
                        )}
                    </div>
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <h4 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider text-center">Real-time Metrics</h4>
                        <div className="flex justify-around items-center gap-2">
                            <CognitiveGauge value={currentAttention} label="Attention" colorClassName="text-cyan-400" />
                            <CognitiveGauge value={currentStress} label="Stress" colorClassName="text-rose-500" />
                            <CognitiveGauge value={currentCuriosity} label="Curiosity" colorClassName="text-violet-400" />
                        </div>
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider text-center">Current Cognitive State</h4>
                            <div className={`flex items-center justify-center gap-3 transition-opacity duration-200 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                                <span className={`w-3 h-3 rounded-full transition-colors duration-500 ${displayedCognitiveSummary.color.replace('text-', 'bg-')}`}></span>
                                <p className={`text-xl font-bold transition-colors duration-500 ${displayedCognitiveSummary.color}`}>{displayedCognitiveSummary.text}</p>
                            </div>
                        </div>
                    </div>
                     <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                        <div className="flex items-center gap-3 mb-2">
                            <LightBulbIcon />
                            <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Personalized Suggestion</h4>
                        </div>
                        <p className={`text-gray-300 transition-opacity duration-200 ${isFading ? 'opacity-0' : 'opacity-100'}`}>{displayedSuggestion}</p>
                    </div>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 gap-6 md:gap-8">
                    <CognitiveChart data={chartData} dataKey="attention" color="#22d3ee" name="Attention" timeRange={timeRange} />
                    <CognitiveChart data={chartData} dataKey="stress" color="#f43f5e" name="Stress" timeRange={timeRange} />
                    <CognitiveChart data={chartData} dataKey="curiosity" color="#a78bfa" name="Curiosity" timeRange={timeRange} />
                </div>
            </div>

            {historicalInsights && timeRange !== 'live' && (
                <div className="mt-8 border-t border-gray-800 pt-6 animate-fade-in-right">
                    <h3 className="text-xl font-bold text-center mb-4 text-white">Historical Summary ({timeRange === 'hour' ? 'Last Hour' : timeRange === 'day' ? 'Last 24 Hours' : 'Last 7 Days'})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                         <div className="bg-gray-800 p-4 rounded-lg border border-gray-700/50">
                            <p className="text-sm text-gray-400">Avg. Attention</p>
                            <p className="text-2xl font-bold text-cyan-400">{historicalInsights.avgAttention.toFixed(1)}%</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700/50">
                            <p className="text-sm text-gray-400">Avg. Stress</p>
                            <p className="text-2xl font-bold text-rose-400">{historicalInsights.avgStress.toFixed(1)}%</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700/50">
                            <p className="text-sm text-gray-400">Avg. Curiosity</p>
                            <p className="text-2xl font-bold text-violet-400">{historicalInsights.avgCuriosity.toFixed(1)}%</p>
                        </div>
                    </div>
                    <div className="mt-4 text-center bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-gray-300 italic">{historicalInsights.insightText}</p>
                    </div>
                </div>
            )}


            <div className="mt-8 border-t border-gray-800 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                     <div>
                         <p className="text-gray-500 text-sm italic">
                            Move your mouse or click to simulate interaction and see its effect on the cognitive model.
                         </p>
                    </div>
                    <div className="flex flex-col md:items-end gap-3">
                        <button 
                            onClick={handleExportCSV}
                            className="w-full md:w-auto flex items-center justify-center px-4 py-2 bg-gray-700/80 text-gray-300 rounded-md hover:bg-gray-600/80 transition-colors text-sm font-medium border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Export cognitive data to CSV"
                            disabled={chartData.length === 0}
                        >
                            <DownloadIcon />
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
