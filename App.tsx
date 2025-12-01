
import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import MeetingAgent from './components/MeetingAgent';
import FeatureCard from './components/FeatureCard';
import { CameraIcon } from './components/icons/CameraIcon';
import { EyeIcon } from './components/icons/EyeIcon';
import { CursorClickIcon } from './components/icons/CursorClickIcon';
import { BrainIcon } from './components/icons/BrainIcon';
import { ChipIcon } from './components/icons/ChipIcon';
import { ChartBarIcon } from './components/icons/ChartBarIcon';
import { UserGroupIcon } from './components/icons/UserGroupIcon';
import { PresentationChartLineIcon } from './components/icons/PresentationChartLineIcon';

type AppMode = 'personal' | 'meeting';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('personal');

  return (
    <div className="min-h-screen bg-gray-950 font-sans text-gray-100">
      <div className="absolute inset-0 -z-10 h-full w-full bg-gray-950 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      
      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 border-b border-gray-800 pb-8">
          <div className="text-center md:text-left mb-6 md:mb-0">
             <div className="inline-block bg-cyan-500/10 text-cyan-400 text-xs font-medium px-3 py-1 rounded-full mb-2">
              Human–AI Co-Learning System
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              NeuroLens AI
            </h1>
            <p className="mt-2 text-gray-400 text-sm md:text-base max-w-xl">
              Real-time Cognitive State & Meeting Analytics
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="bg-gray-900 p-1.5 rounded-lg border border-gray-800 flex items-center gap-1">
            <button
              onClick={() => setMode('personal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'personal' 
                  ? 'bg-gray-800 text-white shadow-lg shadow-cyan-500/10 border border-gray-700' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <EyeIcon className="w-4 h-4" />
              Personal Focus
            </button>
            <button
              onClick={() => setMode('meeting')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'meeting' 
                  ? 'bg-gray-800 text-white shadow-lg shadow-violet-500/10 border border-gray-700' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <UserGroupIcon className="w-4 h-4" />
              Meeting Agent
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="animate-fade-in-right">
          {mode === 'personal' ? (
            <>
              {/* Personal Dashboard */}
              <section className="mb-12">
                 <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-cyan-500/10 rounded-lg">
                      <BrainIcon />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Personal Focus Analytics</h2>
                      <p className="text-gray-400 text-sm">Real-time monitoring of your attention, stress, and flow state.</p>
                    </div>
                 </div>
                 <Dashboard />
              </section>

              {/* How It Works (Collapsed for cleaner UI, only shown in personal) */}
              <section className="mb-12">
                <h3 className="text-xl font-bold text-center mb-8 text-gray-300">System Capabilities</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FeatureCard
                    icon={<CameraIcon />}
                    title="Micro-Expressions"
                    description="Analyzes involuntary facial movements to gauge emotional states."
                  />
                  <FeatureCard
                    icon={<EyeIcon />}
                    title="Gaze Tracking"
                    description="Monitors pupil dilation and patterns to measure cognitive load."
                  />
                  <FeatureCard
                    icon={<CursorClickIcon />}
                    title="Behavioral Logs"
                    description="Correlates digital interaction patterns with cognitive focus."
                  />
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Meeting Agent Section */}
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-violet-500/10 rounded-lg">
                      <PresentationChartLineIcon className="w-8 h-8 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">AI Meeting Agent</h2>
                      <p className="text-gray-400 text-sm">Analyze team dynamics, sentiment, and engagement in Google Meet, Zoom, or Teams.</p>
                    </div>
                 </div>
                 <MeetingAgent />
              </section>
            </>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="text-center py-8 border-t border-gray-800 bg-gray-900/30">
        <p className="text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} NeuroLens AI. <span className="hidden md:inline">|</span> 
          <span className="block md:inline mt-1 md:mt-0"> Pioneering the future of human-computer interaction.</span>
        </p>
      </footer>
    </div>
  );
};

export default App;
