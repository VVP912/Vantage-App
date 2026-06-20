import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'

// Minimal ABI — only the functions/events this route needs
const CONTRACT_ABI = [
  'function logPrediction(string symbol, bytes32 signalHash, string convictionLevel, uint8 agreeingSignals, uint8 totalLiveSignals) external returns (uint256)',
  'function getPrediction(uint256 id) external view returns (tuple(address recorder, string symbol, bytes32 signalHash, string convictionLevel, uint8 agreeingSignals, uint8 totalLiveSignals, uint256 timestamp, bool resolved, bool outcomeCorrect))',
  'function getAccuracyStats() external view returns (uint256 totalResolved, uint256 totalCorrect)',
  'function predictionCount() external view returns (uint256)',
]

const AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology'
const AMOY_CHAIN_ID = 80002

function getContractConfig() {
  const contractAddress = process.env.VANTAGE_CONTRACT_ADDRESS
  const privateKey = process.env.VANTAGE_WALLET_PRIVATE_KEY
  if (!contractAddress || !privateKey) return null
  return { contractAddress, privateKey }
}

export async function POST(req: NextRequest) {
  const config = getContractConfig()

  const body = await req.json()
  const { symbol, signalValues, convictionLevel, agreeingSignals, totalLiveSignals } = body

  // Hash the raw signal values so the on-chain record is verifiable
  // against the off-chain data without storing the raw values on-chain
  // (cheaper gas, and proves the prediction wasn't altered after the
  // fact without needing to publish every signal value publicly).
  const signalHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(signalValues))
  )

  if (!config) {
    return NextResponse.json({
      logged: false,
      message: 'On-chain logging not configured — add VANTAGE_CONTRACT_ADDRESS and VANTAGE_WALLET_PRIVATE_KEY to enable. Deploy contracts/VantagePredictionLog.sol to Polygon Amoy testnet via Remix to get a contract address.',
      signalHash,
      network: 'Polygon Amoy (testnet, chain id 80002)',
    })
  }

  try {
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL, AMOY_CHAIN_ID)
    const wallet = new ethers.Wallet(config.privateKey, provider)
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, wallet)

    const tx = await contract.logPrediction(
      symbol,
      signalHash,
      convictionLevel,
      agreeingSignals,
      totalLiveSignals
    )
    const receipt = await tx.wait()

    return NextResponse.json({
      logged: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      explorerUrl: `https://amoy.polygonscan.com/tx/${receipt.hash}`,
      signalHash,
      network: 'Polygon Amoy (testnet, chain id 80002)',
      contractAddress: config.contractAddress,
    })
  } catch (error) {
    console.error('On-chain logging error:', error)
    return NextResponse.json({
      logged: false,
      message: 'On-chain transaction failed — falling back gracefully. App continues to function without on-chain verification for this call.',
      error: String(error),
      signalHash,
    })
  }
}

export async function GET(req: NextRequest) {
  const config = getContractConfig()
  if (!config) {
    return NextResponse.json({
      available: false,
      message: 'On-chain logging not configured.',
    })
  }

  try {
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL, AMOY_CHAIN_ID)
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider)

    const [totalResolved, totalCorrect] = await contract.getAccuracyStats()
    const predictionCount = await contract.predictionCount()
    const totalResolvedNum = Number(totalResolved)
    const totalCorrectNum = Number(totalCorrect)

    return NextResponse.json({
      available: true,
      predictionCount: Number(predictionCount),
      totalResolved: totalResolvedNum,
      totalCorrect: totalCorrectNum,
      accuracyPercent: totalResolvedNum > 0
        ? parseFloat(((totalCorrectNum / totalResolvedNum) * 100).toFixed(1))
        : null,
      contractAddress: config.contractAddress,
      network: 'Polygon Amoy (testnet, chain id 80002)',
      explorerUrl: `https://amoy.polygonscan.com/address/${config.contractAddress}`,
    })
  } catch (error) {
    console.error('On-chain read error:', error)
    return NextResponse.json({ available: false, error: String(error) })
  }
}
