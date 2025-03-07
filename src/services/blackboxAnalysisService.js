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
  
    // Приблизна частота вибірки (в Гц)
    const looptimeUs = parseFloat(metadata.looptime) || 312; // мікросекунди
    const sampleRate = Math.round(1000000 / looptimeUs); // Гц
    
    console.log(`Using sample rate: ${sampleRate} Hz, analyzing full dataset of ${flightData.length} points`);
  
    // Аналіз кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      
      // Використовуємо функцію пошуку стовпця
      const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
      const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
      
      // Діагностика
      console.log(`Columns for frequency analysis of ${axis} axis:`, {
        gyro: gyroCol,
        gyroUnfilt: gyroUnfiltCol
      });
      
      // Перевірка існування стовпців
      const hasFiltered = gyroCol !== null;
      const hasUnfiltered = gyroUnfiltCol !== null;
      
      if (hasFiltered) {
        try {
          // Для FFT використовуємо розмір - степінь 2
          const fftSize = 1024;
          
          // Розділяємо весь набір даних на сегменти для FFT аналізу
          const segmentSize = fftSize;
          const numSegments = Math.floor(flightData.length / segmentSize);
          const maxSegments = Math.max(1, numSegments); // Використовуємо всі можливі сегменти
          
          console.log(`Analyzing ${maxSegments} segments for ${axis} axis`);
          
          // Масиви для накопичення результатів всіх сегментів
          let accumulatedSpectrum = new Array(Math.floor(fftSize / 2)).fill(0).map(() => ({
            frequency: 0,
            magnitude: 0
          }));
          
          let accumulatedUnfiltSpectrum = hasUnfiltered 
            ? new Array(Math.floor(fftSize / 2)).fill(0).map(() => ({
                frequency: 0,
                magnitude: 0
              }))
            : null;
          
          // Збір всіх знайдених домінуючих частот
          let allDominantFrequencies = [];
          let allUnfiltDominantFreqs = [];
          
          // Обробка даних по сегментах
          const chunkSize = 1000; // Розмір чанка для уникнення зависання UI
          
          for (let segment = 0; segment < maxSegments; segment++) {
            const startIdx = segment * segmentSize;
            const endIdx = Math.min(startIdx + segmentSize, flightData.length);
            
            if (endIdx - startIdx < fftSize / 2) {
              continue; // Пропускаємо надто короткі сегменти
            }
            
            // Збір даних для цього сегмента
            const gyroData = new Array(fftSize).fill(0);
            const gyroUnfiltData = hasUnfiltered ? new Array(fftSize).fill(0) : null;
            
            let dataIdx = 0;
            
            // Обробка сегмента по чанках
            await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
              for (const row of chunk) {
                if (dataIdx < fftSize) {
                  const value = getNumericColumnValue(row, gyroCol, dataHeaders);
                  if (!isNaN(value)) {
                    gyroData[dataIdx] = value;
                    
                    if (hasUnfiltered) {
                      const unfiltValue = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
                      gyroUnfiltData[dataIdx] = unfiltValue;
                    }
                    
                    dataIdx++;
                  }
                }
              }
            });
            
            // Заповнюємо решту нулями, якщо потрібно
            for (let i = dataIdx; i < fftSize; i++) {
              gyroData[i] = 0;
              if (hasUnfiltered) gyroUnfiltData[i] = 0;
            }
            
            // Аналіз спектра для сегмента
            const windowedGyroData = applyHannWindow(gyroData);
            
            // Налаштування FFT для відфільтрованих даних
            const fft = new FFT(fftSize);
            const out = new Array(fftSize * 2); // Вихідний комплексний масив
            
            // Копіювання даних у комплексний масив (дійсна частина)
            const complexData = new Array(fftSize * 2).fill(0);
            for (let i = 0; i < fftSize; i++) {
              complexData[i * 2] = windowedGyroData[i]; // Дійсна частина
              complexData[i * 2 + 1] = 0;               // Уявна частина
            }
            
            // Запуск FFT
            fft.transform(out, complexData);
            
            // Обчислення спектру (амплітуда) і збереження в масиві
            // Використовуємо тільки половину спектру (до частоти Найквіста)
            const spectrum = new Array(Math.floor(fftSize / 2));
            for (let i = 0; i < fftSize / 2; i++) {
              const real = out[i * 2];
              const imag = out[i * 2 + 1];
              const frequency = i * (sampleRate / fftSize); // Частота в Гц
              const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2); // Нормалізація
              spectrum[i] = { frequency, magnitude };
              
              // Накопичуємо для усереднення
              accumulatedSpectrum[i].frequency = frequency;
              accumulatedSpectrum[i].magnitude += magnitude;
            }
            
            // Знаходимо домінуючі частоти (локальні максимуми)
            const segmentDominantFreqs = [];
            for (let i = 1; i < spectrum.length - 1; i++) {
              if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
                  spectrum[i].magnitude > spectrum[i+1].magnitude &&
                  spectrum[i].magnitude > 0.01) { // Поріг для фільтрації шуму
                segmentDominantFreqs.push({
                  frequency: spectrum[i].frequency,
                  magnitude: spectrum[i].magnitude,
                  segment
                });
              }
              
              // Обмежуємо кількість домінуючих частот
              if (segmentDominantFreqs.length >= 25) break;
            }
            
            // Додаємо знайдені домінуючі частоти
            allDominantFrequencies = allDominantFrequencies.concat(segmentDominantFreqs);
            
            // Якщо є нефільтровані дані, аналізуємо і їх аналогічно
            if (hasUnfiltered && gyroUnfiltData) {
              const windowedUnfiltData = applyHannWindow(gyroUnfiltData);
              const unfiltFft = new FFT(fftSize);
              const unfiltOut = new Array(fftSize * 2);
              const unfiltComplexData = new Array(fftSize * 2).fill(0);
              
              for (let i = 0; i < fftSize; i++) {
                unfiltComplexData[i * 2] = windowedUnfiltData[i];
                unfiltComplexData[i * 2 + 1] = 0;
              }
              
              unfiltFft.transform(unfiltOut, unfiltComplexData);
              
              const unfiltSpectrum = new Array(Math.floor(fftSize / 2));
              for (let i = 0; i < fftSize / 2; i++) {
                const real = unfiltOut[i * 2];
                const imag = unfiltOut[i * 2 + 1];
                const frequency = i * (sampleRate / fftSize);
                const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                unfiltSpectrum[i] = { frequency, magnitude };
                
                // Накопичуємо для усереднення
                if (accumulatedUnfiltSpectrum) {
                  accumulatedUnfiltSpectrum[i].frequency = frequency;
                  accumulatedUnfiltSpectrum[i].magnitude += magnitude;
                }
              }
              
              // Знаходимо домінуючі частоти для нефільтрованих даних
              const unfiltDominantFreqs = [];
              for (let i = 1; i < unfiltSpectrum.length - 1; i++) {
                if (unfiltSpectrum[i].magnitude > unfiltSpectrum[i-1].magnitude && 
                    unfiltSpectrum[i].magnitude > unfiltSpectrum[i+1].magnitude &&
                    unfiltSpectrum[i].magnitude > 0.01) {
                  unfiltDominantFreqs.push({
                    frequency: unfiltSpectrum[i].frequency,
                    magnitude: unfiltSpectrum[i].magnitude,
                    segment
                  });
                }
                
                if (unfiltDominantFreqs.length >= 10) break;
              }
              
              allUnfiltDominantFreqs = allUnfiltDominantFreqs.concat(unfiltDominantFreqs);
            }
          }
          
          // Усереднення спектрів
          for (let i = 0; i < accumulatedSpectrum.length; i++) {
            accumulatedSpectrum[i].magnitude /= maxSegments;
            if (accumulatedUnfiltSpectrum) {
              accumulatedUnfiltSpectrum[i].magnitude /= maxSegments;
            }
          }
          
          // Об'єднуємо частоти з всіх сегментів і групуємо по близьким значенням
          const groupedFrequencies = [];
          const freqTolerance = 2; // Гц
          
          // Сортуємо за амплітудою (більші першими)
          allDominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
          
          // Групуємо близькі частоти
          for (const freq of allDominantFrequencies) {
            let added = false;
            
            for (const group of groupedFrequencies) {
              if (Math.abs(group.frequency - freq.frequency) < freqTolerance) {
                // Оновлюємо групу (збільшуємо вагу та усереднюємо частоту)
                const newWeight = group.weight + 1;
                group.frequency = (group.frequency * group.weight + freq.frequency) / newWeight;
                group.magnitude = Math.max(group.magnitude, freq.magnitude);
                group.weight = newWeight;
                group.segments.push(freq.segment);
                added = true;
                break;
              }
            }
            
            if (!added) {
              // Створюємо нову групу
              groupedFrequencies.push({
                frequency: freq.frequency,
                magnitude: freq.magnitude,
                weight: 1,
                segments: [freq.segment]
              });
            }
          }
          
          // Сортуємо групи за вагою та амплітудою
          groupedFrequencies.sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return b.magnitude - a.magnitude;
          });
          
          // Вибираємо топ-5 домінуючих частот
          const top5Frequencies = groupedFrequencies.slice(0, 5).map(g => ({
            frequency: g.frequency,
            magnitude: g.magnitude,
            occurrenceRate: g.weight / maxSegments // Частка сегментів, в яких зустрічається
          }));
          
          // Оцінка загального рівня шуму (середнє по всьому спектру)
          const noiseLevel = accumulatedSpectrum.reduce((sum, point) => sum + point.magnitude, 0) 
                           / accumulatedSpectrum.length;
          
          // Структура для результатів аналізу
          const analysisResult = {
            dominantFrequencies: top5Frequencies,
            noiseLevel,
            filteredVsUnfiltered: { ratio: 1, noiseDiff: 0 } // Значення за замовчуванням
          };
          
          // Якщо доступні нефільтровані дані, обчислюємо різницю між фільтрованими і нефільтрованими
          if (hasUnfiltered && accumulatedUnfiltSpectrum) {
            // Обчислюємо загальний рівень шуму для нефільтрованих даних
            const unfiltNoiseLevel = accumulatedUnfiltSpectrum.reduce((sum, point) => sum + point.magnitude, 0) 
                                  / accumulatedUnfiltSpectrum.length;
            
            // Обчислюємо коефіцієнт та різницю шуму
            const noiseRatio = unfiltNoiseLevel > 0 ? noiseLevel / unfiltNoiseLevel : 1;
            const noiseDiff = unfiltNoiseLevel - noiseLevel;
            
            analysisResult.filteredVsUnfiltered = {
              ratio: noiseRatio,
              noiseDiff: noiseDiff,
              unfiltNoiseLevel
            };
            
            // Групуємо нефільтровані домінуючі частоти аналогічно
            const groupedUnfiltFreqs = [];
            
            allUnfiltDominantFreqs.sort((a, b) => b.magnitude - a.magnitude);
            
            for (const freq of allUnfiltDominantFreqs) {
              let added = false;
              
              for (const group of groupedUnfiltFreqs) {
                if (Math.abs(group.frequency - freq.frequency) < freqTolerance) {
                  const newWeight = group.weight + 1;
                  group.frequency = (group.frequency * group.weight + freq.frequency) / newWeight;
                  group.magnitude = Math.max(group.magnitude, freq.magnitude);
                  group.weight = newWeight;
                  added = true;
                  break;
                }
              }
              
              if (!added) {
                groupedUnfiltFreqs.push({
                  frequency: freq.frequency,
                  magnitude: freq.magnitude,
                  weight: 1
                });
              }
            }
            
            groupedUnfiltFreqs.sort((a, b) => {
              if (b.weight !== a.weight) return b.weight - a.weight;
              return b.magnitude - a.magnitude;
            });
            
            analysisResult.unfilteredDominantFrequencies = groupedUnfiltFreqs.slice(0, 5).map(g => ({
              frequency: g.frequency,
              magnitude: g.magnitude,
              occurrenceRate: g.weight / maxSegments
            }));
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
// Модифікація функції analyzeHarmonicDistortion для обробки всіх даних
export const analyzeHarmonicDistortion = async (flightData, dataHeaders, metadata) => {
    const harmonicAnalysis = {
      roll: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      pitch: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      yaw: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      // Додаємо розділ для аналізу взаємодії осей
      axisInteractions: {
        roll_pitch: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
        roll_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
        pitch_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 }
      },
      // Спільні гармоніки - коли одна частота з'являється на кількох осях
      commonHarmonics: []
    };
  
    // Приблизна частота вибірки
    const looptimeUs = parseFloat(metadata.looptime) || 312;
    const sampleRate = Math.round(1000000 / looptimeUs);
    
    console.log(`Analyzing harmonic distortion with full dataset (${flightData.length} points)`);
  
    // Розмір FFT для аналізу гармонік
    const fftSize = 1024;
    const segmentSize = fftSize;
    const numSegments = Math.floor(flightData.length / segmentSize);
    const maxSegments = Math.max(1, numSegments); // Використовуємо всі сегменти
    
    console.log(`Dividing data into ${maxSegments} segments for harmonic analysis`);
    
    // Спектри для всіх сегментів і осей
    const allSpectrums = {
      roll: [],
      pitch: [],
      yaw: []
    };
    
    // Доміннтні частоти для всіх сегментів
    const allDominantFreqs = {
      roll: [],
      pitch: [],
      yaw: []
    };
    
    // Аналіз кожного сегмента даних
    const chunkSize = 500;
    
    for (let segment = 0; segment < maxSegments; segment++) {
      const startIdx = segment * segmentSize;
      const endIdx = Math.min(startIdx + segmentSize, flightData.length);
      
      if (endIdx - startIdx < fftSize / 2) {
        continue; // Пропускаємо надто короткі сегменти
      }
      
      // Збираємо дані гіроскопа для цього сегмента
      const segmentGyroData = {
        roll: new Array(fftSize).fill(0),
        pitch: new Array(fftSize).fill(0),
        yaw: new Array(fftSize).fill(0)
      };
      
      // Індекси для заповнення даних
      const dataIdx = { roll: 0, pitch: 0, yaw: 0 };
      
      // Обробляємо дані сегмента по чанкам
      await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
        for (const row of chunk) {
          for (const axis of ['roll', 'pitch', 'yaw']) {
            if (dataIdx[axis] < fftSize) {
              const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
              const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
              
              if (gyroCol) {
                const value = getNumericColumnValue(row, gyroCol, dataHeaders);
                if (!isNaN(value)) {
                  segmentGyroData[axis][dataIdx[axis]] = value;
                  dataIdx[axis]++;
                }
              }
            }
          }
        }
      });
      
      // Аналіз гармонік для кожної осі в цьому сегменті
      for (const axis of ['roll', 'pitch', 'yaw']) {
        if (dataIdx[axis] > fftSize / 2) { // Якщо зібрано достатньо даних
          try {
            // Доповнюємо масив даних до повного розміру FFT
            for (let i = dataIdx[axis]; i < fftSize; i++) {
              segmentGyroData[axis][i] = 0;
            }
            
            // Застосовуємо віконну функцію Ханна
            const windowedData = applyHannWindow(segmentGyroData[axis]);
            
            // Виконуємо FFT аналіз
            const { spectrum, dominantFrequencies } = performFFTAnalysis(
              windowedData, sampleRate, fftSize
            );
            
            // Зберігаємо спектр та домінуючі частоти для цього сегмента
            allSpectrums[axis].push(spectrum);
            
            // Додаємо інформацію про сегмент до домінуючих частот
            const segmentDominantFreqs = dominantFrequencies.map(freq => ({
              ...freq,
              segment
            }));
            
            allDominantFreqs[axis] = allDominantFreqs[axis].concat(segmentDominantFreqs);
          } catch (err) {
            console.error(`Error analyzing ${axis} axis for segment ${segment}:`, err);
          }
        }
      }
    }
    
    // Об'єднуємо результати всіх сегментів для кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      if (allSpectrums[axis].length > 0) {
        try {
          // Усереднення спектрів
          const avgSpectrum = [];
          const spectrumLength = allSpectrums[axis][0].length;
          
          for (let i = 0; i < spectrumLength; i++) {
            let sumMagnitude = 0;
            let frequency = 0;
            
            for (const spectrum of allSpectrums[axis]) {
              if (i < spectrum.length) {
                sumMagnitude += spectrum[i].magnitude;
                frequency = spectrum[i].frequency;
              }
            }
            
            avgSpectrum.push({
              frequency,
              magnitude: sumMagnitude / allSpectrums[axis].length
            });
          }
          
          // Групуємо близькі домінуючі частоти
          const groupedFrequencies = [];
          const freqTolerance = 2; // Гц
          
          // Сортуємо за амплітудою
          allDominantFreqs[axis].sort((a, b) => b.magnitude - a.magnitude);
          
          for (const freq of allDominantFreqs[axis]) {
            let added = false;
            
            for (const group of groupedFrequencies) {
              if (Math.abs(group.frequency - freq.frequency) < freqTolerance) {
                const newWeight = group.weight + 1;
                group.frequency = (group.frequency * group.weight + freq.frequency) / newWeight;
                group.magnitude = Math.max(group.magnitude, freq.magnitude);
                group.weight = newWeight;
                group.segments.push(freq.segment);
                added = true;
                break;
              }
            }
            
            if (!added) {
              groupedFrequencies.push({
                frequency: freq.frequency,
                magnitude: freq.magnitude,
                weight: 1,
                segments: [freq.segment]
              });
            }
          }
          
          // Сортуємо за вагою та амплітудою
          groupedFrequencies.sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight;
            return b.magnitude - a.magnitude;
          });
          
          // Виділяємо найбільш стабільні частоти (присутні в багатьох сегментах)
          const consistentFrequencies = groupedFrequencies
            .filter(g => g.weight >= maxSegments * 0.5) // Присутні хоча б у 50% сегментів
            .slice(0, 10)
            .map(g => ({
              frequency: g.frequency,
              magnitude: g.magnitude,
              occurrenceRate: g.weight / maxSegments
            }));
          
          // Обчислюємо THD та інші метрики для всього набору даних
          let totalThd = 0;
          let totalOscillationDetected = false;
          
          // Якщо є стабільні частоти, аналізуємо їх
          if (consistentFrequencies.length > 0) {
            const { thd, stabilityScore, oscillationDetected } = calculateTHD(
              avgSpectrum, consistentFrequencies
            );
            
            totalThd = thd;
            totalOscillationDetected = oscillationDetected;
            
            harmonicAnalysis[axis] = {
              thd,
              stabilityScore,
              oscillationDetected,
              dominantFrequencies: consistentFrequencies
            };
          } else {
            harmonicAnalysis[axis] = {
              thd: 0,
              stabilityScore: 100,
              oscillationDetected: false,
              dominantFrequencies: []
            };
          }
        } catch (err) {
          console.error(`Error in final harmonic analysis for ${axis} axis:`, err);
        }
      }
    }
    
    // Аналіз взаємодії між осями
    const axesPairs = [
      ['roll', 'pitch'],
      ['roll', 'yaw'],
      ['pitch', 'yaw']
    ];
    
    // Зберігаємо домінуючі частоти для подальшого використання
    const axisDominantFreqs = {
      roll: harmonicAnalysis.roll.dominantFrequencies || [],
      pitch: harmonicAnalysis.pitch.dominantFrequencies || [],
      yaw: harmonicAnalysis.yaw.dominantFrequencies || []
    };
    
    for (const [axis1, axis2] of axesPairs) {
      const key = `${axis1}_${axis2}`;
      
      if (allSpectrums[axis1].length > 0 && allSpectrums[axis2].length > 0) {
        try {
          // Обчислюємо кореляцію між осями для кожного сегмента
          let totalCorrelation = 0;
          let segmentCount = 0;
          
          for (let segment = 0; segment < maxSegments; segment++) {
            const startIdx = segment * segmentSize;
            const endIdx = Math.min(startIdx + segmentSize, flightData.length);
            
            if (endIdx - startIdx < fftSize / 2) {
              continue; // Пропускаємо надто короткі сегменти
            }
            
            // Збираємо дані для обох осей
            const segmentData1 = [];
            const segmentData2 = [];
            
            // Обробляємо дані сегмента по чанкам
            await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
              for (const row of chunk) {
                const axisIndex1 = { roll: 0, pitch: 1, yaw: 2 }[axis1];
                const axisIndex2 = { roll: 0, pitch: 1, yaw: 2 }[axis2];
                
                const gyroCol1 = findColumnName(`gyroADC[${axisIndex1}]`, dataHeaders);
                const gyroCol2 = findColumnName(`gyroADC[${axisIndex2}]`, dataHeaders);
                
                if (gyroCol1 && gyroCol2) {
                  const value1 = getNumericColumnValue(row, gyroCol1, dataHeaders);
                  const value2 = getNumericColumnValue(row, gyroCol2, dataHeaders);
                  
                  if (!isNaN(value1) && !isNaN(value2)) {
                    segmentData1.push(value1);
                    segmentData2.push(value2);
                  }
                }
              }
            });
            
            if (segmentData1.length > fftSize / 2 && segmentData2.length > fftSize / 2) {
              // Обчислюємо нормалізовану крос-кореляцію для цього сегмента
              const correlation = calculateNormalizedCrossCorrelation(
                segmentData1, segmentData2
              );
              
              totalCorrelation += correlation;
              segmentCount++;
            }
          }
          
          // Усереднюємо кореляцію
          const avgCorrelation = segmentCount > 0 ? totalCorrelation / segmentCount : 0;
          
          // Обчислюємо фазові відносини між осями
          // Використовуємо усереднені спектри
          const avgSpectrum1 = [];
          const avgSpectrum2 = [];
          
          if (allSpectrums[axis1].length > 0 && allSpectrums[axis2].length > 0) {
            const spectrumLength = Math.min(allSpectrums[axis1][0].length, allSpectrums[axis2][0].length);
            
            for (let i = 0; i < spectrumLength; i++) {
              let sumMagnitude1 = 0;
              let sumMagnitude2 = 0;
              let sumPhase1 = 0;
              let sumPhase2 = 0;
              let frequency = 0;
              
              for (let j = 0; j < allSpectrums[axis1].length; j++) {
                if (i < allSpectrums[axis1][j].length) {
                  sumMagnitude1 += allSpectrums[axis1][j][i].magnitude;
                  frequency = allSpectrums[axis1][j][i].frequency;
                  if (allSpectrums[axis1][j][i].phase !== undefined) {
                    sumPhase1 += allSpectrums[axis1][j][i].phase;
                  }
                }
              }
              
              for (let j = 0; j < allSpectrums[axis2].length; j++) {
                if (i < allSpectrums[axis2][j].length) {
                  sumMagnitude2 += allSpectrums[axis2][j][i].magnitude;
                  if (allSpectrums[axis2][j][i].phase !== undefined) {
                    sumPhase2 += allSpectrums[axis2][j][i].phase;
                  }
                }
              }
              
              avgSpectrum1.push({
                frequency,
                magnitude: sumMagnitude1 / allSpectrums[axis1].length,
                phase: sumPhase1 / allSpectrums[axis1].length
              });
              
              avgSpectrum2.push({
                frequency,
                magnitude: sumMagnitude2 / allSpectrums[axis2].length,
                phase: sumPhase2 / allSpectrums[axis2].length
              });
            }
          }
          
          // Обчислюємо фазові відносини
          const phaseRelation = calculatePhaseRelation(
            avgSpectrum1, avgSpectrum2, axisDominantFreqs[axis1], axisDominantFreqs[axis2]
          );
          
          // Оцінюємо силу зв'язку між осями
          const couplingStrength = calculateCouplingStrength(
            axisDominantFreqs[axis1], axisDominantFreqs[axis2], avgCorrelation, phaseRelation
          );
          
          harmonicAnalysis.axisInteractions[key] = {
            correlation: avgCorrelation,
            phaseRelation,
            couplingStrength
          };
        } catch (err) {
          console.error(`Error analyzing interaction between ${axis1} and ${axis2}:`, err);
        }
      }
    }
    
    // Пошук спільних гармонік між осями
    const commonFreqs = findCommonFrequencies(
      axisDominantFreqs.roll, 
      axisDominantFreqs.pitch, 
      axisDominantFreqs.yaw
    );
    
    harmonicAnalysis.commonHarmonics = commonFreqs;
    
    // Аналіз поширення коливань між осями
    if (commonFreqs.length > 0) {
      const segmentSize = 1024;
      const maxSegmentsToAnalyze = Math.min(10, maxSegments); // Обмежуємо кількість сегментів для аналізу поширення
      
      // Збираємо дані для аналізу поширення
      const segmentGyroData = [];
      
      for (let segment = 0; segment < maxSegmentsToAnalyze; segment++) {
        const startIdx = segment * segmentSize;
        const endIdx = Math.min(startIdx + segmentSize, flightData.length);
        
        if (endIdx - startIdx < segmentSize / 2) {
          continue;
        }
        
        // Дані для цього сегмента
        const segmentData = {
          roll: [],
          pitch: [],
          yaw: []
        };
        
        // Збір даних по чанкам
        await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
          for (const row of chunk) {
            for (const axis of ['roll', 'pitch', 'yaw']) {
              const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
              const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
              
              if (gyroCol) {
                const value = getNumericColumnValue(row, gyroCol, dataHeaders);
                if (!isNaN(value)) {
                  segmentData[axis].push(value);
                }
              }
            }
          }
        });
        
        // Додаємо дані сегмента якщо достатньо точок
        if (segmentData.roll.length > segmentSize / 2 &&
            segmentData.pitch.length > segmentSize / 2 &&
            segmentData.yaw.length > segmentSize / 2) {
          segmentGyroData.push(segmentData);
        }
      }
      
      // Аналізуємо поширення для кожного сегмента
      let propagationResults = [];
      
      for (const segmentData of segmentGyroData) {
        const segmentPropagation = analyzeOscillationPropagation(
          segmentData, commonFreqs, sampleRate
        );
        
        propagationResults = propagationResults.concat(segmentPropagation);
      }
      
      // Об'єднуємо результати аналізу поширення
      harmonicAnalysis.oscillationPropagation = propagationResults;
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
// Модифікація функції analyzeFilters для обробки всіх даних
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
        classifiedNoises: [],
        recommendedQFactors: {}
      },
      rpmFilters: {
        effectiveness: 0,
        motorNoiseFrequencies: [],
        detectedHarmonics: []
      }
    };
  
    // Отримуємо налаштування фільтрів з метаданих
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
    
    // Приблизна частота вибірки (в Гц)
    const looptimeUs = parseFloat(metadata.looptime) || 312; // мікросекунди
    const sampleRate = Math.round(1000000 / looptimeUs); // Гц
    console.log(`Sample rate: ${sampleRate} Hz, analyzing full dataset of ${flightData.length} points`);
    
    try {
      // Аналіз даних гіроскопа
      // Перевіряємо наявність фільтрованих і нефільтрованих даних
      const hasUnfilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
        const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
        return findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders) !== null;
      });
      
      const hasFilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
        const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
        return findColumnName(`gyroADC[${axisIndex}]`, dataHeaders) !== null;
      });
      
      // Діагностичний лог
      console.log(`Gyroscope data availability: filtered=${hasFilteredGyro}, unfiltered=${hasUnfilteredGyro}`);
      
      if (hasUnfilteredGyro && hasFilteredGyro) {
        // Розбиваємо аналіз на сегменти
        const segmentSize = 1024;
        const numSegments = Math.floor(flightData.length / segmentSize);
        const maxSegments = Math.max(1, numSegments);
        
        console.log(`Dividing data into ${maxSegments} segments for filter analysis`);
        
        // Накопичення результатів аналізу для кожного сегмента
        let totalNoiseReduction = {
          x: 0,
          y: 0,
          z: 0
        };
        
        let segmentCount = 0;
        
        // Обробка даних по сегментам
        const chunkSize = 500;
        
        for (let segment = 0; segment < maxSegments; segment++) {
          const startIdx = segment * segmentSize;
          const endIdx = Math.min(startIdx + segmentSize, flightData.length);
          
          if (endIdx - startIdx < segmentSize / 2) {
            continue; // Пропускаємо надто короткі сегменти
          }
          
          // Збираємо дані гіроскопа для цього сегмента
          const rawData = [];
          const filteredData = [];
          
          // Обробка сегмента по чанкам
          await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
            for (const row of chunk) {
              const data = {
                x: getNumericColumnValue(row, 'gyroUnfilt[0]', dataHeaders),
                y: getNumericColumnValue(row, 'gyroUnfilt[1]', dataHeaders),
                z: getNumericColumnValue(row, 'gyroUnfilt[2]', dataHeaders)
              };
              
              const filtered = {
                x: getNumericColumnValue(row, 'gyroADC[0]', dataHeaders),
                y: getNumericColumnValue(row, 'gyroADC[1]', dataHeaders),
                z: getNumericColumnValue(row, 'gyroADC[2]', dataHeaders)
              };
              
              // Додаємо тільки якщо всі дані присутні
              if (!isNaN(data.x) && !isNaN(data.y) && !isNaN(data.z) &&
                  !isNaN(filtered.x) && !isNaN(filtered.y) && !isNaN(filtered.z)) {
                rawData.push(data);
                filteredData.push(filtered);
              }
            }
          });
          
          // Оцінка ефективності фільтра гіроскопа для цього сегмента
          if (rawData.length > 0 && filteredData.length > 0) {
            // Обчислюємо різницю між нефільтрованими і фільтрованими даними
            const segmentNoiseReduction = {
              x: 0,
              y: 0,
              z: 0
            };
            
            const compareCount = Math.min(rawData.length, filteredData.length);
            
            for (let i = 0; i < compareCount; i++) {
              segmentNoiseReduction.x += Math.abs(rawData[i].x - filteredData[i].x);
              segmentNoiseReduction.y += Math.abs(rawData[i].y - filteredData[i].y);
              segmentNoiseReduction.z += Math.abs(rawData[i].z - filteredData[i].z);
            }
            
            // Нормалізація
            segmentNoiseReduction.x /= compareCount;
            segmentNoiseReduction.y /= compareCount;
            segmentNoiseReduction.z /= compareCount;
            
            // Додаємо до загальних результатів
            totalNoiseReduction.x += segmentNoiseReduction.x;
            totalNoiseReduction.y += segmentNoiseReduction.y;
            totalNoiseReduction.z += segmentNoiseReduction.z;
            
            segmentCount++;
          }
        }
        
        // Усереднюємо результати
        if (segmentCount > 0) {
          totalNoiseReduction.x /= segmentCount;
          totalNoiseReduction.y /= segmentCount;
          totalNoiseReduction.z /= segmentCount;
          
          // Загальна ефективність як середнє по осях
          const gyroFilterEffectiveness = (totalNoiseReduction.x + totalNoiseReduction.y + totalNoiseReduction.z) / 3;
          
          // Оцінка затримки фази
          let phaseDelay = 0;
          if (gyroLowpassHz > 0) {
            // Приблизна оцінка затримки на основі частоти зрізу
            phaseDelay = 1000 / (2 * Math.PI * gyroLowpassHz);
          }
          
          // Рекомендована частота фільтра
          // Спочатку аналізуємо весь набір даних для виявлення шуму
          const allRawData = [];
          
          // Збираємо дані з кількох рівномірно розподілених сегментів
          const sampleSegments = 5;
          const segmentStep = Math.max(1, Math.floor(maxSegments / sampleSegments));
          
          for (let segIdx = 0; segIdx < maxSegments; segIdx += segmentStep) {
            const startIdx = segIdx * segmentSize;
            const endIdx = Math.min(startIdx + segmentSize, flightData.length);
            
            if (endIdx - startIdx < segmentSize / 2) {
              continue;
            }
            
            // Збираємо нефільтровані дані гіроскопа
            const segmentRawData = [];
            
            await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
              for (const row of chunk) {
                const data = {
                  x: getNumericColumnValue(row, 'gyroUnfilt[0]', dataHeaders),
                  y: getNumericColumnValue(row, 'gyroUnfilt[1]', dataHeaders),
                  z: getNumericColumnValue(row, 'gyroUnfilt[2]', dataHeaders)
                };
                
                if (!isNaN(data.x) && !isNaN(data.y) && !isNaN(data.z)) {
                  segmentRawData.push(data);
                }
              }
            });
            
            allRawData.push(...segmentRawData);
          }
          
          // Рекомендована частота на основі аналізу шуму
          const recommendedFrequency = calculateRecommendedGyroFrequency(allRawData);
          
          filterAnalysis.gyroFilters = {
            effectiveness: gyroFilterEffectiveness,
            phaseDelay,
            recommendedFrequency,
            noiseReduction: {
              x: totalNoiseReduction.x,
              y: totalNoiseReduction.y,
              z: totalNoiseReduction.z
            }
          };
        }
        
        // Аналіз шуму мотора з використанням даних eRPM
        const hasERPM = dataHeaders.some(h => findColumnName('eRPM[0]', dataHeaders) !== null);
        const hasMotor = dataHeaders.some(h => findColumnName('motor[0]', dataHeaders) !== null);
        
        if (hasERPM && hasMotor) {
          // Аналіз шуму моторів з використанням кількох репрезентативних сегментів
          const motorNoiseFrequencies = [];
          const rpmHarmonics = [];
          
          // Обираємо кілька сегментів для аналізу шуму моторів
          const motorAnalysisSegments = 3;
          const motorSegmentStep = Math.max(1, Math.floor(maxSegments / motorAnalysisSegments));
          
          for (let segIdx = 0; segIdx < maxSegments; segIdx += motorSegmentStep) {
            const startIdx = segIdx * segmentSize;
            const endIdx = Math.min(startIdx + segmentSize, flightData.length);
            
            if (endIdx - startIdx < segmentSize / 2) {
              continue;
            }
            
            // Збираємо дані моторів і eRPM
            const motorData = [];
            const eRpmData = [];
            
            for (let motorIdx = 0; motorIdx < 4; motorIdx++) {
              const motorCol = findColumnName(`motor[${motorIdx}]`, dataHeaders);
              const eRpmCol = findColumnName(`eRPM[${motorIdx}]`, dataHeaders);
              
              if (motorCol && eRpmCol) {
                const motorValues = [];
                const eRpmValues = [];
                
                // Збираємо дані по чанкам
                await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
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
            
            // Аналіз шуму моторів з урахуванням eRPM
            if (motorData.length > 0 && eRpmData.length > 0) {
              // Аналізуємо кожен мотор
              for (let motorIndex = 0; motorIndex < motorData.length; motorIndex++) {
                try {
                  const motorValues = motorData[motorIndex];
                  const eRpmValues = eRpmData[motorIndex];
                  
                  // Знаходимо середнє значення eRPM мотора
                  const avgERPM = eRpmValues.reduce((sum, rpm) => sum + rpm, 0) / eRpmValues.length;
                  
                  // Частота обертання в Гц (eRPM / 60)
                  const rotationFreqHz = avgERPM / 60;
                  
                  // Базова частота шуму мотора (залежить від кількості полюсів)
                  // Для безщіткових моторів з N полюсами = (eRPM * N / 60) / 2
                  const baseNoiseFreq = (avgERPM * motorPoles) / (60 * 2);
                  
                  // Гармоніки шуму мотора
                  for (let harmonic = 1; harmonic <= gyroRpmNotchHarmonics; harmonic++) {
                    rpmHarmonics.push({
                      harmonic,
                      frequency: baseNoiseFreq * harmonic,
                      motorIndex,
                      averageERPM: avgERPM,
                      segment: segIdx
                    });
                  }
                  
                  // Аналіз спектру мотора для пошуку піків шуму
                  const fftSize = 512;
                  if (motorValues.length >= fftSize) {
                    const windowedData = applyHannWindow(motorValues.slice(0, fftSize));
                    
                    // Виконуємо FFT
                    const fft = new FFT(fftSize);
                    const out = new Array(fftSize * 2);
                    const complexData = new Array(fftSize * 2).fill(0);
                    
                    for (let i = 0; i < fftSize; i++) {
                      complexData[i * 2] = windowedData[i]; // Дійсна частина
                      complexData[i * 2 + 1] = 0;          // Уявна частина
                    }
                    
                    fft.transform(out, complexData);
                    
                    // Обчислюємо спектр
                    const frequencies = [];
                    for (let i = 1; i < fftSize / 2; i++) {
                      const real = out[i * 2];
                      const imag = out[i * 2 + 1];
                      const freq = i * (sampleRate / fftSize);
                      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                      frequencies.push({ frequency: freq, magnitude });
                    }
                    
                    // Знаходимо локальні максимуми
                    const peaks = [];
                    for (let i = 1; i < frequencies.length - 1; i++) {
                      if (frequencies[i].magnitude > frequencies[i-1].magnitude && 
                          frequencies[i].magnitude > frequencies[i+1].magnitude &&
                          frequencies[i].magnitude > 0.01) {
                        peaks.push({
                          ...frequencies[i],
                          segment: segIdx
                        });
                      }
                    }
                    
                    // Сортуємо за величиною і обираємо топ-3
                    peaks.sort((a, b) => b.magnitude - a.magnitude);
                    const topFrequencies = peaks.slice(0, 3);
                    
                    motorNoiseFrequencies.push({
                      motorIndex,
                      frequencies: topFrequencies,
                      averageERPM: avgERPM,
                      segment: segIdx
                    });
                  }
                } catch (err) {
                  console.error(`Error analyzing motor noise for motor ${motorIndex}:`, err);
                }
              }
            }
          }
          
          // Об'єднуємо результати аналізу шуму моторів
          if (motorNoiseFrequencies.length > 0) {
            // Групуємо частоти шуму для кожного мотора
            const groupedMotorNoises = [];
            
            for (let motorIdx = 0; motorIdx < 4; motorIdx++) {
              const motorNoises = motorNoiseFrequencies
                .filter(data => data.motorIndex === motorIdx);
              
              if (motorNoises.length > 0) {
                // Об'єднуємо частоти шуму по сегментам
                const allFrequencies = [];
                let totalERPM = 0;
                
                for (const noise of motorNoises) {
                  allFrequencies.push(...noise.frequencies);
                  totalERPM += noise.averageERPM;
                }
                
                // Групуємо близькі частоти
                const groupedFreqs = [];
                const freqTolerance = 5; // Гц
                
                for (const freq of allFrequencies) {
                  let added = false;
                  
                  for (const group of groupedFreqs) {
                    if (Math.abs(group.frequency - freq.frequency) < freqTolerance) {
                      const newWeight = group.weight + 1;
                      group.frequency = (group.frequency * group.weight + freq.frequency) / newWeight;
                      group.magnitude = Math.max(group.magnitude, freq.magnitude);
                      group.weight = newWeight;
                      added = true;
                      break;
                    }
                  }
                  
                  if (!added) {
                    groupedFreqs.push({
                      frequency: freq.frequency,
                      magnitude: freq.magnitude,
                      weight: 1
                    });
                  }
                }
                
                // Сортуємо за вагою та амплітудою
                groupedFreqs.sort((a, b) => {
                  if (b.weight !== a.weight) return b.weight - a.weight;
                  return b.magnitude - a.magnitude;
                });
                
                // Додаємо об'єднані результати
                groupedMotorNoises.push({
                  motorIndex: motorIdx,
                  frequencies: groupedFreqs.slice(0, 3).map(f => ({
                    frequency: f.frequency,
                    magnitude: f.magnitude,
                    consistency: f.weight / motorNoises.length
                  })),
                  averageERPM: totalERPM / motorNoises.length
                });
              }
            }
            
            // Також групуємо гармоніки RPM
            const groupedHarmonics = [];
            
            for (const harmonic of rpmHarmonics) {
              const key = `${harmonic.motorIndex}_${harmonic.harmonic}`;
              
              // Шукаємо існуючу групу
              let group = groupedHarmonics.find(g => 
                g.motorIndex === harmonic.motorIndex && g.harmonic === harmonic.harmonic
              );
              
              if (group) {
                // Оновлюємо групу
                group.frequency = (group.frequency * group.count + harmonic.frequency) / (group.count + 1);
                group.averageERPM = (group.averageERPM * group.count + harmonic.averageERPM) / (group.count + 1);
                group.count++;
              } else {
                // Створюємо нову групу
                groupedHarmonics.push({
                  harmonic: harmonic.harmonic,
                  motorIndex: harmonic.motorIndex,
                  frequency: harmonic.frequency,
                  averageERPM: harmonic.averageERPM,
                  count: 1
                });
              }
            }
            
            // Сортуємо за номером гармоніки
            groupedHarmonics.sort((a, b) => a.harmonic - b.harmonic);
            
            // Оцінка ефективності фільтра RPM
            const rpmFilterEffectiveness = 0.5; // Базове значення
            
            filterAnalysis.rpmFilters = {
              effectiveness: rpmFilterEffectiveness,
              motorNoiseFrequencies: groupedMotorNoises,
              detectedHarmonics: groupedHarmonics
            };
          }
        }
        
        // Аналіз фільтра Notch на основі повного набору даних
        if (dynNotchMinHz > 0 && dynNotchMaxHz > 0) {
          // Збираємо частоти шуму з усього набору даних
          const identifiedNoiseFrequencies = [];
          
          // Аналізуємо спектри гіроскопа для виявлення шуму
          for (const axis of ['roll', 'pitch', 'yaw']) {
            const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
            const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
            
            if (gyroUnfiltCol) {
              // Аналізуємо кілька рівномірно розподілених сегментів
              const notchAnalysisSegments = 5;
              const notchSegmentStep = Math.max(1, Math.floor(maxSegments / notchAnalysisSegments));
              
              for (let segIdx = 0; segIdx < maxSegments; segIdx += notchSegmentStep) {
                const startIdx = segIdx * segmentSize;
                const endIdx = Math.min(startIdx + segmentSize, flightData.length);
                
                if (endIdx - startIdx < segmentSize / 2) {
                  continue;
                }
                
                try {
                  const fftSize = 1024;
                  const gyroData = [];
                  
                  // Збираємо дані по чанкам
                  await processInChunks(flightData.slice(startIdx, endIdx), chunkSize, (chunk) => {
                    for (const row of chunk) {
                      const value = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
                      if (!isNaN(value)) {
                        gyroData.push(value);
                        if (gyroData.length >= fftSize) break;
                      }
                    }
                  });
                  
                  if (gyroData.length > 0) {
                    // Доповнюємо даними, якщо потрібно
                    const paddedData = [...gyroData];
                    for (let i = gyroData.length; i < fftSize; i++) {
                      paddedData[i] = 0;
                    }
                    
                    // Застосовуємо віконну функцію
                    const windowedData = applyHannWindow(paddedData);
                    
                    // Виконуємо FFT
                    const fft = new FFT(fftSize);
                    const out = new Array(fftSize * 2);
                    const complexData = new Array(fftSize * 2).fill(0);
                    
                    for (let i = 0; i < fftSize; i++) {
                      complexData[i * 2] = windowedData[i]; // Дійсна частина
                      complexData[i * 2 + 1] = 0;           // Уявна частина
                    }
                    
                    fft.transform(out, complexData);
                    
                    // Обчислюємо спектр для пошуку піків шуму в діапазоні фільтра Notch
                    const freqSpectrum = [];
                    for (let i = 0; i < fftSize / 2; i++) {
                      const freq = i * (sampleRate / fftSize);
                      const real = out[i * 2];
                      const imag = out[i * 2 + 1];
                      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                      freqSpectrum.push({ frequency: freq, magnitude });
                    }
                    
                    // Пошук піків шуму в діапазоні фільтра Notch
                    for (let i = 1; i < fftSize / 2 - 1; i++) {
                      const freq = i * (sampleRate / fftSize);
                      
                      if (freq >= dynNotchMinHz && freq <= dynNotchMaxHz) {
                        const magnitude = freqSpectrum[i].magnitude;
                        const prevMagnitude = freqSpectrum[i-1].magnitude;
                        const nextMagnitude = freqSpectrum[i+1].magnitude;
                        
                        // Перевіряємо чи це локальний максимум зі значною амплітудою
                        if (magnitude > 0.01 && magnitude > prevMagnitude && magnitude > nextMagnitude) {
                          
                          // Перевіряємо чи ця частота вже була додана
                          const existingFreq = identifiedNoiseFrequencies.find(f => Math.abs(f.frequency - freq) < 5);
                          
                          if (!existingFreq) {
                            // Додаємо цей пік шуму до списку
                            const noiseData = {
                              frequency: freq,
                              magnitude,
                              axis,
                              freqSpectrum, // Додаємо повний спектр для аналізу ширини шуму
                              segment: segIdx
                            };
                            
                            identifiedNoiseFrequencies.push(noiseData);
                          } else {
                            // Оновлюємо існуючий запис, якщо знайдена більша амплітуда
                            if (magnitude > existingFreq.magnitude) {
                              existingFreq.magnitude = magnitude;
                              existingFreq.freqSpectrum = freqSpectrum;
                            }
                            // Додаємо інформацію про вісь, якщо вона відрізняється
                            if (existingFreq.axis !== axis && !existingFreq.additionalAxes) {
                              existingFreq.additionalAxes = [axis];
                            } else if (existingFreq.additionalAxes && !existingFreq.additionalAxes.includes(axis)) {
                              existingFreq.additionalAxes.push(axis);
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (err) {
                  console.error(`Error analyzing notch filters for ${axis} axis in segment ${segIdx}:`, err);
                }
              }
            }
          }
          
          // Сортуємо за амплітудою
          identifiedNoiseFrequencies.sort((a, b) => b.magnitude - a.magnitude);
          
          // Оцінка ефективності фільтра Notch
          let notchEffectiveness = 0;
          if (identifiedNoiseFrequencies.length > 0) {
            notchEffectiveness = 0.6; // Базове значення
          }
          
          // Класифікуємо шуми на основі їх характеристик
          const classifiedNoises = identifiedNoiseFrequencies.map(noise => {
            try {
              // Ширина шуму - знаходимо напівширину на рівні 70.7% від максимуму (-3dB)
              const noiseWidth = determineNoiseWidth(noise);
              
              // Частотна стабільність - оцінка стабільності частоти в часі
              const frequencyStability = 0.7; // Базове значення
              
              // Клас шуму та рекомендований Q-фактор
              let noiseClass;
              let recommendedQ;
              
              if (noiseWidth < 5 && frequencyStability > 0.8) {
                // Вузькосмуговий стабільний шум (типово від моторів)
                noiseClass = 'narrowband_stable';
                recommendedQ = 500; // Високий Q-фактор для вузького фільтра
              } else if (noiseWidth < 10 && frequencyStability > 0.6) {
                // Середньосмуговий стабільний шум
                noiseClass = 'mediumband_stable';
                recommendedQ = 300; // Середній Q-фактор
              } else if (noiseWidth > 20 || frequencyStability < 0.4) {
                // Широкосмуговий або нестабільний шум
                noiseClass = 'wideband_or_unstable';
                recommendedQ = 120; // Низький Q-фактор для широкого фільтра
              } else {
                // Стандартний випадок
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
          
          // Оновлюємо аналіз класифікованими шумами
          filterAnalysis.notchFilters = {
            effectiveness: notchEffectiveness,
            identifiedNoiseFrequencies: identifiedNoiseFrequencies.slice(0, 5),
            classifiedNoises: classifiedNoises
          };
          
          // Обчислюємо середній рекомендований Q-фактор
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
        
        // Аналіз фільтра D-term з використанням всього набору даних
        if (dtermLowpassHz > 0) {
          const phaseDelay = 1000 / (2 * Math.PI * dtermLowpassHz);
          
          // Обчислюємо ефективність фільтра D-term
          const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
          
          // Рекомендована частота фільтра D-term
          // Використовуємо нефільтровані дані гіроскопа для аналізу
          const recommendedFrequency = calculateRecommendedDtermFrequency(allRawData);
          
          filterAnalysis.dtermFilters = {
            effectiveness,
            phaseDelay,
            recommendedFrequency
          };
        }
      } else {
        console.warn("Missing gyroUnfilt or gyroADC data for full dataset filter analysis");
      }
    } catch (error) {
      console.error("Error analyzing filters with full dataset:", error);
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