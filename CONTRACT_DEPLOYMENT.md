# Deploying VantagePredictionLog to Polygon Amoy testnet

This is the on-chain verifiability piece for the BGA bounty. Total time: ~15 minutes.

## 1. Set up MetaMask for Polygon Amoy (5 min)

1. Install MetaMask browser extension if you don't have it: https://metamask.io/
2. Create a wallet (or use an existing one — but see step 4, use a throwaway wallet, never your main one)
3. Add the Polygon Amoy testnet to MetaMask:
   - Open MetaMask → click the network dropdown → "Add network" → "Add a network manually"
   - Network name: `Polygon Amoy Testnet`
   - RPC URL: `https://rpc-amoy.polygon.technology`
   - Chain ID: `80002`
   - Currency symbol: `POL`
   - Block explorer URL: `https://amoy.polygonscan.com`
   - Save

## 2. Get free test POL tokens (2 min)

1. Copy your wallet address from MetaMask
2. Go to https://faucet.polygon.technology/
3. Select "Amoy" network, paste your address, request tokens
4. Wait ~30 seconds, check MetaMask shows a POL balance (you only need a tiny amount — this is testnet, it's free and worthless by design)

## 3. Deploy the contract via Remix (5 min)

1. Go to https://remix.ethereum.org/ (runs entirely in your browser, no install needed)
2. In the file explorer on the left, create a new file called `VantagePredictionLog.sol`
3. Copy the entire contents of `contracts/VantagePredictionLog.sol` from this repo and paste it in
4. Click the "Solidity Compiler" tab (left sidebar, looks like an "S") → click "Compile VantagePredictionLog.sol"
5. Click the "Deploy & Run Transactions" tab (looks like an Ethereum logo)
6. In the "Environment" dropdown, select "Injected Provider - MetaMask"
7. MetaMask will pop up asking to connect — approve it, make sure it shows "Polygon Amoy Testnet" as the network
8. Click the orange "Deploy" button
9. MetaMask pops up again asking to confirm the transaction — click "Confirm"
10. Wait a few seconds. Once deployed, you'll see the contract appear under "Deployed Contracts" at the bottom of the Remix panel
11. Click the copy icon next to the contract address to copy it

## 4. Get your wallet's private key (2 min)

**Use a throwaway wallet for this, never your main wallet with real funds.** If you created a fresh wallet in step 1, that's already a throwaway — fine to use.

1. In MetaMask, click the three dots → "Account details" → "Show private key"
2. Enter your MetaMask password
3. Copy the private key shown

## 5. Add to your environment variables

In your `.env.local` file (or Vercel's environment variables for the deployed app):

```
VANTAGE_CONTRACT_ADDRESS=0x... (the address you copied in step 3)
VANTAGE_WALLET_PRIVATE_KEY=0x... (the private key you copied in step 4)
```

## 6. Test it

Run the app, go to the EdgeScreen, select a stock, wait for the conviction agent to load, then click "Log prediction on-chain." You should get back a transaction hash and a link to view it on PolygonScan — that's your live, public, verifiable proof.

## Why this matters for judging

This directly addresses BGA's "transparency & verifiability" criterion: the conviction call is hashed and timestamped on a public blockchain *before* the earnings outcome is known, so anyone — including a judge — can independently verify on PolygonScan that the prediction wasn't altered or fabricated after the fact. It also touches "on-chain trading infrastructure" from the innovation criteria, using real Solidity and a real (test) network rather than just claiming blockchain involvement in the pitch.
