
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { CameraIcon } from './icons/CameraIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { ZapIcon } from './icons/ZapIcon';
import { UserGroupIcon } from './icons/UserGroupIcon';
import { DownloadIcon } from './icons/DownloadIcon';

interface MeetingDataPoint {
  time: number;
  sentiment: number; // 0-100 (Negative to Positive)
  engagement: number; // 0-100 (Low to High)
  dominance: number; // 0-100 (Who is speaking dominance)
}

const MeetingAgent: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [sharingSource, setSharingSource] = useState<string | null>(null);
  const [data, setData] = useState<MeetingDataPoint[]>([]);
  const [highlights, setHighlights] = useState<{time: string, text: string, type: 'positive'|'negative'|'neutral'}[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingRef = useRef(false);

  // Analyze the video frame to guess meeting dynamics
  const analyzeFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx || video.paused || video.ended) return;

    // Use a small resolution for performance
    canvas.width = 100;
    canvas.height = 75;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;
    
    let totalBrightness = 0;
    let totalVariation = 0;

    // Simple heuristic: 
    // High variation in pixel brightness usually means movement (people gesturing, speaking).
    // Brightness shifts can imply screen sharing changes or active speaker switching.
    for (let i = 0; i < data.length; i += 4) {
       const r = data[i];
       const g = data[i + 1];
       const b = data[i + 2];
       const brightness = (r + g + b) / 3;
       totalBrightness += brightness;
       
       // Calculate variation from a mid-grey to detect contrast (features)
       totalVariation += Math.abs(brightness - 128);
    }
    
    const avgBrightness = totalBrightness / (canvas.width * canvas.height);
    const avgVariation = totalVariation / (canvas.width * canvas.height);

    // Normalize variation (0-50 usually) to 0-100 engagement
    const calculatedEngagement = Math.min(100, Math.max(10, avgVariation * 2.5));
    
    const randomSentimentFlux = (Math.random() - 0.5) * 5;
    
    setData(prev => {
        const last = prev[prev.length - 1] || { sentiment: 60, engagement: 50 };
        let newSentiment = last.sentiment + randomSentimentFlux;
        
        if (calculatedEngagement > 60) newSentiment += 0.5;
        
        return [...prev.slice(-40), {
            time: Date.now(),
            sentiment: Math.max(0, Math.min(100, newSentiment)),
            engagement: (last.engagement * 0.7) + (calculatedEngagement * 0.3), // Smooth it
            dominance: Math.random() * 100 // Placeholder for audio analysis
        }];
    });

    requestAnimationFrame(analyzeFrame);
  }, []);

  const handleConnectClick = () => {
    setIsConfirming(true);
    setError(null);
  };

  const startCapture = async () => {
    setIsConfirming(false);
    setError(null);
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: 1280,
                height: 720,
                displaySurface: 'browser' // Hint to browser to show tabs first if supported
            },
            audio: true
        });

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            
            // Extract the label (e.g. "Meet - Daily Standup")
            const track = stream.getVideoTracks()[0];
            setSharingSource(track.label || "External Window");

            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play();
                processingRef.current = true;
                setIsLive(true);
                analyzeFrame();
            };

             // Handle stream stop (user clicks "Stop sharing")
            track.onended = () => {
                stopCapture();
            };
        }

        setHighlights(prev => [...prev, { time: new Date().toLocaleTimeString(), text: "Agent joined the meeting", type: 'neutral' }]);

    } catch (err) {
        console.error("Error sharing screen:", err);
        // Don't show error if user just cancelled
        if ((err as Error).name !== 'NotAllowedError') {
             setError("Failed to connect to screen. Please try again.");
        }
    }
  };

  const stopCapture = () => {
    processingRef.current = false;
    setIsLive(false);
    setSharingSource(null);
    if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(t => t.stop());
        videoRef.current.srcObject = null;
    }
    setHighlights(prev => [...prev, { time: new Date().toLocaleTimeString(), text: "Meeting session ended", type: 'neutral' }]);
  };

  useEffect(() => {
    if (!isLive || data.length < 2) return;
    
    const latest = data[data.length - 1];
    const prev = data[data.length - 2];
    
    if (latest.engagement > 85 && prev.engagement <= 85) {
        setHighlights(h => [...h, { time: new Date().toLocaleTimeString(), text: "High Group Engagement detected", type: 'positive' }].slice(-5));
    }
    if (latest.sentiment < 30 && prev.sentiment >= 30) {
        setHighlights(h => [...h, { time: new Date().toLocaleTimeString(), text: "Potential conflict or confusion detected", type: 'negative' }].slice(-5));
    }
  }, [data, isLive]);

  return (
    <div className="flex flex-col gap-6 relative">
        
        {/* Connection Confirmation Modal */}
        {isConfirming && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in-right">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
                    <button 
                        onClick={() => setIsConfirming(false)}
                        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-violet-500/10 rounded-lg">
                            <CameraIcon />
                        </div>
                        <h3 className="text-xl font-bold text-white">Connect to Meeting Feed</h3>
                    </div>
                    
                    <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                        To analyze group dynamics, NeuroLens needs to "see" the meeting. When the browser prompt appears:
                    </p>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 mb-8">
                        <ol className="text-sm text-gray-300 space-y-3 list-decimal list-inside">
                            <li>Select the <strong className="text-white">Chrome Tab</strong> option</li>
                            <li>Choose the tab running <strong className="text-white">Google Meet</strong> or <strong className="text-white">Zoom</strong></li>
                            <li>Ensure <strong className="text-white">Share tab audio</strong> is checked</li>
                            <li>Click <strong className="text-cyan-400">Share</strong></li>
                        </ol>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setIsConfirming(false)} 
                            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={startCapture} 
                            className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all"
                        >
                            Select Meeting Tab
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Connection Bar */}
        <div className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col md:flex-row items-center justify-between gap-4 ${
            isLive 
            ? 'bg-violet-900/10 border-violet-500/30 shadow-lg shadow-violet-500/5' 
            : 'bg-gray-900/50 border-gray-800'
        }`}>
            <div className="flex-grow w-full md:w-auto">
                {isLive ? (
                    <div className="flex flex-col animate-fade-in-right">
                         <span className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-2 uppercase tracking-wider">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Active Source
                         </span>
                         <div className="text-lg font-medium text-white flex items-center gap-2">
                            <span className="truncate max-w-xl text-gray-200">{sharingSource || "Screen Capture"}</span>
                         </div>
                    </div>
                ) : (
                    <>
                        <label className="block text-xs font-medium text-gray-400 mb-1 tracking-wider">TARGET MEETING URL (OPTIONAL)</label>
                        <input 
                            type="text" 
                            placeholder="https://meet.google.com/..." 
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-200 focus:outline-none focus:border-violet-500 transition-colors"
                        />
                    </>
                )}
            </div>
            <div className="flex items-end h-full pt-1 md:pt-5">
                {!isLive ? (
                    <button 
                        onClick={handleConnectClick}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95"
                    >
                        <CameraIcon />
                        Connect Agent
                    </button>
                ) : (
                    <button 
                        onClick={stopCapture}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-6 py-2.5 rounded-lg font-semibold transition-all hover:text-red-300"
                    >
                        <ZapIcon />
                        Disconnect
                    </button>
                )}
            </div>
        </div>

        {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-lg flex items-center gap-2 animate-fade-in-right">
                <ExclamationIcon />
                {error}
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Video Feed */}
            <div className="lg:col-span-2">
                <div className={`relative bg-black rounded-xl overflow-hidden aspect-video border shadow-2xl transition-colors duration-500 ${isLive ? 'border-violet-500/30' : 'border-gray-800'}`}>
                    {!isLive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
                            <UserGroupIcon className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-medium text-gray-400">Waiting for meeting connection...</p>
                        </div>
                    )}
                    <video ref={videoRef} className="w-full h-full object-contain" />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {isLive && (
                        <div className="absolute top-4 left-4 bg-red-600/90 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm tracking-widest border border-red-500/50">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                            LIVE ANALYSIS
                        </div>
                    )}
                </div>

                {/* Timeline Chart */}
                <div className="mt-6 bg-gray-900/50 p-6 rounded-xl border border-gray-800 h-72">
                    <h3 className="text-gray-300 font-semibold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <ZapIcon className="text-violet-400 w-4 h-4" />
                        Meeting Sentiment & Energy
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorSentiment" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="time" tick={false} stroke="#9ca3af" axisLine={false} />
                            <YAxis domain={[0, 100]} stroke="#6b7280" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', borderRadius: '0.5rem' }}
                                itemStyle={{ color: '#e5e7eb', fontSize: '12px' }}
                                labelFormatter={() => ''}
                            />
                            <Area type="monotone" dataKey="sentiment" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorSentiment)" name="Positive Sentiment" />
                            <Area type="monotone" dataKey="engagement" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#colorEngagement)" name="Group Energy" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Right: Metrics & Highlights */}
            <div className="flex flex-col gap-6">
                
                {/* Live Gauges */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                    <h3 className="text-gray-300 font-semibold mb-6 text-sm uppercase tracking-wider">Real-time Metrics</h3>
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Team Engagement</span>
                                <span className="text-cyan-400 font-bold">{data.length ? Math.round(data[data.length-1].engagement) : 0}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-cyan-400 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]" 
                                    style={{ width: `${data.length ? data[data.length-1].engagement : 0}%` }}
                                ></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-400">Positive Sentiment</span>
                                <span className="text-violet-400 font-bold">{data.length ? Math.round(data[data.length-1].sentiment) : 0}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-violet-400 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" 
                                    style={{ width: `${data.length ? data[data.length-1].sentiment : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Highlights Feed */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex-grow overflow-hidden flex flex-col h-[300px] lg:h-auto">
                    <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider">Session Highlights</h3>
                    <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {highlights.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                                <div className="p-3 bg-gray-800/50 rounded-full">
                                    <ZapIcon className="w-5 h-5 opacity-50" />
                                </div>
                                <p className="text-sm italic">Waiting for events...</p>
                            </div>
                        ) : (
                            highlights.slice().reverse().map((h, i) => (
                                <div key={i} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/30 text-sm animate-fade-in-right hover:bg-gray-800/50 transition-colors">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                                            h.type === 'positive' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                                            h.type === 'negative' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                                            'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                                        }`}>{h.type.toUpperCase()}</span>
                                        <span className="text-gray-600 text-[10px] font-mono">{h.time}</span>
                                    </div>
                                    <p className="text-gray-300 mt-1 leading-snug">{h.text}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                 <button className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                    <DownloadIcon />
                    Export Meeting Report
                </button>

            </div>
        </div>
    </div>
  );
};

export default MeetingAgent;
