/**
 * Клас для генерації покращених рекомендацій фільтрів на основі FFT аналізу
 */
export class AdvancedFilterRecommender {
    constructor() {
      // Константи для різних версій Betaflight
      this.BF_VERSIONS = {
        '4.2': {
          maxDynNotchQ: 250,
          defaultDTermLpf: 100,
          defaultGyroLpf: 120,
          supportsBandpassGyro: true,
          supportsBiQuadDTerm: true
        },
        '4.3': {
          maxDynNotchQ: 500,
          defaultDTermLpf: 150,
          defaultGyroLpf: 150,
          supportsBandpassGyro: true,
          supportsBiQuadDTerm: true,
          supportsDynLpf: true
        },
        '4.4': {
          maxDynNotchQ: 600,
          defaultDTermLpf: 150,
          defaultGyroLpf: 180,
          supportsBandpassGyro: true,
          supportsBiQuadDTerm: true,
          supportsDynLpf: true,
          supportsImprovedDynamicNotch: true
        }
      };
      
      // За замовчуванням використовуємо версію 4.3
      this.currentVersion = '4.3';
    }
    
    /**
     * Встановлює версію Betaflight для правильних рекомендацій
     * @param {string} version - Версія Betaflight
     */
    setVersion(version) {
      // Знаходимо найближчу підтримувану версію
      const versionNumber = parseFloat(version);
      
      if (versionNumber <= 4.2) {
        this.currentVersion = '4.2';
      } else if (versionNumber <= 4.3) {
        this.currentVersion = '4.3';
      } else {
        this.currentVersion = '4.4';
      }
      
      console.log(`Using settings for Betaflight ${this.currentVersion}`);
    }
    
    /**
     * Генерує рекомендації для фільтрів на основі FFT аналізу
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} noiseLevel - Загальний рівень шуму (0-100)
     * @param {Object} droneParams - Параметри дрона (опціонально)
     * @returns {Object} - Рекомендації для фільтрів
     */
    generateFilterRecommendations(fftAnalysis, noiseLevel, droneParams = {}) {
      // Отримуємо параметри для поточної версії
      const versionParams = this.BF_VERSIONS[this.currentVersion];
      
      // Результати рекомендацій
      const recommendations = {
        gyroLowpass: this._generateGyroLpfRecommendation(fftAnalysis, noiseLevel, versionParams),
        dtermLowpass: this._generateDTermLpfRecommendation(fftAnalysis, noiseLevel, versionParams),
        notchFilter: this._generateNotchRecommendation(fftAnalysis, noiseLevel, versionParams),
        additionalFilters: [],
        notes: []
      };
      
      // Додаткові рекомендації на основі аналізу частотних діапазонів
      if (fftAnalysis.bandAnalysis) {
        this._addAdditionalRecommendations(recommendations, fftAnalysis, noiseLevel, versionParams, droneParams);
      }
      
      return recommendations;
    }
    
    /**
     * Генерує рекомендації для гіроскопічного Low-Pass фільтра
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} noiseLevel - Загальний рівень шуму
     * @param {Object} versionParams - Параметри версії Betaflight
     * @returns {Object} - Рекомендації для гіро LPF
     */
    _generateGyroLpfRecommendation(fftAnalysis, noiseLevel, versionParams) {
      let filterType = 'PT1';
      let cutoff = versionParams.defaultGyroLpf;
      
      // Знаходимо найнижчу частоту піку, що більше 50 Гц (ігноруємо низькочастотні)
      const firstHighPeak = fftAnalysis.resonanceFrequencies.find(peak => peak.frequency > 50);
      
      // Якщо немає доступних піків, використовуємо рівень шуму для оцінки
      if (!firstHighPeak) {
        if (noiseLevel > 50) {
          cutoff = 90; // Сильне фільтрування для високого шуму
        } else if (noiseLevel > 25) {
          cutoff = 120; // Середнє фільтрування для середнього шуму
        } else {
          cutoff = 150; // Слабке фільтрування для низького шуму
        }
      } else {
        // Розраховуємо частоту зрізу на 30% нижче першого піку
        // але не нижче 80 Гц і не вище 200 Гц
        cutoff = Math.max(80, Math.min(200, Math.round(firstHighPeak.frequency * 0.7)));
        
        // Для більшого шуму використовуємо більш агресивний фільтр
        if (noiseLevel > 50) {
          filterType = 'BIQUAD';
        }
      }
      
      // Динамічний LPF для новіших версій
      let dynamicLpf = null;
      if (versionParams.supportsDynLpf && noiseLevel > 20) {
        dynamicLpf = {
          min: Math.max(80, Math.round(cutoff * 0.7)),
          max: Math.min(500, Math.round(cutoff * 1.5))
        };
      }
      
      return {
        type: filterType,
        cutoff: cutoff,
        dynamicLpf: dynamicLpf,
        command: dynamicLpf ? 
          `set gyro_lowpass_type = ${filterType}\nset gyro_lowpass_hz = 0\nset dyn_lpf_gyro_min_hz = ${dynamicLpf.min}\nset dyn_lpf_gyro_max_hz = ${dynamicLpf.max}` :
          `set gyro_lowpass_type = ${filterType}\nset gyro_lowpass_hz = ${cutoff}`
      };
    }
    
    /**
     * Генерує рекомендації для D-Term Low-Pass фільтра
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} noiseLevel - Загальний рівень шуму
     * @param {Object} versionParams - Параметри версії Betaflight
     * @returns {Object} - Рекомендації для D-Term LPF
     */
    _generateDTermLpfRecommendation(fftAnalysis, noiseLevel, versionParams) {
      // D-term фільтр зазвичай нижче, ніж гіро фільтр
      let filterType = 'PT1';
      let cutoff = versionParams.defaultDTermLpf;
      
      // Знаходимо найнижчу частоту піку, що більше 40 Гц
      const firstHighPeak = fftAnalysis.resonanceFrequencies.find(peak => peak.frequency > 40);
      
      // Якщо немає доступних піків, використовуємо рівень шуму для оцінки
      if (!firstHighPeak) {
        if (noiseLevel > 50) {
          cutoff = 70; // Сильне фільтрування для високого шуму
        } else if (noiseLevel > 25) {
          cutoff = 100; // Середнє фільтрування для середнього шуму
        } else {
          cutoff = 120; // Слабке фільтрування для низького шуму
        }
      } else {
        // D-term фільтр ще нижче, ніж гіро, десь 60% від першого піку
        cutoff = Math.max(60, Math.min(150, Math.round(firstHighPeak.frequency * 0.6)));
        
        // Для більшого шуму використовуємо більш агресивний фільтр
        if (noiseLevel > 40 && versionParams.supportsBiQuadDTerm) {
          filterType = 'BIQUAD';
        }
      }
      
      // Динамічний LPF для D-term
      let dynamicLpf = null;
      if (versionParams.supportsDynLpf && noiseLevel > 30) {
        dynamicLpf = {
          min: Math.max(60, Math.round(cutoff * 0.7)),
          max: Math.min(250, Math.round(cutoff * 1.3))
        };
      }
      
      return {
        type: filterType,
        cutoff: cutoff,
        dynamicLpf: dynamicLpf,
        command: dynamicLpf ? 
          `set dterm_lowpass_type = ${filterType}\nset dterm_lowpass_hz = 0\nset dyn_lpf_dterm_min_hz = ${dynamicLpf.min}\nset dyn_lpf_dterm_max_hz = ${dynamicLpf.max}` :
          `set dterm_lowpass_type = ${filterType}\nset dterm_lowpass_hz = ${cutoff}`
      };
    }
    
    /**
     * Генерує рекомендації для Notch фільтра
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} noiseLevel - Загальний рівень шуму
     * @param {Object} versionParams - Параметри версії Betaflight
     * @returns {Object} - Рекомендації для Notch фільтра
     */
    _generateNotchRecommendation(fftAnalysis, noiseLevel, versionParams) {
      // Якщо рівень шуму низький, notch фільтр не потрібен
      if (noiseLevel < 20 || !fftAnalysis.resonanceFrequencies || fftAnalysis.resonanceFrequencies.length === 0) {
        return {
          enabled: false,
          command: 'set dyn_notch_enable = OFF'
        };
      }
      
      // Підготуємо рекомендації для динамічного notch фільтра
      const recommendation = {
        enabled: true,
        type: 'dynamic',
        q: versionParams.maxDynNotchQ, // Q-фактор
        centerFreq: 0,
        minFreq: 0,
        maxFreq: 0,
        command: ''
      };
      
      // Для версії 4.4+ використовуємо покращений динамічний notch
      if (versionParams.supportsImprovedDynamicNotch) {
        // Визначаємо діапазон частот на основі аналізу шуму
        const minFreq = Math.max(80, Math.round(fftAnalysis.resonanceFrequencies[0].frequency * 0.5));
        const maxFreq = Math.min(500, Math.round(fftAnalysis.resonanceFrequencies[0].frequency * 2));
        
        // Додаємо розширені параметри
        recommendation.minFreq = minFreq;
        recommendation.maxFreq = maxFreq;
        recommendation.width = Math.round((maxFreq - minFreq) / 2);
        
        recommendation.command = `set dyn_notch_enable = ON\nset dyn_notch_count = 3\nset dyn_notch_q = ${recommendation.q}\nset dyn_notch_min_hz = ${minFreq}\nset dyn_notch_max_hz = ${maxFreq}`;
        
        // Для високого шуму збільшуємо кількість notch фільтрів
        if (noiseLevel > 60) {
          recommendation.command = recommendation.command.replace('count = 3', 'count = 5');
        }
      } else {
        // Для старих версій конфігуруємо простіший динамічний notch
        const centerFreq = Math.round(fftAnalysis.resonanceFrequencies[0].frequency);
        const width = Math.max(20, Math.round(centerFreq * 0.15)); // 15% ширина або мінімум 20 Гц
        
        recommendation.centerFreq = centerFreq;
        recommendation.width = width;
        
        recommendation.command = `set dyn_notch_enable = ON\nset dyn_notch_width_percent = ${Math.round(width / centerFreq * 100)}\nset dyn_notch_q = ${recommendation.q}\nset dyn_notch_min_hz = ${Math.max(80, centerFreq - width)}\nset dyn_notch_max_hz = ${centerFreq + width * 2}`;
      }
      
      return recommendation;
    }
    
    /**
     * Додає додаткові рекомендації на основі аналізу діапазонів
     * @param {Object} recommendations - Поточні рекомендації
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} noiseLevel - Загальний рівень шуму
     * @param {Object} versionParams - Параметри версії Betaflight
     * @param {Object} droneParams - Параметри дрона
     */
    _addAdditionalRecommendations(recommendations, fftAnalysis, noiseLevel, versionParams, droneParams) {
      const bandAnalysis = fftAnalysis.bandAnalysis;
      
      // Додаємо рекомендації на основі проблемних діапазонів
      for (const band of bandAnalysis) {
        if (band.severity > 7) {
          // Для дуже проблемних низьких частот
          if (band.name === 'низькі частоти' && band.severity > 8) {
            recommendations.additionalFilters.push({
              title: 'Статичний Notch для низьких частот',
              description: `Додатковий статичний notch для проблемної частоти ${Math.round(band.maxPeak.frequency)} Гц (пов'язано з ${band.source})`,
              command: `set gyro_notch1_enable = ON\nset gyro_notch1_hz = ${Math.round(band.maxPeak.frequency)}\nset gyro_notch1_cutoff = ${Math.round(band.maxPeak.frequency * 0.7)}`
            });
            
            recommendations.notes.push(`Виявлено значний шум на низьких частотах (${band.min}-${band.max} Гц). Перевірте кріплення FC, баланс пропелерів та моторів.`);
          }
          
          // Для проблемних середніх частот (типово від пропелерів)
          else if (band.name === 'середні частоти' && band.severity > 7) {
            if (!recommendations.notchFilter.enabled) {
              recommendations.additionalFilters.push({
                title: 'Статичний Notch для пропелерів',
                description: `Додатковий notch для проблемної частоти пропелерів ${Math.round(band.maxPeak.frequency)} Гц`,
                command: `set gyro_notch1_enable = ON\nset gyro_notch1_hz = ${Math.round(band.maxPeak.frequency)}\nset gyro_notch1_cutoff = ${Math.round(band.maxPeak.frequency * 0.65)}`
              });
            }
            
            recommendations.notes.push(`Виявлено шум від пропелерів (${band.min}-${band.max} Гц). Перевірте стан пропелерів, можливо, потрібна заміна.`);
          }
          
          // Для проблемних високих частот (типово від моторів/ESC)
          else if ((band.name === 'високі частоти' || band.name === 'дуже високі частоти') && band.severity > 7) {
            recommendations.additionalFilters.push({
              title: 'RPM фільтр',
              description: 'Рекомендується увімкнути RPM фільтр для більш ефективного усунення шуму моторів',
              command: `set dshot_bidir = ON\nset motor_pwm_protocol = DSHOT600\nset rpm_filter_harmonics = 3\nset dyn_notch_enable = OFF # Вимикаємо, якщо використовуємо RPM фільтр`
            });
            
            recommendations.notes.push(`Виявлено шум від моторів/ESC (${band.min}-${band.max} Гц). RPM фільтр може значно покращити ситуацію.`);
          }
        }
      }
      
      // Додаємо загальні рекомендації на основі рівня шуму
      if (noiseLevel > 70) {
        recommendations.notes.push('Дуже високий рівень шуму! Рекомендується перевірити механічні проблеми перед налаштуванням PID.');
        
        // Додаємо другий D-term фільтр для дуже шумних систем
        recommendations.additionalFilters.push({
          title: 'Другий D-term фільтр',
          description: 'Додатковий фільтр для D складової для запобігання гарячих моторів',
          command: `set dterm_lowpass2_type = PT1\nset dterm_lowpass2_hz = ${Math.round(recommendations.dtermLowpass.cutoff * 0.7)}`
        });
      }
      
      // Враховуємо параметри дрона, якщо вони доступні
      if (droneParams.weight && droneParams.weight > 500) {
        recommendations.notes.push(`Важкий дрон (${droneParams.weight}г). Збільшена I складова може покращити стабільність.`);
      }
    }
  }