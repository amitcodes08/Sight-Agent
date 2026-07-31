import { useState, useEffect } from 'react';
import { Play, Square, Settings, Activity, Server, Clock, Image as ImageIcon } from 'lucide-react';
import { MSG } from '../shared/constants';
import type { AgentConfig } from '../shared/types';

export default function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<number | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Load initial state
  useEffect(() => {
    // Get status
    chrome.runtime.sendMessage({ type: MSG.GET_STATUS }, (response) => {
      if (response) {
        setIsMonitoring(response.isMonitoring);
        setLastSnapshot(response.lastSnapshotTimestamp || null);
      }
    });

    // Get config
    chrome.runtime.sendMessage({ type: MSG.GET_CONFIG }, (response) => {
      if (response) {
        setConfig(response);
      }
    });

    // Poll for status updates (simple polling since we don't have a push mechanism for status changes yet)
    const interval = setInterval(() => {
      chrome.runtime.sendMessage({ type: MSG.GET_STATUS }, (response) => {
        if (response) {
          setIsMonitoring(response.isMonitoring);
          setLastSnapshot(response.lastSnapshotTimestamp || null);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const toggleMonitoring = () => {
    const nextState = !isMonitoring;
    chrome.runtime.sendMessage(
      { type: nextState ? MSG.START_MONITORING : MSG.STOP_MONITORING },
      () => {
        setIsMonitoring(nextState);
      }
    );
  };

  const updateConfig = (updates: Partial<AgentConfig>) => {
    chrome.runtime.sendMessage({ type: MSG.SET_CONFIG, payload: updates }, (newConfig) => {
      if (newConfig) setConfig(newConfig);
    });
  };

  return (
    <div className="min-h-screen bg-sight-bg text-white p-5 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-sight-primary to-sight-accent bg-clip-text text-transparent">
            SightAgent
          </h1>
          <p className="text-sm text-gray-400 mt-1">Visual AI Companion</p>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-sight-primary/20 text-sight-primary' : 'hover:bg-sight-surface text-gray-400 hover:text-white'}`}
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Main Status Card */}
      <div className={`rounded-2xl p-6 border transition-all duration-300 ${
        isMonitoring 
          ? 'bg-sight-surface border-sight-primary shadow-[0_0_30px_rgba(99,102,241,0.15)]' 
          : 'bg-sight-surface/50 border-white/5'
      }`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${isMonitoring ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            {isMonitoring && (
              <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{isMonitoring ? 'Monitoring Active' : 'Paused'}</h2>
            <p className="text-sm text-gray-400">
              {isMonitoring ? 'Capturing screen & DOM' : 'Agent is idle'}
            </p>
          </div>
        </div>

        <button
          onClick={toggleMonitoring}
          className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
            isMonitoring
              ? 'bg-white/10 hover:bg-white/20 text-white'
              : 'bg-sight-primary hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25'
          }`}
        >
          {isMonitoring ? <Square size={18} /> : <Play size={18} />}
          {isMonitoring ? 'Stop Agent' : 'Start Agent'}
        </button>

        {lastSnapshot && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Activity size={14} /> Last capture
            </span>
            <span>{new Date(lastSnapshot).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && config && (
        <div className="bg-sight-surface/50 rounded-2xl p-5 border border-white/5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="font-semibold text-gray-200 mb-2">Configuration</h3>
          
          <div className="space-y-3">
            <div>
              <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <Server size={14} /> Backend URL
              </label>
              <input 
                type="text" 
                value={config.backendUrl}
                onChange={(e) => updateConfig({ backendUrl: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sight-primary transition-colors"
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <Clock size={14} /> Capture Interval (ms)
              </label>
              <input 
                type="number" 
                value={config.captureIntervalMs}
                onChange={(e) => updateConfig({ captureIntervalMs: parseInt(e.target.value) || 5000 })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sight-primary transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <ImageIcon size={14} /> Max Width
                </label>
                <input 
                  type="number" 
                  value={config.screenshotMaxWidth}
                  onChange={(e) => updateConfig({ screenshotMaxWidth: parseInt(e.target.value) || 1280 })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sight-primary transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <ImageIcon size={14} /> Quality (0-1)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0.1"
                  max="1.0"
                  value={config.screenshotQuality}
                  onChange={(e) => updateConfig({ screenshotQuality: parseFloat(e.target.value) || 0.7 })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sight-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="text-sm text-gray-300">PII Scrubbing</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={config.piiScrubbing}
                  onChange={(e) => updateConfig({ piiScrubbing: e.target.checked })}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sight-primary"></div>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
