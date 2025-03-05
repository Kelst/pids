import FFT from 'fftjs';
import { findPeaks } from 'ml-peak-finder';
import { SavitzkyGolay } from 'ml-savitzky-golay';

/**
 * Клас для аналізу частот за допомогою FFT (Fast Fourier Transform)
 */
export class FFTAnalyzer {
  /**
   * Конструктор
   * @param {Object} options - Опції FFT-аналізатора
   * @param {number} options.sampleRate - Частота дискретизації в Гц (за замовчуванням 1000 Гц)
   * @param {number} options.minFreq - Мінімальна частота для аналізу
   * @param {number} options.maxFreq - Максимальна частота для аналізу
   */
  constructor(options = {}) {
    this.options = {
      sampleRate: 1000, // Hz
      minFreq: 5,       // Hz
      maxFreq: 500,     // Hz
      ...options
    };
    
    // Діапазони частот для аналізу
    this.frequencyBands = [
      { name: 'PropWash', min: 5, max: 30, source: 'Turbulence, Tuning Issues', severity: 0 },
      { name: 'Mechanical Low', min: 30, max: 60, source: 'Frame Vibrations, Motor Balance', severity: 0 },
      { name: 'Mechanical Mid', min: 60, max: 120, source: 'Props, Motor Mounts', severity: 0 },
      { name: 'Mechanical High', min: 120, max: 180, source: 'Motors, Bearings', severity: 0 },
      { name: 'Aliasing', min: 180, max: 300, source: 'Gyro Sampling, High-Freq Noise', severity: 0 },
      { name: 'Electrical', min: 300, max: 500, source: 'ESC, PWM Issues', severity: 0 }
    ];
  }
  
  /**
   * Аналізує дані гіроскопа та виявляє резонансні частоти
   * @param {Array} gyroData - Масив показань гіроскопа
   * @param {number} sampleRate - Частота дискретизації (необов'язково)
   * @returns {Object} - Результати аналізу
   */
  analyzeGyroData(gyroData, sampleRate = this.options.sampleRate) {
    // Якщо немає даних, повертаємо порожній результат
    if (!gyroData || gyroData.length < 64) {
      return {
        resonanceFrequencies: [],
        dominantFrequency: 0,
        bandAnalysis: this.frequencyBands.map(band => ({ ...band, severity: 0 })),
        noiseLevel: 0
      };
    }
    
    try {
      // Робимо копію даних і застосовуємо вікно Хеннінга для кращого FFT
      const dataLength = gyroData.length;
      const dataPadded = this.padToPowerOfTwo(gyroData);
      const windowedData = this.applyHannWindow(dataPadded);
      
      // Створюємо FFT об'єкт і обчислюємо спектр
      const fft = new FFT(dataPadded.length);
      const spectrum = fft.forward(windowedData);
      
      // Підготовка масиву частот
      const freqStep = sampleRate / dataPadded.length;
      const frequencies = Array.from({ length: spectrum.length / 2 }, (_, i) => i * freqStep);
      
      // Підготовка масиву амплітуд (перетворення комплексних чисел в амплітуди)
      const amplitudes = Array.from({ length: spectrum.length / 2 }, (_, i) => {
        const real = spectrum[i * 2];
        const imag = spectrum[i * 2 + 1];
        return Math.sqrt(real * real + imag * imag) / (dataPadded.length / 2);
      });
      
      // Згладжування амплітуд для кращого виявлення піків
      const smoothedAmplitudes = SavitzkyGolay.savitzkyGolay(amplitudes, 1, { windowSize: 9, derivative: 0 });
      
      // Пошук піків (потенційних резонансних частот)
      const { maxima } = findPeaks(smoothedAmplitudes, {
        minMaxRatio: 0.1,
        maxCriteria: true
      });
      
      // Фільтрація піків у діапазоні частот
      const relevantPeaks = maxima
        .filter(index => {
          const freq = frequencies[index];
          return freq >= this.options.minFreq && freq <= this.options.maxFreq;
        })
        .sort((a, b) => smoothedAmplitudes[b] - smoothedAmplitudes[a])
        .slice(0, 10) // Обмежуємо кількість піків для аналізу
        .map(index => ({
          frequency: parseFloat(frequencies[index].toFixed(2)),
          amplitude: parseFloat(smoothedAmplitudes[index].toFixed(4)),
          index
        }));
      
      // Знаходимо домінантну частоту (пік з найбільшою амплітудою)
      const dominantFrequency = relevantPeaks.length > 0 ? relevantPeaks[0].frequency : 0;
      
      // Аналіз по частотних діапазонах
      const bandAnalysis = this.analyzeBands(frequencies, smoothedAmplitudes);
      
      // Обчислюємо загальний рівень шуму
      const noiseLevel = this.calculateNoiseLevel(smoothedAmplitudes);
      
      return {
        spectrum: {
          frequencies: frequencies.filter(f => f >= this.options.minFreq && f <= this.options.maxFreq),
          amplitudes: smoothedAmplitudes.slice(
            Math.floor(this.options.minFreq / freqStep),
            Math.ceil(this.options.maxFreq / freqStep)
          )
        },
        resonanceFrequencies: relevantPeaks,
        dominantFrequency,
        bandAnalysis,
        noiseLevel
      };
    } catch (error) {
      console.error("FFT Analysis Error:", error);
      return {
        resonanceFrequencies: [],
        dominantFrequency: 0,
        bandAnalysis: this.frequencyBands.map(band => ({ ...band, severity: 0 })),
        noiseLevel: 0,
        error: error.message
      };
    }
  }
  
  /**
   * Аналізує FFT результати по частотних діапазонах
   * @param {Array} frequencies - Масив частот
   * @param {Array} amplitudes - Масив амплітуд
   * @returns {Array} - Результати аналізу по діапазонах
   */
  analyzeBands(frequencies, amplitudes) {
    return this.frequencyBands.map(band => {
      // Знаходимо індекси, які входять у діапазон
      const indices = frequencies
        .map((freq, index) => ({ freq, index }))
        .filter(item => item.freq >= band.min && item.freq <= band.max)
        .map(item => item.index);
      
      // Якщо немає частот у цьому діапазоні, повертаємо нуль
      if (indices.length === 0) {
        return { ...band, severity: 0, peaks: [] };
      }
      
      // Обчислюємо середню та максимальну амплітуду в діапазоні
      const bandAmplitudes = indices.map(i => amplitudes[i]);
      const avgAmplitude = bandAmplitudes.reduce((sum, a) => sum + a, 0) / bandAmplitudes.length;
      const maxAmplitude = Math.max(...bandAmplitudes);
      const maxIndex = indices[bandAmplitudes.indexOf(maxAmplitude)];
      
      // Знаходимо найбільші піки в діапазоні
      const { maxima } = findPeaks(bandAmplitudes, { maxCriteria: true, minMaxRatio: 0.5 });
      const peaks = maxima.map(i => ({
        frequency: parseFloat(frequencies[indices[i]].toFixed(2)),
        amplitude: parseFloat(bandAmplitudes[i].toFixed(4))
      })).sort((a, b) => b.amplitude - a.amplitude).slice(0, 3);
      
      // Обчислюємо "тяжкість" проблем в цьому діапазоні
      // Це відносне значення від 0 до 10, де вищі значення означають більші проблеми
      const severity = Math.min(10, Math.round(maxAmplitude * 100));
      
      return {
        ...band,
        severity,
        avgAmplitude: parseFloat(avgAmplitude.toFixed(4)),
        maxAmplitude: parseFloat(maxAmplitude.toFixed(4)),
        dominantFrequency: frequencies[maxIndex],
        peaks
      };
    });
  }
  
  /**
   * Обчислює загальний рівень шуму
   * @param {Array} amplitudes - Масив амплітуд
   * @returns {number} - Рівень шуму від 0 до 10
   */
  calculateNoiseLevel(amplitudes) {
    const sum = amplitudes.reduce((acc, val) => acc + val, 0);
    const avg = sum / amplitudes.length;
    
    // Нормалізація до шкали 0-10
    return Math.min(10, Math.round(avg * 250));
  }
  
  /**
   * Доповнює масив до розміру степеня двійки для ефективного FFT
   * @param {Array} data - Масив даних
   * @returns {Array} - Доповнений масив
   */
  padToPowerOfTwo(data) {
    // Знаходимо найближчий більший степінь двійки
    const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(data.length)));
    
    // Створюємо новий масив і копіюємо дані
    const padded = new Array(nextPowerOfTwo).fill(0);
    for (let i = 0; i < data.length; i++) {
      padded[i] = data[i];
    }
    
    return padded;
  }
  
  /**
   * Застосовує вікно Хеннінга до даних для зменшення ефекту розтікання спектру
   * @param {Array} data - Масив даних
   * @returns {Array} - Масив з застосованим вікном
   */
  applyHannWindow(data) {
    const windowedData = new Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      // Вікно Хеннінга: 0.5 * (1 - cos(2π * i / (N - 1)))
      const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (data.length - 1)));
      windowedData[i] = data[i] * windowValue;
    }
    
    return windowedData;
  }
  
  /**
   * Генерує рекомендації для налаштування фільтрів на основі FFT-аналізу
   * @param {Object} fftResults - Результати FFT-аналізу
   * @returns {Object} - Рекомендації для фільтрів
   */
  generateFilterRecommendations(fftResults) {
    const { resonanceFrequencies, bandAnalysis, noiseLevel } = fftResults;
    
    // Базові налаштування фільтрів
    const baseRecommendations = {
      gyro_lowpass_hz: 0,
      gyro_lowpass_type: "PT1",
      gyro_lowpass2_hz: 0,
      gyro_notch1_hz: 0,
      gyro_notch1_cutoff: 0,
      gyro_notch2_hz: 0,
      gyro_notch2_cutoff: 0,
      dyn_notch_max_hz: 350,
      dyn_notch_width_percent: 8,
      dyn_notch_q: 300,
      dyn_notch_min_hz: 60
    };
    
    // Якщо немає виявлених резонансів, повертаємо базові налаштування
    if (!resonanceFrequencies || resonanceFrequencies.length === 0) {
      return {
        ...baseRecommendations,
        comments: ["Не виявлено значних резонансів. Використовуйте стандартні налаштування."]
      };
    }
    
    // Визначення проблемних діапазонів
    const problemBands = bandAnalysis
      .filter(band => band.severity > 5)
      .sort((a, b) => b.severity - a.severity);
    
    // Рекомендації базуються на виявлених проблемних частотах
    const recommendations = { ...baseRecommendations };
    const comments = [];
    
    // Загальний рівень шуму
    if (noiseLevel <= 3) {
      comments.push("Низький рівень шуму. Можливе використання мінімальної фільтрації.");
    } else if (noiseLevel <= 6) {
      comments.push("Середній рівень шуму. Рекомендується стандартна фільтрація.");
    } else {
      comments.push("Високий рівень шуму. Рекомендується агресивна фільтрація.");
    }
    
    // Аналіз по діапазонах
    if (problemBands.length > 0) {
      problemBands.forEach(band => {
        comments.push(`${band.name} діапазон (${band.min}-${band.max}Hz) має високий рівень шуму. Можлива причина: ${band.source}`);
      });
      
      // Налаштування LPF
      const highestProblemBand = problemBands[0];
      if (highestProblemBand.min < 100) {
        // Низькочастотні проблеми - агресивніша фільтрація
        recommendations.gyro_lowpass_hz = Math.max(65, Math.round(highestProblemBand.dominantFrequency * 1.5));
        recommendations.gyro_lowpass_type = "PT1";
        recommendations.gyro_lowpass2_hz = Math.max(100, Math.round(highestProblemBand.dominantFrequency * 2.5));
        comments.push(`Встановлено фільтр низьких частот на ${recommendations.gyro_lowpass_hz}Hz для зменшення шуму в проблемному діапазоні.`);
      } else if (highestProblemBand.min < 200) {
        // Середньочастотні проблеми - збалансована фільтрація
        recommendations.gyro_lowpass_hz = Math.round(Math.min(120, highestProblemBand.dominantFrequency * 0.7));
        comments.push(`Встановлено фільтр низьких частот на ${recommendations.gyro_lowpass_hz}Hz.`);
      } else {
        // Високочастотні проблеми - можна бути менш агресивним з LPF
        recommendations.gyro_lowpass_hz = 150;
        comments.push("Встановлено стандартний фільтр низьких частот 150Hz.");
      }
    }
    
    // Налаштування Notch фільтрів для виявлених резонансів
    if (resonanceFrequencies.length > 0) {
      // Підбір частоти для динамічного нотч-фільтра
      const dominantPeak = resonanceFrequencies[0];
      
      if (dominantPeak.frequency > 60 && dominantPeak.frequency < 350) {
        recommendations.dyn_notch_min_hz = Math.max(40, Math.round(dominantPeak.frequency * 0.7));
        recommendations.dyn_notch_max_hz = Math.min(600, Math.round(dominantPeak.frequency * 2));
        recommendations.dyn_notch_width_percent = 8;
        recommendations.dyn_notch_q = Math.round(Math.max(120, 500 - dominantPeak.frequency));
        
        comments.push(`Налаштовано динамічний нотч-фільтр для цільового діапазону ${recommendations.dyn_notch_min_hz}-${recommendations.dyn_notch_max_hz}Hz.`);
      }
      
      // Якщо є кілька чітких піків, можна налаштувати статичні нотч-фільтри
      if (resonanceFrequencies.length > 1 && resonanceFrequencies[1].amplitude > 0.02) {
        const secondPeak = resonanceFrequencies[1];
        
        if (secondPeak.frequency > 80 && secondPeak.frequency < 500 && 
            Math.abs(secondPeak.frequency - dominantPeak.frequency) > 30) {
          recommendations.gyro_notch1_hz = Math.round(secondPeak.frequency);
          recommendations.gyro_notch1_cutoff = Math.round(secondPeak.frequency * 0.7);
          
          comments.push(`Додано статичний нотч-фільтр на ${recommendations.gyro_notch1_hz}Hz для другого резонансного піку.`);
        }
      }
    }
    
    // Додаткові загальні рекомендації
    comments.push("Використовуйте ці налаштування як відправну точку і налаштовуйте поступово.");
    
    return {
      ...recommendations,
      comments
    };
  }
}