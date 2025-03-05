/**
 * Клас для генерації оптимальних налаштувань фільтрів на основі FFT аналізу
 */
export class FilterTuner {
    /**
     * Генерує рекомендації для фільтрів на основі FFT аналізу та профілю польоту
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {Object} flightProfile - Інформація про профіль польоту
     * @param {number} currentVersion - Версія Betaflight (4.2, 4.3, 4.4)
     * @returns {Object} - Рекомендації для фільтрів
     */
    generateFilterRecommendations(fftAnalysis, flightProfile, currentVersion = 4.3) {
      try {
        const recommendations = {
          gyro: {},
          dterm: {},
          dynamic_notch: {},
          rpm_filter: {},
          notes: []
        };
        
        // Розрахунок базових частот фільтрів на основі FFT
        const filterFreqs = this.calculateBaseFilterFrequencies(fftAnalysis);
        
        // Коригування частот на основі профілю польоту
        const adjustedFreqs = this.adjustFrequenciesForFlightProfile(
          filterFreqs, 
          flightProfile
        );
        
        // Налаштування фільтрів гіроскопа
        recommendations.gyro = this.configureGyroFilters(adjustedFreqs, currentVersion);
        
        // Налаштування фільтрів D-терму
        recommendations.dterm = this.configureDtermFilters(adjustedFreqs, currentVersion);
        
        // Налаштування динамічного notch-фільтру
        recommendations.dynamic_notch = this.configureDynamicNotch(fftAnalysis, currentVersion);
        
        // Налаштування RPM-фільтру (якщо доступно у цій версії)
        if (currentVersion >= 4.2) {
          recommendations.rpm_filter = this.configureRPMFilter(currentVersion);
        }
        
        // Додаємо примітки щодо налаштувань
        recommendations.notes = this.generateFilterNotes(fftAnalysis, flightProfile);
        
        // Генеруємо повний набір CLI команд для фільтрів
        recommendations.commands = this.generateFilterCommands(recommendations, currentVersion);
        
        return recommendations;
      } catch (error) {
        console.error("Помилка генерації рекомендацій для фільтрів:", error);
        return this.getDefaultFilterRecommendations(currentVersion);
      }
    }
    
    /**
     * Обчислює базові частоти фільтрів на основі FFT аналізу
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @returns {Object} - Базові частоти фільтрів
     */
    calculateBaseFilterFrequencies(fftAnalysis) {
      // За замовчуванням
      const defaults = {
        gyroLpfFreq: 120,
        dtermLpfFreq: 100,
        notchCenterFreq: 200,
        notchBandwidth: 40
      };
      
      // Якщо немає даних FFT, повертаємо значення за замовчуванням
      if (!fftAnalysis || !fftAnalysis.resonanceFrequencies || fftAnalysis.resonanceFrequencies.length === 0) {
        return defaults;
      }
      
      // Отримуємо домінантну частоту шуму
      const dominantFreq = fftAnalysis.dominantFrequency || 0;
      
      // Визначаємо нижню межу шуму як мінімальну з резонансних частот або 80 Гц
      const lowestNoiseFreq = Math.max(
        80, 
        Math.min(
          ...fftAnalysis.resonanceFrequencies.map(peak => peak.frequency),
          dominantFreq
        )
      );
      
      // Визначаємо частоту LPF гіроскопа
      // Встановлюємо трохи нижче найнижчої частоти шуму для кращої фільтрації
      const gyroLpfFreq = Math.max(70, Math.min(150, Math.floor(lowestNoiseFreq * 0.9)));
      
      // D-term LPF зазвичай встановлюють нижче, ніж LPF гіроскопа
      const dtermLpfFreq = Math.max(60, Math.min(120, Math.floor(gyroLpfFreq * 0.85)));
      
      // Налаштування notch-фільтра для домінантної частоти
      const notchCenterFreq = dominantFreq > 0 ? Math.round(dominantFreq) : defaults.notchCenterFreq;
      
      // Ширина смуги notch-фільтра (приблизно 20% від центральної частоти)
      const notchBandwidth = Math.max(20, Math.round(notchCenterFreq * 0.2));
      
      return {
        gyroLpfFreq,
        dtermLpfFreq,
        notchCenterFreq,
        notchBandwidth
      };
    }
    
    /**
     * Коригує частоти фільтрів з урахуванням профілю польоту
     * @param {Object} filterFreqs - Базові частоти фільтрів
     * @param {Object} flightProfile - Інформація про профіль польоту
     * @returns {Object} - Скориговані частоти фільтрів
     */
    adjustFrequenciesForFlightProfile(filterFreqs, flightProfile) {
      // Копіюємо вхідні частоти
      const adjusted = { ...filterFreqs };
      
      // Якщо немає даних профілю, повертаємо без змін
      if (!flightProfile || !flightProfile.flightStyle) {
        return adjusted;
      }
      
      // Отримуємо множники для фільтрів на основі стилю польоту
      const filterAdjustments = flightProfile.filterAdjustments || { gyro: 1.0, dterm: 1.0 };
      
      // Коригуємо частоти фільтрів з урахуванням стилю польоту
      adjusted.gyroLpfFreq = Math.round(adjusted.gyroLpfFreq * filterAdjustments.gyro);
      adjusted.dtermLpfFreq = Math.round(adjusted.dtermLpfFreq * filterAdjustments.dterm);
      
      // Обмежуємо значення розумними межами
      adjusted.gyroLpfFreq = Math.max(60, Math.min(160, adjusted.gyroLpfFreq));
      adjusted.dtermLpfFreq = Math.max(50, Math.min(130, adjusted.dtermLpfFreq));
      
      return adjusted;
    }
    
    /**
     * Налаштовує фільтри гіроскопа
     * @param {Object} freqs - Частоти фільтрів
     * @param {number} version - Версія Betaflight
     * @returns {Object} - Налаштування фільтрів гіроскопа
     */
    configureGyroFilters(freqs, version) {
      const gyroFilters = {
        lowpass_type: "PT1",
        lowpass_hz: freqs.gyroLpfFreq
      };
      
      // Додаткові налаштування для новіших версій
      if (version >= 4.3) {
        // В Betaflight 4.3+ доступні додаткові опції
        gyroFilters.lowpass2_type = "PT1";
        gyroFilters.lowpass2_hz = Math.round(freqs.gyroLpfFreq * 1.5);
        
        // Налаштування ABG-фільтру для новіших версій
        if (freqs.gyroLpfFreq < 90) {
          // Для низьких частот LPF рекомендується вмикати ABG
          gyroFilters.abg_alpha = 0.5;
          gyroFilters.abg_boost = 1.5;
        }
      }
      
      return gyroFilters;
    }
    
    /**
     * Налаштовує фільтри D-терму
     * @param {Object} freqs - Частоти фільтрів
     * @param {number} version - Версія Betaflight
     * @returns {Object} - Налаштування фільтрів D-терму
     */
    configureDtermFilters(freqs, version) {
      const dtermFilters = {
        lowpass_type: "PT1",
        lowpass_hz: freqs.dtermLpfFreq
      };
      
      // Додаткові налаштування для новіших версій
      if (version >= 4.3) {
        dtermFilters.lowpass2_type = "PT1";
        dtermFilters.lowpass2_hz = Math.round(freqs.dtermLpfFreq * 1.4);
        
        // Налаштування D_min для зменшення шуму D-терму на високих PID
        if (freqs.dtermLpfFreq < 80) {
          dtermFilters.d_min_roll = 22;
          dtermFilters.d_min_pitch = 24;
          dtermFilters.d_min_boost = 20;
        }
      }
      
      return dtermFilters;
    }
    
    /**
     * Налаштовує динамічний notch-фільтр
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {number} version - Версія Betaflight
     * @returns {Object} - Налаштування динамічного notch-фільтру
     */
    configureDynamicNotch(fftAnalysis, version) {
      // Базові налаштування
      const notchConfig = {
        enabled: 1,
        q: 250,
        min_hz: 80,
        max_hz: 500
      };
      
      if (!fftAnalysis || !fftAnalysis.resonanceFrequencies || fftAnalysis.resonanceFrequencies.length === 0) {
        return notchConfig;
      }
      
      // Отримуємо домінантну частоту шуму
      const dominantFreq = fftAnalysis.dominantFrequency || 200;
      
      // Налаштовуємо динамічний notch-фільтр на основі FFT-аналізу
      notchConfig.min_hz = Math.max(80, Math.round(dominantFreq * 0.7));
      notchConfig.max_hz = Math.min(600, Math.round(dominantFreq * 1.5));
      
      // В новіших версіях Betaflight доступні кілька notch-фільтрів
      if (version >= 4.3) {
        notchConfig.count = 3; // Кількість notch-фільтрів
        
        // Якщо виявлено кілька піків шуму
        if (fftAnalysis.resonanceFrequencies.length >= 2) {
          const peak1 = fftAnalysis.resonanceFrequencies[0].frequency;
          const peak2 = fftAnalysis.resonanceFrequencies[1].frequency;
          
          // Якщо піки далеко один від одного, збільшуємо ширину діапазону
          if (Math.abs(peak1 - peak2) > 100) {
            notchConfig.min_hz = Math.max(80, Math.min(peak1, peak2) - 30);
            notchConfig.max_hz = Math.min(600, Math.max(peak1, peak2) + 30);
          }
        }
      }
      
      return notchConfig;
    }
    
    /**
     * Налаштовує RPM-фільтр
     * @param {number} version - Версія Betaflight
     * @returns {Object} - Налаштування RPM-фільтру
     */
    configureRPMFilter(version) {
      // RPM-фільтр доступний з версії 4.2
      return {
        enabled: 1,
        harmonics: version >= 4.3 ? 3 : 2,
        q: 500,
        min_hz: 80,
        fadein_range: 10
      };
    }
    
    /**
     * Генерує примітки щодо налаштувань фільтрів
     * @param {Object} fftAnalysis - Результати FFT аналізу
     * @param {Object} flightProfile - Інформація про профіль польоту
     * @returns {string[]} - Масив приміток
     */
    generateFilterNotes(fftAnalysis, flightProfile) {
      const notes = [];
      
      // Додаємо примітки на основі FFT-аналізу
      if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
        const dominantFreq = fftAnalysis.dominantFrequency;
        
        if (dominantFreq < 100) {
          notes.push(`Виявлено низькочастотний шум (${dominantFreq.toFixed(1)} Гц), який може бути пов'язаний з проблемами рами або монтажу. Рекомендується перевірити кріплення FC.`);
        } else if (dominantFreq < 200) {
          notes.push(`Виявлено шум на середніх частотах (${dominantFreq.toFixed(1)} Гц), типовий для проблем з пропелерами. Перевірте баланс пропелерів та стан підшипників.`);
        } else {
          notes.push(`Виявлено високочастотний шум (${dominantFreq.toFixed(1)} Гц), який часто пов'язаний з проблемами моторів або ESC. Перевірте стан моторів та налаштування ESC.`);
        }
        
        // Аналіз діапазонів частот
        if (fftAnalysis.bandAnalysis) {
          const problemBands = fftAnalysis.bandAnalysis.filter(band => band.severity > 6);
          if (problemBands.length > 0) {
            const worstBand = problemBands[0];
            notes.push(`Проблемний частотний діапазон: ${worstBand.name} (${worstBand.min}-${worstBand.max} Гц). Можлива причина: ${worstBand.source}.`);
          }
        }
      }
      
      // Додаємо примітки на основі профілю польоту
      if (flightProfile && flightProfile.flightStyle) {
        switch (flightProfile.flightStyle) {
          case "racing":
            notes.push("Фільтри налаштовані для перегонів: менше фільтрації для кращої реакції, але потрібні якісні компоненти для запобігання шуму.");
            break;
          case "freestyle":
            notes.push("Фільтри налаштовані для фристайлу: збалансована фільтрація для відмінної продуктивності та стійкості до шуму.");
            break;
          case "cinematic":
            notes.push("Фільтри налаштовані для кінозйомки: більше фільтрації для плавних рухів та максимальної стабільності зображення.");
            break;
        }
      }
      
      // Загальні рекомендації
      notes.push("Для кращих результатів активуйте RPM-фільтр, якщо ваші ESC підтримують telemetry або bidirectional протокол.");
      
      return notes;
    }
    
    /**
     * Генерує CLI-команди для налаштування фільтрів
     * @param {Object} recommendations - Рекомендації для фільтрів
     * @param {number} version - Версія Betaflight
     * @returns {string[]} - Масив CLI-команд
     */
    generateFilterCommands(recommendations, version) {
      const commands = [];
      
      // Команди для фільтрів гіроскопа
      commands.push('# Gyro filter settings');
      commands.push(`set gyro_lowpass_type = ${recommendations.gyro.lowpass_type}`);
      commands.push(`set gyro_lowpass_hz = ${recommendations.gyro.lowpass_hz}`);
      
      if (version >= 4.3 && recommendations.gyro.lowpass2_hz) {
        commands.push(`set gyro_lowpass2_type = ${recommendations.gyro.lowpass2_type}`);
        commands.push(`set gyro_lowpass2_hz = ${recommendations.gyro.lowpass2_hz}`);
      }
      
      if (version >= 4.3 && recommendations.gyro.abg_alpha) {
        commands.push(`set gyro_abg_alpha = ${recommendations.gyro.abg_alpha}`);
        commands.push(`set gyro_abg_boost = ${recommendations.gyro.abg_boost}`);
      }
      
      commands.push('');
      
      // Команди для фільтрів D-терму
      commands.push('# D-term filter settings');
      commands.push(`set dterm_lowpass_type = ${recommendations.dterm.lowpass_type}`);
      commands.push(`set dterm_lowpass_hz = ${recommendations.dterm.lowpass_hz}`);
      
      if (version >= 4.3 && recommendations.dterm.lowpass2_hz) {
        commands.push(`set dterm_lowpass2_type = ${recommendations.dterm.lowpass2_type}`);
        commands.push(`set dterm_lowpass2_hz = ${recommendations.dterm.lowpass2_hz}`);
      }
      
      if (version >= 4.3 && recommendations.dterm.d_min_roll) {
        commands.push(`set d_min_roll = ${recommendations.dterm.d_min_roll}`);
        commands.push(`set d_min_pitch = ${recommendations.dterm.d_min_pitch}`);
        commands.push(`set d_min_boost = ${recommendations.dterm.d_min_boost}`);
      }
      
      commands.push('');
      
      // Команди для динамічного notch-фільтра
      commands.push('# Dynamic notch filter settings');
      commands.push(`set dyn_notch_enabled = ${recommendations.dynamic_notch.enabled}`);
      commands.push(`set dyn_notch_q = ${recommendations.dynamic_notch.q}`);
      commands.push(`set dyn_notch_min_hz = ${recommendations.dynamic_notch.min_hz}`);
      commands.push(`set dyn_notch_max_hz = ${recommendations.dynamic_notch.max_hz}`);
      
      if (version >= 4.3 && recommendations.dynamic_notch.count) {
        commands.push(`set dyn_notch_count = ${recommendations.dynamic_notch.count}`);
      }
      
      commands.push('');
      
      // Команди для RPM-фільтра
      commands.push('# RPM filter settings (enable if ESC telemetry is available)');
      commands.push(`set rpm_filter_enabled = ${recommendations.rpm_filter.enabled}`);
      commands.push(`set rpm_filter_harmonics = ${recommendations.rpm_filter.harmonics}`);
      commands.push(`set rpm_filter_q = ${recommendations.rpm_filter.q}`);
      commands.push(`set rpm_filter_min_hz = ${recommendations.rpm_filter.min_hz}`);
      
      if (version >= 4.3) {
        commands.push(`set rpm_filter_fadein_range = ${recommendations.rpm_filter.fadein_range}`);
      }
      
      commands.push('');
      commands.push('# Save settings');
      commands.push('save');
      
      return commands;
    }
    
    /**
     * Повертає налаштування фільтрів за замовчуванням
     * @param {number} version - Версія Betaflight
     * @returns {Object} - Налаштування фільтрів за замовчуванням
     */
    getDefaultFilterRecommendations(version) {
      const defaults = {
        gyro: {
          lowpass_type: "PT1",
          lowpass_hz: 120
        },
        dterm: {
          lowpass_type: "PT1",
          lowpass_hz: 100
        },
        dynamic_notch: {
          enabled: 1,
          q: 250,
          min_hz: 80,
          max_hz: 500
        },
        rpm_filter: {
          enabled: 1,
          harmonics: 2,
          q: 500,
          min_hz: 80
        },
        notes: [
          "Використано налаштування фільтрів за замовчуванням через брак даних для аналізу.",
          "Для кращої продуктивності рекомендується активувати RPM-фільтр, якщо ваші ESC підтримують telemetry або bidirectional протокол."
        ]
      };
      
      // Додаткові налаштування для новіших версій
      if (version >= 4.3) {
        defaults.gyro.lowpass2_type = "PT1";
        defaults.gyro.lowpass2_hz = 180;
        
        defaults.dterm.lowpass2_type = "PT1";
        defaults.dterm.lowpass2_hz = 140;
        
        defaults.dynamic_notch.count = 3;
        defaults.rpm_filter.harmonics = 3;
        defaults.rpm_filter.fadein_range = 10;
      }
      
      // Генеруємо команди для налаштувань за замовчуванням
      defaults.commands = this.generateFilterCommands(defaults, version);
      
      return defaults;
    }
  }