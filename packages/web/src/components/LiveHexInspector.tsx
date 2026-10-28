'use client';

import React from 'react';

interface Props {
  abiPayload: string;
  scaleData: { scaleHex: string; breakdown: any[] } | null;
}

export const LiveHexInspector: React.FC<Props> = ({ abiPayload, scaleData }) => {
  return (
    <div className="bg-[#10121d] border border-[#232738] rounded-xl p-5 mb-8 shadow-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-[#232738]">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse"></div>
          <h3 className="font-mono text-sm font-bold tracking-wide uppercase text-slate-200">
            Bytecode Codec Transcoder Live Inspector
          </h3>
        </div>
        <span className="text-xs bg-[#1a1e30] text-cyan-300 font-mono px-3 py-1 rounded-full border border-cyan-800/40">
          Zero-Loss Dynamic Transcoding
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {/* EVM ABI View */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-portaldot-evm uppercase tracking-wider">
              Solidity ABI Payload (32-Byte Word Padded)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">96 Bytes</span>
          </div>
          <div className="p-3 bg-[#0a0b12] rounded-lg border border-slate-800 font-mono text-xs break-all text-slate-300 space-y-1">
            <div className="text-slate-500">// Word 0: origin_evm (H160 padded)</div>
            <div className="text-indigo-400">{abiPayload.slice(0, 66)}</div>
            <div className="text-slate-500 pt-1">// Word 1: wasm_recipient (32 bytes AccountId)</div>
            <div className="text-pink-400">{'0x' + abiPayload.slice(66, 130)}</div>
            <div className="text-slate-500 pt-1">// Word 2: amount (uint256 big-endian)</div>
            <div className="text-emerald-400">{'0x' + abiPayload.slice(130, 194)}</div>
          </div>
        </div>

        {/* ink! SCALE View */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-portaldot-wasm uppercase tracking-wider">
              ink! 5.0 Substrate SCALE Payload (Packed LE)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">72 Bytes (25% More Compact)</span>
          </div>
          <div className="p-3 bg-[#0a0b12] rounded-lg border border-slate-800 font-mono text-xs break-all text-slate-300 space-y-1">
            {scaleData ? (
              <>
                <div className="text-slate-500">// Selector + Compact byte stream</div>
                <div className="text-cyan-300 font-bold">{scaleData.scaleHex.slice(0, 10)}</div>
                <div className="text-indigo-300">{scaleData.scaleHex.slice(10, 50)}</div>
                <div className="text-pink-300">{scaleData.scaleHex.slice(50, 114)}</div>
                <div className="text-emerald-300">{scaleData.scaleHex.slice(114)}</div>
              </>
            ) : (
              <div className="text-slate-600 italic">Awaiting dispatch trigger...</div>
            )}
          </div>
        </div>
      </div>

      {scaleData && (
        <div className="mt-4 pt-4 border-t border-[#1e2235]">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
            Transcoded Field Map:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {scaleData.breakdown.map((item, idx) => (
              <div key={idx} className="bg-[#151826] p-2 rounded border border-slate-800 text-[11px] font-mono">
                <div className="text-slate-400">{item.field}</div>
                <div className="text-slate-200 font-bold truncate">{item.hex}</div>
                <div className="text-[10px] text-slate-500">{item.size}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
