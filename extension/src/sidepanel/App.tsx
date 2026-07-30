import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-sight-bg text-white p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-sight-primary to-sight-accent bg-clip-text text-transparent">
          SightAgent
        </h1>
        <p className="text-sm text-gray-400 mt-1">Visual AI Agent</p>
      </header>

      <div className="bg-sight-surface/50 rounded-xl p-4 border border-sight-primary/20">
        <p className="text-gray-300 text-sm">
          Side panel UI will be built in Step 5.
        </p>
      </div>
    </div>
  );
}
