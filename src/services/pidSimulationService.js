/**
 * PID Optimizer Service
 * Provides functions for analyzing flight data and generating optimized PID settings
 * based on various optimization strategies
 */

import { findColumnName, getNumericColumnValue, getAxisValues } from '../utils/blackboxColumnMapper';
import { processInChunks } from '../utils/analyzerUtils';
import { optimizePidFromFlightData } from '../utils/pidOptimizationAlgorithms';
import * as math from 'mathjs';
import _ from 'lodash';

/**
 * Generate optimal PID settings based on flight data analysis
 * 
 * @param {Array} flightData - Flight log data array
 * @param {Array} dataHeaders - Headers from flight log
 * @param {Object} metadata - Metadata containing current settings
 * @param {String} mode - Optimization mode: 'standard' or 'cinematic' 
 * @returns {Promise<Object>} - Optimized PID settings and explanations
 */
export const generateOptimalPidSettings = async (flightData, dataHeaders, metadata, mode = 'standard') => {
    // Create result structure
    const result = {
        originalPid: {
            roll: { p: 0, i: 0, d: 0, f: 0 },
            pitch: { p: 0, i: 0, d: 0, f: 0 },
            yaw: { p: 0, i: 0, d: 0, f: 0 }
        },
        recommendedPid: {
            roll: { p: 0, i: 0, d: 0, f: 0 },
            pitch: { p: 0, i: 0, d: 0, f: 0 },
            yaw: { p: 0, i: 0, d: 0, f: 0 }
        },
        performanceChange: {
            responsiveness: { roll: 0, pitch: 0, yaw: 0 },
            stability: { roll: 0, pitch: 0, yaw: 0 },
            noiseRejection: { roll: 0, pitch: 0, yaw: 0 },
            overshoot: { roll: 0, pitch: 0, yaw: 0 },
            settlingTime: { roll: 0, pitch: 0, yaw: 0 }
        },
        explanations: {
            roll: { p: "", i: "", d: "", f: "" },
            pitch: { p: "", i: "", d: "", f: "" },
            yaw: { p: "", i: "", d: "", f: "" },
            general: []
        },
        confidentLevel: { roll: 0.7, pitch: 0.7, yaw: 0.6 }
    };

    try {
        // Extract current PID settings from metadata
        result.originalPid = extractCurrentPidSettings(metadata);
        
        // Initial copy of current settings as a starting point
        result.recommendedPid = JSON.parse(JSON.stringify(result.originalPid));
        
        // Analyze flight characteristics for each axis
        const flightCharacteristics = await analyzeFlightCharacteristics(flightData, dataHeaders, metadata);
        
        // Based on analysis, calculate optimal PID values
        await optimizePidValues(result, flightCharacteristics, mode);
        
        // Calculate expected performance changes
        calculatePerformanceChanges(result);
        
        // Evaluate confidence level
        evaluateConfidenceLevel(result, flightData, flightCharacteristics);
        
        return result;
    } catch (error) {
        console.error("Error optimizing PID settings:", error);
        
        // Return default values on error
        result.recommendedPid = result.originalPid;
        result.explanations.general.push(
            "An error occurred during PID optimization. Using original values as fallback."
        );
        
        return result;
    }
};

/**
 * Extract current PID settings from metadata
 * @param {Object} metadata - Metadata object from blackbox log
 * @returns {Object} - Current PID settings
 */
function extractCurrentPidSettings(metadata) {
    const pidSettings = {
        roll: { p: 40, i: 50, d: 25, f: 80 },  // Default values
        pitch: { p: 40, i: 50, d: 25, f: 80 },
        yaw: { p: 35, i: 80, d: 0, f: 60 }
    };
    
    try {
        // Parse Roll PID
        if (metadata.rollPID) {
            const parts = metadata.rollPID.split(',').map(p => parseInt(p.trim()));
            if (parts.length >= 3) {
                pidSettings.roll.p = parts[0] || pidSettings.roll.p;
                pidSettings.roll.i = parts[1] || pidSettings.roll.i;
                pidSettings.roll.d = parts[2] || pidSettings.roll.d;
                if (parts.length >= 4) {
                    pidSettings.roll.f = parts[3] || pidSettings.roll.f;
                }
            }
        }
        
        // Parse Pitch PID
        if (metadata.pitchPID) {
            const parts = metadata.pitchPID.split(',').map(p => parseInt(p.trim()));
            if (parts.length >= 3) {
                pidSettings.pitch.p = parts[0] || pidSettings.pitch.p;
                pidSettings.pitch.i = parts[1] || pidSettings.pitch.i;
                pidSettings.pitch.d = parts[2] || pidSettings.pitch.d;
                if (parts.length >= 4) {
                    pidSettings.pitch.f = parts[3] || pidSettings.pitch.f;
                }
            }
        }
        
        // Parse Yaw PID
        if (metadata.yawPID) {
            const parts = metadata.yawPID.split(',').map(p => parseInt(p.trim()));
            if (parts.length >= 3) {
                pidSettings.yaw.p = parts[0] || pidSettings.yaw.p;
                pidSettings.yaw.i = parts[1] || pidSettings.yaw.i;
                pidSettings.yaw.d = parts[2] || pidSettings.yaw.d;
                if (parts.length >= 4) {
                    pidSettings.yaw.f = parts[3] || pidSettings.yaw.f;
                }
            }
        }
    } catch (error) {
        console.error("Error parsing PID settings from metadata:", error);
    }
    
    return pidSettings;
}

/**
 * Analyze flight characteristics (responsiveness, stability, etc.)
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @param {Object} metadata - Metadata object
 * @returns {Object} - Flight characteristics analysis
 */
async function analyzeFlightCharacteristics(flightData, dataHeaders, metadata) {
    const result = {
        roll: {
            responseTime: 0,
            overshoot: 0,
            oscillations: 0,
            noiseLevel: 0,
            stickActivity: 0
        },
        pitch: {
            responseTime: 0,
            overshoot: 0,
            oscillations: 0,
            noiseLevel: 0,
            stickActivity: 0
        },
        yaw: {
            responseTime: 0,
            overshoot: 0,
            oscillations: 0,
            noiseLevel: 0,
            stickActivity: 0
        }
    };
    
    try {
        // For each axis, analyze transient response
        for (const axis of ['roll', 'pitch', 'yaw']) {
            const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
            
            // Find relevant columns
            const rcCommandCol = findColumnName(`rcCommand[${axisIndex}]`, dataHeaders);
            const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
            
            if (rcCommandCol && gyroCol) {
                // Find significant stick movements to analyze response
                const stickMovements = await findSignificantStickMovements(
                    flightData, rcCommandCol, gyroCol, dataHeaders
                );
                
                if (stickMovements.length > 0) {
                    // Calculate average metrics
                    result[axis].responseTime = calculateAverageResponseTime(stickMovements);
                    result[axis].overshoot = calculateAverageOvershoot(stickMovements);
                    result[axis].oscillations = detectOscillations(stickMovements);
                    
                    // Measure stick activity (how aggressive the flying is)
                    result[axis].stickActivity = measureStickActivity(flightData, rcCommandCol, dataHeaders);
                }
                
                // Analyze noise level in gyro signal
                result[axis].noiseLevel = await analyzeNoiseLevel(flightData, gyroCol, dataHeaders);
            }
        }
    } catch (error) {
        console.error("Error analyzing flight characteristics:", error);
    }
    
    return result;
}

/**
 * Find significant stick movements to analyze system response
 * @param {Array} flightData - Flight data array
 * @param {String} rcCommandCol - RC command column name
 * @param {String} gyroCol - Gyro column name
 * @param {Array} dataHeaders - Data headers array
 * @returns {Array} - List of significant stick movements and responses
 */
async function findSignificantStickMovements(flightData, rcCommandCol, gyroCol, dataHeaders) {
    const movements = [];
    const threshold = 30; // Minimum change to be considered significant
    const windowSize = 100; // Number of samples after change to analyze
    
    let prevRcCommand = null;
    
    // Process data in chunks for better performance
    await processInChunks(flightData, 1000, (chunk, chunkIndex, startIndex) => {
        for (let i = 0; i < chunk.length - windowSize; i++) {
            const rcCommand = getNumericColumnValue(chunk[i], rcCommandCol, dataHeaders);
            
            // Skip first data point
            if (prevRcCommand === null) {
                prevRcCommand = rcCommand;
                continue;
            }
            
            // Check if this is a significant change
            if (Math.abs(rcCommand - prevRcCommand) > threshold) {
                // Found significant change, collect response data
                const movement = {
                    startIndex: startIndex + i,
                    startRcCommand: prevRcCommand,
                    targetRcCommand: rcCommand,
                    change: rcCommand - prevRcCommand,
                    gyroResponse: []
                };
                
                // Collect gyro data for response analysis
                for (let j = 0; j < windowSize && (i + j) < chunk.length; j++) {
                    const gyroValue = getNumericColumnValue(chunk[i + j], gyroCol, dataHeaders);
                    movement.gyroResponse.push(gyroValue);
                }
                
                movements.push(movement);
            }
            
            prevRcCommand = rcCommand;
        }
    });
    
    return movements;
}

/**
 * Calculate average response time from stick movements
 * @param {Array} movements - Array of stick movements
 * @returns {Number} - Average response time
 */
function calculateAverageResponseTime(movements) {
    if (movements.length === 0) return 0;
    
    let totalResponseTime = 0;
    let validMovements = 0;
    
    for (const movement of movements) {
        // Find when gyro reaches 90% of target change
        const gyroStart = movement.gyroResponse[0];
        const expectedChange = movement.change;
        const targetValue = gyroStart + expectedChange * 0.9;
        const direction = Math.sign(expectedChange);
        
        for (let i = 0; i < movement.gyroResponse.length; i++) {
            const gyroValue = movement.gyroResponse[i];
            
            // Check if we've reached 90% of target
            if ((direction > 0 && gyroValue >= targetValue) || 
                (direction < 0 && gyroValue <= targetValue)) {
                totalResponseTime += i;
                validMovements++;
                break;
            }
        }
    }
    
    return validMovements > 0 ? totalResponseTime / validMovements : 0;
}

/**
 * Calculate average overshoot from stick movements
 * @param {Array} movements - Array of stick movements
 * @returns {Number} - Average overshoot percentage
 */
function calculateAverageOvershoot(movements) {
    if (movements.length === 0) return 0;
    
    let totalOvershoot = 0;
    let validMovements = 0;
    
    for (const movement of movements) {
        const gyroStart = movement.gyroResponse[0];
        const expectedChange = movement.change;
        const targetValue = gyroStart + expectedChange;
        const direction = Math.sign(expectedChange);
        
        // Find maximum overshoot
        let maxOvershoot = 0;
        
        for (const gyroValue of movement.gyroResponse) {
            const deviation = gyroValue - targetValue;
            
            // Only count overshoots in the direction of movement
            if (Math.sign(deviation) === direction) {
                maxOvershoot = Math.max(maxOvershoot, Math.abs(deviation));
            }
        }
        
        // Calculate overshoot as percentage
        if (Math.abs(expectedChange) > 0) {
            const overshootPercent = (maxOvershoot / Math.abs(expectedChange)) * 100;
            totalOvershoot += overshootPercent;
            validMovements++;
        }
    }
    
    return validMovements > 0 ? totalOvershoot / validMovements : 0;
}

/**
 * Detect oscillations in gyro response
 * @param {Array} movements - Array of stick movements
 * @returns {Number} - Oscillation score (0-1)
 */
function detectOscillations(movements) {
    if (movements.length === 0) return 0;
    
    let totalOscillationScore = 0;
    
    for (const movement of movements) {
        const gyroResponse = movement.gyroResponse;
        
        // Find all direction changes in the response (zero crossings of derivative)
        let directionChanges = 0;
        let prevDelta = 0;
        
        for (let i = 1; i < gyroResponse.length; i++) {
            const delta = gyroResponse[i] - gyroResponse[i-1];
            
            // Count direction changes
            if (prevDelta * delta < 0) {
                directionChanges++;
            }
            
            prevDelta = delta;
        }
        
        // Normalize oscillation score (higher = more oscillations)
        // Typically, a well-tuned system should have 1-2 direction changes (overshoot and return)
        // More than 3 changes indicates oscillation
        let oscillationScore = Math.max(0, (directionChanges - 2) / 5);
        oscillationScore = Math.min(1, oscillationScore); // Cap at 1
        
        totalOscillationScore += oscillationScore;
    }
    
    return movements.length > 0 ? totalOscillationScore / movements.length : 0;
}

/**
 * Measure stick activity (how aggressive the flying is)
 * @param {Array} flightData - Flight data array
 * @param {String} rcCommandCol - RC command column name
 * @param {Array} dataHeaders - Data headers array
 * @returns {Number} - Stick activity score (0-1)
 */
function measureStickActivity(flightData, rcCommandCol, dataHeaders) {
    if (flightData.length === 0) return 0;
    
    // Sample at most 5000 points for performance
    const sampleInterval = Math.max(1, Math.floor(flightData.length / 5000));
    const rcCommands = [];
    
    for (let i = 0; i < flightData.length; i += sampleInterval) {
        const rcCommand = getNumericColumnValue(flightData[i], rcCommandCol, dataHeaders);
        rcCommands.push(rcCommand);
    }
    
    // Calculate rate of change
    let totalChange = 0;
    
    for (let i = 1; i < rcCommands.length; i++) {
        totalChange += Math.abs(rcCommands[i] - rcCommands[i-1]);
    }
    
    const avgChange = totalChange / (rcCommands.length - 1);
    
    // Normalize to 0-1 (assuming typical range of 0-10 change per sample)
    return Math.min(1, avgChange / 10);
}

/**
 * Analyze noise level in gyro signal
 * @param {Array} flightData - Flight data array
 * @param {String} gyroCol - Gyro column name
 * @param {Array} dataHeaders - Data headers array
 * @returns {Number} - Noise level score (0-1)
 */
async function analyzeNoiseLevel(flightData, gyroCol, dataHeaders) {
    if (flightData.length === 0) return 0;
    
    // Sample at most 10000 points for performance
    const sampleInterval = Math.max(1, Math.floor(flightData.length / 10000));
    const gyroValues = [];
    
    for (let i = 0; i < flightData.length; i += sampleInterval) {
        const gyroValue = getNumericColumnValue(flightData[i], gyroCol, dataHeaders);
        gyroValues.push(gyroValue);
    }
    
    // Calculate short-term variance (high-frequency noise)
    let totalVariance = 0;
    const windowSize = 5;
    
    for (let i = 0; i < gyroValues.length - windowSize; i++) {
        const window = gyroValues.slice(i, i + windowSize);
        const mean = window.reduce((sum, val) => sum + val, 0) / windowSize;
        
        // Calculate variance in this window
        let variance = 0;
        for (const val of window) {
            variance += Math.pow(val - mean, 2);
        }
        variance /= windowSize;
        
        totalVariance += variance;
    }
    
    const avgVariance = totalVariance / (gyroValues.length - windowSize);
    
    // Normalize to 0-1 (assuming typical range of 0-500 for variance)
    return Math.min(1, avgVariance / 500);
}

/**
 * Optimize PID values based on flight characteristics
 * @param {Object} result - Result object to be modified
 * @param {Object} flightCharacteristics - Flight characteristics analysis
 * @param {String} mode - Optimization mode ('standard' or 'cinematic')
 */
async function optimizePidValues(result, flightCharacteristics, mode) {
    // Initialize a score matrix for different PID adjustments
    const scoreMatrix = initScoreMatrix();
    
    // P-term optimization
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Analyze response time
        const responseTime = flightCharacteristics[axis].responseTime;
        if (responseTime > 20) {
            // Slow response - increase P
            scoreMatrix[axis].p_up += 2;
            result.explanations[axis].p += "Increased P to improve response time. ";
        } else if (responseTime < 5) {
            // Fast response - might decrease P
            scoreMatrix[axis].p_down += 1;
            result.explanations[axis].p += "Slight reduction in P as response is already very fast. ";
        }
        
        // Analyze oscillations
        const oscillations = flightCharacteristics[axis].oscillations;
        if (oscillations > 0.5) {
            // High oscillations - decrease P
            scoreMatrix[axis].p_down += 3;
            result.explanations[axis].p += "Decreased P to reduce oscillations. ";
        }
        
        // Analyze stick activity
        const stickActivity = flightCharacteristics[axis].stickActivity;
        if (stickActivity > 0.7) {
            // Aggressive flying - may need higher P
            scoreMatrix[axis].p_up += 1;
            result.explanations[axis].p += "Slightly increased P for more responsive handling with aggressive inputs. ";
        }
    }
    
    // I-term optimization
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // I-term mostly affects steady-state performance
        const overshoot = flightCharacteristics[axis].overshoot;
        if (overshoot > 20) {
            // High overshoot - decrease I
            scoreMatrix[axis].i_down += 1;
            result.explanations[axis].i += "Decreased I to reduce overshoot. ";
        }
        
        // For Yaw, I-term is typically higher
        if (axis === 'yaw') {
            scoreMatrix[axis].i_up += 1;
            result.explanations[axis].i += "Increased I on Yaw for better directional control. ";
        }
    }
    
    // D-term optimization
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // D-term affects dampening
        const overshoot = flightCharacteristics[axis].overshoot;
        const oscillations = flightCharacteristics[axis].oscillations;
        const noiseLevel = flightCharacteristics[axis].noiseLevel;
        
        if (oscillations > 0.3 || overshoot > 15) {
            // Need more dampening - increase D
            scoreMatrix[axis].d_up += 2;
            result.explanations[axis].d += "Increased D to improve dampening and reduce overshoots. ";
        }
        
        if (noiseLevel > 0.6) {
            // High noise - decrease D
            scoreMatrix[axis].d_down += 2;
            result.explanations[axis].d += "Reduced D due to high noise levels. ";
        }
        
        // For Yaw, D is often lower or zero
        if (axis === 'yaw') {
            scoreMatrix[axis].d_down += 2;
            result.explanations[axis].d += "Minimized D on Yaw as it's less critical for this axis. ";
        }
    }
    
    // F-term (Feed Forward) optimization 
    for (const axis of ['roll', 'pitch', 'yaw']) {
        const stickActivity = flightCharacteristics[axis].stickActivity;
        const responseTime = flightCharacteristics[axis].responseTime;
        
        if (stickActivity > 0.6 && responseTime > 10) {
            // High stick activity and not fast enough response - increase F
            scoreMatrix[axis].f_up += 2;
            result.explanations[axis].f += "Increased Feed Forward for faster initial response to stick inputs. ";
        } else if (stickActivity < 0.3) {
            // Low stick activity - decrease F
            scoreMatrix[axis].f_down += 1;
            result.explanations[axis].f += "Reduced Feed Forward as flying style doesn't require quick stick response. ";
        }
    }
    
    // Apply cinematic mode adjustments if selected
    if (mode === 'cinematic') {
        applyCinematicModeAdjustments(scoreMatrix, result);
    }
    
    // Apply score matrix to calculate final values
    applyScoreMatrix(scoreMatrix, result);
    
    // Balance Roll and Pitch values for better overall control
    balanceRollAndPitch(result);
}

/**
 * Initialize the score matrix for PID adjustments
 * @returns {Object} - Score matrix
 */
function initScoreMatrix() {
    return {
        roll: { p_up: 0, p_down: 0, i_up: 0, i_down: 0, d_up: 0, d_down: 0, f_up: 0, f_down: 0 },
        pitch: { p_up: 0, p_down: 0, i_up: 0, i_down: 0, d_up: 0, d_down: 0, f_up: 0, f_down: 0 },
        yaw: { p_up: 0, p_down: 0, i_up: 0, i_down: 0, d_up: 0, d_down: 0, f_up: 0, f_down: 0 }
    };
}

/**
 * Apply cinematic mode adjustments to the score matrix
 * @param {Object} scoreMatrix - Score matrix to adjust
 * @param {Object} result - Result object for explanations
 */
function applyCinematicModeAdjustments(scoreMatrix, result) {
    // Add cinematic mode explanation
    result.explanations.general.push(
        "Cinematic mode activated: settings optimized for smooth video, reduced vibrations, and motor heat management."
    );
    
    // Adjust P terms for smoother motion
    for (const axis of ['roll', 'pitch', 'yaw']) {
        scoreMatrix[axis].p_down += 2;
        result.explanations[axis].p += "[Cinematic Mode] Reduced P for smoother motion. ";
        
        // Increase I for better position holding
        scoreMatrix[axis].i_up += 1;
        result.explanations[axis].i += "[Cinematic Mode] Increased I for stable position holding. ";
        
        // Reduce Feed Forward for smoother starts/stops
        scoreMatrix[axis].f_down += 2;
        result.explanations[axis].f += "[Cinematic Mode] Reduced Feed Forward for smoother control transitions. ";
    }
    
    // Special settings for Yaw in cinematic mode
    scoreMatrix.yaw.d_down += 2;
    result.explanations.yaw.d += "[Cinematic Mode] Minimized D on Yaw for smooth rotations. ";
}

/**
 * Apply the score matrix to calculate final PID values
 * @param {Object} scoreMatrix - Score matrix with adjustment scores
 * @param {Object} result - Result object to be modified
 */
function applyScoreMatrix(scoreMatrix, result) {
    // Define safe limits for PID values
    const safeLimits = {
        roll: {
            p: { min: 20, max: 120 },
            i: { min: 40, max: 200 },
            d: { min: 15, max: 80 },
            f: { min: 0, max: 250 }
        },
        pitch: {
            p: { min: 20, max: 120 },
            i: { min: 40, max: 200 },
            d: { min: 15, max: 80 },
            f: { min: 0, max: 250 }
        },
        yaw: {
            p: { min: 10, max: 100 },
            i: { min: 40, max: 200 },
            d: { min: 0, max: 50 },
            f: { min: 0, max: 200 }
        }
    };
    
    // For each axis and term, apply score and calculate new value
    for (const axis of ['roll', 'pitch', 'yaw']) {
        for (const term of ['p', 'i', 'd', 'f']) {
            const upScore = scoreMatrix[axis][`${term}_up`];
            const downScore = scoreMatrix[axis][`${term}_down`];
            const netScore = upScore - downScore;
            
            // Calculate adjustment factor
            const adjFactor = calculateAdjustmentFactor(netScore);
            
            // Apply adjustment
            const originalValue = result.originalPid[axis][term];
            let newValue = Math.round(originalValue * adjFactor);
            
            // Ensure value is within safe limits
            newValue = Math.max(safeLimits[axis][term].min, 
                              Math.min(safeLimits[axis][term].max, newValue));
            
            // Set new value
            result.recommendedPid[axis][term] = newValue;
        }
    }
}

/**
 * Calculate adjustment factor based on score
 * @param {Number} score - Net adjustment score
 * @returns {Number} - Adjustment factor
 */
function calculateAdjustmentFactor(score) {
    if (score <= -4) return 0.8;     // Strong decrease
    if (score <= -2) return 0.9;     // Medium decrease
    if (score < 0) return 0.95;      // Slight decrease
    if (score === 0) return 1.0;     // No change
    if (score < 2) return 1.05;      // Slight increase
    if (score < 4) return 1.1;       // Medium increase
    return 1.15;                     // Strong increase
}

/**
 * Balance Roll and Pitch values for better control
 * @param {Object} result - Result object to be modified
 */
function balanceRollAndPitch(result) {
    // Check P values
    const pDiff = Math.abs(result.recommendedPid.roll.p - result.recommendedPid.pitch.p);
    if (pDiff > 5) {
        // Balance P values
        const avgP = Math.round((result.recommendedPid.roll.p + result.recommendedPid.pitch.p) / 2);
        result.recommendedPid.roll.p = avgP;
        result.recommendedPid.pitch.p = avgP;
        
        // Add explanation
        result.explanations.general.push(
            "Roll and Pitch P values balanced for more predictable handling."
        );
    }
    
    // Check D values
    const dDiff = Math.abs(result.recommendedPid.roll.d - result.recommendedPid.pitch.d);
    if (dDiff > 3) {
        // Balance D values
        const avgD = Math.round((result.recommendedPid.roll.d + result.recommendedPid.pitch.d) / 2);
        result.recommendedPid.roll.d = avgD;
        result.recommendedPid.pitch.d = avgD;
        
        // Add explanation
        result.explanations.general.push(
            "Roll and Pitch D values balanced for more consistent dampening."
        );
    }
}

/**
 * Calculate expected performance changes
 * @param {Object} result - Result object to be modified
 */
function calculatePerformanceChanges(result) {
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // P term affects responsiveness and stability
        const pChange = result.recommendedPid[axis].p / result.originalPid[axis].p;
        result.performanceChange.responsiveness[axis] = (pChange - 1) * 0.5;
        result.performanceChange.stability[axis] = (pChange > 1) ? (1 - pChange) * 0.3 : (1 - pChange) * 0.2;
        
        // I term affects settling time
        const iChange = result.recommendedPid[axis].i / result.originalPid[axis].i;
        result.performanceChange.settlingTime[axis] = (iChange > 1) ? (iChange - 1) * 0.4 : (1 - iChange) * -0.3;
        
        // D term affects overshoot and noise
        const dChange = result.recommendedPid[axis].d / result.originalPid[axis].d;
        result.performanceChange.overshoot[axis] = (dChange > 1) ? (1 - dChange) * -0.5 : (1 - dChange) * 0.4;
        result.performanceChange.noiseRejection[axis] = (dChange < 1) ? (1 - dChange) * 0.6 : (dChange - 1) * -0.5;
    }
}

/**
 * Evaluate confidence level in recommendations
 * @param {Object} result - Result object to be modified
 * @param {Array} flightData - Flight data array
 * @param {Object} flightCharacteristics - Flight characteristics analysis
 */
function evaluateConfidenceLevel(result, flightData, flightCharacteristics) {
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Start with base confidence
        let confidence = 0.7;
        
        // More data = higher confidence
        if (flightData.length > 10000) {
            confidence += 0.1;
        } else if (flightData.length < 1000) {
            confidence -= 0.2;
        }
        
        // Higher stick activity = better insights
        if (flightCharacteristics[axis].stickActivity > 0.5) {
            confidence += 0.1;
        } else if (flightCharacteristics[axis].stickActivity < 0.2) {
            confidence -= 0.1;
        }
        
        // Limit to 0-1 range
        result.confidentLevel[axis] = Math.min(1, Math.max(0, confidence));
    }
}

/**
 * Generate Betaflight CLI commands from recommended PID values
 * @param {Object} recommendedPid - Object with recommended PID values
 * @returns {Array} - List of CLI commands
 */
export function generateBetaflightCommands(recommendedPid) {
    const commands = [
        '# PID settings',
        `set p_roll = ${recommendedPid.roll.p}`,
        `set i_roll = ${recommendedPid.roll.i}`,
        `set d_roll = ${recommendedPid.roll.d}`,
        `set f_roll = ${recommendedPid.roll.f}`,
        
        `set p_pitch = ${recommendedPid.pitch.p}`,
        `set i_pitch = ${recommendedPid.pitch.i}`,
        `set d_pitch = ${recommendedPid.pitch.d}`,
        `set f_pitch = ${recommendedPid.pitch.f}`,
        
        `set p_yaw = ${recommendedPid.yaw.p}`,
        `set i_yaw = ${recommendedPid.yaw.i}`,
        `set d_yaw = ${recommendedPid.yaw.d}`,
        `set f_yaw = ${recommendedPid.yaw.f}`,
        
        '# Save settings and reboot',
        'save'
    ];
    
    return commands;
}