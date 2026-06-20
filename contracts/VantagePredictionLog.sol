// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VantagePredictionLog
/// @notice Logs alternative-data conviction predictions on-chain BEFORE
///         the underlying event (e.g. earnings) resolves, so a user can
///         later verify the prediction was made honestly and was not
///         altered or fabricated after the fact. This is the on-chain
///         verifiability layer for VANTAGE: every conviction call the
///         AI agent makes is hashed and timestamped here.
contract VantagePredictionLog {
    struct Prediction {
        address recorder;       // wallet that submitted the prediction
        string symbol;          // stock ticker, e.g. "NVDA"
        bytes32 signalHash;     // keccak256 hash of the 7 raw signal values
        string convictionLevel; // "high" | "moderate" | "low" | "insufficient_data"
        uint8 agreeingSignals;  // how many of the 7 signals agreed
        uint8 totalLiveSignals; // how many signals had live data
        uint256 timestamp;      // block timestamp at recording
        bool resolved;          // whether the outcome has since been logged
        bool outcomeCorrect;    // was the conviction direction correct
    }

    mapping(uint256 => Prediction) public predictions;
    uint256 public predictionCount;

    event PredictionLogged(
        uint256 indexed id,
        string symbol,
        bytes32 signalHash,
        string convictionLevel,
        uint256 timestamp
    );

    event PredictionResolved(
        uint256 indexed id,
        bool outcomeCorrect
    );

    /// @notice Record a new conviction prediction on-chain. Called the
    ///         moment the conviction agent produces its result, before
    ///         the earnings outcome is known — this is what makes the
    ///         timestamp meaningful as proof of prior commitment.
    function logPrediction(
        string calldata symbol,
        bytes32 signalHash,
        string calldata convictionLevel,
        uint8 agreeingSignals,
        uint8 totalLiveSignals
    ) external returns (uint256) {
        uint256 id = predictionCount;
        predictions[id] = Prediction({
            recorder: msg.sender,
            symbol: symbol,
            signalHash: signalHash,
            convictionLevel: convictionLevel,
            agreeingSignals: agreeingSignals,
            totalLiveSignals: totalLiveSignals,
            timestamp: block.timestamp,
            resolved: false,
            outcomeCorrect: false
        });
        predictionCount++;
        emit PredictionLogged(id, symbol, signalHash, convictionLevel, block.timestamp);
        return id;
    }

    /// @notice Once the real-world outcome is known (e.g. earnings result
    ///         published), resolve the prediction so its accuracy is
    ///         permanently auditable. Anyone can call this with the
    ///         correct outcome — in production this would be restricted
    ///         to an oracle or the original recorder.
    function resolvePrediction(uint256 id, bool outcomeCorrect) external {
        require(id < predictionCount, "Prediction does not exist");
        require(!predictions[id].resolved, "Already resolved");
        predictions[id].resolved = true;
        predictions[id].outcomeCorrect = outcomeCorrect;
        emit PredictionResolved(id, outcomeCorrect);
    }

    /// @notice Read a single prediction by id.
    function getPrediction(uint256 id) external view returns (Prediction memory) {
        require(id < predictionCount, "Prediction does not exist");
        return predictions[id];
    }

    /// @notice Aggregate accuracy across all resolved predictions —
    ///         the headline transparency metric: "X% of our high
    ///         conviction calls were correct, verifiable on-chain."
    function getAccuracyStats() external view returns (
        uint256 totalResolved,
        uint256 totalCorrect
    ) {
        for (uint256 i = 0; i < predictionCount; i++) {
            if (predictions[i].resolved) {
                totalResolved++;
                if (predictions[i].outcomeCorrect) {
                    totalCorrect++;
                }
            }
        }
        return (totalResolved, totalCorrect);
    }
}
