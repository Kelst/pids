/**
 * Клас для розширеної обробки сигналів (DSP) для аналізу даних Blackbox
 * Містить алгоритми для фільтрації, аналізу та виявлення аномалій
 */
export class AdvancedDSP {
    /**
     * Застосовує фільтр з ковзним середнім для згладжування даних
     * @param {number[]} data - Вхідні дані
     * @param {number} windowSize - Розмір вікна для згладжування
     * @returns {number[]} - Згладжені дані
     */
    static movingAverage(data, windowSize = 5) {
      if (windowSize < 1) windowSize = 1;
      if (windowSize > data.length) windowSize = data.length;
      
      const result = new Array(data.length);
      
      for (let i = 0; i < data.length; i++) {
        let sum = 0;
        let count = 0;
        
        // Обчислюємо середнє для поточного вікна
        for (let j = Math.max(0, i - Math.floor(windowSize / 2)); 
             j < Math.min(data.length, i + Math.floor(windowSize / 2) + 1); 
             j++) {
          sum += data[j];
          count++;
        }
        
        result[i] = sum / count;
      }
      
      return result;
    }
    
    /**
     * Застосовує фільтр Баттерворта низьких частот
     * @param {number[]} data - Вхідні дані
     * @param {number} cutoffFreq - Частота зрізу (нормалізована до [0, 0.5])
     * @param {number} order - Порядок фільтра
     * @returns {number[]} - Фільтровані дані
     */
    static butterworthLowPass(data, cutoffFreq = 0.1, order = 1) {
      // Нормалізуємо частоту зрізу
      cutoffFreq = Math.max(0.001, Math.min(0.5, cutoffFreq));
      
      // Обчислюємо коефіцієнти фільтра
      const a = Math.tan(Math.PI * cutoffFreq);
      const a2 = Math.pow(a, 2);
      
      const r = 1 / (1 + Math.SQRT2 * a + a2);
      const b0 = a2 * r;
      const b1 = 2 * b0;
      const b2 = b0;
      const a1 = 2 * (a2 - 1) * r;
      const a2Coef = (1 - Math.SQRT2 * a + a2) * r;
      
      // Застосовуємо фільтр
      const result = new Array(data.length);
      
      // Початкові умови
      result[0] = data[0];
      if (data.length > 1) result[1] = data[1];
      
      // Прямий прохід
      for (let i = 2; i < data.length; i++) {
        result[i] = b0 * data[i] + b1 * data[i - 1] + b2 * data[i - 2] 
                  - a1 * result[i - 1] - a2Coef * result[i - 2];
      }
      
      // Для більш високих порядків фільтра повторюємо процес
      for (let j = 1; j < order; j++) {
        for (let i = 2; i < data.length; i++) {
          result[i] = b0 * result[i] + b1 * result[i - 1] + b2 * result[i - 2] 
                    - a1 * result[i - 1] - a2Coef * result[i - 2];
        }
      }
      
      return result;
    }
    
    /**
     * Застосовує нерекурсивний notch-фільтр
     * @param {number[]} data - Вхідні дані
     * @param {number} centerFreq - Центральна частота (нормалізована до [0, 0.5])
     * @param {number} bandwidth - Ширина смуги (нормалізована до [0, 0.5])
     * @returns {number[]} - Фільтровані дані
     */
    static notchFilter(data, centerFreq = 0.25, bandwidth = 0.05) {
      // Нормалізуємо параметри
      centerFreq = Math.max(0.01, Math.min(0.49, centerFreq));
      bandwidth = Math.max(0.001, Math.min(0.2, bandwidth));
      
      // Обчислюємо коефіцієнти фільтра
      const w0 = 2 * Math.PI * centerFreq;
      const alpha = Math.sin(w0) * Math.sinh(Math.log(2) / 2 * bandwidth * w0 / Math.sin(w0));
      
      const b0 = 1;
      const b1 = -2 * Math.cos(w0);
      const b2 = 1;
      const a0 = 1 + alpha;
      const a1 = -2 * Math.cos(w0);
      const a2 = 1 - alpha;
      
      // Нормалізуємо коефіцієнти
      const b = [b0 / a0, b1 / a0, b2 / a0];
      const a = [1, a1 / a0, a2 / a0];
      
      // Застосовуємо фільтр
      const result = new Array(data.length);
      
      // Початкові умови
      result[0] = data[0];
      if (data.length > 1) result[1] = data[1];
      
      // Прямий прохід
      for (let i = 2; i < data.length; i++) {
        result[i] = b[0] * data[i] + b[1] * data[i - 1] + b[2] * data[i - 2] 
                  - a[1] * result[i - 1] - a[2] * result[i - 2];
      }
      
      return result;
    }
    
    /**
     * Обчислює спектрограму сигналу (спектр у часі)
     * @param {number[]} data - Вхідні дані
     * @param {number} windowSize - Розмір вікна FFT
     * @param {number} overlap - Перекриття вікон (0-1)
     * @returns {Array} - Спектрограма як масив спектрів
     */
    static computeSpectrogram(data, windowSize = 64, overlap = 0.5) {
      if (windowSize > data.length) windowSize = data.length;
      
      // Обчислюємо крок
      const step = Math.floor(windowSize * (1 - overlap));
      if (step < 1) step = 1;
      
      // Обчислюємо кількість вікон
      const numWindows = Math.floor((data.length - windowSize) / step) + 1;
      
      // Створюємо вікно Хенінга
      const hanningWindow = new Array(windowSize);
      for (let i = 0; i < windowSize; i++) {
        hanningWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
      }
      
      // Створюємо спектрограму
      const spectrogram = [];
      
      for (let i = 0; i < numWindows; i++) {
        const windowData = data.slice(i * step, i * step + windowSize);
        
        // Застосовуємо вікно
        const windowedData = windowData.map((x, j) => x * hanningWindow[j]);
        
        // Обчислюємо FFT
        const spectrum = this.computeFFTMagnitude(windowedData);
        
        spectrogram.push(spectrum);
      }
      
      return spectrogram;
    }
    
    /**
     * Обчислює амплітудний спектр за допомогою FFT
     * @param {number[]} data - Вхідні дані
     * @returns {number[]} - Амплітудний спектр
     */
    static computeFFTMagnitude(data) {
      // Перевіряємо, чи розмір даних є ступенем 2
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(data.length)));
      
      // Доповнюємо нулями до розміру ступеня 2
      const paddedData = [...data];
      while (paddedData.length < nextPowerOf2) {
        paddedData.push(0);
      }
      
      // Обчислюємо FFT
      const fft = this.computeFFT(paddedData);
      
      // Обчислюємо амплітуду (використовуємо лише половину спектру)
      const magnitude = new Array(Math.floor(paddedData.length / 2));
      
      for (let i = 0; i < magnitude.length; i++) {
        magnitude[i] = Math.sqrt(
          fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]
        );
      }
      
      return magnitude;
    }
    
    /**
     * Обчислює FFT (швидке перетворення Фур'є)
     * @param {number[]} data - Вхідні дані
     * @returns {Object} - Результати FFT (дійсна та уявна частини)
     */
    static computeFFT(data) {
      const n = data.length;
      
      // Якщо розмір малий, використовуємо пряме DFT
      if (n <= 4) {
        return this.computeDFT(data);
      }
      
      // Розділяємо на парні та непарні індекси
      const evenData = [];
      const oddData = [];
      
      for (let i = 0; i < n / 2; i++) {
        evenData.push(data[i * 2]);
        oddData.push(data[i * 2 + 1]);
      }
      
      // Рекурсивно обчислюємо FFT для парної та непарної частин
      const evenFFT = this.computeFFT(evenData);
      const oddFFT = this.computeFFT(oddData);
      
      // Об'єднуємо результати
      const result = {
        real: new Array(n),
        imag: new Array(n)
      };
      
      for (let k = 0; k < n / 2; k++) {
        // Обчислюємо фазовий множник
        const theta = -2 * Math.PI * k / n;
        const re = Math.cos(theta);
        const im = Math.sin(theta);
        
        // Множимо на фазовий множник
        const reOdd = oddFFT.real[k] * re - oddFFT.imag[k] * im;
        const imOdd = oddFFT.real[k] * im + oddFFT.imag[k] * re;
        
        // Об'єднуємо результати
        result.real[k] = evenFFT.real[k] + reOdd;
        result.imag[k] = evenFFT.imag[k] + imOdd;
        
        result.real[k + n / 2] = evenFFT.real[k] - reOdd;
        result.imag[k + n / 2] = evenFFT.imag[k] - imOdd;
      }
      
      return result;
    }
    
    /**
     * Обчислює DFT (дискретне перетворення Фур'є)
     * @param {number[]} data - Вхідні дані
     * @returns {Object} - Результати DFT (дійсна та уявна частини)
     */
    static computeDFT(data) {
      const n = data.length;
      const result = {
        real: new Array(n).fill(0),
        imag: new Array(n).fill(0)
      };
      
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < n; t++) {
          const theta = -2 * Math.PI * k * t / n;
          result.real[k] += data[t] * Math.cos(theta);
          result.imag[k] += data[t] * Math.sin(theta);
        }
      }
      
      return result;
    }
    
    /**
     * Обчислює автокореляцію сигналу
     * @param {number[]} data - Вхідні дані
     * @param {number} maxLag - Максимальний зсув
     * @returns {number[]} - Автокореляція
     */
    static computeAutocorrelation(data, maxLag = null) {
      if (maxLag === null) maxLag = data.length - 1;
      maxLag = Math.min(maxLag, data.length - 1);
      
      const result = new Array(maxLag + 1);
      
      // Обчислюємо середнє значення
      const mean = data.reduce((sum, x) => sum + x, 0) / data.length;
      
      // Обчислюємо автокореляцію для кожного зсуву
      for (let lag = 0; lag <= maxLag; lag++) {
        let sum = 0;
        let count = 0;
        
        for (let i = 0; i < data.length - lag; i++) {
          sum += (data[i] - mean) * (data[i + lag] - mean);
          count++;
        }
        
        result[lag] = sum / count;
      }
      
      // Нормалізуємо
      const variance = result[0];
      if (variance !== 0) {
        for (let i = 0; i < result.length; i++) {
          result[i] /= variance;
        }
      }
      
      return result;
    }
    
    /**
     * Виявляє піки у сигналі
     * @param {number[]} data - Вхідні дані
     * @param {number} threshold - Поріг для виявлення піків
     * @param {number} minDistance - Мінімальна відстань між піками
     * @returns {Array} - Масив індексів піків
     */
    static findPeaks(data, threshold = 0, minDistance = 1) {
      const peaks = [];
      
      // Знаходимо локальні максимуми
      for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > data[i - 1] && data[i] > data[i + 1] && data[i] > threshold) {
          peaks.push({ index: i, value: data[i] });
        }
      }
      
      // Сортуємо піки за значенням
      peaks.sort((a, b) => b.value - a.value);
      
      // Фільтруємо піки за мінімальною відстанню
      const result = [];
      const usedIndices = new Set();
      
      for (const peak of peaks) {
        let isValidPeak = true;
        
        // Перевіряємо, чи пік знаходиться на достатній відстані від уже знайдених піків
        for (const usedIndex of usedIndices) {
          if (Math.abs(peak.index - usedIndex) < minDistance) {
            isValidPeak = false;
            break;
          }
        }
        
        if (isValidPeak) {
          result.push(peak);
          usedIndices.add(peak.index);
        }
      }
      
      // Сортуємо результат за індексом
      result.sort((a, b) => a.index - b.index);
      
      return result;
    }
    
    /**
     * Виявляє викиди у сигналі
     * @param {number[]} data - Вхідні дані
     * @param {number} threshold - Поріг для виявлення викидів (у стандартних відхиленнях)
     * @returns {Array} - Масив індексів викидів
     */
    static findOutliers(data, threshold = 3) {
      // Обчислюємо середнє та стандартне відхилення
      const mean = data.reduce((sum, x) => sum + x, 0) / data.length;
      const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
      const variance = squaredDiffs.reduce((sum, x) => sum + x, 0) / data.length;
      const stdDev = Math.sqrt(variance);
      
      // Знаходимо викиди
      const outliers = [];
      
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i] - mean) > threshold * stdDev) {
          outliers.push({ index: i, value: data[i] });
        }
      }
      
      return outliers;
    }
    
    /**
     * Обчислює кросс-кореляцію між двома сигналами
     * @param {number[]} data1 - Перший сигнал
     * @param {number[]} data2 - Другий сигнал
     * @param {number} maxLag - Максимальний зсув
     * @returns {number[]} - Крос-кореляція
     */
    static computeCrossCorrelation(data1, data2, maxLag = null) {
      const minLength = Math.min(data1.length, data2.length);
      
      if (maxLag === null) maxLag = minLength - 1;
      maxLag = Math.min(maxLag, minLength - 1);
      
      // Нормалізуємо дані
      const mean1 = data1.reduce((sum, x) => sum + x, 0) / data1.length;
      const mean2 = data2.reduce((sum, x) => sum + x, 0) / data2.length;
      
      const norm1 = data1.map(x => x - mean1);
      const norm2 = data2.map(x => x - mean2);
      
      // Обчислюємо стандартні відхилення
      const std1 = Math.sqrt(norm1.reduce((sum, x) => sum + x * x, 0) / norm1.length);
      const std2 = Math.sqrt(norm2.reduce((sum, x) => sum + x * x, 0) / norm2.length);
      
      // Обчислюємо крос-кореляцію для кожного зсуву
      const result = new Array(2 * maxLag + 1);
      
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        let sum = 0;
        let count = 0;
        
        for (let i = 0; i < minLength; i++) {
          const j = i + lag;
          
          if (j >= 0 && j < minLength) {
            sum += (norm1[i] * norm2[j]) / (std1 * std2);
            count++;
          }
        }
        
        result[lag + maxLag] = count ? sum / count : 0;
      }
      
      return result;
    }
    
    /**
     * Застосовує медіанний фільтр для видалення викидів
     * @param {number[]} data - Вхідні дані
     * @param {number} windowSize - Розмір вікна
     * @returns {number[]} - Фільтровані дані
     */
    static medianFilter(data, windowSize = 5) {
      if (windowSize < 1) windowSize = 1;
      if (windowSize > data.length) windowSize = data.length;
      
      const result = new Array(data.length);
      
      for (let i = 0; i < data.length; i++) {
        // Створюємо вікно
        const window = [];
        
        for (let j = Math.max(0, i - Math.floor(windowSize / 2)); 
             j < Math.min(data.length, i + Math.floor(windowSize / 2) + 1); 
             j++) {
          window.push(data[j]);
        }
        
        // Сортуємо вікно та беремо середнє значення
        window.sort((a, b) => a - b);
        result[i] = window[Math.floor(window.length / 2)];
      }
      
      return result;
    }
    
    /**
     * Обчислює сегментовану статистику в рухомому вікні
     * @param {number[]} data - Вхідні дані
     * @param {number} windowSize - Розмір вікна
     * @param {number} step - Крок між вікнами
     * @returns {Array} - Статистика у кожному вікні
     */
    static segmentedStatistics(data, windowSize = 100, step = 50) {
      if (windowSize > data.length) windowSize = data.length;
      if (step < 1) step = 1;
      
      const numSegments = Math.floor((data.length - windowSize) / step) + 1;
      const result = [];
      
      for (let i = 0; i < numSegments; i++) {
        const segment = data.slice(i * step, i * step + windowSize);
        
        // Обчислюємо статистику для сегмента
        const stats = {
          startIndex: i * step,
          endIndex: i * step + windowSize - 1,
          mean: 0,
          stdDev: 0,
          min: Infinity,
          max: -Infinity
        };
        
        // Обчислюємо середнє
        stats.mean = segment.reduce((sum, x) => sum + x, 0) / segment.length;
        
        // Обчислюємо стандартне відхилення
        stats.stdDev = Math.sqrt(
          segment.reduce((sum, x) => sum + Math.pow(x - stats.mean, 2), 0) / segment.length
        );
        
        // Знаходимо мінімум та максимум
        stats.min = Math.min(...segment);
        stats.max = Math.max(...segment);
        
        result.push(stats);
      }
      
      return result;
    }
    
    /**
     * Виявляє стрибки у даних
     * @param {number[]} data - Вхідні дані
     * @param {number} threshold - Поріг для виявлення стрибків
     * @returns {Array} - Масив стрибків
     */
    static findJumps(data, threshold = 3) {
      const jumps = [];
      
      // Обчислюємо різниці
      const diffs = [];
      for (let i = 1; i < data.length; i++) {
        diffs.push(data[i] - data[i - 1]);
      }
      
      // Обчислюємо середнє та стандартне відхилення різниць
      const mean = diffs.reduce((sum, x) => sum + x, 0) / diffs.length;
      const squaredDiffs = diffs.map(x => Math.pow(x - mean, 2));
      const variance = squaredDiffs.reduce((sum, x) => sum + x, 0) / diffs.length;
      const stdDev = Math.sqrt(variance);
      
      // Знаходимо стрибки
      for (let i = 0; i < diffs.length; i++) {
        if (Math.abs(diffs[i] - mean) > threshold * stdDev) {
          jumps.push({
            index: i + 1, // Індекс у вихідних даних
            value: diffs[i],
            direction: diffs[i] > 0 ? 'up' : 'down'
          });
        }
      }
      
      return jumps;
    }
    
    /**
     * Знаходить патерни у даних
     * @param {number[]} data - Вхідні дані
     * @param {number} patternLength - Довжина шаблону
     * @param {number} threshold - Поріг схожості
     * @returns {Array} - Масив знайдених патернів
     */
    static findPatterns(data, patternLength = 10, threshold = 0.9) {
      if (patternLength < 2) patternLength = 2;
      if (patternLength > data.length / 2) patternLength = Math.floor(data.length / 2);
      
      const patterns = [];
      
      // Перебираємо всі можливі початкові позиції
      for (let i = 0; i <= data.length - patternLength; i++) {
        const pattern = data.slice(i, i + patternLength);
        const matches = [];
        
        // Шукаємо схожі патерни
        for (let j = 0; j <= data.length - patternLength; j++) {
          // Пропускаємо порівняння з самим собою
          if (Math.abs(i - j) < patternLength) continue;
          
          const candidate = data.slice(j, j + patternLength);
          const similarity = this.calculatePatternSimilarity(pattern, candidate);
          
          if (similarity >= threshold) {
            matches.push({
              index: j,
              similarity: similarity
            });
          }
        }
        
        // Якщо знайдено схожі патерни, додаємо результат
        if (matches.length > 0) {
          patterns.push({
            patternIndex: i,
            pattern: pattern,
            matches: matches
          });
        }
      }
      
      return patterns;
    }
    
    /**
     * Обчислює схожість між двома патернами
     * @param {number[]} pattern1 - Перший патерн
     * @param {number[]} pattern2 - Другий патерн
     * @returns {number} - Схожість (0-1)
     */
    static calculatePatternSimilarity(pattern1, pattern2) {
      if (pattern1.length !== pattern2.length) {
        throw new Error('Patterns must have the same length');
      }
      
      // Нормалізуємо патерни
      const mean1 = pattern1.reduce((sum, x) => sum + x, 0) / pattern1.length;
      const mean2 = pattern2.reduce((sum, x) => sum + x, 0) / pattern2.length;
      
      const norm1 = pattern1.map(x => x - mean1);
      const norm2 = pattern2.map(x => x - mean2);
      
      // Обчислюємо кореляцію
      let numerator = 0;
      let denom1 = 0;
      let denom2 = 0;
      
      for (let i = 0; i < norm1.length; i++) {
        numerator += norm1[i] * norm2[i];
        denom1 += norm1[i] * norm1[i];
        denom2 += norm2[i] * norm2[i];
      }
      
      const denominator = Math.sqrt(denom1 * denom2);
      
      if (denominator === 0) return 0;
      
      return Math.abs(numerator / denominator);
    }
  }