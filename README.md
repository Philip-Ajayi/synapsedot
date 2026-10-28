# SynapseDot

Portaldot cross-runtime interoperability monorepo for bridging EVM events to Substrate/ink! contract calls through a relayer and a Solidity ABI-to-SCALE transcoder.

## Repository layout

- `packages/contracts-evm/` — EVM dispatcher and mock vault contracts
- `packages/contracts-wasm/` — ink!/WASM receiver contract
- `packages/transcoder/` — ABI parsing and SCALE encoding
- `packages/relayer/` — EVM listener, durable event tracking, and WASM dispatch
- `packages/web/` — Next.js dashboard and visual inspection tools

## Getting started

1. Install a supported Node.js version, Rust/Cargo and the required chain development tools.
2. Copy `.env.example` to `.env` and replace development credentials and addresses with values for your own local environment.
3. Install workspace dependencies with `npm install`.
4. Build with `npm run build` and run tests with `npm test`.
5. Start services only after configuring and verifying the EVM and Substrate endpoints.

Review all network, key, address, and chain settings before running. The repository has been packaged from supplied code excerpts; it has not been built, tested, audited, or deployed as part of this archive.
