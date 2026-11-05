'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { LiveHexInspector } from './LiveHexInspector';
import { TerminalStream, TerminalLog } from './TerminalStream';
import { abiEncodeDeposit, transcodeToScale, ss58ToHex } from '../lib/transcoder-engine';
import { MOCK_VAULT_ABI, switchToPortaldotNetwork } from '../lib/contracts';
import { Lock, CheckCircle2, ShieldCheck, Zap, Wallet, PlayCircle } from 'lucide-react';

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const EVM_RPC_URL = process.env.NEXT_PUBLIC_EVM_RPC || "http://127.0.0.1:8545";
const DEFAULT_WASM_RECIPIENT = process.env.NEXT_PUBLIC_WASM_RECEIVER_ADDRESS || "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

export const SplitScreenDashboard: React.FC = () => {
  const [amount, setAmount] = useState<number>(1);
  const [evmAccount, setEvmAccount] = useState<string>('');
  const [wasmRecipientInput, setWasmRecipientInput] = useState<string>(DEFAULT_WASM_RECIPIENT);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [evmTxHash, setEvmTxHash] = useState<string | null>(null);
  const [wasmTxHash, setWasmTxHash] = useState<string | null>(null);
  const [evmBalance, setEvmBalance] = useState<string>('0.00');
  const [wasmBalance, setWasmBalance] = useState<string>('0.00');
  const [isJudgeMode, setIsJudgeMode] = useState<boolean>(false);

  let resolvedWasmHex = '0x0000000000000000000000000000000000000000000000000000000000000000';
  let isWasmAddressValid = true;
  try {
    resolvedWasmHex = ss58ToHex(wasmRecipientInput);
  } catch {
    isWasmAddressValid = false;
  }

  const rawAbi = abiEncodeDeposit(
    evmAccount || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    wasmRecipientInput,
    amount
  );
  const scaleInspection = transcodeToScale(rawAbi, '0x3a5b6c7d');

  const [logs, setLogs] = useState<TerminalLog[]>([
    {
      id: 'init',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      message: 'SynapseDOT cross-runtime gateway synchronized. Dual-chain live.'
    }
  ]);

  const addLog = (level: TerminalLog['level'], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level, message }
    ]);
  };

  useEffect(() => {
    const fetchDaemonActivity = async () => {
      try {
        const res = await fetch('/api/relayer-status');
        const data = await res.json();
        if (data?.logs && Array.isArray(data.logs)) {
          const formatted: TerminalLog[] = data.logs.map((item: any) => ({
            id: item.id.toString(),
            timestamp: new Date(item.timestamp).toLocaleTimeString(),
            level: item.level,
            message: item.message,
          }));
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newEntries = formatted.filter((l) => !existingIds.has(l.id));
            return [...prev, ...newEntries];
          });
        }
      } catch {
        // Relayer daemon syncing
      }
    };

    fetchDaemonActivity();
    const interval = setInterval(fetchDaemonActivity, 2000);
    return () => clearInterval(interval);
  }, []);

  const connectMetaMask = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert("Please install MetaMask to use user-agnostic wallet mode, or toggle Judge Mode.");
      return;
    }
    try {
      await switchToPortaldotNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setEvmAccount(addr);
      setIsJudgeMode(false);
      addLog('INFO', `[MetaMask] User wallet connected: ${addr}`);
      updateBalances(addr);
    } catch (err: any) {
      addLog('WARN', `Connection failed: ${err.message}`);
    }
  };

  const updateBalances = async (address: string) => {
    try {
      const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
      const bal = await provider.getBalance(address);
      setEvmBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
    } catch {
      // Offline fallback
    }
  };

  const pollRelayerUntilSettled = async (dispatchId: string) => {
    addLog('INFO', `[Relayer] Tracking dispatch ID ${dispatchId.slice(0, 10)}... in database`);
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/relayer-status?dispatchId=${dispatchId}`);
        const data = await res.json();

        if (data?.record) {
          if (data.record.status === 'TRANSCODED') {
            addLog('EXEC', `[Transcoder] ABI transformed to SCALE LE: ${data.record.scale_payload.slice(0, 18)}...`);
          } else if (data.record.status === 'CONFIRMED' || data.record.status === 'SETTLED') {
            clearInterval(interval);
            setWasmTxHash(data.record.dest_tx_hash);
            addLog('SUCCESS', `[Portaldot WASM] Extrinsic finalized on Substrate! Hash: ${data.record.dest_tx_hash}`);
            addLog('SUCCESS', `[EVM Dispatcher] State settled.`);
            setWasmBalance((prev) => (parseFloat(prev) + amount).toFixed(2));
            setIsProcessing(false);
          } else if (data.record.status === 'REFUNDED' || data.record.status === 'FAILED') {
            clearInterval(interval);
            addLog('ERROR', `[Relayer] Dispatch execution ${data.record.status.toLowerCase()}: ${data.record.error_message || 'Reverted'}`);
            setIsProcessing(false);
          }
        }
      } catch {
        // Continue polling
      }

      if (attempts > 35) {
        clearInterval(interval);
        addLog('WARN', 'Polling timeout reached. Check daemon logs.');
        setIsProcessing(false);
      }
    }, 2000);
  };

  const handleExecuteBridge = async () => {
    if (!isWasmAddressValid) {
      alert("Please provide a valid Substrate SS58 address or 32-byte Hex AccountId.");
      return;
    }

    setIsProcessing(true);
    setEvmTxHash(null);
    setWasmTxHash(null);

    try {
      let signer: ethers.Signer;

      if (isJudgeMode) {
        addLog('INFO', '[Judge 1-Click Mode] Signing with funded local key...');
        const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
        const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        signer = new ethers.Wallet(testKey, provider);
      } else {
        if (!evmAccount) {
          await connectMetaMask();
        }
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        signer = await provider.getSigner();
      }

      const vaultContract = new ethers.Contract(VAULT_ADDRESS, MOCK_VAULT_ABI, signer);
      const totalAmount = ethers.parseEther((amount + 0.001).toString());

      addLog('INFO', `Calling lockAndMint() on Vault [${VAULT_ADDRESS.slice(0, 8)}...]`);
      const tx = await vaultContract.lockAndMint(resolvedWasmHex, { value: totalAmount });

      setEvmTxHash(tx.hash);
      addLog('SUCCESS', `[Portaldot EVM] Broadcasted! TxHash: ${tx.hash}`);

      const receipt = await tx.wait();

      // Extract Dispatch ID from event topics
      let dispatchId = ethers.keccak256(tx.hash);
      for (const log of receipt.logs) {
        if (log.topics && log.topics.length >= 2) {
          dispatchId = log.topics[1];
          break;
        }
      }
      addLog('INFO', `Dispatch ID recorded on EVM: ${dispatchId}`);

      await pollRelayerUntilSettled(dispatchId);
    } catch (err: any) {
      addLog('WARN', `Execution aborted: ${err?.reason || err?.message || 'Transaction rejected'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-8 border-b border-[#232738] gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="bg-gradient-to-r from-portaldot-evm to-portaldot-wasm text-transparent bg-clip-text text-3xl font-extrabold tracking-tight">
              SYNAPSEDOT
            </span>
            <span className="text-xs uppercase px-2.5 py-0.5 rounded-full bg-purple-950/60 text-purple-300 font-mono border border-purple-800/40">
              V3.0 Cross-Runtime Interop (LIVE)
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Bridging Solidity (Ethereum ABI) & ink! 5.0 (Substrate SCALE) via real on-chain dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsJudgeMode(!isJudgeMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              isJudgeMode
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                : 'bg-[#121422] text-slate-400 border-slate-800'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Judge 1-Click Mode: {isJudgeMode ? 'ON' : 'OFF'}
          </button>

          {!isJudgeMode && (
            <button
              onClick={connectMetaMask}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-mono shadow-md transition-all"
            >
              <Wallet className="w-3.5 h-3.5" />
              {evmAccount ? `${evmAccount.slice(0, 6)}...${evmAccount.slice(-4)}` : 'Connect MetaMask'}
            </button>
          )}
        </div>
      </div>

      {/* Split Dashboard Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 my-8">
        {/* EVM RUNTIME */}
        <div className="bg-[#10121d] border border-portaldot-evm/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-portaldot-evm font-bold">
                EVM
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Solidity Execution Runtime</h2>
                <span className="text-xs text-slate-400 font-mono">Portaldot EVM (Chain ID: 1337)</span>
              </div>
            </div>
            <span className="text-xs bg-blue-900/30 text-blue-300 font-mono px-2.5 py-1 rounded-full border border-blue-800/40">
              Live Contract
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Signer</span>
              <div className="font-mono text-sm text-slate-200 mt-1 truncate">
                {isJudgeMode
                  ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Pre-funded Judge Wallet)'
                  : (evmAccount || 'Click "Connect MetaMask" or enable Judge Mode')}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800/60">
                <span className="text-xs text-slate-400">Vault Liquid Balance:</span>
                <span className="text-sm font-mono font-bold text-portaldot-evm">{evmBalance} POT</span>
              </div>
            </div>

            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <label className="text-xs text-slate-400 font-semibold block mb-2">Deposit & Lock Amount (POT)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.1"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  disabled={isProcessing}
                  className="bg-[#141624] border border-slate-700 rounded-lg px-4 py-2 font-mono text-lg text-white w-full focus:outline-none focus:border-portaldot-evm"
                />
                <button
                  onClick={handleExecuteBridge}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                >
                  {isProcessing ? <Zap className="w-4 h-4 animate-spin text-cyan-300" /> : <Lock className="w-4 h-4" />}
                  {isJudgeMode ? '1-Click Live Test' : 'Lock & Mint'}
                </button>
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Includes 0.001 POT Base Relay Fee. Calls real on-chain MockVaultEVM.sol.
              </span>
            </div>

            {evmTxHash && (
              <div className="p-3 bg-blue-950/20 border border-blue-800/40 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-300 font-mono truncate max-w-[240px]">Tx: {evmTxHash}</span>
                </div>
                <span className="text-blue-400 font-mono">Mined in Block</span>
              </div>
            )}
          </div>
        </div>

        {/* SUBSTRATE WASM RUNTIME */}
        <div className="bg-[#10121d] border border-portaldot-wasm/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-rose-600"></div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-portaldot-wasm font-bold">
                WASM
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">ink! 5.0 WASM Runtime</h2>
                <span className="text-xs text-slate-400 font-mono">Substrate / pallet_contracts</span>
              </div>
            </div>
            <span className="text-xs bg-pink-900/30 text-pink-300 font-mono px-2.5 py-1 rounded-full border border-pink-800/40">
              synapse_receiver.wasm
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                Recipient WASM Account (SS58 or 32-Byte Hex)
              </label>
              <input
                type="text"
                value={wasmRecipientInput}
                onChange={(e) => setWasmRecipientInput(e.target.value.trim())}
                disabled={isProcessing}
                placeholder="5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
                className={`bg-[#141624] border ${isWasmAddressValid ? 'border-slate-700' : 'border-red-500'} rounded-lg px-3 py-1.5 font-mono text-xs text-white w-full focus:outline-none`}
              />
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800/60 text-[11px] font-mono">
                <span className="text-slate-500">Decoded AccountId32:</span>
                <span className="text-pink-400 truncate max-w-[250px]">{resolvedWasmHex}</span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800/60">
                <span className="text-xs text-slate-400">Minted Synthetic Balance:</span>
                <span className="text-sm font-mono font-bold text-portaldot-wasm">{wasmBalance} POT</span>
              </div>
            </div>

            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 font-semibold block mb-2">Contract Interface Verification</span>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-500">Method Selector:</span>
                  <span className="text-cyan-400">0x3a5b6c7d (mint_from_evm)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/50">
                  <span className="text-slate-500">Target Contract:</span>
                  <span className="text-pink-400 truncate max-w-[200px]">{DEFAULT_WASM_RECIPIENT}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Execution Guarantee:</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Replay-Guarded / Atomic
                  </span>
                </div>
              </div>
            </div>

            {wasmTxHash && (
              <div className="p-3 bg-pink-950/20 border border-pink-800/40 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-pink-400" />
                  <span className="text-slate-300 font-mono truncate max-w-[240px]">Extrinsic: {wasmTxHash}</span>
                </div>
                <span className="text-pink-400 font-mono">Finalized</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Codec Inspector */}
      <LiveHexInspector abiPayload={rawAbi} scaleData={scaleInspection} />

      {/* Real Daemon Terminal Stream */}
      <TerminalStream logs={logs} />
    </div>
  );
};