/**
 * Клас для FFT аналізу даних гіроскопа з виявленням резонансних частот
 */
export class FFTAnalyzer {
    /**
     * Аналізує дані гіроскопа використовуючи FFT для виявлення частот шуму
     * @param {number[]} gyroData - Масив даних гіроскопа
     * @param {number} sampleRate - Частота дискретизації в Гц (зазвичай 1000-2000 для Betaflight)
     * @returns {Object} - Результати FFT аналізу
     */
    analyzeGyroData(gyroData, sampleRate = 1000) {
      if (!gyroData || gyroData.length < 32) {
        console.warn("Недостатньо даних для FFT аналізу");
        return {
          resonanceFrequencies: [],
          dominantFrequency: 0,
          noiseLevel: 0
        };
      }
  
      try {
        // Підготувати дані для FFT (кількість точок повинна бути ступенем 2)
        const fftSize = this.getNextPowerOfTwo(gyroData.length);
        const paddedData = this.padArray(gyroData, fftSize);
        
        // Застосувати вікно (window function) для зменшення витоку спектру
        const windowedData = this.applyHannWindow(paddedData);
        
        // Виконати FFT
        const fftResult = this.computeFFT(windowedData);
        
        // Аналізувати результати FFT
        const freqBins = this.getFrequencyBins(fftResult, sampleRate);
        
        // Виявити резонансні піки
        const peaks = this.findPeaks(freqBins);
        
        // Оцінити загальний рівень шуму
        const noiseLevel = this.estimateNoiseLevel(freqBins);
        
        // Аналіз по частотних діапазонах
        const bandAnalysis = this.analyzeBands(freqBins);
        
        // Визначити домінантну частоту
        const dominantFrequency = peaks.length > 0 ? peaks[0].frequency : 0;
        
        return {
          resonanceFrequencies: peaks,
          dominantFrequency,
          noiseLevel,
          bandAnalysis,
          spectrum: freqBins
        };
      } catch (error) {
        console.error("Помилка під час FFT аналізу:", error);
        return {
          resonanceFrequencies: [],
          dominantFrequency: 0,
          noiseLevel: 0
        };
      }
    }
    
    /**
     * Знаходить наступне число, яке є ступенем 2
     * @param {number} n - Початкове число
     * @returns {number} - Наступний ступінь 2
     */
    getNextPowerOfTwo(n) {
      return Math.pow(2, Math.ceil(Math.log2(n)));
    }
    
    /**
     * Доповнює масив нулями до заданого розміру
     * @param {number[]} array - Вхідний масив
     * @param {number} size - Необхідний розмір
     * @returns {number[]} - Доповнений масив
     */
    padArray(array, size) {
      const result = new Array(size).fill(0);
      for (let i = 0; i < Math.min(array.length, size); i++) {
        result[i] = array[i];
      }
      return result;
    }
    
    /**
     * Застосовує вікно Хана (Hann window) до даних
     * @param {number[]} data - Вхідні дані
     * @returns {number[]} - Дані після застосування вікна
     */
    applyHannWindow(data) {
      const result = new Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const windowCoef = 0.5 * (1 - Math.cos(2 * Math.PI * i / (data.length - 1)));
        result[i] = data[i] * windowCoef;
      }
      return result;
    }
    
    /**
     * Обчислює FFT (швидке перетворення Фур'є)
     * Це спрощена реалізація, в реальному застосуванні варто використовувати оптимізовану бібліотеку
     * @param {number[]} data - Вхідні дані
     * @returns {Object} - Результати FFT (дійсна та уявна частини)
     */
    computeFFT(data) {
      const n = data.length;
      
      // Для малих розмірів використовуємо пряме обчислення DFT
      if (n <= 4) {
        return this.computeDFT(data);
      }
      
      // FFT використовує рекурсивний алгоритм "розділяй і володарюй"
      const evenData = [];
      const oddData = [];
      
      for (let i = 0; i < n / 2; i++) {
        evenData.push(data[i * 2]);
        oddData.push(data[i * 2 + 1]);
      }
      
      const evenFFT = this.computeFFT(evenData);
      const oddFFT = this.computeFFT(oddData);
      
      const result = {
        real: new Array(n),
        imag: new Array(n)
      };
      
      for (let k = 0; k < n / 2; k++) {
        // Обчислення фазового множника (twiddle factor)
        const angle = -2 * Math.PI * k / n;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Множення фазового множника на компоненти FFT для непарних індексів
        const oddRealK = oddFFT.real[k] * cos - oddFFT.imag[k] * sin;
        const oddImagK = oddFFT.real[k] * sin + oddFFT.imag[k] * cos;
        
        // Об'єднання результатів
        result.real[k] = evenFFT.real[k] + oddRealK;
        result.imag[k] = evenFFT.imag[k] + oddImagK;
        
        result.real[k + n / 2] = evenFFT.real[k] - oddRealK;
        result.imag[k + n / 2] = evenFFT.imag[k] - oddImagK;
      }
      
      return result;
    }
    
    /**
     * Обчислює DFT (дискретне перетворення Фур'є) - базове перетворення для FFT
     * @param {number[]} data - Вхідні дані
     * @returns {Object} - Результати DFT (дійсна та уявна частини)
     */
    computeDFT(data) {
      const n = data.length;
      const result = {
        real: new Array(n).fill(0),
        imag: new Array(n).fill(0)
      };
      
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < n; t++) {
          const angle = -2 * Math.PI * k * t / n;
          result.real[k] += data[t] * Math.cos(angle);
          result.imag[k] += data[t] * Math.sin(angle);
        }
      }
      
      return result;
    }
    
    /**
     * Перетворює результати FFT у частотні діапазони
     * @param {Object} fftResult - Результати FFT
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Array} - Масив частотних діапазонів з амплітудами
     */
    getFrequencyBins(fftResult, sampleRate) {
      const n = fftResult.real.length;
      const result = [];
      
      // Розраховуємо лише до половини, оскільки друга половина - це дзеркальне відображення
      const numBins = Math.floor(n / 2);
      
      for (let i = 0; i < numBins; i++) {
        // Обчислюємо частоту для кожного біна
        const frequency = i * sampleRate / n;
        
        // Обчислюємо амплітуду (magnitude)
        const magnitude = Math.sqrt(
          fftResult.real[i] * fftResult.real[i] + 
          fftResult.imag[i] * fftResult.imag[i]
        );
        
        // Нормалізуємо амплітуду
        const normalizedMagnitude = magnitude / (n / 2);
        
        result.push({
          frequency,
          magnitude: normalizedMagnitude
        });
      }
      
      return result;
    }
    
    /**
     * Знаходить піки в спектрі частот
     * @param {Array} freqBins - Масив частотних діапазонів
     * @returns {Array} - Масив виявлених піків, відсортованих за амплітудою
     */
    findPeaks(freqBins) {
      const peaks = [];
      
      // Обчислюємо середню амплітуду для визначення порогу
      const magnitudes = freqBins.map(bin => bin.magnitude);
      const meanMagnitude = magnitudes.reduce((sum, mag) => sum + mag, 0) / magnitudes.length;
      const threshold = meanMagnitude * 3; // Поріг: в 3 рази більше за середню амплітуду
      
      // Ігноруємо перший бін (DC компонент) та дуже низькі частоти (до 10 Гц)
      for (let i = 2; i < freqBins.length - 1; i++) {
        if (freqBins[i].frequency < 10) continue;
        
        const prevBin = freqBins[i - 1];
        const currentBin = freqBins[i];
        const nextBin = freqBins[i + 1];
        
        // Перевіряємо, чи є це локальним максимумом
        if (currentBin.magnitude > prevBin.magnitude && 
            currentBin.magnitude > nextBin.magnitude &&
            currentBin.magnitude > threshold) {
          
          // Додаємо пік до результатів
          peaks.push({
            frequency: currentBin.frequency,
            amplitude: currentBin.magnitude
          });
        }
      }
      
      // Сортуємо піки за спаданням амплітуди
      return peaks.sort((a, b) => b.amplitude - a.amplitude);
    }
    
    /**
     * Оцінює загальний рівень шуму в спектрі
     * @param {Array} freqBins - Масив частотних діапазонів
     * @returns {number} - Рівень шуму
     */
    estimateNoiseLevel(freqBins) {
      // Беремо лише частоти вище 20 Гц для виключення низькочастотних рухів
      const relevantBins = freqBins.filter(bin => bin.frequency > 20 && bin.frequency < 500);
      
      if (relevantBins.length === 0) return 0;
      
      // Обчислюємо середню амплітуду як міру шуму
      const totalMagnitude = relevantBins.reduce((sum, bin) => sum + bin.magnitude, 0);
      return totalMagnitude / relevantBins.length * 100; // Масштабуємо для зручності
    }
    
    /**
     * Аналізує спектр по частотних діапазонах
     * @param {Array} freqBins - Масив частотних діапазонів
     * @returns {Array} - Результати аналізу по діапазонах
     */
    analyzeBands(freqBins) {
      // Визначаємо діапазони частот важливі для квадрокоптерів
      const bands = [
        { name: "Низькі частоти", min: 10, max: 80, source: "вібрація рами або проблеми балансування", severity: 0 },
        { name: "Середні частоти", min: 80, max: 180, source: "проблеми з пропелерами або підшипниками", severity: 0 },
        { name: "Високі частоти", min: 180, max: 300, source: "проблеми з моторами або електронікою", severity: 0 },
        { name: "Дуже високі частоти", min: 300, max: 500, source: "електричні перешкоди або проблеми з ESC", severity: 0 }
      ];
      
      // Аналізуємо потужність у кожному діапазоні
      for (const band of bands) {
        const bandBins = freqBins.filter(bin => 
          bin.frequency >= band.min && bin.frequency <= band.max
        );
        
        if (bandBins.length > 0) {
          // Обчислюємо середню і максимальну амплітуду в діапазоні
          const avgMagnitude = bandBins.reduce((sum, bin) => sum + bin.magnitude, 0) / bandBins.length;
          const maxMagnitude = Math.max(...bandBins.map(bin => bin.magnitude));
          
          // Встановлюємо важкість проблеми на основі амплітуди
          band.severity = avgMagnitude * 10 + maxMagnitude * 5;
          band.averageMagnitude = avgMagnitude;
          band.peakMagnitude = maxMagnitude;
        }
      }
      
      return bands;
    }
  }