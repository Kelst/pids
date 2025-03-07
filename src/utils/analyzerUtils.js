/**
 * Processes data in chunks to prevent UI freezing during heavy computations
 * @param {Array} data - The data array to process
 * @param {number} chunkSize - Size of each chunk
 * @param {Function} processFunc - Function to process each chunk
 * @returns {Promise<Array>} - Array of results from each chunk
 */
import FFT from 'fft.js';

export const processInChunks = async (data, chunkSize, processFunc) => {
    const results = [];
    const totalChunks = Math.ceil(data.length / chunkSize);
  
    // Process data in chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      
      // Process the chunk
      const chunkResult = processFunc(chunk, i, start);
      results.push(chunkResult);
      
      // Allow the browser to breathe between chunks
      if (i % 5 === 0) { // every 5 chunks
        await new Promise(resolve => setTimeout(resolve, 0)); 
      }
    }
    
    return results;
  };
  
  /**
   * Applies a Hann window to a data array to reduce spectral leakage
   * @param {Array} data - The data array to window
   * @returns {Array} - Windowed data array
   */
  export const applyHannWindow = (data) => {
    const windowedData = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // Hann window: 0.5 * (1 - cos(2π*n/(N-1)))
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (data.length - 1)));
      windowedData[i] = data[i] * window;
    }
    return windowedData;
  };
  
  /**
   * Calculates normalized cross-correlation between two signals
   * @param {Array} signal1 - First signal array
   * @param {Array} signal2 - Second signal array
   * @returns {number} - Correlation coefficient
   */
  export const calculateNormalizedCrossCorrelation = (signal1, signal2) => {
    // Normalize signals
    const mean1 = signal1.reduce((sum, val) => sum + val, 0) / signal1.length;
    const mean2 = signal2.reduce((sum, val) => sum + val, 0) / signal2.length;
    
    const normalized1 = signal1.map(val => val - mean1);
    const normalized2 = signal2.map(val => val - mean2);
    
    // Calculate standard deviations
    const std1 = Math.sqrt(normalized1.reduce((sum, val) => sum + val * val, 0) / normalized1.length);
    const std2 = Math.sqrt(normalized2.reduce((sum, val) => sum + val * val, 0) / normalized2.length);
    
    // Cross-correlation at zero lag
    let correlation = 0;
    for (let i = 0; i < normalized1.length; i++) {
      correlation += (normalized1[i] / std1) * (normalized2[i] / std2);
    }
    
    correlation /= normalized1.length;
    
    return correlation;
  };
  
  /**
   * Calculates recommended gyro filter frequency based on noise analysis
   * @param {Array} gyroData - Gyroscope data array
   * @returns {number} - Recommended frequency in Hz
   */
  export const calculateRecommendedGyroFrequency = (gyroData) => {
    try {
      // Simplified algorithm: analyze spectrum and find cutoff frequency before noise appears
      const fftSize = 1024;
      const samples = Math.min(gyroData.length, 1000);
      
      // Take average value across all axes
      let combinedData = [];
      for (let i = 0; i < samples; i++) {
        const magnitude = Math.sqrt(
          gyroData[i].x * gyroData[i].x + 
          gyroData[i].y * gyroData[i].y + 
          gyroData[i].z * gyroData[i].z
        );
        combinedData.push(magnitude);
      }
      
      // Pad to FFT size
      combinedData = [...combinedData, ...Array(fftSize - combinedData.length).fill(0)];
      
      const fft = new FFT(fftSize);
      const out = new Array(fftSize * 2);
      
      // Prepare complex data
      const complexData = new Array(fftSize * 2).fill(0);
      for (let i = 0; i < fftSize; i++) {
        complexData[i * 2] = combinedData[i]; // Real part
        complexData[i * 2 + 1] = 0;           // Imaginary part
      }
      
      // Run the FFT
      fft.transform(out, complexData);
      
      // Get amplitude spectrum
      const spectrum = [];
      for (let i = 0; i < fftSize / 2; i++) {
        const real = out[i * 2];
        const imag = out[i * 2 + 1];
        const frequency = i * (1000 / fftSize);
        const magnitude = Math.sqrt(real * real + imag * imag);
        spectrum.push({ frequency, magnitude });
      }
      
      // Find frequency where noise begins (sharp increase in amplitude)
      let noiseStartFrequency = 100; // Default value
      
      // Smooth spectrum to determine trend
      const smoothedMagnitudes = [];
      const windowSize = 5;
      
      for (let i = 0; i < spectrum.length; i++) {
        let sum = 0;
        let count = 0;
        
        for (let j = Math.max(0, i - windowSize); j < Math.min(spectrum.length, i + windowSize); j++) {
          sum += spectrum[j].magnitude;
          count++;
        }
        
        smoothedMagnitudes.push(sum / count);
      }
      
      // Find point where amplitude starts rising rapidly
      for (let i = 10; i < spectrum.length - 5; i++) {
        const currentAvg = (smoothedMagnitudes[i] + smoothedMagnitudes[i+1] + smoothedMagnitudes[i+2]) / 3;
        const nextAvg = (smoothedMagnitudes[i+3] + smoothedMagnitudes[i+4] + smoothedMagnitudes[i+5]) / 3;
        
        // If there's a significant increase in amplitude
        if (nextAvg > currentAvg * 2 && nextAvg > 10) {
          noiseStartFrequency = spectrum[i].frequency;
          break;
        }
      }
      
      // Recommended filter frequency - slightly below noise start
      return Math.max(50, Math.round(noiseStartFrequency * 0.8));
    } catch (err) {
      console.error("Error calculating recommended gyro frequency:", err);
      return 100; // Default value
    }
  };
  
  /**
   * Estimates D-term filter effectiveness based on frequency
   * @param {number} frequency - Filter frequency in Hz
   * @returns {number} - Effectiveness score between 0 and 1
   */
  export const calculateDtermFilterEffectiveness = (frequency) => {
    // Simplified model of effectiveness:
    // - Too low frequency (< 70 Hz) causes significant phase delays
    // - Too high frequency (> 150 Hz) doesn't provide enough filtering
    if (frequency < 70) {
      return 0.5 + (frequency / 70) * 0.3; // from 0.5 to 0.8
    } else if (frequency > 150) {
      return 0.8 - ((frequency - 150) / 100) * 0.3; // from 0.8 to 0.5
    } else {
      return 0.8; // optimal effectiveness
    }
  };
  
  /**
   * Calculates recommended D-term filter frequency
   * @param {Array} gyroData - Gyroscope data array
   * @returns {number} - Recommended frequency in Hz
   */
  export const calculateRecommendedDtermFrequency = (gyroData) => {
    // Simplified approach: D-term filter should be set to lower frequency than gyro
    const gyroRecommendedFreq = calculateRecommendedGyroFrequency(gyroData);
    return Math.max(50, Math.round(gyroRecommendedFreq * 0.7));
  };