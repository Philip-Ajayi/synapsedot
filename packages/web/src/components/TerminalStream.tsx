'use client';

import React, { useEffect, useRef } from 'react';

export interface TerminalLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'EXEC' | 'ERROR';
  message: string;
}

interface Props {
  logs: TerminalLog[];
}

export const TerminalStream: React.FC<Props> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Confine scroll to the terminal container only, preventing window/page scrolling
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-[#0b0c14] border border-[#232738] rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
      <div className="bg-[#121422] px-4 py-2 border-b border-[#232738] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 animate-pulse"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
          <span className="ml-2 text-slate-400 font-semibold text-[11px]">
            SynapseDOT Relay Daemon Stream (live write-ahead log)
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
          WS CONNECTED (SUBSTRATE & EVM)
        </span>
      </div>

      {/* Attach ref here */}
      <div ref={containerRef} className="p-4 h-64 overflow-y-auto space-y-1.5 bg-[#07080d]">
        {logs.map((log) => {
          let badgeColor = 'text-blue-400 bg-blue-950/50 border-blue-800/50';
          if (log.level === 'SUCCESS') badgeColor = 'text-emerald-400 bg-emerald-950/50 border-emerald-800/50';
          if (log.level === 'WARN') badgeColor = 'text-amber-400 bg-amber-950/50 border-amber-800/50';
          if (log.level === 'EXEC') badgeColor = 'text-pink-400 bg-pink-950/50 border-pink-800/50';
          if (log.level === 'ERROR') badgeColor = 'text-red-400 bg-red-950/50 border-red-800/50';

          return (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed font-mono">
              <span className="text-slate-600 select-none">[{log.timestamp}]</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badgeColor}`}>
                {log.level}
              </span>
              <span className="text-slate-300 break-all">{log.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};