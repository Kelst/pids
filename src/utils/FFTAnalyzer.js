/**
 * Клас для виконання FFT аналізу на даних гіроскопа
 */
export class FFTAnalyzer {
    constructor() {
      // Константи для аналізу частотних діапазонів
      this.FREQ_BANDS = [
        { name: 'низькі частоти', min: 5, max: 50, source: 'рамою або проблемами монтажу' },
        { name: 'середні частоти', min: 50, max: 150, source: 'пропелерами або моторами' },
        { name: 'високі частоти', min: 150, max: 300, source: 'електричним шумом або підшипниками' },
        { name: 'дуже високі частоти', min: 300, max: 600, source: 'проблемами ESC або PWM' }
      ];
    }
  
    /**
     * Виконує FFT аналіз даних гіроскопа
     * @param {number[]} gyroData - Дані гіроскопа по одній осі
     * @param {number} sampleRate - Частота дискретизації в Гц
     * @returns {Object} - Результати аналізу
     */
    analyzeGyroData(gyroData, sampleRate) {
      if (!gyroData || gyroData.length < 32) {
        console.warn("Недостатньо даних для FFT аналізу");
        return { resonanceFrequencies: [], dominantFrequency: 0 };
      }
  
      // Підготовка даних (видалення постійної складової)
      const data = this._prepareData(gyroData);
      
      // Виконання FFT
      const fftResult = this._computeFFT(data);
      
      // Отримання частотного спектру
      const spectrum = this._getFrequencySpectrum(fftResult, sampleRate, data.length);
      
      // Знаходження резонансних піків
      const peaks = this._findPeaks(spectrum);
      
      // Аналіз діапазонів частот
      const bandAnalysis = this._analyzeBands(spectrum);
      
      // Обчислення рівня шуму
      const noiseLevel = this._calculateNoiseLevel(spectrum);
      
      return {
        resonanceFrequencies: peaks,
        dominantFrequency: peaks.length > 0 ? peaks[0].frequency : 0,
        spectrum: spectrum,
        bandAnalysis: bandAnalysis,
        noiseLevel: noiseLevel
      };
    }
  
    /**
     * Підготовка даних для FFT (видалення постійної складової та нормалізація)
     * @param {number[]} data - Вхідні дані
     * @returns {number[]} - Підготовлені дані
     */
    _prepareData(data) {
      // Копіюємо вхідні дані, щоб не змінювати оригінал
      const preparedData = [...data];
      
      // Видаляємо NaN та Infinity
      const validData = preparedData.filter(val => 
        !isNaN(val) && isFinite(val)
      );
      
      if (validData.length === 0) {
        return new Array(32).fill(0);
      }
      
      // Знаходимо середнє значення (DC компонент)
      const mean = validData.reduce((sum, val) => sum + val, 0) / validData.length;
      
      // Віднімаємо середнє значення від кожного елемента
      const dcRemovedData = validData.map(val => val - mean);
      
      // Застосовуємо вікно Хеннінга для зменшення спектральних витоків
      return this._applyWindow(dcRemovedData);
    }
  
    /**
     * Застосовує вікно Хеннінга до даних для зменшення спектральних витоків
     * @param {number[]} data - Вхідні дані
     * @returns {number[]} - Дані з застосованим вікном
     */
    _applyWindow(data) {
      const windowedData = [];
      const n = data.length;
      
      for (let i = 0; i < n; i++) {
        // Коефіцієнт вікна Хеннінга
        const windowCoeff = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        windowedData.push(data[i] * windowCoeff);
      }
      
      return windowedData;
    }
  
    /**
     * Обчислює FFT для даних
     * @param {number[]} data - Вхідні дані
     * @returns {Object} - Комплексні результати FFT
     */
    _computeFFT(data) {
      // Для кращої ефективності FFT, доповнюємо дані до найближчої степені 2
      const paddedLength = this._nextPowerOf2(data.length);
      const paddedData = [...data];
      
      // Доповнюємо нулями
      while (paddedData.length < paddedLength) {
        paddedData.push(0);
      }
      
      // Створюємо комплексні дані (реальна та уявна частини)
      const complexData = paddedData.map(val => ({ re: val, im: 0 }));
      
      // Виконуємо FFT
      return this._fft(complexData);
    }
  
    /**
     * Знаходить найближчу степінь 2, що більша або рівна заданому числу
     * @param {number} n - Число
     * @returns {number} - Найближча степінь 2
     */
    _nextPowerOf2(n) {
      return Math.pow(2, Math.ceil(Math.log2(n)));
    }
  
    /**
     * Реалізація алгоритму FFT (Fast Fourier Transform)
     * Використовує алгоритм Cooley-Tukey
     * @param {Object[]} data - Комплексні дані (масив об'єктів з re та im)
     * @returns {Object[]} - Результат FFT
     */
    _fft(data) {
      const n = data.length;
      
      // Базовий випадок
      if (n === 1) {
        return data;
      }
      
      // Розділяємо на парні та непарні індекси
      const even = [];
      const odd = [];
      
      for (let i = 0; i < n; i += 2) {
        even.push(data[i]);
        if (i + 1 < n) {
          odd.push(data[i + 1]);
        }
      }
      
      // Рекурсивно обчислюємо FFT для парних та непарних частин
      const evenFFT = this._fft(even);
      const oddFFT = this._fft(odd);
      
      // Об'єднуємо результати
      const result = new Array(n);
      
      for (let k = 0; k < n / 2; k++) {
        // Множник повороту (twiddle factor)
        const theta = -2 * Math.PI * k / n;
        const re = Math.cos(theta);
        const im = Math.sin(theta);
        
        // Множення комплексних чисел: oddFFT[k] * (re + im * i)
        const oddRe = oddFFT[k].re * re - oddFFT[k].im * im;
        const oddIm = oddFFT[k].re * im + oddFFT[k].im * re;
        
        // Перша половина результату
        result[k] = {
          re: evenFFT[k].re + oddRe,
          im: evenFFT[k].im + oddIm
        };
        
        // Друга половина результату
        result[k + n / 2] = {
          re: evenFFT[k].re - oddRe,
          im: evenFFT[k].im - oddIm
        };
      }
      
      return result;
    }
  
    /**
     * Перетворює результат FFT у частотний спектр
     * @param {Object[]} fftResult - Результат FFT
     * @param {number} sampleRate - Частота дискретизації
     * @param {number} originalLength - Оригінальна довжина даних
     * @returns {Object[]} - Частотний спектр
     */
    _getFrequencySpectrum(fftResult, sampleRate, originalLength) {
      const n = fftResult.length;
      const spectrum = [];
      
      // Використовуємо тільки першу половину FFT (симетрія)
      const usefulBins = Math.ceil(n / 2);
      
      for (let i = 0; i < usefulBins; i++) {
        // Обчислюємо частоту для біна
        const frequency = i * sampleRate / n;
        
        // Обчислюємо амплітуду (модуль комплексного числа)
        // |z| = sqrt(re^2 + im^2)
        const amplitude = Math.sqrt(
          fftResult[i].re * fftResult[i].re + 
          fftResult[i].im * fftResult[i].im
        ) / originalLength; // Нормалізація
        
        spectrum.push({ frequency, amplitude });
      }
      
      return spectrum;
    }
  
    /**
     * Знаходить піки у частотному спектрі
     * @param {Object[]} spectrum - Частотний спектр
     * @returns {Object[]} - Піки, відсортовані за амплітудою
     */
    _findPeaks(spectrum) {
      const peaks = [];
      const THRESHOLD_FACTOR = 0.1; // Поріг для вважання піком
      
      // Знаходимо максимальну амплітуду для розрахунку порогу
      let maxAmplitude = 0;
      for (const bin of spectrum) {
        if (bin.amplitude > maxAmplitude) {
          maxAmplitude = bin.amplitude;
        }
      }
      
      const threshold = maxAmplitude * THRESHOLD_FACTOR;
      
      // Шукаємо локальні максимуми
      for (let i = 1; i < spectrum.length - 1; i++) {
        const prev = spectrum[i - 1].amplitude;
        const current = spectrum[i].amplitude;
        const next = spectrum[i + 1].amplitude;
        
        // Перевіряємо, чи це локальний максимум і чи він вище порогу
        if (current > prev && current > next && current > threshold) {
          // Ігноруємо дуже низькі частоти (DC та близькі до нього)
          if (spectrum[i].frequency > 5) {
            peaks.push({
              frequency: spectrum[i].frequency,
              amplitude: current
            });
          }
        }
      }
      
      // Сортуємо піки за амплітудою (від найбільшої до найменшої)
      return peaks.sort((a, b) => b.amplitude - a.amplitude);
    }
  
    /**
     * Аналізує енергію в різних частотних діапазонах
     * @param {Object[]} spectrum - Частотний спектр
     * @returns {Object[]} - Аналіз по діапазонах
     */
    _analyzeBands(spectrum) {
      const bandAnalysis = [];
      
      for (const band of this.FREQ_BANDS) {
        // Фільтруємо біни, що входять у діапазон
        const binsInBand = spectrum.filter(bin => 
          bin.frequency >= band.min && bin.frequency <= band.max
        );
        
        // Сума енергії у діапазоні
        const energy = binsInBand.reduce((sum, bin) => sum + bin.amplitude, 0);
        
        // Знаходимо максимальний пік у діапазоні
        let maxPeak = { frequency: 0, amplitude: 0 };
        for (const bin of binsInBand) {
          if (bin.amplitude > maxPeak.amplitude) {
            maxPeak = bin;
          }
        }
        
        // Оцінка "проблемності" діапазону (0-10)
        // Більше значення означає більше проблем у цьому діапазоні
        const severity = Math.min(10, energy * 20);
        
        bandAnalysis.push({
          name: band.name,
          min: band.min,
          max: band.max,
          energy: energy,
          maxPeak: maxPeak,
          severity: severity,
          source: band.source
        });
      }
      
      // Сортуємо за "проблемністю"
      return bandAnalysis.sort((a, b) => b.severity - a.severity);
    }
  
    /**
     * Обчислює загальний рівень шуму на основі спектру
     * @param {Object[]} spectrum - Частотний спектр
     * @returns {number} - Рівень шуму
     */
    _calculateNoiseLevel(spectrum) {
      // Видаляємо дуже низькі частоти (DC компонент)
      const filteredSpectrum = spectrum.filter(bin => bin.frequency > 5);
      
      if (filteredSpectrum.length === 0) {
        return 0;
      }
      
      // Обчислюємо середню амплітуду
      const totalEnergy = filteredSpectrum.reduce((sum, bin) => sum + bin.amplitude, 0);
      
      // Нормалізуємо до шкали 0-100
      return Math.min(100, totalEnergy * 100);
    }
  }