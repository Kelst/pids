import FFT from 'fft.js';import * as math from 'mathjs';
import _ from 'lodash';
import { 
  findColumnName, 
  getNumericColumnValue, 
  getAxisValues, 
  getAxisColumns 
} from '../utils/blackboxColumnMapper';

import {
  performFFTAnalysis,
  calculateTHD,
  findCommonFrequencies,
  analyzeOscillationPropagation,
  calculateCouplingStrength,
  calculatePhaseRelation,
  determineNoiseWidth
} from '../utils/fftAnalysis';
import { 
    processInChunks, 
    applyHannWindow, 
    calculateNormalizedCrossCorrelation,
    calculateRecommendedGyroFrequency,
    calculateDtermFilterEffectiveness,
    calculateRecommendedDtermFrequency
  } from '../utils/analyzerUtils';
/**
 * Analyzes error metrics for each axis
 * 
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @returns {Promise<Object>} - Error metrics and PID contributions by axis
 */
export const analyzeErrorMetrics = async (flightData, dataHeaders) => {
  // Find required columns for each axis
  const axisColumns = {
    roll: {
      setpoint: findColumnName('setpoint[0]', dataHeaders),
      actual: findColumnName('gyroADC[0]', dataHeaders),
      error: findColumnName('axisError[0]', dataHeaders),
      p: findColumnName('axisP[0]', dataHeaders),
      i: findColumnName('axisI[0]', dataHeaders),
      d: findColumnName('axisD[0]', dataHeaders),
      f: findColumnName('axisF[0]', dataHeaders),
      sum: findColumnName('axisSum[0]', dataHeaders)
    },
    pitch: {
      setpoint: findColumnName('setpoint[1]', dataHeaders),
      actual: findColumnName('gyroADC[1]', dataHeaders),
      error: findColumnName('axisError[1]', dataHeaders),
      p: findColumnName('axisP[1]', dataHeaders),
      i: findColumnName('axisI[1]', dataHeaders),
      d: findColumnName('axisD[1]', dataHeaders),
      f: findColumnName('axisF[1]', dataHeaders),
      sum: findColumnName('axisSum[1]', dataHeaders)
    },
    yaw: {
      setpoint: findColumnName('setpoint[2]', dataHeaders),
      actual: findColumnName('gyroADC[2]', dataHeaders),
      error: findColumnName('axisError[2]', dataHeaders),
      p: findColumnName('axisP[2]', dataHeaders),
      i: findColumnName('axisI[2]', dataHeaders),
      d: findColumnName('axisD[2]', dataHeaders),
      f: findColumnName('axisF[2]', dataHeaders),
      sum: findColumnName('axisSum[2]', dataHeaders)
    }
  };

  // Log found columns for diagnostics
  console.log("Found columns for error metrics analysis:", axisColumns);

  // Calculate RMS error and other metrics
  const errorMetrics = {};
  const pidContributions = {};
  
  // Chunk size for data processing
  const chunkSize = 1000;
  
  // Process each axis
  for (const [axis, columns] of Object.entries(axisColumns)) {
    if (columns.actual) {
      try {
        // Metrics to accumulate
        let sumError = 0;
        let sumSquaredError = 0;
        let maxError = 0;
        let validErrorCount = 0;
        
        // PID components
        let sumP = 0;
        let sumI = 0;
        let sumD = 0;
        let sumF = 0;
        let sumTotal = 0;
        
        // Use direct error values if available
        const useDirectError = columns.error && columns.error in dataHeaders;
        
        // Process data in chunks
        await processInChunks(flightData, chunkSize, (chunk) => {
          for (const row of chunk) {
            let error;
            
            if (useDirectError) {
              // Use getNumericColumnValue instead of direct access
              error = getNumericColumnValue(row, `axisError[${axis === 'roll' ? 0 : axis === 'pitch' ? 1 : 2}]`, dataHeaders);
            } else {
              // Calculate error as difference between setpoint and actual
              const setpoint = getNumericColumnValue(row, columns.setpoint, dataHeaders);
              const actual = getNumericColumnValue(row, columns.actual, dataHeaders);
              error = setpoint - actual;
            }
            
            if (!isNaN(error)) {
              const absError = Math.abs(error);
              sumError += absError;
              sumSquaredError += error * error;
              maxError = Math.max(maxError, absError);
              validErrorCount++;
            }
            
            // Collect PID component information, if available
            if (columns.p && columns.i && columns.d) {
              const p = getNumericColumnValue(row, columns.p, dataHeaders);
              const i = getNumericColumnValue(row, columns.i, dataHeaders);
              const d = getNumericColumnValue(row, columns.d, dataHeaders);
              const f = columns.f ? getNumericColumnValue(row, columns.f, dataHeaders) : 0;
              const sum = columns.sum ? getNumericColumnValue(row, columns.sum, dataHeaders) : (p + i + d + f);
              
              if (!isNaN(p) && !isNaN(i) && !isNaN(d)) {
                sumP += Math.abs(p);
                sumI += Math.abs(i);
                sumD += Math.abs(d);
                sumF += Math.abs(f);
                sumTotal += Math.abs(sum);
              }
            }
          }
        });
        
        if (validErrorCount > 0) {
          // Root Mean Squared Error
          const meanSquaredError = sumSquaredError / validErrorCount;
          const rmsError = Math.sqrt(meanSquaredError);
          
          // Mean Error
          const meanError = sumError / validErrorCount;
          
          // Standard Deviation
          const variance = meanSquaredError - (meanError * meanError);
          const stdDeviation = Math.sqrt(Math.max(0, variance)); // Ensure variance is non-negative
          
          errorMetrics[axis] = {
            rmsError,
            maxError,
            meanError,
            stdDeviation
          };
          
          // Calculate relative contribution of each PID component
          if (sumTotal > 0) {
            pidContributions[axis] = {
              p: sumP / sumTotal,
              i: sumI / sumTotal,
              d: sumD / sumTotal,
              f: sumF / sumTotal
            };
          } else {
            pidContributions[axis] = {
              p: 0,
              i: 0,
              d: 0,
              f: 0
            };
          }
        } else {
          errorMetrics[axis] = {
            rmsError: 0,
            maxError: 0,
            meanError: 0,
            stdDeviation: 0
          };
          pidContributions[axis] = {
            p: 0,
            i: 0,
            d: 0,
            f: 0
          };
        }
      } catch (e) {
        console.error(`Error analyzing ${axis} axis:`, e);
        errorMetrics[axis] = {
          rmsError: 0,
          maxError: 0,
          meanError: 0,
          stdDeviation: 0
        };
        pidContributions[axis] = {
          p: 0,
          i: 0,
          d: 0,
          f: 0
        };
      }
    }
  }

  return { errorMetrics, pidContributions };
};

/**
 * Analyzes step response metrics for each axis
 * 
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @param {Object} metadata - Metadata object with looptime
 * @returns {Promise<Object>} - Step response metrics and response history
 */
export const analyzeStepResponse = async (flightData, dataHeaders, metadata) => {
  // Initialize metrics structure
  const stepResponseMetrics = {
    roll: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 },
    pitch: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 },
    yaw: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 }
  };

  // Response history for visualization and analysis
  const responseHistory = {
    roll: [],
    pitch: [],
    yaw: []
  };

  // Chunk size for data processing
  const chunkSize = 500;
  const sampleTimeUs = parseFloat(metadata.looptime) || 1000; // Time between samples in microseconds
  const sampleTimeMs = sampleTimeUs / 1000; // Convert to milliseconds

  // Analyze each axis
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
    
    // Use column finder function
    const rcCommandCol = findColumnName(`rcCommand[${axisIndex}]`, dataHeaders);
    const setpointCol = findColumnName(`setpoint[${axisIndex}]`, dataHeaders);
    const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
    const pTermCol = findColumnName(`axisP[${axisIndex}]`, dataHeaders);
    const dTermCol = findColumnName(`axisD[${axisIndex}]`, dataHeaders);
    const errorCol = findColumnName(`axisError[${axisIndex}]`, dataHeaders);
    
    // Check if required columns exist
    const columnsExist = setpointCol && gyroCol && (rcCommandCol || errorCol);
    
    if (columnsExist) {
      try {
        // Find significant command changes
        const stepChanges = [];
        const threshold = 30; // Threshold for detecting step change
        
        // Buffer to track previous values
        let prevSetpoint = null;
        
        // Process data to detect sharp changes
        await processInChunks(flightData, chunkSize, (chunk, chunkIndex, startIndex) => {
          for (let i = 0; i < chunk.length; i++) {
            const row = chunk[i];
            const globalIndex = startIndex + i;
            
            // Use getNumericColumnValue to get values
            const currentTime = getNumericColumnValue(row, 'time', dataHeaders) || (globalIndex * sampleTimeMs * 1000);
            const currentSetpoint = getNumericColumnValue(row, setpointCol, dataHeaders);
            const currentGyro = getNumericColumnValue(row, gyroCol, dataHeaders);
            
            // If not the first record and there's a significant setpoint change
            if (prevSetpoint !== null && Math.abs(currentSetpoint - prevSetpoint) > threshold) {
              // Found a step change
              const startIndex = globalIndex;
              const startTime = currentTime;
              const targetValue = currentSetpoint;
              const startGyro = currentGyro;
              
              // Collect system response (up to 200 points after change for better damping analysis)
              const response = [];
              
              for (let j = 0; j < 200 && (globalIndex + j) < flightData.length; j++) {
                if (globalIndex + j >= flightData.length) break;
                
                // If still within current chunk
                if (i + j < chunk.length) {
                  const responseRow = chunk[i + j];
                  const time = getNumericColumnValue(responseRow, 'time', dataHeaders);
                  const gyroValue = getNumericColumnValue(responseRow, gyroCol, dataHeaders);
                  const dTerm = dTermCol ? getNumericColumnValue(responseRow, dTermCol, dataHeaders) : null;
                  response.push({ 
                    time: (time - startTime) / 1000, // time in ms
                    value: gyroValue,
                    dTerm
                  });
                } 
                // If beyond current chunk - save position for further analysis
                else {
                  stepChanges.push({ 
                    startIndex, 
                    targetValue, 
                    startGyro,
                    startTime,
                    response,
                    complete: false
                  });
                  break;
                }
              }
              
              // If collected enough points within chunk, mark as complete
              if (response.length >= 50) {
                stepChanges.push({ 
                  startIndex, 
                  targetValue, 
                  startGyro,
                  startTime,
                  response,
                  complete: true
                });
              }
            }
            
            // Update previous value
            prevSetpoint = currentSetpoint;
          }
        });
        
        // Analyze found changes
        if (stepChanges.length > 0) {
          // Find best step for analysis - one with largest change
          let bestStep = stepChanges[0];
          let bestMagnitude = Math.abs(bestStep.targetValue - bestStep.startGyro);
          
          for (let i = 1; i < stepChanges.length; i++) {
            const step = stepChanges[i];
            if (step.complete) {
              const magnitude = Math.abs(step.targetValue - step.startGyro);
              if (magnitude > bestMagnitude) {
                bestMagnitude = magnitude;
                bestStep = step;
              }
            }
          }
          
          const { targetValue, startGyro, response } = bestStep;
          
          // Save found changes for visualization
          responseHistory[axis] = response;
          
          // Determine actual range of change (from start gyro to target value)
          const actualRange = targetValue - startGyro;
          
          if (Math.abs(actualRange) > 5) { // Ensure change is significant
            // ----- IMPROVED DAMPING ANALYSIS -----
            
            // Find peaks and valleys for damping analysis
            const peaks = [];
            const valleys = [];
            
            // Skip first 5ms to avoid noise in initial phase
            let startAnalysisIdx = 0;
            while (startAnalysisIdx < response.length && response[startAnalysisIdx].time < 5) {
              startAnalysisIdx++;
            }
            
            // Find peaks and valleys
            for (let i = startAnalysisIdx + 1; i < response.length - 1; i++) {
              const prev = response[i-1].value;
              const curr = response[i].value;
              const next = response[i+1].value;
              
              // Detect local maxima (peaks)
              if (curr > prev && curr > next) {
                peaks.push({
                  index: i,
                  time: response[i].time,
                  value: curr
                });
              }
              
              // Detect local minima (valleys)
              if (curr < prev && curr < next) {
                valleys.push({
                  index: i,
                  time: response[i].time,
                  value: curr
                });
              }
            }
            
            // Calculate logarithmic decrement of damping if there are enough peaks
            let dampingRatio = 0;
            let oscillationFreq = 0;
            let decayRate = 0;
            
            if (peaks.length >= 2) {
              // Calculate amplitude ratios of successive peaks
              const amplitudeRatios = [];
              for (let i = 0; i < peaks.length - 1; i++) {
                const currentPeakAmp = Math.abs(peaks[i].value - targetValue);
                const nextPeakAmp = Math.abs(peaks[i+1].value - targetValue);
                
                if (nextPeakAmp > 0) {
                  amplitudeRatios.push(currentPeakAmp / nextPeakAmp);
                }
              }
              
              // Calculate average amplitude ratio
              if (amplitudeRatios.length > 0) {
                const avgAmplitudeRatio = amplitudeRatios.reduce((sum, ratio) => sum + ratio, 0) / amplitudeRatios.length;
                
                // Logarithmic decrement of damping
                const logDecrement = Math.log(avgAmplitudeRatio);
                
                // Damping ratio
                dampingRatio = logDecrement / (2 * Math.PI * Math.sqrt(1 + (logDecrement / (2 * Math.PI)) ** 2));
                
                // Decay rate (damping speed)
                decayRate = logDecrement * 100; // in percentage per period
              }
              
              // Calculate oscillation frequency
              if (peaks.length >= 2) {
                const periods = [];
                for (let i = 0; i < peaks.length - 1; i++) {
                  periods.push(peaks[i+1].time - peaks[i].time);
                }
                
                const avgPeriod = periods.reduce((sum, period) => sum + period, 0) / periods.length;
                oscillationFreq = avgPeriod > 0 ? 1000 / avgPeriod : 0; // Frequency in Hz
              }
            }
            
            // Standard step response metrics
            // Settling value (95% of target)
            const settlingThreshold = 0.05 * Math.abs(actualRange);
            
            // Settling time
            let settlingTime = 0;
            for (let i = 0; i < response.length; i++) {
              if (Math.abs(response[i].value - targetValue) <= settlingThreshold) {
                // Check if value remains stable
                let stable = true;
                for (let j = i; j < Math.min(i + 10, response.length); j++) {
                  if (Math.abs(response[j].value - targetValue) > settlingThreshold) {
                    stable = false;
                    break;
                  }
                }
                
                if (stable) {
                  settlingTime = response[i].time;
                  break;
                }
              }
            }
            
            // Overshoot
            let maxValue = startGyro;
            let maxIndex = 0;
            
            for (let i = 0; i < response.length; i++) {
              if (Math.abs(response[i].value - startGyro) > Math.abs(maxValue - startGyro)) {
                maxValue = response[i].value;
                maxIndex = i;
              }
            }
            
            const overshoot = actualRange !== 0 ? 
              ((maxValue - targetValue) / actualRange) * 100 : 0;
            
            // Rise time (10% - 90%)
            const riseStartThreshold = startGyro + 0.1 * actualRange;
            const riseEndThreshold = startGyro + 0.9 * actualRange;
            
            let riseStartTime = 0;
            let riseEndTime = 0;
            let riseStartFound = false;
            let riseEndFound = false;
            
            for (let i = 0; i < response.length; i++) {
              // For positive range
              if (actualRange > 0) {
                if (!riseStartFound && response[i].value >= riseStartThreshold) {
                  riseStartTime = response[i].time;
                  riseStartFound = true;
                }
                if (!riseEndFound && response[i].value >= riseEndThreshold) {
                  riseEndTime = response[i].time;
                  riseEndFound = true;
                  break;
                }
              } 
              // For negative range
              else {
                if (!riseStartFound && response[i].value <= riseStartThreshold) {
                  riseStartTime = response[i].time;
                  riseStartFound = true;
                }
                if (!riseEndFound && response[i].value <= riseEndThreshold) {
                  riseEndTime = response[i].time;
                  riseEndFound = true;
                  break;
                }
              }
            }
            
            const riseTime = riseEndFound && riseStartFound ? 
              riseEndTime - riseStartTime : settlingTime * 0.6;
            
            // Delay
            const delay = riseStartFound ? riseStartTime : 0;
            
            // Update metrics with additional damping information
            stepResponseMetrics[axis] = {
              settlingTime,
              overshoot,
              riseTime,
              delay,
              dampingRatio,
              oscillationFreq,
              decayRate,
              peaks,
              valleys
            };
          }
        }
      } catch (err) {
        console.error(`Error analyzing step response for ${axis} axis:`, err);
      }
    }
  }

  return { stepResponseMetrics, responseHistory };
};

/**
 * Analyzes frequency characteristics using FFT
 * 
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @param {Object} metadata - Metadata object with looptime
 * @returns {Promise<Object>} - Frequency analysis results
 */
export const analyzeFrequencyCharacteristics = async (flightData, dataHeaders, metadata) => {
  const frequencyAnalysis = {
    roll: { 
      dominantFrequencies: [], 
      noiseLevel: 0,
      filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
    },
    pitch: { 
      dominantFrequencies: [], 
      noiseLevel: 0,
      filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
    },
    yaw: { 
      dominantFrequencies: [], 
      noiseLevel: 0,
      filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
    }
  };

  // Approximate sampling rate (in Hz)
  const looptimeUs = parseFloat(metadata.looptime) || 312; // microseconds
  const sampleRate = Math.round(1000000 / looptimeUs); // Hz
  
  console.log(`Using sample rate: ${sampleRate} Hz`);

  // Analyze each axis
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
    
    // Use column finder function
    const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
    const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
    
    // Diagnostic log
    console.log(`Columns for frequency analysis of ${axis} axis:`, {
      gyro: gyroCol,
      gyroUnfilt: gyroUnfiltCol
    });
    
    // Check column existence
    const hasFiltered = gyroCol !== null;
    const hasUnfiltered = gyroUnfiltCol !== null;
    
    if (hasFiltered) {
      try {
        // For FFT, use power of 2 length
        const fftSize = 1024;
        
        // Get gyro data for FFT (filtered)
        const gyroData = new Array(fftSize).fill(0);
        // Also collect unfiltered data if available
        const gyroUnfiltData = hasUnfiltered ? new Array(fftSize).fill(0) : null;
        
        // Collect data in chunks
        let dataCollected = 0;
        const chunkSize = 2000;
        
        // Size of data to collect
        const collectSize = Math.min(flightData.length, fftSize * 2);
        
        // Process data in chunks and collect values for FFT
        await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
          for (const row of chunk) {
            if (dataCollected < fftSize) {
              // Use getNumericColumnValue instead of direct access
              const value = getNumericColumnValue(row, gyroCol, dataHeaders);
              if (!isNaN(value)) {
                gyroData[dataCollected] = value;
                
                // If unfiltered data available, also store it
                if (hasUnfiltered) {
                  const unfiltValue = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
                  gyroUnfiltData[dataCollected] = unfiltValue;
                }
                
                dataCollected++;
              }
            }
          }
        });
        
        // Apply Hann window to reduce spectral leakage
        const windowedGyroData = applyHannWindow(gyroData);
        
        // Setup FFT for filtered data
        const fft = new FFT(fftSize);
        const out = new Array(fftSize * 2); // Complex output array
        
        // Copy data to complex array (real part)
        const complexData = new Array(fftSize * 2).fill(0);
        for (let i = 0; i < fftSize; i++) {
          complexData[i * 2] = windowedGyroData[i]; // Real part
          complexData[i * 2 + 1] = 0;               // Imaginary part
        }
        
        // Run FFT
        fft.transform(out, complexData);
        
        // Calculate spectrum (amplitude) and store in array
        // Use only half of spectrum (up to Nyquist frequency)
        const spectrum = new Array(Math.floor(fftSize / 2));
        for (let i = 0; i < fftSize / 2; i++) {
          const real = out[i * 2];
          const imag = out[i * 2 + 1];
          const frequency = i * (sampleRate / fftSize); // Frequency in Hz
          const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2); // Normalize
          spectrum[i] = { frequency, magnitude };
        }
        
        // Find dominant frequencies (local maxima)
        const dominantFrequencies = [];
        for (let i = 1; i < spectrum.length - 1; i++) {
          if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
              spectrum[i].magnitude > spectrum[i+1].magnitude &&
              spectrum[i].magnitude > 0.01) { // Threshold for filtering noise
            dominantFrequencies.push({
              frequency: spectrum[i].frequency,
              magnitude: spectrum[i].magnitude
            });
          }
          
          // Limit number of dominant frequencies
          if (dominantFrequencies.length >= 25) break;
        }
        
        // Sort by magnitude and take top-5
        dominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
        const top5Frequencies = dominantFrequencies.slice(0, 5);
        
        // Estimate overall noise level (use loop to reduce stack load)
        let totalMagnitude = 0;
        for (let i = 0; i < spectrum.length; i++) {
          totalMagnitude += spectrum[i].magnitude;
        }
        const noiseLevel = totalMagnitude / spectrum.length;
        
        // Structure for analysis results
        const analysisResult = {
          dominantFrequencies: top5Frequencies,
          noiseLevel,
          filteredVsUnfiltered: { ratio: 1, noiseDiff: 0 } // Default values
        };
        
        // If unfiltered data available, calculate difference between filtered and unfiltered
        if (hasUnfiltered && gyroUnfiltData) {
          // Apply same Hann window to unfiltered data
          const windowedUnfiltData = applyHannWindow(gyroUnfiltData);
          
          // Setup FFT for unfiltered data
          const unfiltFft = new FFT(fftSize);
          const unfiltOut = new Array(fftSize * 2);
          
          // Copy data to complex array
          const unfiltComplexData = new Array(fftSize * 2).fill(0);
          for (let i = 0; i < fftSize; i++) {
            unfiltComplexData[i * 2] = windowedUnfiltData[i]; // Real part
            unfiltComplexData[i * 2 + 1] = 0;                // Imaginary part
          }
          
          // Run FFT for unfiltered data
          unfiltFft.transform(unfiltOut, unfiltComplexData);
          
          // Calculate unfiltered data spectrum
          const unfiltSpectrum = new Array(Math.floor(fftSize / 2));
          for (let i = 0; i < fftSize / 2; i++) {
            const real = unfiltOut[i * 2];
            const imag = unfiltOut[i * 2 + 1];
            const frequency = i * (sampleRate / fftSize);
            const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
            unfiltSpectrum[i] = { frequency, magnitude };
          }
          
          // Calculate overall noise level for unfiltered data
          let unfiltTotalMagnitude = 0;
          for (let i = 0; i < unfiltSpectrum.length; i++) {
            unfiltTotalMagnitude += unfiltSpectrum[i].magnitude;
          }
          const unfiltNoiseLevel = unfiltTotalMagnitude / unfiltSpectrum.length;
          
          // Calculate ratio and noise difference
          const noiseRatio = unfiltNoiseLevel > 0 ? noiseLevel / unfiltNoiseLevel : 1;
          const noiseDiff = unfiltNoiseLevel - noiseLevel;
          
          analysisResult.filteredVsUnfiltered = {
            ratio: noiseRatio,
            noiseDiff: noiseDiff,
            unfiltNoiseLevel
          };
          
          // Find dominant frequencies in unfiltered data
          const unfiltDominantFreqs = [];
          for (let i = 1; i < unfiltSpectrum.length - 1; i++) {
            if (unfiltSpectrum[i].magnitude > unfiltSpectrum[i-1].magnitude && 
                unfiltSpectrum[i].magnitude > unfiltSpectrum[i+1].magnitude &&
                unfiltSpectrum[i].magnitude > 0.01) {
              unfiltDominantFreqs.push({
                frequency: unfiltSpectrum[i].frequency,
                magnitude: unfiltSpectrum[i].magnitude
              });
            }
            
            if (unfiltDominantFreqs.length >= 10) break;
          }
          
          // Sort by magnitude and take top-5
          unfiltDominantFreqs.sort((a, b) => b.magnitude - a.magnitude);
          analysisResult.unfilteredDominantFrequencies = unfiltDominantFreqs.slice(0, 5);
        }
        
        frequencyAnalysis[axis] = analysisResult;
      } catch (err) {
        console.error(`FFT error for ${axis} axis:`, err);
        frequencyAnalysis[axis] = {
          dominantFrequencies: [],
          noiseLevel: 0,
          filteredVsUnfiltered: { ratio: 1, noiseDiff: 0 }
        };
      }
    }
  }

  return { frequencyAnalysis };
};

/**
 * Performs harmonic distortion analysis
 * 
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @param {Object} metadata - Metadata object with looptime
 * @returns {Promise<Object>} - Harmonic analysis results
 */
export const analyzeHarmonicDistortion = async (flightData, dataHeaders, metadata) => {
  const harmonicAnalysis = {
    roll: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
    pitch: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
    yaw: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
    // Add section for axis interaction analysis
    axisInteractions: {
      roll_pitch: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
      roll_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
      pitch_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 }
    },
    // Common harmonics - when same frequency appears on multiple axes
    commonHarmonics: []
  };

  // Approximate sampling rate
  const looptimeUs = parseFloat(metadata.looptime) || 312;
  const sampleRate = Math.round(1000000 / looptimeUs);

  // Collect gyro data for all axes
  const gyroData = {
    roll: [],
    pitch: [],
    yaw: []
  };
  
  // FFT size for harmonic analysis
  const fftSize = 1024;
  const chunkSize = 2000;
  const collectSize = Math.min(flightData.length, fftSize * 2);
  
  // Collect data for all axes
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
    const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
    
    if (gyroCol) {
      const axisData = [];
      
      await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
        for (const row of chunk) {
          const value = getNumericColumnValue(row, gyroCol, dataHeaders);
          axisData.push(value);
          if (axisData.length >= fftSize) break;
        }
      });
      
      gyroData[axis] = axisData.slice(0, fftSize);
    }
  }
  
  // Analyze harmonics for each axis separately (basic analysis)
  const axisSpectrums = {};
  const axisDominantFreqs = {};
  
  for (const axis of ['roll', 'pitch', 'yaw']) {
    if (gyroData[axis].length > 0) {
      // Hann window to reduce spectral leakage
      const windowedData = applyHannWindow(gyroData[axis]);
      
      // Perform FFT analysis
      const { spectrum, dominantFrequencies } = performFFTAnalysis(
        windowedData, sampleRate, fftSize
      );
      
      axisSpectrums[axis] = spectrum;
      axisDominantFreqs[axis] = dominantFrequencies;
      
      // Basic THD analysis, as in original function
      const { thd, stabilityScore, oscillationDetected } = calculateTHD(spectrum, dominantFrequencies);
      
      harmonicAnalysis[axis] = {
        thd,
        stabilityScore,
        oscillationDetected,
        dominantFrequencies
      };
    }
  }
  
  // ----- AXIS INTERACTION ANALYSIS -----
  
  // 1. Cross-correlation analysis between axes in time domain
  const axesPairs = [
    ['roll', 'pitch'],
    ['roll', 'yaw'],
    ['pitch', 'yaw']
  ];
  
  for (const [axis1, axis2] of axesPairs) {
    const key = `${axis1}_${axis2}`;
    
    if (gyroData[axis1].length > 0 && gyroData[axis2].length > 0) {
      // Calculate normalized cross-correlation
      const correlation = calculateNormalizedCrossCorrelation(
        gyroData[axis1], gyroData[axis2]
      );
      
      // Calculate phase relationships between axes
      const phaseRelation = calculatePhaseRelation(
        axisSpectrums[axis1], axisSpectrums[axis2], axisDominantFreqs[axis1], axisDominantFreqs[axis2]
      );
      
      // Estimate coupling strength between axes (mechanical coupling)
      const couplingStrength = calculateCouplingStrength(
        axisDominantFreqs[axis1], axisDominantFreqs[axis2], correlation, phaseRelation
      );
      
      harmonicAnalysis.axisInteractions[key] = {
        correlation,
        phaseRelation,
        couplingStrength
      };
    }
  }
  
  // 2. Find common harmonics that appear on multiple axes
  const commonFreqs = findCommonFrequencies(
    axisDominantFreqs.roll, 
    axisDominantFreqs.pitch, 
    axisDominantFreqs.yaw
  );
  
  harmonicAnalysis.commonHarmonics = commonFreqs;
  
  // 3. Analyze oscillation propagation between axes
  if (commonFreqs.length > 0) {
    const propagationAnalysis = analyzeOscillationPropagation(
      gyroData, commonFreqs, sampleRate
    );
    
    harmonicAnalysis.oscillationPropagation = propagationAnalysis;
  }
  
  return { harmonicAnalysis };
};

/**
 * Analyzes filter performance and noise characteristics
 * 
 * @param {Array} flightData - Flight data array
 * @param {Array} dataHeaders - Data headers array
 * @param {Object} metadata - Metadata object with filter settings
 * @returns {Promise<Object>} - Filter analysis results
 */
export const analyzeFilters = async (flightData, dataHeaders, metadata) => {
  const filterAnalysis = {
    gyroFilters: {
      effectiveness: 0,
      phaseDelay: 0,
      recommendedFrequency: 0
    },
    dtermFilters: {
      effectiveness: 0,
      phaseDelay: 0,
      recommendedFrequency: 0
    },
    notchFilters: {
      effectiveness: 0,
      identifiedNoiseFrequencies: [],
      classifiedNoises: [], // Add classified noises
      recommendedQFactors: {} // Add recommended Q-factors
    },
    rpmFilters: {
      effectiveness: 0,
      motorNoiseFrequencies: [],
      detectedHarmonics: []
    }
  };

  // Get filter settings from metadata
  const gyroLowpassHz = parseFloat(metadata['gyro_lowpass_hz']) || 0;
  const dtermLowpassHz = parseFloat(metadata['dterm_lowpass_hz']) || 0;
  const dynNotchMinHz = parseFloat(metadata['dyn_notch_min_hz']) || 0;
  const dynNotchMaxHz = parseFloat(metadata['dyn_notch_max_hz']) || 0;
  const gyroRpmNotchHarmonics = parseFloat(metadata['gyro_rpm_notch_harmonics']) || 0;
  const motorPoles = parseFloat(metadata['motor_poles']) || 14;
  const dshotBidir = parseInt(metadata['dshot_bidir']) || 0;
  
  console.log(`Filter metadata: gyro_lowpass_hz=${gyroLowpassHz}, dterm_lowpass_hz=${dtermLowpassHz}`);
  console.log(`Dynamic notch filters: min=${dynNotchMinHz}Hz, max=${dynNotchMaxHz}Hz`);
  console.log(`RPM filter: harmonics=${gyroRpmNotchHarmonics}, motor_poles=${motorPoles}, bidir=${dshotBidir}`);
  
  // Approximate sampling rate (in Hz)
  const looptimeUs = parseFloat(metadata.looptime) || 312; // microseconds
  const sampleRate = Math.round(1000000 / looptimeUs); // Hz
  console.log(`Sample rate: ${sampleRate} Hz`);
  
  try {
    // Gyroscope data analysis
    // Check if both filtered and unfiltered data exist
    const hasUnfilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      return findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders) !== null;
    });
    
    const hasFilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      return findColumnName(`gyroADC[${axisIndex}]`, dataHeaders) !== null;
    });
    
    // Diagnostic log
    console.log(`Gyroscope data availability: filtered=${hasFilteredGyro}, unfiltered=${hasUnfilteredGyro}`);
    
    if (hasUnfilteredGyro && hasFilteredGyro) {
      const gyroDataRaw = [];
      const gyroDataFiltered = [];
      
      // Chunk size for processing
      const chunkSize = 500;
      // Limit data amount for analysis (2048 points max)
      const maxSamples = 2048;
      const collectSize = Math.min(flightData.length, maxSamples);
      
      // Collect data in chunks
      await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
        for (const row of chunk) {
          const rawData = {
            x: getNumericColumnValue(row, 'gyroUnfilt[0]', dataHeaders),
            y: getNumericColumnValue(row, 'gyroUnfilt[1]', dataHeaders),
            z: getNumericColumnValue(row, 'gyroUnfilt[2]', dataHeaders)
          };
          
          const filteredData = {
            x: getNumericColumnValue(row, 'gyroADC[0]', dataHeaders),
            y: getNumericColumnValue(row, 'gyroADC[1]', dataHeaders),
            z: getNumericColumnValue(row, 'gyroADC[2]', dataHeaders)
          };
          
          gyroDataRaw.push(rawData);
          gyroDataFiltered.push(filteredData);
        }
      });
      
      // Estimate gyro filter effectiveness
      if (gyroDataRaw.length > 0 && gyroDataFiltered.length > 0) {
        // Calculate difference between unfiltered and filtered data
        const noiseReduction = {
          x: 0,
          y: 0,
          z: 0
        };
        
        for (let i = 0; i < Math.min(gyroDataRaw.length, gyroDataFiltered.length); i++) {
          noiseReduction.x += Math.abs(gyroDataRaw[i].x - gyroDataFiltered[i].x);
          noiseReduction.y += Math.abs(gyroDataRaw[i].y - gyroDataFiltered[i].y);
          noiseReduction.z += Math.abs(gyroDataRaw[i].z - gyroDataFiltered[i].z);
        }
        
        // Normalize
        const sampleCount = Math.min(gyroDataRaw.length, gyroDataFiltered.length);
        noiseReduction.x /= sampleCount;
        noiseReduction.y /= sampleCount;
        noiseReduction.z /= sampleCount;
        
        // Overall effectiveness as average across axes
        const gyroFilterEffectiveness = (noiseReduction.x + noiseReduction.y + noiseReduction.z) / 3;
        
        // Phase delay estimation
        let phaseDelay = 0;
        if (gyroLowpassHz > 0) {
          // Rough estimation of delay based on cutoff frequency
          phaseDelay = 1000 / (2 * Math.PI * gyroLowpassHz);
        }
        
        // Recommended frequency based on noise analysis
        const recommendedFrequency = calculateRecommendedGyroFrequency(gyroDataRaw);
        
        filterAnalysis.gyroFilters = {
          effectiveness: gyroFilterEffectiveness,
          phaseDelay,
          recommendedFrequency,
          noiseReduction: {
            x: noiseReduction.x,
            y: noiseReduction.y,
            z: noiseReduction.z
          }
        };
      }
      
      // Motor noise analysis using eRPM data
      const hasERPM = dataHeaders.some(h => findColumnName('eRPM[0]', dataHeaders) !== null);
      const hasMotor = dataHeaders.some(h => findColumnName('motor[0]', dataHeaders) !== null);
      
      if (hasERPM && hasMotor) {
        // Collect motor and RPM data
        const motorData = [];
        const eRpmData = [];
        
        for (let motorIdx = 0; motorIdx < 4; motorIdx++) {
          const motorCol = findColumnName(`motor[${motorIdx}]`, dataHeaders);
          const eRpmCol = findColumnName(`eRPM[${motorIdx}]`, dataHeaders);
          
          if (motorCol && eRpmCol) {
            const motorValues = [];
            const eRpmValues = [];
            
            // Collect data in chunks
            await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
              for (const row of chunk) {
                const motorValue = getNumericColumnValue(row, motorCol, dataHeaders);
                const eRpmValue = getNumericColumnValue(row, eRpmCol, dataHeaders);
                
                motorValues.push(motorValue);
                eRpmValues.push(eRpmValue);
              }
            });
            
            motorData.push(motorValues);
            eRpmData.push(eRpmValues);
          }
        }
        
        // Motor noise analysis considering eRPM
        if (motorData.length > 0 && eRpmData.length > 0) {
          const motorNoiseFrequencies = [];
          const rpmHarmonics = [];
          
          // Analyze each motor
          for (let motorIndex = 0; motorIndex < motorData.length; motorIndex++) {
            try {
              const motorValues = motorData[motorIndex];
              const eRpmValues = eRpmData[motorIndex];
              
              // Find average motor RPM
              const avgERPM = eRpmValues.reduce((sum, rpm) => sum + rpm, 0) / eRpmValues.length;
              
              // Rotation frequency in Hz (eRPM / 60)
              const rotationFreqHz = avgERPM / 60;
              
              // Base motor noise frequency (depends on pole count)
              // For brushless motors with N poles = (eRPM * N / 60) / 2
              const baseNoiseFreq = (avgERPM * motorPoles) / (60 * 2);
              
              // Motor noise harmonics
              const harmonics = [];
              for (let harmonic = 1; harmonic <= gyroRpmNotchHarmonics; harmonic++) {
                harmonics.push({
                  harmonic,
                  frequency: baseNoiseFreq * harmonic,
                  motorIndex,
                  averageERPM: avgERPM
                });
              }
              
              // Add found harmonics
              rpmHarmonics.push(...harmonics);
              
              // Analyze motor spectrum for noise peaks
              const fftSize = 512;
              if (motorValues.length >= fftSize) {
                // Apply Hann window
                const windowedData = applyHannWindow(motorValues.slice(0, fftSize));
                
                // Prepare for FFT
                const fft = new FFT(fftSize);
                const out = new Array(fftSize * 2);
                const complexData = new Array(fftSize * 2).fill(0);
                
                for (let i = 0; i < fftSize; i++) {
                  complexData[i * 2] = windowedData[i]; // Real part
                  complexData[i * 2 + 1] = 0;          // Imaginary part
                }
                
                // Run FFT
                fft.transform(out, complexData);
                
                // Calculate spectrum
                const frequencies = [];
                for (let i = 1; i < fftSize / 2; i++) {
                  const real = out[i * 2];
                  const imag = out[i * 2 + 1];
                  const freq = i * (sampleRate / fftSize);
                  const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                  frequencies.push({ frequency: freq, magnitude });
                }
                
                // Find local maxima
                const peaks = [];
                for (let i = 1; i < frequencies.length - 1; i++) {
                  if (frequencies[i].magnitude > frequencies[i-1].magnitude && 
                      frequencies[i].magnitude > frequencies[i+1].magnitude &&
                      frequencies[i].magnitude > 0.01) {
                    peaks.push(frequencies[i]);
                  }
                }
                
                // Sort by magnitude and take top-3
                peaks.sort((a, b) => b.magnitude - a.magnitude);
                const topFrequencies = peaks.slice(0, 3);
                
                motorNoiseFrequencies.push({
                  motorIndex,
                  frequencies: topFrequencies,
                  averageERPM: avgERPM
                });
              }
            } catch (err) {
              console.error(`Error analyzing motor noise for motor ${motorIndex}:`, err);
            }
          }
          
          // Calculate RPM filter effectiveness by comparing noise at harmonic frequencies
          const rpmFilterEffectiveness = 0.5; // Placeholder value
          
          filterAnalysis.rpmFilters = {
            effectiveness: rpmFilterEffectiveness,
            motorNoiseFrequencies,
            detectedHarmonics: rpmHarmonics
          };
        }
      }
      
      // Notch filter analysis
      if (dynNotchMinHz > 0 && dynNotchMaxHz > 0) {
        const identifiedNoiseFrequencies = [];
        
        // Analyze gyro spectrum to detect noise that needs filtering
        for (const axis of ['roll', 'pitch', 'yaw']) {
          const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
          const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
          
          if (gyroUnfiltCol) {
            try {
              const fftSize = 1024;
              const gyroData = [];
              
              // Collect data in chunks
              await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                for (const row of chunk) {
                  const value = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
                  if (!isNaN(value)) {
                    gyroData.push(value);
                    if (gyroData.length >= fftSize) break;
                  }
                }
              });
              
              if (gyroData.length > 0) {
                // Apply Hann window
                const windowedData = applyHannWindow(gyroData.slice(0, Math.min(fftSize, gyroData.length)));
                
                // Pad with zeros if needed
                for (let i = gyroData.length; i < fftSize; i++) {
                  windowedData[i] = 0;
                }
                
                // Prepare for FFT
                const fft = new FFT(fftSize);
                const out = new Array(fftSize * 2);
                const complexData = new Array(fftSize * 2).fill(0);
                
                for (let i = 0; i < fftSize; i++) {
                  complexData[i * 2] = windowedData[i]; // Real part
                  complexData[i * 2 + 1] = 0;          // Imaginary part
                }
                
                // Run FFT
                fft.transform(out, complexData);
                
                // Calculate spectrum and look for noise peaks in notch filter range
                const freqSpectrum = [];
                for (let i = 0; i < fftSize / 2; i++) {
                  const freq = i * (sampleRate / fftSize);
                  const real = out[i * 2];
                  const imag = out[i * 2 + 1];
                  const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                  freqSpectrum.push({ frequency: freq, magnitude });
                }
                
                for (let i = 1; i < fftSize / 2 - 1; i++) {
                  const freq = i * (sampleRate / fftSize);
                  
                  if (freq >= dynNotchMinHz && freq <= dynNotchMaxHz) {
                    const real = out[i * 2];
                    const imag = out[i * 2 + 1];
                    const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                    
                    const prevReal = out[(i-1) * 2];
                    const prevImag = out[(i-1) * 2 + 1];
                    const prevMagnitude = Math.sqrt(prevReal * prevReal + prevImag * prevImag) / (fftSize/2);
                    
                    const nextReal = out[(i+1) * 2];
                    const nextImag = out[(i+1) * 2 + 1];
                    const nextMagnitude = Math.sqrt(nextReal * nextReal + nextImag * nextImag) / (fftSize/2);
                    
                    // Check if it's a local maximum with significant amplitude
                    if (magnitude > 0.01 && magnitude > prevMagnitude && magnitude > nextMagnitude) {
                      
                      // Check if this frequency was already added
                      const existingFreq = identifiedNoiseFrequencies.find(f => Math.abs(f.frequency - freq) < 5);
                      
                      if (!existingFreq) {
                        // Add this noise peak to the list
                        const noiseData = {
                          frequency: freq,
                          magnitude,
                          axis,
                          freqSpectrum // Add full spectrum for noise width analysis
                        };
                        
                        identifiedNoiseFrequencies.push(noiseData);
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`Error analyzing notch filters for ${axis} axis:`, err);
            }
          }
        }
        
        // Sort by amplitude
        identifiedNoiseFrequencies.sort((a, b) => b.magnitude - a.magnitude);
        
        // Estimate notch filter effectiveness
        let notchEffectiveness = 0;
        if (identifiedNoiseFrequencies.length > 0) {
          notchEffectiveness = 0.6; // Placeholder value
        }
        
        // Classify noises based on their characteristics
        const classifiedNoises = identifiedNoiseFrequencies.map(noise => {
          try {
            // Noise width - find half-width at 70.7% of maximum (-3dB)
            const noiseWidth = determineNoiseWidth(noise);
            
            // Frequency stability - estimate how stable the frequency is over time
            const frequencyStability = 0.7; // Placeholder value
            
            // Noise class and recommended Q-factor
            let noiseClass;
            let recommendedQ;
            
            if (noiseWidth < 5 && frequencyStability > 0.8) {
              // Narrowband stable noise (typically from motors)
              noiseClass = 'narrowband_stable';
              recommendedQ = 500; // High Q-factor for narrow notch
            } else if (noiseWidth < 10 && frequencyStability > 0.6) {
              // Medium stable noise
              noiseClass = 'mediumband_stable';
              recommendedQ = 300; // Medium Q-factor
            } else if (noiseWidth > 20 || frequencyStability < 0.4) {
              // Wideband or unstable noise
              noiseClass = 'wideband_or_unstable';
              recommendedQ = 120; // Low Q-factor for wide notch
            } else {
              // Standard case
              noiseClass = 'standard';
              recommendedQ = 250;
            }
            
            return {
              ...noise,
              noiseWidth,
              frequencyStability,
              noiseClass,
              recommendedQ
            };
          } catch (error) {
            console.error("Error classifying noise:", error);
            return {
              ...noise,
              noiseWidth: 10,
              frequencyStability: 0.5,
              noiseClass: 'standard',
              recommendedQ: 250
            };
          }
        });
        
        // Update analysis with classified noises
        filterAnalysis.notchFilters = {
          effectiveness: notchEffectiveness,
          identifiedNoiseFrequencies: identifiedNoiseFrequencies.slice(0, 5),
          classifiedNoises: classifiedNoises
        };
        
        // Calculate average recommended Q-factor
        if (classifiedNoises.length > 0) {
          const avgRecommendedQ = classifiedNoises.reduce((sum, noise) => sum + noise.recommendedQ, 0) / 
                                classifiedNoises.length;
          
          filterAnalysis.notchFilters.recommendedQFactors = {
            average: Math.round(avgRecommendedQ),
            perNoiseType: {
              narrowband_stable: 500,
              mediumband_stable: 300,
              standard: 250,
              wideband_or_unstable: 120
            }
          };
        }
      }
      
      // D-term filter analysis
      // Simplified analysis due to limited direct access to D-term signals
      const dTermCol = findColumnName('axisD[0]', dataHeaders) || 
                      findColumnName('axisD[1]', dataHeaders) || 
                      findColumnName('axisD[2]', dataHeaders);
      
      if (dtermLowpassHz > 0) {
        const phaseDelay = 1000 / (2 * Math.PI * dtermLowpassHz);
        
        // Calculate D-term filter effectiveness
        const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
        
        // Recommended D-term filter frequency
        const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw);
        
        filterAnalysis.dtermFilters = {
          effectiveness,
          phaseDelay,
          recommendedFrequency
        };
      }
    } else {
      console.warn("Missing gyroUnfilt or gyroADC data for filter analysis");
    }
  } catch (error) {
    console.error("Error analyzing filters:", error);
  }
  
  return { filterAnalysis };
};

/**
 * Generates recommendations based on analysis results
 * 
 * @param {Object} analysisResults - Results from all analysis functions
 * @param {Object} metadata - Metadata with current settings
 * @returns {Object} - Recommendations for PID, filters, and CLI commands
 */
export const generateRecommendations = (analysisResults, metadata) => {
  if (!analysisResults) return null;
  
  const recommendations = {
    pid: {
      roll: { p: 0, i: 0, d: 0, f: 0 },
      pitch: { p: 0, i: 0, d: 0, f: 0 },
      yaw: { p: 0, i: 0, d: 0, f: 0 }
    },
    filters: {
      gyro_lowpass_hz: 0,
      dterm_lowpass_hz: 0,
      dyn_notch_count: 0,
      dyn_notch_q: 0,
      dyn_notch_min_hz: 0,
      dyn_notch_max_hz: 0,
      // Add ability for different Q-factors
      dynamic_notch_q_factors: []
    },
    betaflightCommands: [],
    // Add detailed explanations for recommendations
    explanations: {
      pid: {},
      filters: {},
      interactions: {}
    }
  };
  
  try {
    // Get current PID settings from metadata
    const currentPid = {
      roll: { p: 0, i: 0, d: 0, f: 0 },
      pitch: { p: 0, i: 0, d: 0, f: 0 },
      yaw: { p: 0, i: 0, d: 0, f: 0 }
    };
    
    // Parse current PIDs from metadata
    if (metadata.rollPID) {
      const parts = metadata.rollPID.split(',').map(p => parseInt(p.trim()));
      if (parts.length >= 3) {
        currentPid.roll.p = parts[0];
        currentPid.roll.i = parts[1];
        currentPid.roll.d = parts[2];
        if (parts.length >= 4) {
          currentPid.roll.f = parts[3];
        }
      }
    }
    
    if (metadata.pitchPID) {
      const parts = metadata.pitchPID.split(',').map(p => parseInt(p.trim()));
      if (parts.length >= 3) {
        currentPid.pitch.p = parts[0];
        currentPid.pitch.i = parts[1];
        currentPid.pitch.d = parts[2];
        if (parts.length >= 4) {
          currentPid.pitch.f = parts[3];
        }
      }
    }
    
    if (metadata.yawPID) {
      const parts = metadata.yawPID.split(',').map(p => parseInt(p.trim()));
      if (parts.length >= 3) {
        currentPid.yaw.p = parts[0];
        currentPid.yaw.i = parts[1];
        currentPid.yaw.d = parts[2];
        if (parts.length >= 4) {
          currentPid.yaw.f = parts[3];
        }
      }
    }
    
    // Get current filter settings
    const currentFilters = {
      gyro_lowpass_hz: parseInt(metadata.gyro_lowpass_hz) || 0,
      dterm_lowpass_hz: parseInt(metadata.dterm_lowpass_hz) || 0,
      dyn_notch_count: parseInt(metadata.dyn_notch_count) || 0,
      dyn_notch_q: parseInt(metadata.dyn_notch_q) || 0,
      dyn_notch_min_hz: parseInt(metadata.dyn_notch_min_hz) || 0,
      dyn_notch_max_hz: parseInt(metadata.dyn_notch_max_hz) || 0
    };
    
    // 1. Basic error analysis and recommendations for PID
    if (analysisResults.errorMetrics) {
      for (const axis of ['roll', 'pitch', 'yaw']) {
        if (analysisResults.errorMetrics[axis]) {
          const {rmsError, maxError, meanError} = analysisResults.errorMetrics[axis];
          
          // P-term recommendations
          if (rmsError > 20) {
            // If large error, increase P
            recommendations.pid[axis].p = Math.round(currentPid[axis].p * 1.1);
          } else if (rmsError < 5) {
            // If small error, decrease P
            recommendations.pid[axis].p = Math.round(currentPid[axis].p * 0.95);
          } else {
            // Leave unchanged
            recommendations.pid[axis].p = currentPid[axis].p;
          }
          
          // Add explanation
          recommendations.explanations.pid[`${axis}_p`] = 
            `P term ${recommendations.pid[axis].p > currentPid[axis].p ? 'increased' : 'decreased'} based on ` +
            `RMS error (${rmsError.toFixed(2)}).`;
          
          // I-term recommendations
          if (meanError > 10) {
            // If large mean error, increase I
            recommendations.pid[axis].i = Math.round(currentPid[axis].i * 1.15);
          } else {
            // Leave unchanged
            recommendations.pid[axis].i = currentPid[axis].i;
          }
          
          // Add explanation
          if (meanError > 10) {
            recommendations.explanations.pid[`${axis}_i`] = 
              `I term increased due to high mean error (${meanError.toFixed(2)}).`;
          }
          
          // F-term recommendations
          recommendations.pid[axis].f = currentPid[axis].f;
        }
      }
    }
    
    // 2. D-term recommendations based on damping analysis
    if (analysisResults.stepResponseMetrics) {
      for (const axis of ['roll', 'pitch', 'yaw']) {
        if (analysisResults.stepResponseMetrics[axis]) {
          const stepResponse = analysisResults.stepResponseMetrics[axis];
          const { overshoot, settlingTime, riseTime, dampingRatio, oscillationFreq, decayRate } = stepResponse;
          
          // Optimal damping ratio for quadcopter - around 0.6-0.7
          const optimalDampingRatio = 0.65;
          
          // D-term adjustment factors
          let dCorrection = 1.0; // Default no change
          
          // 1. Correction based on damping ratio
          if (dampingRatio > 0) {
            if (dampingRatio < optimalDampingRatio - 0.15) {
              // Insufficient damping: increase D
              dCorrection *= 1.15 + (0.05 * ((optimalDampingRatio - dampingRatio) / 0.15));
              
              recommendations.explanations.pid[`${axis}_d_damping`] = 
                `D term increased due to insufficient damping (${dampingRatio.toFixed(2)}).`;
            } else if (dampingRatio > optimalDampingRatio + 0.15) {
              // Excessive damping: decrease D
              dCorrection *= 0.9 - (0.05 * ((dampingRatio - optimalDampingRatio) / 0.15));
              
              recommendations.explanations.pid[`${axis}_d_damping`] = 
                `D term decreased due to excessive damping (${dampingRatio.toFixed(2)}).`;
            }
          }
          
          // 2. Correction based on amplitude decay rate
          if (decayRate > 0) {
            const optimalDecayRate = 50; // Ideal decay rate value (%)
            
            if (decayRate < optimalDecayRate * 0.7) {
              // Too slow damping: increase D
              dCorrection *= 1.1;
              
              recommendations.explanations.pid[`${axis}_d_decay`] = 
                `D term increased due to slow oscillation decay (${decayRate.toFixed(1)}%/period).`;
            } else if (decayRate > optimalDecayRate * 1.5) {
              // Too fast damping: decrease D
              dCorrection *= 0.95;
              
              recommendations.explanations.pid[`${axis}_d_decay`] = 
                `D term decreased due to too fast decay (${decayRate.toFixed(1)}%/period).`;
            }
          }
          
          // 3. Correction based on overshoot (with lower weight)
          if (overshoot > 25) {
            dCorrection *= 1.05;
            
            recommendations.explanations.pid[`${axis}_d_overshoot`] = 
              `D term increased due to high overshoot (${overshoot.toFixed(1)}%).`;
          } else if (overshoot < 5) {
            dCorrection *= 0.95;
            
            recommendations.explanations.pid[`${axis}_d_overshoot`] = 
              `D term decreased due to low overshoot (${overshoot.toFixed(1)}%).`;
          }
          
          // 4. Correction based on oscillation frequency
          if (oscillationFreq > 0) {
            if (oscillationFreq > 30) {
              // High frequency oscillations may need lower D
              dCorrection *= 0.95;
              
              recommendations.explanations.pid[`${axis}_d_freq`] = 
                `D term decreased due to high frequency oscillations (${oscillationFreq.toFixed(1)} Hz).`;
            }
          }
          
          // Limit maximum D change to avoid drastic shifts
          dCorrection = Math.max(0.8, Math.min(dCorrection, 1.3));
          
          // Apply correction with rounding
          recommendations.pid[axis].d = Math.round(currentPid[axis].d * dCorrection);
          
          // General explanation
          recommendations.explanations.pid[`${axis}_d_summary`] = 
            `D term ${recommendations.pid[axis].d > currentPid[axis].d ? 'increased' : 'decreased'} to ${recommendations.pid[axis].d} ` +
            `(was ${currentPid[axis].d}) based on damping analysis: ` +
            `damping ratio=${dampingRatio ? dampingRatio.toFixed(2) : 'n/a'}, ` +
            `decay rate=${decayRate ? decayRate.toFixed(1) : 'n/a'}%/period, ` +
            `frequency=${oscillationFreq ? oscillationFreq.toFixed(1) : 'n/a'} Hz`;
        }
      }
    }
    
    // 3. Harmonic analysis and further PID corrections
    if (analysisResults.harmonicAnalysis) {
      for (const axis of ['roll', 'pitch', 'yaw']) {
        if (analysisResults.harmonicAnalysis[axis]) {
          const {thd, oscillationDetected} = analysisResults.harmonicAnalysis[axis];
          
          // Correction when unwanted oscillations detected
          if (oscillationDetected) {
            // Decrease P and D when oscillations present
            const currentP = recommendations.pid[axis].p;
            const currentD = recommendations.pid[axis].d;
            
            recommendations.pid[axis].p = Math.round(currentP * 0.92);
            recommendations.pid[axis].d = Math.round(currentD * 0.92);
            
            recommendations.explanations.pid[`${axis}_oscillation`] = 
              `P and D terms reduced due to detected unwanted oscillations (THD=${thd.toFixed(1)}%).`;
          }
          
          // Additional correction based on THD
          if (thd > 40) {
            // High THD indicates nonlinearity, decrease P
            const currentP = recommendations.pid[axis].p;
            recommendations.pid[axis].p = Math.round(currentP * 0.95);
            
            recommendations.explanations.pid[`${axis}_thd`] = 
              `P term reduced due to high harmonic distortion (THD=${thd.toFixed(1)}%).`;
          }
        }
      }
      
      // Axis interaction analysis
      if (analysisResults.harmonicAnalysis.axisInteractions) {
        const interactions = analysisResults.harmonicAnalysis.axisInteractions;
        
        // Find strong couplings between axes
        const strongCouplings = [];
        for (const [axes, data] of Object.entries(interactions)) {
          if (data.couplingStrength > 0.6) {
            strongCouplings.push({
              axes: axes.split('_'),
              strength: data.couplingStrength,
              correlation: data.correlation,
              phaseRelation: data.phaseRelation
            });
          }
        }
        
        // Analyze oscillation propagation
        if (analysisResults.harmonicAnalysis.oscillationPropagation) {
          const propagation = analysisResults.harmonicAnalysis.oscillationPropagation;
          
          // Find main oscillation sources
          const mainSources = {};
          
          for (const prop of propagation) {
            if (prop.sourceAxis) {
              mainSources[prop.sourceAxis] = (mainSources[prop.sourceAxis] || 0) + 1;
            }
          }
          
          // Formulate recommendations based on oscillation sources
          const sourcesEntries = Object.entries(mainSources);
          if (sourcesEntries.length > 0) {
            // Sort by count of instances where axis is source
            sourcesEntries.sort((a, b) => b[1] - a[1]);
            const primarySource = sourcesEntries[0][0];
            
            // Add explanation about main oscillation source
            recommendations.explanations.interactions.primary_source = 
              `Primary oscillation source: ${primarySource}. ` +
              `Focus on tuning PIDs for this axis is recommended.`;
            
            // Adjust PIDs for primary oscillation source
            if (recommendations.pid[primarySource]) {
              // Cautiously decrease P and D to reduce oscillation propagation
              const currentP = recommendations.pid[primarySource].p;
              const currentD = recommendations.pid[primarySource].d;
              
              recommendations.pid[primarySource].p = Math.round(currentP * 0.95);
              recommendations.pid[primarySource].d = Math.round(currentD * 0.97);
              
              recommendations.explanations.interactions[`${primarySource}_source_correction`] = 
                `Reduced P and D for ${primarySource} axis as it is the primary oscillation source.`;
            }
          }
        }
        
        // Formulate recommendations based on strong couplings
        if (strongCouplings.length > 0) {
          recommendations.explanations.interactions.strong_couplings = 
            `Strong axis couplings detected: ` +
            strongCouplings.map(c => 
              `${c.axes[0]}-${c.axes[1]} (strength: ${(c.strength * 100).toFixed(0)}%)`
            ).join(', ');
          
          // If strong coupling between roll and pitch, adjust settings
          const rollPitchCoupling = strongCouplings.find(
            c => (c.axes.includes('roll') && c.axes.includes('pitch'))
          );
          
          if (rollPitchCoupling && rollPitchCoupling.strength > 0.7) {
            // Adjust parameters for both axes for better balance
            recommendations.explanations.interactions.roll_pitch = 
              `Strong coupling between roll and pitch (${(rollPitchCoupling.strength * 100).toFixed(0)}%). ` +
              `PID balancing for these axes is recommended.`;
            
            // Balance D-term between axes to reduce shared oscillations
            const avgD = Math.round(
              (recommendations.pid.roll.d + recommendations.pid.pitch.d) / 2
            );
            
            recommendations.pid.roll.d = avgD;
            recommendations.pid.pitch.d = avgD;
            
            recommendations.explanations.interactions.roll_pitch_d_balance = 
              `D terms for roll and pitch balanced to ${avgD} to reduce mutual oscillations.`;
          }
        }
      }
    }
    
    // 4. Filter recommendations
    if (analysisResults.filterAnalysis) {
      // Gyro filters
      if (analysisResults.filterAnalysis.gyroFilters) {
        const {recommendedFrequency, effectiveness} = analysisResults.filterAnalysis.gyroFilters;
        
        // Recommend new gyro filter frequency
        if (recommendedFrequency > 0) {
          recommendations.filters.gyro_lowpass_hz = recommendedFrequency;
          
          recommendations.explanations.filters.gyro_lowpass = 
            `Gyro filter frequency recommended ${recommendedFrequency} Hz ` +
            `(was ${currentFilters.gyro_lowpass_hz} Hz).`;
        } else {
          recommendations.filters.gyro_lowpass_hz = currentFilters.gyro_lowpass_hz;
        }
      }
      
      // D-term filters
      if (analysisResults.filterAnalysis.dtermFilters) {
        const {recommendedFrequency} = analysisResults.filterAnalysis.dtermFilters;
        
        // Recommend new D-term filter frequency
        if (recommendedFrequency > 0) {
          recommendations.filters.dterm_lowpass_hz = recommendedFrequency;
          
          recommendations.explanations.filters.dterm_lowpass = 
            `D-term filter frequency recommended ${recommendedFrequency} Hz ` +
            `(was ${currentFilters.dterm_lowpass_hz} Hz).`;
        } else {
          recommendations.filters.dterm_lowpass_hz = currentFilters.dterm_lowpass_hz;
        }
      }
      
      // Notch filters with adaptive Q-factor
      if (analysisResults.filterAnalysis.notchFilters) {
        const { identifiedNoiseFrequencies, classifiedNoises, recommendedQFactors } = 
          analysisResults.filterAnalysis.notchFilters;
        
        if (identifiedNoiseFrequencies.length > 0) {
          // Find minimum and maximum noise frequencies
          const minFreq = Math.floor(Math.max(10, identifiedNoiseFrequencies.reduce(
            (min, noise) => Math.min(min, noise.frequency), 1000
          )));
          
          const maxFreq = Math.ceil(Math.min(500, identifiedNoiseFrequencies.reduce(
            (max, noise) => Math.max(max, noise.frequency), 0
          )));
          
          // Recommend range for notch filters
          recommendations.filters.dyn_notch_min_hz = minFreq;
          recommendations.filters.dyn_notch_max_hz = maxFreq;
          
          // Recommend number of notch filters based on detected noises
          recommendations.filters.dyn_notch_count = Math.min(5, Math.max(3, identifiedNoiseFrequencies.length));
          
          // Recommend adaptive Q-factors if classification available
          if (classifiedNoises && classifiedNoises.length > 0) {
            // Select top-N noises for filtering
            const topNoises = classifiedNoises
              .sort((a, b) => b.magnitude - a.magnitude)
              .slice(0, recommendations.filters.dyn_notch_count);
            
            // Form array of recommended Q-factors for each noise
            recommendations.filters.dynamic_notch_q_factors = topNoises.map(noise => ({
              frequency: noise.frequency,
              q_factor: noise.recommendedQ,
              noise_class: noise.noiseClass
            }));
            
            // Average Q-factor for compatibility
            recommendations.filters.dyn_notch_q = recommendedQFactors
              ? recommendedQFactors.average
              : 250;
            
            // Add explanation for adaptive Q-factors
            recommendations.explanations.filters.notch_q_factors = 
              `Adaptive Q-factors for different noise types: ` +
              topNoises.map(noise => 
                `${noise.frequency.toFixed(1)} Hz: Q=${noise.recommendedQ} (${noise.noiseClass})`
              ).join(', ');
          } else {
            // Standard Q-factor
            recommendations.filters.dyn_notch_q = 250;
          }
          
          // Add general explanation for notch filters
          recommendations.explanations.filters.notch = 
            `Notch filters: count=${recommendations.filters.dyn_notch_count}, ` +
            `range=${recommendations.filters.dyn_notch_min_hz}-${recommendations.filters.dyn_notch_max_hz} Hz, ` +
            `average Q=${recommendations.filters.dyn_notch_q}.`;
          
        } else {
          // Use current settings if no noises detected
          recommendations.filters.dyn_notch_min_hz = currentFilters.dyn_notch_min_hz;
          recommendations.filters.dyn_notch_max_hz = currentFilters.dyn_notch_max_hz;
          recommendations.filters.dyn_notch_count = currentFilters.dyn_notch_count;
          recommendations.filters.dyn_notch_q = currentFilters.dyn_notch_q;
        }
      }
    }
    
    // Generate CLI commands for Betaflight
    const commands = [];
    
    // PID commands
    commands.push('# PID settings');
    commands.push(`set p_roll = ${recommendations.pid.roll.p}`);
    commands.push(`set i_roll = ${recommendations.pid.roll.i}`);
    commands.push(`set d_roll = ${recommendations.pid.roll.d}`);
    
    commands.push(`set p_pitch = ${recommendations.pid.pitch.p}`);
    commands.push(`set i_pitch = ${recommendations.pid.pitch.i}`);
    commands.push(`set d_pitch = ${recommendations.pid.pitch.d}`);
    
    commands.push(`set p_yaw = ${recommendations.pid.yaw.p}`);
    commands.push(`set i_yaw = ${recommendations.pid.yaw.i}`);
    commands.push(`set d_yaw = ${recommendations.pid.yaw.d}`);
    
    if (recommendations.pid.roll.f) {
      commands.push(`set f_roll = ${recommendations.pid.roll.f}`);
    }
    if (recommendations.pid.pitch.f) {
      commands.push(`set f_pitch = ${recommendations.pid.pitch.f}`);
    }
    if (recommendations.pid.yaw.f) {
      commands.push(`set f_yaw = ${recommendations.pid.yaw.f}`);
    }
    
    // Filter commands
    commands.push('# Filter settings');
    commands.push(`set gyro_lowpass_hz = ${recommendations.filters.gyro_lowpass_hz}`);
    commands.push(`set dterm_lowpass_hz = ${recommendations.filters.dterm_lowpass_hz}`);
    commands.push(`set dyn_notch_count = ${recommendations.filters.dyn_notch_count}`);
    commands.push(`set dyn_notch_q = ${recommendations.filters.dyn_notch_q}`);
    commands.push(`set dyn_notch_min_hz = ${recommendations.filters.dyn_notch_min_hz}`);
    commands.push(`set dyn_notch_max_hz = ${recommendations.filters.dyn_notch_max_hz}`);
    
    // Additional commands for Betaflight 4.3+ with different Q-factor support
    if (recommendations.filters.dynamic_notch_q_factors && 
        recommendations.filters.dynamic_notch_q_factors.length > 0) {
      commands.push('# Additional commands for Betaflight 4.3+ (individual Q-factors)');
      for (let i = 0; i < Math.min(recommendations.filters.dyn_notch_count, 
                                recommendations.filters.dynamic_notch_q_factors.length); i++) {
        const qFactor = recommendations.filters.dynamic_notch_q_factors[i];
        commands.push(`set dyn_notch_q_${i+1} = ${qFactor.q_factor} # For frequency ~${qFactor.frequency.toFixed(1)} Hz`);
      }
    }
    
    // Save settings
    commands.push('save');
    
    recommendations.betaflightCommands = commands;
  } catch (err) {
    console.error("Error generating improved recommendations:", err);
  }
  
  return recommendations;
};