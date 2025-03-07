import FFT from 'fft.js';
import { applyHannWindow } from './analyzerUtils';

/**
 * Performs FFT analysis on data and finds dominant frequencies
 * 
 * @param {Array} windowedData - Data array with window function applied
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} fftSize - Size of FFT to use (power of 2)
 * @returns {Object} - Spectrum and dominant frequencies
 */
export const performFFTAnalysis = (windowedData, sampleRate, fftSize) => {
  // Initialize FFT
  const fft = new FFT(fftSize);
  const out = new Array(fftSize * 2);
  
  // Copy data to complex array
  const complexData = new Array(fftSize * 2).fill(0);
  for (let i = 0; i < fftSize; i++) {
    complexData[i * 2] = windowedData[i]; // Real part
    complexData[i * 2 + 1] = 0;           // Imaginary part
  }
  
  // Run FFT
  fft.transform(out, complexData);
  
  // Calculate spectrum
  const spectrum = [];
  for (let i = 0; i < fftSize / 2; i++) {
    const real = out[i * 2];
    const imag = out[i * 2 + 1];
    const frequency = i * (sampleRate / fftSize);
    const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
    const phase = Math.atan2(imag, real);
    
    spectrum.push({ frequency, magnitude, phase });
  }
  
  // Find dominant frequencies (local maxima)
  const dominantFrequencies = [];
  for (let i = 1; i < spectrum.length - 1; i++) {
    if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
        spectrum[i].magnitude > spectrum[i+1].magnitude &&
        spectrum[i].magnitude > 0.01) {
      dominantFrequencies.push({
        frequency: spectrum[i].frequency,
        magnitude: spectrum[i].magnitude,
        phase: spectrum[i].phase
      });
    }
  }
  
  // Sort by magnitude and take top-10
  dominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
  
  return {
    spectrum,
    dominantFrequencies: dominantFrequencies.slice(0, 10)
  };
};

/**
 * Calculates Total Harmonic Distortion (THD) and other metrics
 * 
 * @param {Array} spectrum - Frequency spectrum data
 * @param {Array} dominantFrequencies - Array of dominant frequencies
 * @returns {Object} - THD, stability score, and oscillation flag
 */
export const calculateTHD = (spectrum, dominantFrequencies) => {
  if (!dominantFrequencies || dominantFrequencies.length === 0) {
    return { thd: 0, stabilityScore: 0, oscillationDetected: false };
  }
  
  // Get the fundamental frequency (strongest component)
  const fundamental = dominantFrequencies[0];
  
  // Calculate THD - ratio of the sum of powers of all harmonic components to the power of the fundamental
  let harmonicPowerSum = 0;
  
  // Consider frequencies that are multiples of the fundamental (within a tolerance)
  for (let i = 1; i < dominantFrequencies.length; i++) {
    const freq = dominantFrequencies[i];
    const harmonic = Math.round(freq.frequency / fundamental.frequency);
    
    // Check if it's a harmonic (multiple of fundamental)
    if (harmonic > 1 && 
        Math.abs(freq.frequency - harmonic * fundamental.frequency) / fundamental.frequency < 0.1) {
      harmonicPowerSum += freq.magnitude * freq.magnitude;
    }
  }
  
  // Calculate THD percentage
  const thd = (harmonicPowerSum > 0 && fundamental.magnitude > 0) 
    ? 100 * Math.sqrt(harmonicPowerSum) / fundamental.magnitude 
    : 0;
  
  // Calculate stability score (inverse of THD, normalized to 0-100)
  const stabilityScore = 100 - Math.min(100, thd);
  
  // Detect problematic oscillations
  // Look for high amplitude secondary frequencies that are not harmonics
  let oscillationDetected = false;
  
  for (let i = 1; i < Math.min(dominantFrequencies.length, 5); i++) {
    const freq = dominantFrequencies[i];
    const ratio = freq.magnitude / fundamental.magnitude;
    
    // Non-harmonic high amplitude frequencies
    const harmonic = Math.round(freq.frequency / fundamental.frequency);
    const isHarmonic = Math.abs(freq.frequency - harmonic * fundamental.frequency) / fundamental.frequency < 0.1;
    
    // If it's not a harmonic and has significant amplitude (>15% of fundamental)
    if (!isHarmonic && ratio > 0.15) {
      oscillationDetected = true;
      break;
    }
  }
  
  return { thd, stabilityScore, oscillationDetected };
};

/**
 * Finds common frequencies between multiple axes
 * 
 * @param {Array} freqs1 - Dominant frequencies from first axis
 * @param {Array} freqs2 - Dominant frequencies from second axis
 * @param {Array} freqs3 - Dominant frequencies from third axis
 * @returns {Array} - Common frequencies across multiple axes
 */
export const findCommonFrequencies = (freqs1, freqs2, freqs3) => {
  const commonFreqs = [];
  const tolerance = 5; // Hz tolerance for considering frequencies as "same"
  
  // Handle undefined inputs
  const axis1Freqs = freqs1 || [];
  const axis2Freqs = freqs2 || [];
  const axis3Freqs = freqs3 || [];
  
  // Check frequency against all three axes
  for (const freq1 of axis1Freqs) {
    let axesFound = ['roll'];
    let matchingFreqs = [freq1];
    
    // Look for matching frequency in axis 2
    for (const freq2 of axis2Freqs) {
      if (Math.abs(freq1.frequency - freq2.frequency) < tolerance) {
        axesFound.push('pitch');
        matchingFreqs.push(freq2);
        break;
      }
    }
    
    // Look for matching frequency in axis 3
    for (const freq3 of axis3Freqs) {
      if (Math.abs(freq1.frequency - freq3.frequency) < tolerance) {
        axesFound.push('yaw');
        matchingFreqs.push(freq3);
        break;
      }
    }
    
    // If frequency found in at least 2 axes
    if (axesFound.length >= 2) {
      // Calculate average frequency and magnitude
      const avgFreq = matchingFreqs.reduce((sum, f) => sum + f.frequency, 0) / matchingFreqs.length;
      const avgMag = matchingFreqs.reduce((sum, f) => sum + f.magnitude, 0) / matchingFreqs.length;
      
      commonFreqs.push({
        frequency: avgFreq,
        magnitude: avgMag,
        axes: axesFound
      });
    }
  }
  
  // Also check for frequencies in axis 2 that match with axis 3 but not axis 1
  for (const freq2 of axis2Freqs) {
    // Skip frequencies already found in axis 1
    if (commonFreqs.some(f => Math.abs(f.frequency - freq2.frequency) < tolerance)) continue;
    
    for (const freq3 of axis3Freqs) {
      if (Math.abs(freq2.frequency - freq3.frequency) < tolerance) {
        const avgFreq = (freq2.frequency + freq3.frequency) / 2;
        const avgMag = (freq2.magnitude + freq3.magnitude) / 2;
        
        commonFreqs.push({
          frequency: avgFreq,
          magnitude: avgMag,
          axes: ['pitch', 'yaw']
        });
        break;
      }
    }
  }
  
  // Sort by magnitude
  return commonFreqs.sort((a, b) => b.magnitude - a.magnitude);
};

/**
 * Analyzes oscillation propagation between axes
 * 
 * @param {Object} gyroData - Gyro data for all axes
 * @param {Array} commonFreqs - Common frequencies across axes
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {Array} - Analysis of oscillation propagation
 */
export const analyzeOscillationPropagation = (gyroData, commonFreqs, sampleRate) => {
  const results = [];
  
  // For each common frequency, analyze phase relationships
  for (const freq of commonFreqs) {
    // Skip if less than 2 axes
    if (freq.axes.length < 2) continue;
    
    // Get the axes
    const axisMap = {
      roll: 0,
      pitch: 1,
      yaw: 2
    };
    
    // Analyze signal for each axis at this frequency
    const axisData = {};
    for (const axis of freq.axes) {
      const axisIndex = axisMap[axis];
      if (axisIndex === undefined) continue;
      
      // Extract data for this axis
      const data = gyroData[axis] || [];
      if (data.length === 0) continue;
      
      // Convert to relative time domain
      const timeMs = freq.frequency > 0 ? 1000 / freq.frequency : 0;
      
      // Get magnitude and phase
      const windowedData = applyHannWindow(data.slice(0, Math.min(data.length, 1024)));
      const { spectrum } = performFFTAnalysis(windowedData, sampleRate, 1024);
      
      // Find the magnitude and phase at this frequency
      const targetBin = Math.floor(freq.frequency * 1024 / sampleRate);
      if (targetBin < spectrum.length) {
        axisData[axis] = {
          magnitude: spectrum[targetBin].magnitude,
          phase: spectrum[targetBin].phase
        };
      }
    }
    
    // Determine source-driven relationships
    if (Object.keys(axisData).length >= 2) {
      // Find the axis with highest magnitude (potential source)
      let sourceAxis = null;
      let maxMag = 0;
      
      for (const [axis, data] of Object.entries(axisData)) {
        if (data.magnitude > maxMag) {
          maxMag = data.magnitude;
          sourceAxis = axis;
        }
      }
      
      // Propagation analysis
      const propagation = {
        frequency: freq.frequency,
        sourceAxis,
        axes: freq.axes,
        phaseRelationships: {}
      };
      
      // Calculate phase differences and propagation delays
      for (const axis of freq.axes) {
        if (axis === sourceAxis) continue;
        
        if (axisData[axis] && axisData[sourceAxis]) {
          // Calculate phase difference
          let phaseDiff = axisData[axis].phase - axisData[sourceAxis].phase;
          
          // Normalize to [-π, π]
          while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
          while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
          
          // Calculate time delay (in ms)
          const timeDelay = (phaseDiff / (2 * Math.PI)) * (1000 / freq.frequency);
          
          propagation.phaseRelationships[axis] = {
            phaseDifference: phaseDiff,
            timeDelay,
            magnitudeRatio: axisData[axis].magnitude / axisData[sourceAxis].magnitude
          };
        }
      }
      
      results.push(propagation);
    }
  }
  
  return results;
};

/**
 * Calculates coupling strength between axes based on correlations
 * 
 * @param {Array} dominantFreqs1 - Dominant frequencies from first axis
 * @param {Array} dominantFreqs2 - Dominant frequencies from second axis 
 * @param {number} correlation - Correlation coefficient between axes
 * @param {number} phaseRelation - Phase relationship between axes
 * @returns {number} - Coupling strength (0-1)
 */
export const calculateCouplingStrength = (dominantFreqs1, dominantFreqs2, correlation, phaseRelation) => {
  // Handle missing inputs
  if (!dominantFreqs1 || !dominantFreqs2) return 0;
  
  // Count common frequencies
  let commonFreqCount = 0;
  const tolerance = 5; // Hz
  
  for (const freq1 of dominantFreqs1) {
    for (const freq2 of dominantFreqs2) {
      if (Math.abs(freq1.frequency - freq2.frequency) < tolerance) {
        commonFreqCount++;
        break;
      }
    }
  }
  
  // Normalize common frequency count
  const maxPossible = Math.min(dominantFreqs1.length, dominantFreqs2.length);
  const freqSimilarity = maxPossible > 0 ? commonFreqCount / maxPossible : 0;
  
  // Use correlation, phase relationship, and frequency similarity to determine coupling
  // Absolute correlation indicates strength of relationship
  const absCorrelation = Math.abs(correlation);
  
  // Phase coherence - coherent signals have consistent phase relationship
  const phaseCoherence = Math.cos(phaseRelation) * Math.cos(phaseRelation);
  
  // Combine metrics with appropriate weights
  const couplingStrength = 0.4 * absCorrelation + 0.3 * freqSimilarity + 0.3 * phaseCoherence;
  
  return Math.min(1, Math.max(0, couplingStrength));
};

/**
 * Calculates phase relationships between two frequency spectra
 * 
 * @param {Array} spectrum1 - Frequency spectrum for first axis
 * @param {Array} spectrum2 - Frequency spectrum for second axis
 * @param {Array} dominantFreqs1 - Dominant frequencies from first axis
 * @param {Array} dominantFreqs2 - Dominant frequencies from second axis
 * @returns {number} - Weighted average phase difference
 */
export const calculatePhaseRelation = (spectrum1, spectrum2, dominantFreqs1, dominantFreqs2) => {
  // Find common frequencies between axes
  const commonFreqs = [];
  
  for (const freq1 of dominantFreqs1) {
    for (const freq2 of dominantFreqs2) {
      // If frequencies are close enough (within 5%)
      if (Math.abs(freq1.frequency - freq2.frequency) / freq1.frequency < 0.05) {
        // Calculate phase difference
        let phaseDiff = freq1.phase - freq2.phase;
        
        // Normalize to [-π, π]
        while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
        while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
        
        commonFreqs.push({
          frequency: (freq1.frequency + freq2.frequency) / 2,
          phaseDiff,
          magnitude1: freq1.magnitude,
          magnitude2: freq2.magnitude
        });
      }
    }
  }
  
  // Calculate weighted average phase difference
  if (commonFreqs.length > 0) {
    let totalWeight = 0;
    let weightedPhaseDiff = 0;
    
    for (const freq of commonFreqs) {
      // Weight depends on amplitude of both signals
      const weight = freq.magnitude1 * freq.magnitude2;
      weightedPhaseDiff += freq.phaseDiff * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedPhaseDiff / totalWeight : 0;
  }
  
  return 0; // No common frequencies
};

/**
 * Determines width of noise based on frequency spectrum
 * 
 * @param {Object} noise - Noise data with frequency and magnitude
 * @returns {number} - Width of noise in Hz
 */
export const determineNoiseWidth = (noise) => {
  // Find spectral width at -3dB (70.7% of maximum)
  const peakMagnitude = noise.magnitude;
  const thresholdMagnitude = peakMagnitude * 0.707;
  const freqSpectrum = noise.freqSpectrum || [];
  
  // If spectrum not available, return default value
  if (!freqSpectrum.length) return 10;
  
  // Find index of noise frequency in spectrum
  const peakIdx = freqSpectrum.findIndex(point => Math.abs(point.frequency - noise.frequency) < 1);
  
  if (peakIdx === -1) return 10; // Default if peak not found
  
  // Find left boundary
  let leftIdx = -1;
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (freqSpectrum[i].magnitude < thresholdMagnitude) {
      leftIdx = i;
      break;
    }
  }
  
  // Find right boundary
  let rightIdx = -1;
  for (let i = peakIdx + 1; i < freqSpectrum.length; i++) {
    if (freqSpectrum[i].magnitude < thresholdMagnitude) {
      rightIdx = i;
      break;
    }
  }
  
  // Calculate width in Hz
  if (leftIdx !== -1 && rightIdx !== -1) {
    return freqSpectrum[rightIdx].frequency - freqSpectrum[leftIdx].frequency;
  } else {
    // If boundaries not found, use empirical estimate
    return 10; // Default average value
  }
};