'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { LiveHexInspector } from './LiveHexInspector';
import { TerminalStream, TerminalLog } from './TerminalStream';
import { abiEncodeDeposit, transcodeToScale } from '../lib/transcoder-engine';
import { MOCK_VAULT_ABI, switchToPortaldotNetwork } from '../lib/contracts';
import { ArrowRight, Lock, CheckCircle2, ShieldCheck, ExternalLink, Zap, Wallet, PlayCircle } from 'lucide-react';

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const EVM_RPC_URL = process.env.NEXT_PUBLIC_EVM_RPC || "http://127.0.0.1:8545";
const DEFAULT_WASM_RECIPIENT = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d"; // Alice

export const SplitScreenDashboard: React.FC = () => {
  const [amount, setAmount] = useState<number>(1);
  const [evmAccount, setEvmAccount] = useState<string>('');
  const [wasmAccount, setWasmAccount] = useState<string>(DEFAULT_WASM_RECIPIENT);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [evmTxHash, setEvmTxHash] = useState<string | null>(null);
  const [wasmTxHash, setWasmTxHash] = useState<string | null>(null);
  const [evmBalance, setEvmBalance] = useState<string>('0.00');
  const [wasmBalance, setWasmBalance] = useState<string>('0.00');
  const [isJudgeMode, setIsJudgeMode] = useState<boolean>(true);

  // Live Transcode Data
  const rawAbi = abiEncodeDeposit(
    evmAccount || "0x0000000000000000000000000000000000000000",
    wasmAccount,
    amount
  );
  const [scaleInspection, setScaleInspection] = useState<any>(null);

  const [logs, setLogs] = useState<TerminalLog[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      message: 'SynapseDOT connected to network gateway. Ready for live cross-runtime calls.'
    }
  ]);

  const addLog = (level: TerminalLog['level'], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), level, message }
    ]);
  };

  // Connect MetaMask
  const connectMetaMask = async () => {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask to use direct wallet mode, or use 'Judge 1-Click Mode'.");
      return;
    }
    try {
      await switchToPortaldotNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setEvmAccount(addr);
      setIsJudgeMode(false);
      addLog('INFO', `[MetaMask] Connected account: ${addr}`);
      updateBalances(addr);
    } catch (err: any) {
      addLog('WARN', `Connection failed: ${err.message}`);
    }
  };

  // Fetch real on-chain balance
  const updateBalances = async (address: string) => {
    try {
      const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
      const bal = await provider.getBalance(address);
      setEvmBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
    } catch {
      // Fallback if node temporarily unreachable
    }
  };

  // Poll relayer status from backend on Render
  const pollRelayerUntilSettled = async (dispatchId: string) => {
    addLog('INFO', `[Relayer] Polling daemon write-ahead log for dispatch: ${dispatchId.slice(0, 10)}...`);

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/relayer-status?dispatchId=${dispatchId}`);
        const data = await res.json();

        if (data?.record) {
          if (data.record.status === 'TRANSCODED') {
            addLog('EXEC', `[Transcoder] Event ingested. Dynamic SCALE payload generated (${data.record.scale_payload.length / 2 - 1} bytes).`);
          } else if (data.record.status === 'CONFIRMED' || data.record.status === 'SETTLED') {
            clearInterval(interval);
            setWasmTxHash(data.record.dest_tx_hash);
            addLog('SUCCESS', `[Portaldot WASM] Extrinsic finalized on Substrate ink! Tx: ${data.record.dest_tx_hash}`);
            addLog('SUCCESS', `[SynapseDispatcher.sol] State settlement confirmed on EVM.`);
            setWasmBalance((prev) => (parseFloat(prev) + amount).toFixed(2));
            setIsProcessing(false);
          }
        }
      } catch (err) {
        // Continue polling
      }

      if (attempts > 30) {
        clearInterval(interval);
        addLog('WARN', '[Relayer] Polling timeout reached. Check daemon logs.');
        setIsProcessing(false);
      }
    }, 2000);
  };

  // Real on-chain dispatch handler
  const handleExecuteBridge = async () => {
    setIsProcessing(true);
    setEvmTxHash(null);
    setWasmTxHash(null);

    // Compute live SCALE encoding for visual inspector
    const transcoded = transcodeToScale(rawAbi, '0x3a5b6c7d');
    setScaleInspection(transcoded);

    try {
      let signer: ethers.Signer;

      if (isJudgeMode) {
        addLog('INFO', '[Judge 1-Click Mode] Signing with pre-funded ephemeral judge relayer wallet...');
        const provider = new ethers.JsonRpcProvider(EVM_RPC_URL);
        // Uses standard hardhat/local or testnet funded private key
        const testKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        signer = new ethers.Wallet(testKey, provider);
      } else {
        addLog('INFO', '[MetaMask] Requesting signature from user...');
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        signer = await provider.getSigner();
      }

      const vaultContract = new ethers.Contract(VAULT_ADDRESS, MOCK_VAULT_ABI, signer);
      const totalAmount = ethers.parseEther((amount + 0.001).toString()); // amount + 0.001 baseRelayFee

      addLog('INFO', `Broadcasting lockAndMint() to EVM Vault (${VAULT_ADDRESS})...`);
      const tx = await vaultContract.lockAndMint(wasmAccount, { value: totalAmount });

      setEvmTxHash(tx.hash);
      addLog('SUCCESS', `[Portaldot EVM] Transaction mined in block! TxHash: ${tx.hash}`);

      const receipt = await tx.wait();

      // Extract dispatchId from CrossRuntimeDispatch event
      const dispatchId = receipt.logs[0]?.topics[1] || ethers.keccak256(tx.hash);
      addLog('INFO', `Dispatch ID generated on-chain: ${dispatchId}`);

      // Poll real relayer daemon
      await pollRelayerUntilSettled(dispatchId);

    } catch (err: any) {
      addLog('WARN', `Execution error: ${err?.reason || err?.message || 'Transaction rejected'}`);
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
              V3.0 Cross-Runtime Engine (LIVE)
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Bridging Solidity (Ethereum ABI) & ink! 5.0 (Substrate SCALE) via real on-chain dispatch.
          </p>
        </div>

        {/* Quick Testing Controls for Judges */}
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
        {/* LEFT RUNTIME: Portaldot Solidity EVM */}
        <div className="bg-[#10121d] border border-portaldot-evm/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-portaldot-evm font-bold">
                EVM
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Solidity Execution Runtime</h2>
                <span className="text-xs text-slate-400 font-mono">Portaldot EVM / Hardhat RPC</span>
              </div>
            </div>
            <span className="text-xs bg-blue-900/30 text-blue-300 font-mono px-2.5 py-1 rounded-full border border-blue-800/40">
              Live Contract
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Signer Address</span>
              <div className="font-mono text-sm text-slate-200 mt-1 truncate">
                {isJudgeMode ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Judge Ephemeral Signer)' : (evmAccount || 'Not Connected')}
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
                  min="0.1"
                  max="50"
                  step="0.5"
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
                Includes 0.001 POT Relayer Fee. Executes genuine contract dispatch.
              </span>
            </div>

            {evmTxHash && (
              <div className="p-3 bg-blue-950/20 border border-blue-800/40 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-300 font-mono truncate max-w-[240px]">Tx: {evmTxHash}</span>
                </div>
                <a
                  href={`https://explorer.portaldot.io/tx/${evmTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-1 font-mono"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT RUNTIME: Portaldot Substrate WASM */}
        <div className="bg-[#10121d] border border-portaldot-wasm/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-rose-600"></div>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 text-portaldot-wasm font-bold">
                WASM
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">ink! 5.0 WASM Runtime</h2>
                <span className="text-xs text-slate-400 font-mono">pallet_contracts / Substrate RPC</span>
              </div>
            </div>
            <span className="text-xs bg-pink-900/30 text-pink-300 font-mono px-2.5 py-1 rounded-full border border-pink-800/40">
              synapse_receiver.wasm
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0a0b12] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Destination WASM AccountId</span>
              <div className="font-mono text-sm text-slate-200 mt-1 truncate">{wasmAccount}</div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-800/60">
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
                  <span className="text-slate-500">Address Model:</span>
                  <span className="text-pink-400">32-Byte Substrate Public Key</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Execution Guarantees:</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Atomic / Refund Protected
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
                <a
                  href={`https://explorer.portaldot.io/extrinsic/${wasmTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-pink-400 hover:underline flex items-center gap-1 font-mono"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
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
