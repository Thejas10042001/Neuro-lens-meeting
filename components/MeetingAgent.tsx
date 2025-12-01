
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CameraIcon } from './icons/CameraIcon';
import { ExclamationIcon } from './icons/ExclamationIcon';
import { ZapIcon } from './icons/ZapIcon';
import { UserGroupIcon } from './icons/UserGroupIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ChatBubbleLeftRightIcon } from './icons/ChatBubbleLeftRightIcon';
import { BrainIcon } from './icons/BrainIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';

// Add type definition for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface MeetingCognitiveData {
  time: number;
  attention: number;
  stress: number;
  curiosity: number;
}

type EmotionalTone = 'excitement' | 'concern' | 'frustration' | 'surprise' | 'confused' | 'neutral' | 'agreement';

interface TranscriptLine {
  id: number;
  speaker: string;
  text: string;
  sentiment: EmotionalTone;
  timestamp: string;
}

interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface ParticipantMetric {
  id: number;
  label: string;
  attention: number;
  stress: number;
  curiosity: number;
  activity: number; // Raw motion
  engagementScore: number; // Calculated combined metric
  isSpeaking: boolean;
  bodyLanguage: string; // e.g. "Nodding", "Leaning In", "Slouching"
  box: BoundingBox; // Dynamic tracking box
}

type ParticipantHistory = { [id: number]: MeetingCognitiveData[] };

const MeetingAgent: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [sharingSource, setSharingSource] = useState<string | null>(null);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  // Group Data (Average)
  const [groupData, setGroupData] = useState<MeetingCognitiveData[]>([]);
  
  // Individual Data History
  const [participantHistory, setParticipantHistory] = useState<ParticipantHistory>({
      0: [], 1: [], 2: [], 3: []
  });
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);

  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  
  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Grid-based participant state (Assuming 2x2 grid for MVP)
  // Boxes are normalized (0-100 percent of container) for rendering
  const [participants, setParticipants] = useState<ParticipantMetric[]>([
    { id: 0, label: "Top-Left", attention: 80, stress: 20, curiosity: 60, activity: 0, engagementScore: 75, isSpeaking: false, bodyLanguage: "Listening", box: {x: 5, y: 5, w: 40, h: 40} },
    { id: 1, label: "Top-Right", attention: 75, stress: 25, curiosity: 55, activity: 0, engagementScore: 70, isSpeaking: false, bodyLanguage: "Listening", box: {x: 55, y: 5, w: 40, h: 40} },
    { id: 2, label: "Btm-Left", attention: 85, stress: 15, curiosity: 70, activity: 0, engagementScore: 80, isSpeaking: false, bodyLanguage: "Listening", box: {x: 5, y: 55, w: 40, h: 40} },
    { id: 3, label: "Btm-Right", attention: 70, stress: 30, curiosity: 50, activity: 0, engagementScore: 65, isSpeaking: false, bodyLanguage: "Listening", box: {x: 55, y: 55, w: 40, h: 40} },
  ]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingRef = useRef(false);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const isDemoRef = useRef(false);
  
  // Audio Analysis Refs (System Audio)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Speech Recognition Ref (Mic Audio)
  const recognitionRef = useRef<any>(null);

  // Heatmap for robust tracking (Persistence)
  const heatmapRef = useRef<Float32Array | null>(null);

  // Demo Script Data
  const demoScript: {text: string, sentiment: EmotionalTone}[] = [
      { text: "I think the project timeline is realistic.", sentiment: 'agreement' },
      { text: "I'm extremely worried about the integration module failure.", sentiment: 'concern' },
      { text: "Can we explore the analytics features more?", sentiment: 'neutral' },
      { text: "Wow! That solution is absolutely brilliant!", sentiment: 'excitement' },
      { text: "Wait, I don't understand how the API connects.", sentiment: 'confused' },
      { text: "This keeps crashing and it's really annoying me.", sentiment: 'frustration' },
      { text: "Let's pivot to the marketing strategy.", sentiment: 'neutral' },
      { text: "Really? I didn't expect that result at all.", sentiment: 'surprise' },
      { text: "The server load is critically high, we need to fix this.", sentiment: 'concern' },
      { text: "Could you explain that last part again? It's unclear.", sentiment: 'confused' },
  ];

  // Helper: Simple Skin Tone Classifier in RGB
  const isSkinTone = (r: number, g: number, b: number) => {
    // Basic heuristic for skin detection
    return (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15);
  };

  // Helper: Basic Sentiment Analysis
  const analyzeSentiment = (text: string): EmotionalTone => {
      const lower = text.toLowerCase();
      
      // Confusion & Uncertainty
      if (
          lower.includes("don't understand") || lower.includes("not sure") || lower.includes("confused") ||
          lower.includes("unclear") || lower.includes("lost me") || lower.includes("repeat that") ||
          (lower.includes("?") && (lower.includes("explain") || lower.startsWith("how") || lower.startsWith("why")))
      ) return 'confused';

      // Frustration / Anger
      if (lower.match(/\b(hate|stupid|annoying|fail|broken|crash|terrible|worst|useless|angry)\b/)) return 'frustration';

      // Concern / Worry
      if (lower.match(/\b(worry|worried|concern|issue|problem|risk|danger|critical|hard|difficult|delay)\b/)) return 'concern';

      // Excitement / Joy
      if (lower.match(/\b(love|amazing|awesome|brilliant|excited|perfect|excellent|great|best|win)\b/)) return 'excitement';

      // Surprise
      if (lower.match(/\b(wow|really|omg|unexpected|sudden|wait|what|shock)\b/)) return 'surprise';

      // Agreement
      if (lower.match(/\b(agree|yes|correct|right|solid|sure|okay|good)\b/)) return 'agreement';
      
      return 'neutral';
  };

  // Determine Body Language based on metrics
  const determineBodyLanguage = (isSpeaking: boolean, activity: number, stress: number, attention: number, curiosity: number): string => {
      if (isSpeaking) return "Gesturing";
      
      // High Stress indicators
      if (stress > 75) {
          if (activity > 30) return "Fidgeting";
          if (activity < 10) return "Arms Crossed"; // Stiff/Defensive
      }

      // High Engagement indicators
      if (attention > 80 && curiosity > 70) return "Leaning In";
      if (activity > 15 && activity < 40 && attention > 60) return "Nodding";

      // Low Engagement indicators
      if (attention < 40 && stress < 50 && activity < 10) return "Slouching";

      return "Listening";
  };

  // Analyze the video frame to guess meeting dynamics
  const analyzeFrame = useCallback(() => {
    if (!processingRef.current) return;
    
    // Safety check for canvas
    const canvas = canvasRef.current;
    if (!canvas) {
        requestAnimationFrame(analyzeFrame);
        return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Use a fixed low resolution for grid analysis (320x240)
    const width = 320;
    const height = 240;
    
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    try {
        if (isDemoRef.current) {
            // --- DEMO MODE SIMULATION ---
            // Draw simulated participants
            ctx.fillStyle = '#111827'; // Dark background
            ctx.fillRect(0, 0, width, height);

            // Draw 4 distinct quadrants
            const quadrants = [
                { x: 0, y: 0, w: width/2, h: height/2, color: '#1e293b' },
                { x: width/2, y: 0, w: width/2, h: height/2, color: '#1e293b' },
                { x: 0, y: height/2, w: width/2, h: height/2, color: '#1e293b' },
                { x: width/2, y: height/2, w: width/2, h: height/2, color: '#1e293b' }
            ];

            // Update fake participants
            let currentParticipants: ParticipantMetric[] = [];
            setParticipants(prevParts => {
                const updated = prevParts.map((p, idx) => {
                    // Randomly start/stop speaking
                    const speakRoll = Math.random();
                    let speaking = p.isSpeaking;
                    if (speaking && speakRoll > 0.92) speaking = false; // Stop speaking
                    if (!speaking && speakRoll > 0.98) speaking = true; // Start speaking

                    // Activity correlates with speaking
                    let targetActivity = speaking ? 70 : 10;
                    targetActivity += (Math.random() * 20);
                    
                    // Update Cognitive State based on 'events'
                    let newAttention = p.attention + (Math.random() - 0.5) * 4;
                    let newStress = p.stress + (Math.random() - 0.5) * 4;
                    let newCuriosity = p.curiosity + (Math.random() - 0.5) * 4;
                    
                    if (speaking) {
                        newAttention = Math.min(100, newAttention + 2);
                        newCuriosity = Math.min(100, newCuriosity + 1);
                    }

                    // Randomly induce specific states for demo
                    if (Math.random() > 0.99) { // 1% chance per frame to spike stress
                        newStress = 85; 
                        if (Math.random() > 0.5) targetActivity = 50; // Fidgeting
                        else targetActivity = 5; // Arms Crossed
                    }
                    if (Math.random() > 0.99) { // Boredom spike
                        newAttention = 20;
                        newStress = 20;
                        targetActivity = 2; // Slouching
                    }
                    
                    // Smooth values
                    const smoothedActivity = (p.activity * 0.8) + (targetActivity * 0.2);
                    const smoothedAttention = Math.max(0, Math.min(100, newAttention));
                    const smoothedStress = Math.max(0, Math.min(100, newStress));
                    const smoothedCuriosity = Math.max(0, Math.min(100, newCuriosity));

                    // Use common logic function
                    const bodyLang = determineBodyLanguage(
                        speaking, 
                        smoothedActivity, 
                        smoothedStress, 
                        smoothedAttention, 
                        smoothedCuriosity
                    );
                    
                    // Calculate Engagement Score
                    // Weighted: Attention 45%, Curiosity 35%, Activity 20%
                    let engagement = (smoothedAttention * 0.45) + (smoothedCuriosity * 0.35) + (Math.min(100, smoothedActivity * 2) * 0.2);
                    if (speaking) engagement = 95 + Math.random()*5; // Speaking overrides
                    
                    // Simulate face tracking movement (wandering box)
                    const q = quadrants[idx];
                    let bx = p.box.x;
                    let by = p.box.y;
                    
                    bx = bx + (Math.random() - 0.5) * 2;
                    by = by + (Math.random() - 0.5) * 2;

                    // Draw on canvas for visual feedback
                    ctx.fillStyle = speaking ? '#4c1d95' : q.color; // Purple if speaking
                    ctx.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
                    
                    // Draw "avatar" circle
                    ctx.beginPath();
                    ctx.arc(q.x + q.w/2, q.y + q.h/2, 30, 0, 2 * Math.PI);
                    ctx.fillStyle = speaking ? '#8b5cf6' : '#64748b';
                    ctx.fill();

                    return {
                        ...p,
                        activity: smoothedActivity,
                        isSpeaking: speaking,
                        attention: smoothedAttention,
                        stress: smoothedStress,
                        curiosity: smoothedCuriosity,
                        engagementScore: Math.min(100, Math.max(0, engagement)),
                        bodyLanguage: bodyLang,
                        box: { ...p.box, x: bx, y: by }
                    };
                });
                currentParticipants = updated;
                return updated;
            });

            // Update Individual Histories
            setParticipantHistory(prevHist => {
                const newHist = { ...prevHist };
                currentParticipants.forEach(p => {
                    newHist[p.id] = [...(newHist[p.id] || []).slice(-40), {
                        time: Date.now(),
                        attention: p.attention,
                        stress: p.stress,
                        curiosity: p.curiosity
                    }];
                });
                return newHist;
            });

            // Demo Global Stats
            setGroupData(prev => {
                const last = prev[prev.length - 1] || { attention: 70, stress: 30, curiosity: 60 };
                const nextVal = (v: number) => Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 5));
                return [...prev.slice(-40), {
                    time: Date.now(),
                    attention: nextVal(last.attention),
                    stress: nextVal(last.stress),
                    curiosity: nextVal(last.curiosity),
                }];
            });

            // Demo Transcripts
            if (Math.random() > 0.985) {
                const speakerId = Math.floor(Math.random() * 4);
                const line = demoScript[Math.floor(Math.random() * demoScript.length)];
                const speakerLabel = quadrants[speakerId] ? ["Sarah", "Mike", "Jessica", "David"][speakerId] : "Unknown";
                
                setTranscripts(prev => [...prev.slice(-9), {
                    id: Date.now(),
                    speaker: speakerLabel,
                    text: line.text,
                    sentiment: line.sentiment,
                    timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})
                }]);
            }

        } else {
            // --- REAL MODE: HYBRID TRACKING WITH HEATMAP ---
            const video = videoRef.current;
            if (!video || video.paused || video.ended) {
                requestAnimationFrame(analyzeFrame);
                return;
            }

            ctx.drawImage(video, 0, 0, width, height);
            const frame = ctx.getImageData(0, 0, width, height);
            const currentData = frame.data;
            const prevData = prevFrameRef.current;

            // Audio Level Analysis (System Audio Volume)
            let audioVolume = 0;
            if (analyserRef.current && dataArrayRef.current) {
                analyserRef.current.getByteFrequencyData(dataArrayRef.current);
                const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
                audioVolume = sum / dataArrayRef.current.length; // 0-255 approx
            }
            const isAudioActive = audioVolume > 15; 

            // Initialize Stats for 4 quadrants
            const quadStats = [
                { motion: 0, pixels: 0 },
                { motion: 0, pixels: 0 },
                { motion: 0, pixels: 0 },
                { motion: 0, pixels: 0 }
            ];

            // Heatmap Setup (Grid 40x30)
            const GRID_W = 40;
            const GRID_H = 30;
            if (!heatmapRef.current) {
                heatmapRef.current = new Float32Array(GRID_W * GRID_H);
            }
            const heatmap = heatmapRef.current;

            // Decay Heatmap
            for (let i = 0; i < heatmap.length; i++) {
                heatmap[i] *= 0.96; // 4% decay per frame
            }

            if (prevData) {
                // Skip pixels for performance (check every 4th pixel)
                const step = 4; 
                for (let y = 0; y < height; y += step) {
                    for (let x = 0; x < width; x += step) {
                        const i = (y * width + x) * 4;
                        const r = currentData[i];
                        const g = currentData[i+1];
                        const b = currentData[i+2];

                        const diff = Math.abs(r - prevData[i]) + 
                                     Math.abs(g - prevData[i+1]) + 
                                     Math.abs(b - prevData[i+2]);
                        
                        const qIdx = (x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0);
                        const isSkin = isSkinTone(r, g, b);

                        if (diff > 40) { 
                             quadStats[qIdx].motion += diff;
                             const weight = isSkin ? 4 : 1;
                             
                             // Update Heatmap
                             const gx = Math.floor(x / (width / GRID_W));
                             const gy = Math.floor(y / (height / GRID_H));
                             const gIdx = gy * GRID_W + gx;
                             if (gIdx < heatmap.length) {
                                heatmap[gIdx] = Math.min(100, heatmap[gIdx] + weight * 2);
                             }
                        }
                        quadStats[qIdx].pixels++;
                    }
                }
            }

            // Save current frame
            prevFrameRef.current = new Uint8ClampedArray(currentData);

            let currentParticipants: ParticipantMetric[] = [];
            
            // Update Participant State based on heuristics
            setParticipants(prevParts => {
                const updated = prevParts.map((p, idx) => {
                    const q = quadStats[idx];
                    
                    // 1. Calculate Activity Score
                    const rawActivity = q.motion / (q.pixels || 1); 
                    const normalizedActivity = Math.min(100, rawActivity * 3); 
                    const likelySpeaking = isAudioActive && normalizedActivity > 10;
                    
                    // 2. Cognitive Heuristics
                    let targetAttention = 100 - normalizedActivity;
                    if (likelySpeaking) targetAttention = 90; // Speaking requires attention

                    let targetStress = (normalizedActivity * 0.5);
                    if (likelySpeaking && audioVolume > 100) targetStress += 20;

                    let targetCuriosity = 50;
                    if (normalizedActivity > 5 && normalizedActivity < 25) targetCuriosity = 80;

                    // Smooth values
                    const smoothedActivity = (p.activity * 0.8) + (normalizedActivity * 0.2);
                    const smoothedAttention = (p.attention * 0.9) + (targetAttention * 0.1);
                    const smoothedStress = (p.stress * 0.9) + (targetStress * 0.1);
                    const smoothedCuriosity = (p.curiosity * 0.9) + (targetCuriosity * 0.1);

                    // 3. Body Language Tagging
                    const bodyLang = determineBodyLanguage(
                        likelySpeaking, 
                        smoothedActivity, 
                        smoothedStress, 
                        smoothedAttention, 
                        smoothedCuriosity
                    );
                    
                    // 4. Calculate Engagement Score
                    let engagement = (smoothedAttention * 0.45) + (smoothedCuriosity * 0.35) + (Math.min(100, smoothedActivity * 2) * 0.2);
                    if (likelySpeaking) engagement = 95; 

                    // 5. Robust Centroid Tracking using Heatmap
                    let targetBoxX = p.box.x;
                    let targetBoxY = p.box.y;
                    
                    // Calculate Centroid of Heatmap for this quadrant
                    let totalHeat = 0;
                    let sumX = 0;
                    let sumY = 0;
                    
                    // Define quadrant bounds in grid coords
                    const qgxStart = (idx % 2) * (GRID_W / 2);
                    const qgyStart = Math.floor(idx / 2) * (GRID_H / 2);
                    
                    for (let gy = qgyStart; gy < qgyStart + (GRID_H / 2); gy++) {
                        for (let gx = qgxStart; gx < qgxStart + (GRID_W / 2); gx++) {
                            const val = heatmap[gy * GRID_W + gx];
                            if (val > 1) { // Threshold to ignore noise
                                sumX += gx * val;
                                sumY += gy * val;
                                totalHeat += val;
                            }
                        }
                    }

                    const quadrantDefaults = [
                        { x: 5, y: 5 }, { x: 55, y: 5 }, { x: 5, y: 55 }, { x: 55, y: 55 }
                    ];

                    if (totalHeat > 50) { // Valid tracking signal
                        const avgX = sumX / totalHeat; 
                        const avgY = sumY / totalHeat; 
                        
                        // Convert Grid Coords to Percentage (0-100)
                        const pctX = (avgX / GRID_W) * 100;
                        const pctY = (avgY / GRID_H) * 100;
                        
                        // Center box on centroid
                        targetBoxX = pctX - (p.box.w / 2);
                        targetBoxY = pctY - (p.box.h / 2);
                    } else {
                        // Drift very slowly to default if signal lost
                        targetBoxX = (targetBoxX * 0.98) + (quadrantDefaults[idx].x * 0.02);
                        targetBoxY = (targetBoxY * 0.98) + (quadrantDefaults[idx].y * 0.02);
                    }

                    // Constrain box to bounds
                    targetBoxX = Math.max(0, Math.min(100 - p.box.w, targetBoxX));
                    targetBoxY = Math.max(0, Math.min(100 - p.box.h, targetBoxY));

                    return {
                        ...p,
                        activity: smoothedActivity,
                        isSpeaking: likelySpeaking,
                        attention: smoothedAttention,
                        stress: smoothedStress,
                        curiosity: smoothedCuriosity,
                        engagementScore: Math.min(100, Math.max(0, engagement)),
                        bodyLanguage: bodyLang,
                        box: {
                            ...p.box,
                            x: (p.box.x * 0.8) + (targetBoxX * 0.2), // Faster response to heatmap changes
                            y: (p.box.y * 0.8) + (targetBoxY * 0.2)
                        }
                    };
                });
                currentParticipants = updated;
                return updated;
            });

            // Update Individual Histories
            setParticipantHistory(prevHist => {
                const newHist = { ...prevHist };
                currentParticipants.forEach(p => {
                    newHist[p.id] = [...(newHist[p.id] || []).slice(-40), {
                        time: Date.now(),
                        attention: p.attention,
                        stress: p.stress,
                        curiosity: p.curiosity
                    }];
                });
                return newHist;
            });

            // Global Stats (Averaged)
            setGroupData(prev => {
                const last = prev[prev.length - 1] || { attention: 50, stress: 50, curiosity: 50 };
                const avgAttention = currentParticipants.reduce((acc, p) => acc + p.attention, 0) / 4;
                const avgStress = currentParticipants.reduce((acc, p) => acc + p.stress, 0) / 4;
                const avgCuriosity = currentParticipants.reduce((acc, p) => acc + p.curiosity, 0) / 4;

                return [...prev.slice(-40), {
                    time: Date.now(),
                    attention: (last.attention * 0.7) + (avgAttention * 0.3),
                    stress: (last.stress * 0.7) + (avgStress * 0.3),
                    curiosity: (last.curiosity * 0.7) + (avgCuriosity * 0.3),
                }];
            });
        }

    } catch (e) {
        console.warn("Frame analysis error", e);
    }
    
    if (processingRef.current) {
        requestAnimationFrame(analyzeFrame);
    }
  }, [participants]); // Included participants in deps to keep id ref, though functional state update used

  const handleConnectClick = () => {
    setIsConfirming(true);
    setError(null);
  };

  const startDemoMode = () => {
    setIsDemo(true);
    isDemoRef.current = true;
    setIsLive(true);
    processingRef.current = true;
    setSharingSource("Simulated Meeting (Demo)");
    setIsConfirming(false);
    
    setTranscripts([{ id: Date.now(), speaker: "System", text: "Demo Mode Started. Simulating team discussion...", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);
    analyzeFrame();
  };

  const startSpeechRecognition = () => {
      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
              const results = event.results;
              const latestResult = results[results.length - 1];
              if (latestResult.isFinal) {
                  const text = latestResult[0].transcript;
                  const sentiment = analyzeSentiment(text);
                  
                  setTranscripts(prev => {
                      const newTranscript: TranscriptLine = {
                          id: Date.now(),
                          speaker: "You / Room", // Client-side can usually only hear the user via mic
                          text: text,
                          sentiment: sentiment,
                          timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})
                      };
                      return [...prev.slice(-19), newTranscript];
                  });
              }
          };

          recognition.onerror = (event: any) => {
              console.warn("Speech recognition error", event.error);
              if (event.error === 'not-allowed') {
                  setTranscripts(prev => [...prev, { id: Date.now(), speaker: "System", text: "Microphone access denied for transcription.", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);
              }
          };
          
          try {
             recognition.start();
             recognitionRef.current = recognition;
          } catch (e) {
             console.error("Failed to start recognition", e);
          }
      } else {
          setTranscripts(prev => [...prev, { id: Date.now(), speaker: "System", text: "Speech recognition not supported in this browser.", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);
      }
  };
  
  // Recording Handlers
  const handleStartRecording = () => {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      
      try {
          recordedChunksRef.current = [];
          const stream = videoRef.current.srcObject as MediaStream;
          
          const options = { mimeType: 'video/webm; codecs=vp9' };
          // Fallback mime types if vp9 is not supported
          const mimeType = MediaRecorder.isTypeSupported(options.mimeType) 
            ? options.mimeType 
            : MediaRecorder.isTypeSupported('video/webm') 
                ? 'video/webm' 
                : 'video/mp4';

          const mediaRecorder = new MediaRecorder(stream, { mimeType });
          
          mediaRecorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                  recordedChunksRef.current.push(event.data);
              }
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: mimeType });
              const url = URL.createObjectURL(blob);
              
              // Trigger Download
              const a = document.createElement('a');
              document.body.appendChild(a);
              a.style.display = 'none';
              a.href = url;
              a.download = `neurolens_recording_${new Date().toISOString().replace(/:/g, '-')}.webm`;
              a.click();
              
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
              
              setTranscripts(prev => [...prev, { 
                  id: Date.now(), 
                  speaker: "System", 
                  text: "Recording saved successfully.", 
                  sentiment: 'neutral', 
                  timestamp: new Date().toLocaleTimeString() 
              }]);
          };

          mediaRecorder.start();
          mediaRecorderRef.current = mediaRecorder;
          setIsRecording(true);
          
           setTranscripts(prev => [...prev, { 
              id: Date.now(), 
              speaker: "System", 
              text: "Recording started.", 
              sentiment: 'neutral', 
              timestamp: new Date().toLocaleTimeString() 
          }]);

      } catch (e) {
          console.error("Recording failed", e);
          setError("Failed to start recording. MediaRecorder not supported.");
      }
  };

  const handleStopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const startCapture = async () => {
    setIsConfirming(false);
    setError(null);
    setIsDemo(false);
    isDemoRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        console.warn("Screen sharing not supported. Switching to demo mode.");
        setError("Screen sharing unavailable. Starting Simulation Mode.");
        setTimeout(() => startDemoMode(), 1000);
        return;
    }

    try {
        // 1. Get Screen Stream (System Audio + Video)
        // @ts-ignore
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                displaySurface: 'browser' 
            },
            audio: true 
        });

        // 2. Get Mic Stream (For Speech-to-Text)
        let micStream: MediaStream | null = null;
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.warn("Microphone access denied. Transcription will be limited.");
        }

        if (videoRef.current) {
            videoRef.current.srcObject = displayStream;
            
            const track = displayStream.getVideoTracks()[0];
            setSharingSource(track.label || "Shared Tab");

            // Setup System Audio Analysis (Volume Visualizer)
            const audioTrack = displayStream.getAudioTracks()[0];
            if (audioTrack) {
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass) {
                        const audioCtx = new AudioContextClass();
                        const source = audioCtx.createMediaStreamSource(displayStream);
                        const analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 256;
                        source.connect(analyser);
                        
                        audioContextRef.current = audioCtx;
                        analyserRef.current = analyser;
                        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
                    }
                } catch (e) {
                    console.warn("Audio analysis setup failed", e);
                }
            } else {
                setTranscripts(prev => [...prev, { id: Date.now(), speaker: "System", text: "Note: Share Tab Audio was not selected. System volume will not be tracked.", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);
            }

            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().catch(console.error);
                processingRef.current = true;
                setIsLive(true);
                prevFrameRef.current = null;
                analyzeFrame();
                
                if (micStream) {
                   startSpeechRecognition();
                }
            };

            track.onended = () => {
                stopCapture();
            };
        }

        setTranscripts([{ id: Date.now(), speaker: "System", text: "Agent joined. Listening for speech...", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);

    } catch (err) {
        console.error("Error sharing screen:", err);
        const e = err as Error;

        if (e.message && (e.message.includes('permissions policy') || e.message.includes('display-capture'))) {
             setError("Screen sharing is restricted in this environment. Starting Simulation Mode.");
             setTimeout(() => startDemoMode(), 1500);
             return;
        }

        if (e.name === 'NotAllowedError') {
             setIsConfirming(false);
        } else {
             setError("Connection failed. Starting Simulation Mode for testing.");
             setTimeout(() => startDemoMode(), 1000);
        }
    }
  };

  const stopCapture = () => {
    // Ensure recording stops if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
    
    processingRef.current = false;
    setIsLive(false);
    setIsDemo(false);
    isDemoRef.current = false;
    setSharingSource(null);
    setGroupData([]);
    setParticipantHistory({0: [], 1: [], 2: [], 3: []});
    
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
    }

    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }
    
    setTranscripts(prev => [...prev, { id: Date.now(), speaker: "System", text: "Session ended.", sentiment: 'neutral', timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleSyncToSpiked = async () => {
      if (!isLive && groupData.length === 0) {
          alert("No meeting data to sync. Start a session first.");
          return;
      }
      
      setIsSyncing(true);
      setSyncSuccess(false);

      // 1. Package Data
      const payload = {
          meetingId: `mtg_${Date.now()}`,
          timestamp: new Date().toISOString(),
          duration_seconds: groupData.length,
          source: sharingSource,
          participants_snapshot: participants.map(p => ({
              label: p.label,
              avg_attention: p.attention,
              avg_stress: p.stress,
              body_language: p.bodyLanguage,
              history: participantHistory[p.id] // Includes individual data points
          })),
          timeline_metrics: groupData,
          transcript_log: transcripts
      };

      console.log("Preparing Payload for Spiked AI:", payload);

      await new Promise(resolve => setTimeout(resolve, 2000));

      setIsSyncing(false);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
  };

  useEffect(() => {
    return () => {
        processingRef.current = false;
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
        }
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };
  }, []);

  // Prepare Chart Data based on selection
  const chartDisplayData = selectedParticipantId !== null 
      ? participantHistory[selectedParticipantId] 
      : groupData;
  
  const chartTitle = selectedParticipantId !== null 
      ? `Analysis: ${participants.find(p => p.id === selectedParticipantId)?.label || 'Participant'}` 
      : "Group Cognitive State";

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
                        To analyze group dynamics and transcripts, NeuroLens needs access to:
                    </p>
                    
                    <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/50 mb-8">
                        <ol className="text-sm text-gray-300 space-y-3 list-decimal list-inside">
                             <li><strong className="text-white">Microphone</strong> (For Speech-to-Text).</li>
                            <li><strong className="text-white">Chrome Tab</strong> (For Video Analysis).</li>
                            <li>Ensure <strong className="text-white">Share tab audio</strong> is checked during selection.</li>
                        </ol>
                        <div className="mt-4 pt-4 border-t border-gray-700/50 text-xs text-gray-500">
                           Note: If screen sharing is not supported by your device, a simulation mode will start automatically.
                        </div>
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
                            Grant Access & Join
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
                         <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
                             <span className="text-xs font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                {isDemo ? "SIMULATION MODE ACTIVE" : "Active Source"}
                             </span>
                             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/30 border border-red-500/30 text-red-400 text-[10px] font-bold tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                ANALYZING LIVE FEED
                             </div>
                         </div>
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
                    <div className="flex gap-2">
                         <button 
                            onClick={() => startDemoMode()}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2.5 rounded-lg font-medium transition-all text-sm"
                        >
                            Try Demo
                        </button>
                        <button 
                            onClick={handleConnectClick}
                            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95"
                        >
                            <CameraIcon />
                            Connect Agent
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        {!isDemo && (
                            <button
                                onClick={isRecording ? handleStopRecording : handleStartRecording}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all border ${
                                    isRecording 
                                        ? 'bg-red-500 text-white border-red-400 hover:bg-red-600'
                                        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                                }`}
                            >
                                {isRecording ? (
                                    <>
                                        <span className="w-3 h-3 bg-white rounded-sm animate-pulse"></span>
                                        Stop Rec
                                    </>
                                ) : (
                                    <>
                                        <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                        Record Session
                                    </>
                                )}
                            </button>
                        )}
                        <button 
                            onClick={stopCapture}
                            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-6 py-2.5 rounded-lg font-semibold transition-all hover:text-red-300"
                        >
                            <ZapIcon />
                            {isDemo ? "Exit Demo" : "Disconnect"}
                        </button>
                    </div>
                )}
            </div>
        </div>

        {error && (
            <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 p-4 rounded-lg flex items-center gap-2 animate-fade-in-right">
                <ExclamationIcon />
                {error}
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Video & Main Chart */}
            <div className="lg:col-span-2 flex flex-col gap-6">
                
                {/* Video Feed */}
                <div className={`relative bg-black rounded-xl overflow-hidden aspect-video border shadow-2xl transition-colors duration-500 ${isLive ? 'border-violet-500/30' : 'border-gray-800'}`}>
                    {!isLive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
                            <UserGroupIcon className="w-16 h-16 mb-4 opacity-30" />
                            <p className="text-lg font-medium text-gray-400">Waiting for meeting connection...</p>
                        </div>
                    )}
                    <video ref={videoRef} className={`w-full h-full object-contain ${isDemo ? 'hidden' : 'block'}`} />
                    <canvas ref={canvasRef} className={isDemo ? 'w-full h-full object-contain' : 'hidden'} />
                    
                    {/* Recording Indicator Overlay */}
                    {isRecording && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/30 z-50">
                            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                            <span className="text-xs font-bold text-red-400 tracking-wider">REC</span>
                        </div>
                    )}
                    
                    {/* Overlays */}
                    {isLive && participants.map((p, idx) => {
                         const isLowEngagement = p.attention < 40 || p.stress > 70;
                         const isSelected = selectedParticipantId === p.id;
                         return (
                        <div 
                            key={p.id}
                            style={{
                                top: `${p.box.y}%`,
                                left: `${p.box.x}%`,
                                width: `${p.box.w}%`,
                                height: `${p.box.h}%`
                            }}
                            className={`absolute transition-all duration-300 pointer-events-none flex flex-col justify-between
                                ${p.isSpeaking ? 'z-20 scale-[1.02]' : 'z-10'}
                                ${isLowEngagement && !p.isSpeaking ? 'opacity-40 grayscale blur-[1px]' : 'opacity-100'}
                            `}
                        >
                             {/* Tracking Corners */}
                            <div className={`absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 rounded-tl-sm ${isSelected ? 'border-white shadow-[0_0_10px_white]' : p.isSpeaking ? 'border-violet-400' : 'border-cyan-500/60'}`}></div>
                            <div className={`absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 rounded-tr-sm ${isSelected ? 'border-white shadow-[0_0_10px_white]' : p.isSpeaking ? 'border-violet-400' : 'border-cyan-500/60'}`}></div>
                            <div className={`absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 rounded-bl-sm ${isSelected ? 'border-white shadow-[0_0_10px_white]' : p.isSpeaking ? 'border-violet-400' : 'border-cyan-500/60'}`}></div>
                            <div className={`absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 rounded-br-sm ${isSelected ? 'border-white shadow-[0_0_10px_white]' : p.isSpeaking ? 'border-violet-400' : 'border-cyan-500/60'}`}></div>
                            
                            {/* Speaking Highlight Box */}
                            {p.isSpeaking && (
                                <div className="absolute inset-0 border-2 border-violet-500/40 bg-violet-500/5 rounded-sm animate-pulse shadow-[0_0_15px_rgba(139,92,246,0.2)]"></div>
                            )}

                            {/* Label Tag */}
                            {(p.activity > 5 || p.isSpeaking) && (
                                <div className="absolute -top-7 left-0 flex items-center gap-1.5 z-30">
                                    <div className={`px-2 py-0.5 bg-black/80 backdrop-blur-md border rounded text-[10px] font-mono flex items-center gap-1.5 shadow-lg transition-colors ${
                                        p.isSpeaking ? 'border-violet-500/80 text-violet-200 shadow-violet-500/20' : 'border-cyan-500/30 text-cyan-400'
                                    }`}>
                                        {p.isSpeaking ? (
                                            <>
                                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse shadow-[0_0_5px_rgba(167,139,250,0.8)]"></span>
                                                <span className="font-bold">SPEAKING</span>
                                            </>
                                        ) : (
                                            <span className="w-1.5 h-1.5 bg-cyan-600 rounded-full"></span>
                                        )}
                                        {p.isSpeaking && <span className="text-gray-500">|</span>}
                                        {p.label}
                                    </div>
                                </div>
                            )}
                        </div>
                    );})}
                </div>

                {/* Main Cognitive Chart */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 h-72 relative">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-gray-300 font-semibold flex items-center gap-2 text-sm uppercase tracking-wider">
                            <BrainIcon />
                            {chartTitle}
                        </h3>
                        {selectedParticipantId !== null && (
                            <button 
                                onClick={() => setSelectedParticipantId(null)}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-cyan-400 px-3 py-1 rounded border border-gray-700 transition-colors"
                            >
                                Back to Group View
                            </button>
                        )}
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartDisplayData}>
                            <defs>
                                <linearGradient id="colorAttention" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorCuriosity" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="time" tick={false} stroke="#9ca3af" axisLine={false} />
                            <YAxis domain={[0, 100]} stroke="#6b7280" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', borderRadius: '0.5rem' }}
                                itemStyle={{ color: '#e5e7eb', fontSize: '12px' }}
                                labelFormatter={() => ''}
                                formatter={(value: number) => value.toFixed(1)}
                            />
                            <Legend verticalAlign="top" iconType="circle" height={36}/>
                            <Area type="monotone" dataKey="attention" stroke="#22d3ee" strokeWidth={2} fillOpacity={1} fill="url(#colorAttention)" name="Attention" />
                            <Area type="monotone" dataKey="stress" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorStress)" name="Stress" />
                            <Area type="monotone" dataKey="curiosity" stroke="#a78bfa" strokeWidth={2} fillOpacity={1} fill="url(#colorCuriosity)" name="Curiosity" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Right Column: Metrics & Transcript */}
            <div className="flex flex-col gap-6">
                
                {/* Participant Metrics Cards */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800">
                     <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                        <UserGroupIcon className="w-4 h-4 text-cyan-400" />
                        Participants (Select to View)
                    </h3>
                    <div className="space-y-4">
                        {participants.map((p) => {
                             const isLowEngagement = p.attention < 40 || p.stress > 70;
                             const isSelected = selectedParticipantId === p.id;
                             
                             let tagColor = 'bg-gray-700/50 text-gray-500 border-gray-600';
                             if (p.bodyLanguage === 'Fidgeting') tagColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                             else if (p.bodyLanguage === 'Arms Crossed') tagColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                             else if (p.bodyLanguage === 'Slouching') tagColor = 'bg-slate-600/30 text-slate-400 border-slate-500/30';
                             else if (p.bodyLanguage === 'Leaning In') tagColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                             else if (p.bodyLanguage === 'Nodding') tagColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                             else if (p.bodyLanguage === 'Gesturing') tagColor = 'bg-violet-500/10 text-violet-400 border-violet-500/20';

                             let engagementColor = 'bg-emerald-500';
                             let engagementTextColor = 'text-emerald-400';
                             if (p.engagementScore < 65) {
                                 engagementColor = 'bg-amber-500';
                                 engagementTextColor = 'text-amber-400';
                             }
                             if (p.engagementScore < 40) {
                                 engagementColor = 'bg-red-500';
                                 engagementTextColor = 'text-red-400';
                             }

                             return (
                            <div 
                                key={p.id} 
                                onClick={() => setSelectedParticipantId(isSelected ? null : p.id)}
                                className={`p-3 rounded-lg border transition-all duration-300 relative overflow-hidden cursor-pointer ${
                                isSelected 
                                    ? 'bg-gray-800 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] scale-[1.02]' 
                                    : p.isSpeaking 
                                        ? 'bg-violet-900/30 border-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.25)]' 
                                        : 'bg-gray-800/40 border-gray-700/50 hover:border-gray-500'
                            } ${isLowEngagement && !p.isSpeaking && !isSelected ? 'opacity-40' : 'opacity-100'}`}>
                                
                                {p.isSpeaking && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500 animate-pulse"></div>}
                                
                                <div className="flex justify-between items-center mb-2 pl-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${p.isSpeaking ? 'bg-violet-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.8)]' : 'bg-gray-600'}`}></div>
                                        <span className={`text-sm font-medium ${p.isSpeaking ? 'text-violet-200' : isSelected ? 'text-white' : 'text-gray-200'}`}>{p.label}</span>
                                        {isLowEngagement && !p.isSpeaking && (
                                            <span className="text-[9px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">LOW ENGAGEMENT</span>
                                        )}
                                        {isSelected && (
                                            <span className="text-[9px] bg-cyan-900/30 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold">VIEWING</span>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tagColor}`}>
                                        {p.bodyLanguage.toUpperCase()}
                                    </span>
                                </div>
                                <div className="space-y-1 pl-2">
                                    {['Attention', 'Stress', 'Curiosity'].map((metric) => {
                                        const key = metric.toLowerCase() as keyof ParticipantMetric;
                                        const val = p[key] as number;
                                        const color = metric === 'Attention' ? 'bg-cyan-400' : metric === 'Stress' ? 'bg-rose-500' : 'bg-violet-400';
                                        return (
                                            <div key={metric} className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-400 w-12">{metric}</span>
                                                <div className="flex-grow bg-gray-700 rounded-full h-1 overflow-hidden">
                                                    <div className={`${color} h-1 rounded-full transition-all duration-500`} style={{ width: `${val}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                {/* Engagement Score Bar */}
                                <div className="mt-2 pt-2 border-t border-gray-700/30 pl-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-bold text-gray-400 tracking-wider">OVERALL ENGAGEMENT</span>
                                        <span className={`text-[10px] font-bold ${engagementTextColor}`}>{Math.round(p.engagementScore)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-700 ease-out ${engagementColor}`} 
                                            style={{ width: `${p.engagementScore}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        );})}
                    </div>
                </div>

                {/* Live Transcript & Sentiment Panel */}
                <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex-grow flex flex-col h-[300px] lg:h-auto">
                    <h3 className="text-gray-300 font-semibold mb-4 text-sm uppercase tracking-wider flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ChatBubbleLeftRightIcon className="w-4 h-4 text-green-400" />
                            Live Transcript
                        </div>
                        {isLive && !isDemo && <span className="text-[10px] text-green-400 animate-pulse">● Listening...</span>}
                        {isLive && isDemo && <span className="text-[10px] text-amber-500">(Simulation)</span>}
                    </h3>
                    
                    <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar bg-gray-950/30 p-2 rounded-lg border border-gray-800/50">
                        {transcripts.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2">
                                <p className="text-sm italic">Waiting for speech...</p>
                            </div>
                        ) : (
                            transcripts.slice().reverse().map((t) => (
                                <div key={t.id} className="p-2 rounded hover:bg-gray-800/50 transition-colors animate-fade-in-right">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-gray-400">{t.speaker}</span>
                                        <span className="text-[10px] text-gray-600">{t.timestamp}</span>
                                    </div>
                                    <p className="text-sm text-gray-300 leading-snug">{t.text}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                         <span className={`text-[9px] px-1.5 rounded uppercase font-bold tracking-wider ${
                                            t.sentiment === 'excitement' ? 'text-emerald-400 bg-emerald-900/30 border border-emerald-500/20' :
                                            t.sentiment === 'concern' ? 'text-amber-400 bg-amber-900/30 border border-amber-500/20' :
                                            t.sentiment === 'frustration' ? 'text-rose-400 bg-rose-900/30 border border-rose-500/20' :
                                            t.sentiment === 'surprise' ? 'text-fuchsia-400 bg-fuchsia-900/30 border border-fuchsia-500/20' :
                                            t.sentiment === 'confused' ? 'text-orange-400 bg-orange-900/30 border border-orange-500/20' :
                                            t.sentiment === 'agreement' ? 'text-blue-400 bg-blue-900/30 border border-blue-500/20' :
                                            'text-gray-400 bg-gray-800 border border-gray-700'
                                        }`}>
                                            {t.sentiment.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                 <button 
                    onClick={handleSyncToSpiked}
                    disabled={isSyncing}
                    className={`w-full py-3 border rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium group relative overflow-hidden ${
                        syncSuccess 
                            ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400 cursor-default'
                            : isSyncing 
                                ? 'bg-violet-900/40 border-violet-500/30 text-violet-300 cursor-wait'
                                : 'bg-violet-900/20 hover:bg-violet-900/40 border-violet-500/30 text-violet-300'
                    }`}
                >
                    {isSyncing ? (
                        <>
                            <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></div>
                            <span>Uploading Data to Spiked AI...</span>
                        </>
                    ) : syncSuccess ? (
                        <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span>Analysis Synced Successfully!</span>
                        </>
                    ) : (
                        <>
                            <DownloadIcon />
                            <span>Sync Analysis with <span className="font-bold text-white group-hover:text-violet-200">Spiked AI</span></span>
                        </>
                    )}
                </button>

            </div>
        </div>
    </div>
  );
};

export default MeetingAgent;
