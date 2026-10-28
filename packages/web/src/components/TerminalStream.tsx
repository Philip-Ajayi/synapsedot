'use client';

import React, { useEffect, useRef } from 'react';

export interface TerminalLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'EXEC';
  message: string;
}

interface Props {
  logs: TerminalLog[];
}

export const TerminalStream: React.FC<Props> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-[#0b0c14] border border-[#232738] rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
      <div className="bg-[#121422] px-4 py-2 border-b border-[#232738] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
          <span className="ml-2 text-slate-400 font-semibold text-[11px]">
            SynapseDOT Relay Daemon Stream (sqlite-wal: active)
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30">
          WS CONNECTED 1-2 BLOCKS LATENCY
        </span>
      </div>

      <div className="p-4 h-64 overflow-y-auto space-y-2">
        {logs.map((log) => {
          let badgeColor = 'text-blue-400 bg-blue-950/50';
          if (log.level === 'SUCCESS') badgeColor = 'text-emerald-400 bg-emerald-950/50';
          if (log.level === 'WARN') badgeColor = 'text-amber-400 bg-amber-950/50';
          if (log.level === 'EXEC') badgeColor = 'text-pink-400 bg-pink-950/50';

          return (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-slate-600 select-none">[{log.timestamp}]</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${badgeColor}`}>
                {log.level}
              </span>
              <span className="text-slate-300 break-all">{log.message}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
