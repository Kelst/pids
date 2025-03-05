/**
 * Вдосконалений аналізатор даних Blackbox з покращеним аналізом та точнішими рекомендаціями
 */
import { FFTAnalyzer } from './FFTAnalyzer';
import { FlightProfileAnalyzer } from './FlightProfileAnalyzer';
import { FilterTuner } from './FilterTuner';
import { EnhancedZieglerNicholsTuner } from './EnhancedZieglerNicholsTuner';

export class BlackboxAnalyzer {
  /**
   * Аналізує дані Blackbox та генерує покращені рекомендації
   * @param {Object} blackboxData - Розібрані дані логу Blackbox
   * @param {Object} options - Опції аналізу
   * @returns {Object} - Результати аналізу з рекомендаціями
   */
  static analyzeData(blackboxData, options = {}) {
    console.log("Запуск вдосконаленого аналізу даних...");
    
    try {
      // Завантажуємо та підготовлюємо дані
      const preparedData = this.prepareData(blackboxData);
      
      // Визначаємо частоту дискретизації датчиків
      const sampleRate = this.estimateSampleRate(preparedData.timeData);
      console.log(`Оцінена частота дискретизації: ${sampleRate.toFixed(1)} Гц`);
      
      // Виконуємо FFT-аналіз
      const fftAnalyzer = new FFTAnalyzer();
      const fftAnalysisX = fftAnalyzer.analyzeGyroData(preparedData.gyroData.x, sampleRate);
      const fftAnalysisY = fftAnalyzer.analyzeGyroData(preparedData.gyroData.y, sampleRate);
      const fftAnalysisZ = fftAnalyzer.analyzeGyroData(preparedData.gyroData.z, sampleRate);
      
      // Об'єднуємо результати FFT-аналізу, вибираючи найбільш значущі дані
      const fftAnalysis = this.combineFFTResults([fftAnalysisX, fftAnalysisY, fftAnalysisZ]);
      
      // Аналізуємо профіль польоту
      const profileAnalyzer = new FlightProfileAnalyzer();
      const flightProfile = profileAnalyzer.analyzeFlightProfile(
        preparedData.rcData,
        preparedData.gyroData,
        preparedData.motorData
      );
      
      // Генеруємо рекомендації для фільтрів
      const filterTuner = new FilterTuner();
      const filterRecommendations = filterTuner.generateFilterRecommendations(
        fftAnalysis,
        flightProfile,
        options.firmwareVersion || 4.3
      );
      
      // Генеруємо рекомендації для PID
      const pidTuner = new EnhancedZieglerNicholsTuner();
      const pidRecommendations = pidTuner.generatePIDRecommendations(
        preparedData.gyroData,
        preparedData.rcData,
        sampleRate,
        flightProfile
      );
      
      // Аналізуємо продуктивність системи
      const performanceMetrics = this.calculatePerformanceMetrics(
        preparedData, 
        fftAnalysis,
        flightProfile
      );
      
      // Аналізуємо потенційні проблеми
      const issuesAnalysis = this.identifyPotentialIssues(
        preparedData,
        fftAnalysis,
        performanceMetrics
      );
      
      // Генеруємо повний набір команд налаштувань CLI
      const cliCommands = this.generateFullCommandSet(
        pidRecommendations,
        filterRecommendations
      );
      
      // Формуємо підсумковий аналіз
      const analysisNotes = this.generateAnalysisSummary(
        performanceMetrics,
        fftAnalysis,
        flightProfile,
        issuesAnalysis
      );
      
      // Результати аналізу
      return {
        // Оригінальні дані для відображення
        gyroData: preparedData.gyroData,
        pidData: preparedData.pidData,
        motorData: preparedData.motorData,
        rcData: preparedData.rcData,
        batteryData: preparedData.batteryData,
        
        // Результати FFT аналізу
        fftAnalysis,
        
        // Аналіз профілю польоту
        flightProfile,
        
        // Рекомендації
        recommendations: {
          pid: pidRecommendations,
          filters: filterRecommendations,
          fullCommandSet: cliCommands
        },
        
        // Виявлені метрики та проблеми
        metrics: performanceMetrics,
        issues: issuesAnalysis,
        
        // Аналіз та примітки
        analysis: {
          gyro: analysisNotes.gyro,
          pid: analysisNotes.pid,
          noise: analysisNotes.noise,
          overall: analysisNotes.overall
        },
        
        // Попередження, якщо є
        warning: this.generateWarnings(preparedData, blackboxData)
      };
    } catch (error) {
      console.error("Помилка під час вдосконаленого аналізу:", error);
      throw new Error(`Помилка аналізу даних: ${error.message}`);
    }
  }
  
  /**
   * Підготовлює дані для аналізу
   * @param {Object} blackboxData - Розібрані дані логу Blackbox
   * @returns {Object} - Підготовлені дані
   */
  static prepareData(blackboxData) {
    let data = [];
    
    if (blackboxData.type === 'csv' || blackboxData.type === 'betaflight') {
      data = blackboxData.data;
    } else if (blackboxData.type === 'blackbox' || blackboxData.type === 'binary' || blackboxData.type === 'demo') {
      data = blackboxData.data;
    } else {
      throw new Error('Невідомий формат даних');
    }
    
    // Перевірка достатньої кількості даних
    if (data.length < 10) {
      throw new Error(`Недостатньо точок даних для аналізу. Знайдено ${data.length}, потрібно щонайменше 10.`);
    }
    
    // Застосовуємо очищення та попередню обробку даних
    const cleanedData = this.cleanData(data);
    
    // Отримуємо дані для кожного типу датчика
    const timeData = cleanedData.map(d => d.time || 0);
    
    // Гіроскоп
    const gyroData = {
      time: timeData,
      x: cleanedData.map(d => d.gyroX || 0),
      y: cleanedData.map(d => d.gyroY || 0),
      z: cleanedData.map(d => d.gyroZ || 0)
    };
    
    // PID
    const pidData = {
      time: timeData,
      p: cleanedData.map(d => d.pidP || 0),
      i: cleanedData.map(d => d.pidI || 0),
      d: cleanedData.map(d => d.pidD || 0)
    };
    
    // Мотори
    const motorData = {
      time: timeData,
      motor0: cleanedData.map(d => d.motor0 || 0),
      motor1: cleanedData.map(d => d.motor1 || 0),
      motor2: cleanedData.map(d => d.motor2 || 0),
      motor3: cleanedData.map(d => d.motor3 || 0)
    };
    
    // RC команди
    const rcData = {
      time: timeData,
      roll: cleanedData.map(d => d.rcRoll || 1500),
      pitch: cleanedData.map(d => d.rcPitch || 1500),
      yaw: cleanedData.map(d => d.rcYaw || 1500),
      throttle: cleanedData.map(d => d.rcThrottle || 1000)
    };
    
    // Батарея
    const batteryData = {
      time: timeData,
      voltage: cleanedData.map(d => d.vbat || 0),
      current: cleanedData.map(d => d.current || 0)
    };
    
    return {
      timeData,
      gyroData,
      pidData,
      motorData,
      rcData,
      batteryData,
      length: cleanedData.length
    };
  }
  
  /**
   * Очищає дані від аномалій та викидів
   * @param {Array} data - Вхідні дані логу
   * @returns {Array} - Очищені дані
   */
  static cleanData(data) {
    // Проста перевірка на аномалії в даних гіроскопа
    return data.filter(d => {
      // Перевіряємо, чи значення в розумних межах
      const validGyro = 
        Math.abs(d.gyroX || 0) < 3000 && 
        Math.abs(d.gyroY || 0) < 3000 && 
        Math.abs(d.gyroZ || 0) < 3000;
      
      // Перевіряємо, чи значення моторів в розумних межах
      const validMotors = 
        (d.motor0 || 0) >= 900 && (d.motor0 || 0) <= 2100 &&
        (d.motor1 || 0) >= 900 && (d.motor1 || 0) <= 2100 &&
        (d.motor2 || 0) >= 900 && (d.motor2 || 0) <= 2100 &&
        (d.motor3 || 0) >= 900 && (d.motor3 || 0) <= 2100;
      
      return validGyro && validMotors;
    });
  }
  
  /**
   * Оцінює частоту дискретизації на основі часових даних
   * @param {Array} timeData - Часові дані
   * @returns {number} - Оцінена частота дискретизації в Гц
   */
  static estimateSampleRate(timeData) {
    if (timeData.length < 2) return 1000; // За замовчуванням 1 кГц
    
    // Обчислюємо середню різницю часу між вибірками
    const timeDiffs = [];
    for (let i = 1; i < timeData.length; i++) {
      const diff = timeData[i] - timeData[i-1];
      if (diff > 0) timeDiffs.push(diff);
    }
    
    if (timeDiffs.length === 0) return 1000;
    
    // Знаходимо медіанну різницю часу (стійка до викидів)
    timeDiffs.sort((a, b) => a - b);
    const medianDiff = timeDiffs[Math.floor(timeDiffs.length / 2)];
    
    // Конвертуємо в Гц (приймаємо, що час у мс)
    return 1000 / medianDiff;
  }
  
  /**
   * Об'єднує результати FFT-аналізу з різних осей
   * @param {Array} fftResults - Масив результатів FFT
   * @returns {Object} - Об'єднані результати FFT
   */
  static combineFFTResults(fftResults) {
    // Знаходимо результат з найбільш вираженими резонансами
    let bestResult = fftResults[0];
    let maxPeakAmplitude = 0;
    
    for (const result of fftResults) {
      if (result.resonanceFrequencies && result.resonanceFrequencies.length > 0) {
        const maxAmplitude = result.resonanceFrequencies[0].amplitude;
        if (maxAmplitude > maxPeakAmplitude) {
          maxPeakAmplitude = maxAmplitude;
          bestResult = result;
        }
      }
    }
    
    // Об'єднуємо унікальні резонансні частоти з усіх результатів
    const allPeaks = [];
    const peakFrequencies = new Set();
    
    for (const result of fftResults) {
      if (result.resonanceFrequencies) {
        for (const peak of result.resonanceFrequencies) {
          // Перевіряємо, чи немає вже схожої частоти (з відхиленням 5%)
          let isDuplicate = false;
          for (const freq of peakFrequencies) {
            if (Math.abs(peak.frequency - freq) / freq < 0.05) {
              isDuplicate = true;
              break;
            }
          }
          
          if (!isDuplicate) {
            peakFrequencies.add(peak.frequency);
            allPeaks.push(peak);
          }
        }
      }
    }
    
    // Сортуємо всі піки за амплітудою
    allPeaks.sort((a, b) => b.amplitude - a.amplitude);
    
    // Створюємо об'єднаний результат
    return {
      resonanceFrequencies: allPeaks,
      dominantFrequency: allPeaks.length > 0 ? allPeaks[0].frequency : bestResult.dominantFrequency,
      noiseLevel: Math.max(...fftResults.map(r => r.noiseLevel || 0)),
      bandAnalysis: bestResult.bandAnalysis
    };
  }
  
  /**
   * Розраховує метрики продуктивності системи
   * @param {Object} data - Підготовлені дані
   * @param {Object} fftAnalysis - Результати FFT-аналізу
   * @param {Object} flightProfile - Профіль польоту
   * @returns {Object} - Метрики продуктивності
   */
  static calculatePerformanceMetrics(data, fftAnalysis, flightProfile) {
    const metrics = {};
    
    // Обчислюємо метрики шуму гіроскопа
    metrics['Шум гіроскопа (Roll)'] = this.calculateStandardDeviation(data.gyroData.x).toFixed(2);
    metrics['Шум гіроскопа (Pitch)'] = this.calculateStandardDeviation(data.gyroData.y).toFixed(2);
    metrics['Шум гіроскопа (Yaw)'] = this.calculateStandardDeviation(data.gyroData.z).toFixed(2);
    
    // Обчислюємо помилку PID як міру точності контролю
    metrics['Помилка PID (Roll)'] = this.calculateRMSE(data.gyroData.x, data.pidData.p).toFixed(2);
    metrics['Помилка PID (Pitch)'] = this.calculateRMSE(data.gyroData.y, data.pidData.p).toFixed(2);
    metrics['Помилка PID (Yaw)'] = this.calculateRMSE(data.gyroData.z, data.pidData.p).toFixed(2);
    
    // Обчислюємо метрики двигунів
    metrics['Баланс моторів'] = this.calculateMotorBalance(data.motorData).toFixed(2);
    metrics['Використання потужності'] = this.calculatePowerUsage(data.motorData).toFixed(2) + '%';
    
    // Обчислюємо метрики реакції системи
    metrics['Час відгуку (мс)'] = this.estimateResponseTime(data.gyroData, data.rcData).toFixed(2);
    
    // Додаємо метрики з FFT-аналізу
    if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
      metrics['Домінантна частота (Гц)'] = fftAnalysis.dominantFrequency.toFixed(1);
      metrics['Рівень шуму FFT'] = fftAnalysis.noiseLevel.toFixed(2);
      
      // Додаємо топ-3 резонансні частоти
      for (let i = 0; i < Math.min(3, fftAnalysis.resonanceFrequencies.length); i++) {
        const peak = fftAnalysis.resonanceFrequencies[i];
        metrics[`Пік ${i+1} (${peak.frequency.toFixed(1)} Гц)`] = peak.amplitude.toFixed(3);
      }
    }
    
    // Додаємо метрики з профілю польоту
    if (flightProfile) {
      metrics['Стиль польоту'] = flightProfile.flightStyle;
      metrics['Агресивність пілотування'] = flightProfile.characteristics.aggressiveness.toFixed(2);
      metrics['Плавність руху'] = flightProfile.characteristics.smoothness.toFixed(2);
    }
    
    return metrics;
  }
  
  /**
   * Ідентифікує потенційні проблеми на основі аналізу даних
   * @param {Object} data - Підготовлені дані
   * @param {Object} fftAnalysis - Результати FFT-аналізу
   * @param {Object} metrics - Метрики продуктивності
   * @returns {Array} - Масив виявлених проблем
   */
  static identifyPotentialIssues(data, fftAnalysis, metrics) {
    const issues = [];
    
    // Перевірка на високий рівень шуму гіроскопа
    const avgGyroNoise = (
      parseFloat(metrics['Шум гіроскопа (Roll)']) + 
      parseFloat(metrics['Шум гіроскопа (Pitch)']) + 
      parseFloat(metrics['Шум гіроскопа (Yaw)'])
    ) / 3;
    
    if (avgGyroNoise > 15) {
      issues.push({
        severity: 'high',
        title: 'Високий рівень шуму гіроскопа',
        description: 'Виявлено високий рівень шуму гіроскопа, що може спричиняти вібрації у польоті.',
        solution: 'Перевірте баланс пропелерів, стан підшипників та кріплення польотного контролера. Розгляньте використання демпферів вібрації.'
      });
    } else if (avgGyroNoise > 10) {
      issues.push({
        severity: 'medium',
        title: 'Підвищений рівень шуму гіроскопа',
        description: 'Рівень шуму гіроскопа вище оптимального.',
        solution: 'Для плавнішого польоту рекомендується перевірити баланс пропелерів та монтаж польотного контролера.'
      });
    }
    
    // Перевірка на проблеми з балансом моторів
    const motorBalance = parseFloat(metrics['Баланс моторів']);
    if (motorBalance > 15) {
      issues.push({
        severity: 'high',
        title: 'Дисбаланс моторів',
        description: 'Виявлено значний дисбаланс у роботі моторів, що може спричиняти схил або рискання.',
        solution: 'Перевірте та відкалібруйте ESC, перевірте стан моторів та регулятори швидкості. Можливо, деякі мотори потребують заміни.'
      });
    }
    
    // Перевірка на резонансні частоти
    if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
      const dominantFreq = fftAnalysis.dominantFrequency;
      
      if (dominantFreq < 100 && fftAnalysis.resonanceFrequencies[0].amplitude > 5) {
        issues.push({
          severity: 'high',
          title: 'Низькочастотний резонанс',
          description: `Виявлено сильний низькочастотний резонанс на ${dominantFreq.toFixed(1)} Гц.`,
          solution: 'Перевірте жорсткість рами, кріплення моторів та польотного контролера. Низькочастотні резонанси зазвичай пов\'язані з проблемами механічного кріплення.'
        });
      } else if (dominantFreq > 200 && fftAnalysis.resonanceFrequencies[0].amplitude > 4) {
        issues.push({
          severity: 'medium',
          title: 'Високочастотний шум',
          description: `Виявлено високочастотний шум на ${dominantFreq.toFixed(1)} Гц.`,
          solution: 'Перевірте стан підшипників моторів. Високочастотний шум часто є ознакою початку зносу підшипників або проблем з ESC.'
        });
      }
    }
    
    // Перевірка на неоптимальні налаштування PID
    const avgPIDError = (
      parseFloat(metrics['Помилка PID (Roll)']) + 
      parseFloat(metrics['Помилка PID (Pitch)']) + 
      parseFloat(metrics['Помилка PID (Yaw)'])
    ) / 3;
    
    if (avgPIDError > 15) {
      issues.push({
        severity: 'medium',
        title: 'Неоптимальні PID налаштування',
        description: 'Поточні PID налаштування не забезпечують оптимального контролю.',
        solution: 'Застосуйте рекомендовані PID налаштування для покращення стабільності та відгуку системи.'
      });
    }
    
    // Перевірка на час відгуку системи
    const responseTime = parseFloat(metrics['Час відгуку (мс)']);
    if (responseTime > 30) {
      issues.push({
        severity: 'medium',
        title: 'Повільний відгук системи',
        description: 'Система реагує на команди повільніше, ніж очікувалося.',
        solution: 'Розгляньте збільшення P-складової PID та зменшення фільтрації для швидшого відгуку. Перевірте затримку в системі керування.'
      });
    }
    
    return issues;
  }
  
  /**
   * Генерує повний набір CLI-команд для Betaflight
   * @param {Object} pidRecommendations - Рекомендації PID
   * @param {Object} filterRecommendations - Рекомендації фільтрів
   * @returns {string[]} - Масив CLI-команд
   */
  static generateFullCommandSet(pidRecommendations, filterRecommendations) {
    // Об'єднуємо команди для PID та фільтрів
    let fullCommandSet = [];
    
    // Додаємо команди для PID
    fullCommandSet.push('# PID Settings');
    
    if (pidRecommendations.roll && pidRecommendations.pitch && pidRecommendations.yaw) {
      fullCommandSet.push(`set pid_roll_p = ${pidRecommendations.roll.P}`);
      fullCommandSet.push(`set pid_roll_i = ${pidRecommendations.roll.I}`);
      fullCommandSet.push(`set pid_roll_d = ${pidRecommendations.roll.D}`);
      fullCommandSet.push(`set pid_pitch_p = ${pidRecommendations.pitch.P}`);
      fullCommandSet.push(`set pid_pitch_i = ${pidRecommendations.pitch.I}`);
      fullCommandSet.push(`set pid_pitch_d = ${pidRecommendations.pitch.D}`);
      fullCommandSet.push(`set pid_yaw_p = ${pidRecommendations.yaw.P}`);
      fullCommandSet.push(`set pid_yaw_i = ${pidRecommendations.yaw.I}`);
      fullCommandSet.push(`set pid_yaw_d = ${pidRecommendations.yaw.D}`);
    }
    
    // Додаємо команди для feed-forward
    if (pidRecommendations.feedforward) {
      fullCommandSet.push('');
      fullCommandSet.push('# Feed-forward Settings');
      fullCommandSet.push(`set feed_forward_roll = ${pidRecommendations.feedforward.roll}`);
      fullCommandSet.push(`set feed_forward_pitch = ${pidRecommendations.feedforward.pitch}`);
      fullCommandSet.push(`set feed_forward_yaw = ${pidRecommendations.feedforward.yaw}`);
      fullCommandSet.push(`set ff_transition = ${pidRecommendations.feedforward.transition}`);
      fullCommandSet.push(`set ff_boost = ${pidRecommendations.feedforward.boost}`);
    }
    
    // Додаємо команди для фільтрів
    fullCommandSet.push('');
    
    if (filterRecommendations.commands) {
      // Використовуємо вже згенеровані команди для фільтрів
      fullCommandSet = fullCommandSet.concat(filterRecommendations.commands);
    } else {
      // Базові команди для фільтрів, якщо немає спеціальних рекомендацій
      fullCommandSet.push('# Filter Settings');
      fullCommandSet.push(`set gyro_lowpass_type = PT1`);
      fullCommandSet.push(`set gyro_lowpass_hz = 120`);
      fullCommandSet.push(`set dterm_lowpass_type = PT1`);
      fullCommandSet.push(`set dterm_lowpass_hz = 100`);
      fullCommandSet.push(`set dyn_notch_enabled = ON`);
      fullCommandSet.push(`set dyn_notch_q = 250`);
      fullCommandSet.push(`set dyn_notch_min_hz = 80`);
      fullCommandSet.push(`set dyn_notch_max_hz = 500`);
      fullCommandSet.push('');
      fullCommandSet.push('# Save Settings');
      fullCommandSet.push('save');
    }
    
    return fullCommandSet;
  }
  
  /**
   * Генерує підсумковий аналіз для відображення
   * @param {Object} metrics - Метрики продуктивності
   * @param {Object} fftAnalysis - Результати FFT-аналізу
   * @param {Object} flightProfile - Профіль польоту
   * @param {Array} issues - Виявлені проблеми
   * @returns {Object} - Підсумковий аналіз
   */
  static generateAnalysisSummary(metrics, fftAnalysis, flightProfile, issues) {
    const analysis = {
      gyro: '',
      pid: '',
      noise: '',
      overall: ''
    };
    
    // Аналіз даних гіроскопа
    const avgGyroNoise = (
      parseFloat(metrics['Шум гіроскопа (Roll)']) + 
      parseFloat(metrics['Шум гіроскопа (Pitch)']) + 
      parseFloat(metrics['Шум гіроскопа (Yaw)'])
    ) / 3;
    
    if (avgGyroNoise < 5) {
      analysis.gyro = 'Рівень шуму гіроскопа дуже низький, що вказує на хороше апаратне забезпечення та фільтрацію. Додаткова фільтрація не потрібна.';
    } else if (avgGyroNoise < 10) {
      analysis.gyro = 'Рівень шуму гіроскопа прийнятний, але може бути покращений. Розгляньте коригування налаштувань фільтрів LPF або notch.';
    } else if (avgGyroNoise < 20) {
      analysis.gyro = 'Рівень шуму гіроскопа високий. Перевірте механічні проблеми та налаштуйте фільтрацію для зменшення шуму.';
    } else {
      analysis.gyro = 'Виявлено дуже високий шум гіроскопа. Перевірте монтаж, баланс та стан моторів. Рекомендовані значні зміни в налаштуваннях фільтрів.';
    }
    
    // Аналіз PID даних
    const avgPIDError = (
      parseFloat(metrics['Помилка PID (Roll)']) + 
      parseFloat(metrics['Помилка PID (Pitch)']) + 
      parseFloat(metrics['Помилка PID (Yaw)'])
    ) / 3;
    
    if (avgPIDError < 5) {
      analysis.pid = 'Відгук PID чудовий. Поточні значення PID добре налаштовані для вашої установки.';
    } else if (avgPIDError < 10) {
      analysis.pid = 'Відгук PID хороший, але може бути покращений. Розгляньте тонке налаштування P та D складових.';
    } else if (avgPIDError < 20) {
      analysis.pid = 'Відгук PID потребує покращення. Рекомендується переналаштування значень PID на основі рекомендацій.';
    } else {
      analysis.pid = 'Виявлено поганий відгук PID. Рекомендовано повне налаштування PID, використовуючи надані значення як відправну точку.';
    }
    
    // Аналіз шуму на основі FFT
    if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
      const dominantFreq = fftAnalysis.dominantFrequency;
      
      if (dominantFreq < 100) {
        analysis.noise = `Виявлено шум на низькій частоті (${dominantFreq.toFixed(1)} Гц), який зазвичай пов'язаний з вібрацією рами або проблемами монтажу. Рекомендується перевірити баланс пропелерів та кріплення моторів.`;
      } else if (dominantFreq < 200) {
        analysis.noise = `Виявлено шум на середній частоті (${dominantFreq.toFixed(1)} Гц), який зазвичай пов'язаний з пропелерами або моторами. Рекомендується перевірити стан пропелерів та підшипників.`;
      } else {
        analysis.noise = `Виявлено високочастотний шум (${dominantFreq.toFixed(1)} Гц), який зазвичай є електричним або походить від пошкоджених підшипників. Перевірте стан моторів та електричну систему.`;
      }
    } else {
      analysis.noise = 'Не вдалося виконати детальний FFT-аналіз шуму. Перевірте баланс, монтаж та стан моторів.';
    }
    
    // Загальний аналіз та поради
    let overallAnalysis = '';
    
    if (flightProfile) {
      overallAnalysis += `Виявлено стиль польоту: ${flightProfile.flightStyle}. `;
      
      switch (flightProfile.flightStyle) {
        case 'racing':
          overallAnalysis += 'Рекомендації оптимізовані для перегонів – вища чутливість та швидший відгук. ';
          break;
        case 'freestyle':
          overallAnalysis += 'Рекомендації оптимізовані для фристайлу – збалансоване співвідношення чутливості та стабільності. ';
          break;
        case 'cinematic':
          overallAnalysis += 'Рекомендації оптимізовані для кінозйомки – вища стабільність та плавність. ';
          break;
      }
    }
    
    // Додаємо прорітетні проблеми
    if (issues.length > 0) {
      const highPriorityIssues = issues.filter(issue => issue.severity === 'high');
      if (highPriorityIssues.length > 0) {
        overallAnalysis += 'Виявлено критичні проблеми, які потребують уваги: ';
        highPriorityIssues.forEach((issue, index) => {
          overallAnalysis += `${issue.title}${index < highPriorityIssues.length - 1 ? ', ' : '. '}`;
        });
      }
    }
    
    // Додаємо загальні рекомендації
    overallAnalysis += 'Рекомендовані налаштування повинні забезпечити кращу продуктивність та стабільність польоту. ';
    
    if (avgGyroNoise > 12) {
      overallAnalysis += 'Пріоритет має бути наданий зменшенню шуму гіроскопа перед точним налаштуванням PID.';
    } else {
      overallAnalysis += 'Застосуйте рекомендовані налаштування та виконайте тестовий політ для оцінки результатів.';
    }
    
    analysis.overall = overallAnalysis;
    
    return analysis;
  }
  
  /**
   * Генерує попередження для користувача
   * @param {Object} preparedData - Підготовлені дані
   * @param {Object} blackboxData - Оригінальні дані Blackbox
   * @returns {string} - Попередження, якщо є
   */
  static generateWarnings(preparedData, blackboxData) {
    const warnings = [];
    
    // Перевірка на обмежену кількість даних
    if (preparedData.length < 100) {
      warnings.push("Увага: Кількість точок даних менше 100. Результати аналізу можуть бути менш точними.");
    }
    
    // Попередження про бінарні дані
    if (blackboxData.type === 'binary') {
      warnings.push("Цей аналіз базується на даних з бінарного BBL файлу. Для найбільш точних результатів рекомендується відкрити його в Betaflight Blackbox Explorer і експортувати як CSV для аналізу.");
    }
    
    if (warnings.length === 0) {
      return null;
    }
    
    return warnings.join(" ");
  }
  
  // Допоміжні методи для розрахунків
  
  /**
   * Обчислює стандартне відхилення масиву
   * @param {Array} values - Масив значень
   * @returns {number} - Стандартне відхилення
   */
  static calculateStandardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Обчислює середньоквадратичну помилку між масивами
   * @param {Array} actual - Фактичні значення
   * @param {Array} expected - Очікувані значення
   * @returns {number} - Середньоквадратична помилка
   */
  static calculateRMSE(actual, expected) {
    if (actual.length !== expected.length) {
      // Обрізаємо до спільної довжини
      const length = Math.min(actual.length, expected.length);
      actual = actual.slice(0, length);
      expected = expected.slice(0, length);
    }
    
    const squaredDiffs = actual.map((val, i) => Math.pow(val - expected[i], 2));
    const meanSquaredError = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
    return Math.sqrt(meanSquaredError);
  }
  
  /**
   * Обчислює баланс моторів
   * @param {Object} motorData - Дані моторів
   * @returns {number} - Міра дисбалансу моторів
   */
  static calculateMotorBalance(motorData) {
    // Обчислює середнє значення для кожного мотора
    const motor0Avg = this.calculateAverage(motorData.motor0);
    const motor1Avg = this.calculateAverage(motorData.motor1);
    const motor2Avg = this.calculateAverage(motorData.motor2);
    const motor3Avg = this.calculateAverage(motorData.motor3);
    
    const motorAvgs = [motor0Avg, motor1Avg, motor2Avg, motor3Avg];
    
    // Обчислює стандартне відхилення між середніми значеннями
    return this.calculateStandardDeviation(motorAvgs);
  }
  
  /**
   * Обчислює відсоток використання потужності моторів
   * @param {Object} motorData - Дані моторів
   * @returns {number} - Відсоток використання потужності
   */
  static calculatePowerUsage(motorData) {
    // Припускаємо діапазон моторів 1000-2000
    const motor0Avg = this.calculateAverage(motorData.motor0);
    const motor1Avg = this.calculateAverage(motorData.motor1);
    const motor2Avg = this.calculateAverage(motorData.motor2);
    const motor3Avg = this.calculateAverage(motorData.motor3);
    
    const avgPower = (motor0Avg + motor1Avg + motor2Avg + motor3Avg) / 4;
    
    // Нормалізуємо до відсотків (0-100%)
    return ((avgPower - 1000) / 1000) * 100;
  }
  
  /**
   * Обчислює середнє значення масиву
   * @param {Array} values - Масив значень
   * @returns {number} - Середнє значення
   */
  static calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Оцінює час відгуку системи
   * @param {Object} gyroData - Дані гіроскопа
   * @param {Object} rcData - Дані команд пульта
   * @returns {number} - Час відгуку в мс
   */
  static estimateResponseTime(gyroData, rcData) {
    // Аналізуємо кореляцію з різними затримками
    const rollCorrelations = this.calculateCrossCorrelation(
      this.normalizeArray(rcData.roll), 
      this.normalizeArray(gyroData.x),
      10
    );
    
    const pitchCorrelations = this.calculateCrossCorrelation(
      this.normalizeArray(rcData.pitch), 
      this.normalizeArray(gyroData.y),
      10
    );
    
    // Знаходимо індекс максимальної кореляції
    let maxRollCorrelation = 0;
    let maxRollLag = 0;
    
    for (let i = 0; i < rollCorrelations.length; i++) {
      if (rollCorrelations[i] > maxRollCorrelation) {
        maxRollCorrelation = rollCorrelations[i];
        maxRollLag = i;
      }
    }
    
    let maxPitchCorrelation = 0;
    let maxPitchLag = 0;
    
    for (let i = 0; i < pitchCorrelations.length; i++) {
      if (pitchCorrelations[i] > maxPitchCorrelation) {
        maxPitchCorrelation = pitchCorrelations[i];
        maxPitchLag = i;
      }
    }
    
    // Обчислюємо середній час відгуку в мс (приблизно)
    // Припускаємо, що частота дискретизації ~1000 Гц
    return ((maxRollLag + maxPitchLag) / 2) * 1;
  }
  
  /**
   * Нормалізує масив до діапазону -1..1
   * @param {Array} array - Вхідний масив
   * @returns {Array} - Нормалізований масив
   */
  static normalizeArray(array) {
    const min = Math.min(...array);
    const max = Math.max(...array);
    const range = max - min;
    
    if (range === 0) return array.map(() => 0);
    
    return array.map(val => 2 * (val - min) / range - 1);
  }
  
  /**
   * Обчислює крос-кореляцію між двома масивами
   * @param {Array} a - Перший масив
   * @param {Array} b - Другий масив
   * @param {number} maxLag - Максимальний зсув
   * @returns {Array} - Масив кореляцій для різних зсувів
   */
  static calculateCrossCorrelation(a, b, maxLag) {
    const correlations = [];
    
    for (let lag = 0; lag <= maxLag; lag++) {
      let sum = 0;
      let count = 0;
      
      for (let i = 0; i < a.length - lag; i++) {
        sum += a[i] * b[i + lag];
        count++;
      }
      
      correlations.push(count > 0 ? sum / count : 0);
    }
    
    return correlations;
  }
  /**
 * Parses uploaded file and extracts blackbox data
 * @param {File} file - Uploaded file
 * @returns {Promise<Object>} - Parsed blackbox data
 */
/**
 * Доданий метод для розбору файлу Blackbox
 * @param {File} file - Завантажений файл
 * @returns {Promise<Object>} - Розібрані дані Blackbox
 */
static async parseFile(file) {
    console.log("Початок аналізу файлу:", file.name);
    
    try {
      // Визначення типу файлу на основі розширення
      const fileType = file.name.split('.').pop().toLowerCase();
      
      // Зчитуємо вміст файлу
      const fileContent = await file.arrayBuffer();
      
      // Парсимо відповідно до типу файлу
      if (fileType === 'bbl') {
        // Обробка бінарних BBL-файлів
        const { BBLParser } = await import('./BBLParser');
        return BBLParser.parseBuffer(fileContent);
      } else if (fileType === 'csv' || fileType === 'txt' || fileType === 'log') {
        // Обробка текстових логів
        const text = new TextDecoder().decode(fileContent);
        
        try {
          const { DirectBetaflightParser } = await import('./DirectBetaflightParser');
          return DirectBetaflightParser.parseLog(text);
        } catch (error) {
          console.warn("Помилка при використанні DirectBetaflightParser:", error);
          
          // Спроба використати альтернативний парсер
          const { BetaflightLogParser } = await import('./BetaflightLogParser');
          return BetaflightLogParser.parseLog(text);
        }
      } else {
        // Невідомий тип файлу, спробуємо як текст
        const text = new TextDecoder().decode(fileContent);
        
        try {
          const { DirectBetaflightParser } = await import('./DirectBetaflightParser');
          return DirectBetaflightParser.parseLog(text);
        } catch (error) {
          // Якщо не вдалося, спробуємо як бінарний файл
          const { BBLParser } = await import('./BBLParser');
          return BBLParser.parseBuffer(fileContent);
        }
      }
    } catch (error) {
      console.error("Помилка при розборі файлу:", error);
      
      // Створюємо демо-дані для тестування
      return {
        type: 'demo',
        data: this.generateDemoData(100),
        headers: {
          'Product': 'Betaflight (Demo)',
          'Firmware revision': 'Demo Mode',
          'Craft name': 'Demo Drone'
        }
      };
    }
  }
  
  /**
   * Генерує демо-дані для тестування при відсутності файлу
   * @param {number} count - Кількість точок даних
   * @returns {Array} - Масив демо-даних
   */
  static generateDemoData(count = 100) {
    const data = [];
    
    for (let i = 0; i < count; i++) {
      const t = i / 10; // Час у секундах
      
      // Синусоїдальні коливання для імітації даних
      const sin1 = Math.sin(t * 5);
      const sin2 = Math.sin(t * 10 + 1);
      const sin3 = Math.sin(t * 3 + 2);
      
      data.push({
        time: i * 10,
        loopIteration: i,
        gyroX: sin1 * 20,
        gyroY: sin2 * 25,
        gyroZ: sin3 * 15,
        pidP: Math.abs(sin1 * 30),
        pidI: Math.abs(sin2 * 20),
        pidD: Math.abs(sin3 * 15),
        motor0: 1000 + sin1 * 400 + 400,
        motor1: 1000 + sin2 * 400 + 400,
        motor2: 1000 + sin3 * 400 + 400,
        motor3: 1000 + sin1 * sin2 * 400 + 400
      });
    }
    
    return data;
  }
  
  /**
   * Генерує рекомендації на основі результатів аналізу
   * @param {Object} analysisResult - Результати аналізу даних
   * @returns {Object} - Рекомендації для PID та фільтрів
   */
  static generateRecommendations(analysisResult) {
    console.log("Генерація рекомендацій на основі аналізу даних");
    
    try {
      // Якщо аналіз вже містить рекомендації, повертаємо їх
      if (analysisResult.recommendations) {
        return analysisResult.recommendations;
      }
      
      // Розробляємо рекомендації на основі аналізу FFT та метрик
      const noiseLevel = analysisResult.fftAnalysis?.noiseLevel || 0;
      
      // Коригуємо рекомендації на основі рівня шуму
      let noiseFactor = 1.0;
      if (noiseLevel > 50) {
        noiseFactor = 0.8; // Зменшуємо коефіцієнти для високого шуму
      } else if (noiseLevel > 20) {
        noiseFactor = 0.9; // Незначне зменшення для середнього шуму
      }
      
      // Базові рекомендації для PID
      const pidRecommendations = {
        roll: {
          P: Math.round(45 * noiseFactor), 
          I: Math.round(80 * noiseFactor), 
          D: Math.round(30 * noiseFactor)
        },
        pitch: {
          P: Math.round(45 * noiseFactor), 
          I: Math.round(80 * noiseFactor), 
          D: Math.round(30 * noiseFactor)
        },
        yaw: {
          P: Math.round(40 * noiseFactor), 
          I: Math.round(80 * noiseFactor), 
          D: 0
        },
        feedforward: {
          roll: 40,
          pitch: 40,
          yaw: 20,
          transition: 20,
          boost: 15
        },
        notes: []
      };
      
      // Аналіз рівня шуму для приміток
      if (noiseLevel > 50) {
        pidRecommendations.notes.push("Виявлено високий рівень шуму. Рекомендується перевірити баланс пропелерів та кріплення FC.");
      } else if (noiseLevel > 20) {
        pidRecommendations.notes.push("Виявлено середній рівень шуму. PID-значення оптимізовані для зменшення шуму.");
      } else {
        pidRecommendations.notes.push("Низький рівень шуму. Можна використовувати більш агресивні налаштування PID за бажанням.");
      }
      
      // Рекомендації для фільтрів
      const filterRecommendations = {
        gyro: {
          lowpass_type: "PT1",
          lowpass_hz: Math.max(80, Math.round(120 * noiseFactor))
        },
        dterm: {
          lowpass_type: "PT1",
          lowpass_hz: Math.max(60, Math.round(100 * noiseFactor))
        },
        dynamic_notch: {
          enabled: 1,
          q: 250,
          min_hz: 80,
          max_hz: 500
        },
        rpm_filter: {
          enabled: 1,
          harmonics: 3,
          q: 500,
          min_hz: 80
        },
        notes: []
      };
      
      // Примітки щодо фільтрів
      if (noiseLevel > 50) {
        filterRecommendations.notes.push("Рекомендовано збільшити фільтрацію для зменшення високого шуму.");
      }
      
      filterRecommendations.notes.push("Для кращих результатів рекомендується активувати RPM-фільтр, якщо ваші ESC підтримують telemetry.");
      
      // Команди CLI для налаштування
      const pidCommands = [
        "# PID Settings",
        `set pid_roll_p = ${pidRecommendations.roll.P}`,
        `set pid_roll_i = ${pidRecommendations.roll.I}`,
        `set pid_roll_d = ${pidRecommendations.roll.D}`,
        `set pid_pitch_p = ${pidRecommendations.pitch.P}`,
        `set pid_pitch_i = ${pidRecommendations.pitch.I}`,
        `set pid_pitch_d = ${pidRecommendations.pitch.D}`,
        `set pid_yaw_p = ${pidRecommendations.yaw.P}`,
        `set pid_yaw_i = ${pidRecommendations.yaw.I}`,
        `set pid_yaw_d = ${pidRecommendations.yaw.D}`,
        "",
        "# Feed-forward Settings",
        `set feed_forward_roll = ${pidRecommendations.feedforward.roll}`,
        `set feed_forward_pitch = ${pidRecommendations.feedforward.pitch}`,
        `set feed_forward_yaw = ${pidRecommendations.feedforward.yaw}`
      ];
      
      const filterCommands = [
        "",
        "# Filter Settings",
        `set gyro_lowpass_type = ${filterRecommendations.gyro.lowpass_type}`,
        `set gyro_lowpass_hz = ${filterRecommendations.gyro.lowpass_hz}`,
        `set dterm_lowpass_type = ${filterRecommendations.dterm.lowpass_type}`,
        `set dterm_lowpass_hz = ${filterRecommendations.dterm.lowpass_hz}`,
        `set dyn_notch_enable = ON`,
        `set dyn_notch_q = ${filterRecommendations.dynamic_notch.q}`,
        `set dyn_notch_min_hz = ${filterRecommendations.dynamic_notch.min_hz}`,
        `set dyn_notch_max_hz = ${filterRecommendations.dynamic_notch.max_hz}`,
        "",
        "# Save Settings",
        "save"
      ];
      
      const fullCommandSet = [...pidCommands, ...filterCommands];
      
      return {
        pid: pidRecommendations,
        filters: filterRecommendations,
        fullCommandSet: fullCommandSet
      };
    } catch (error) {
      console.error("Помилка генерації рекомендацій:", error);
      
      // Значення за замовчуванням у випадку помилки
      return {
        pid: {
          roll: { P: 45, I: 80, D: 30 },
          pitch: { P: 45, I: 80, D: 30 },
          yaw: { P: 40, I: 80, D: 0 },
          feedforward: {
            roll: 40,
            pitch: 40,
            yaw: 20,
            transition: 20,
            boost: 15
          },
          notes: ["Використано значення за замовчуванням"]
        },
        filters: {
          gyro: { lowpass_type: "PT1", lowpass_hz: 120 },
          dterm: { lowpass_type: "PT1", lowpass_hz: 100 },
          dynamic_notch: { enabled: 1, q: 250, min_hz: 80, max_hz: 500 },
          rpm_filter: { enabled: 1, harmonics: 3, q: 500, min_hz: 80 },
          notes: ["Використано значення за замовчуванням"]
        },
        fullCommandSet: [
          "# PID Settings",
          "set pid_roll_p = 45",
          "set pid_roll_i = 80",
          "set pid_roll_d = 30",
          "set pid_pitch_p = 45",
          "set pid_pitch_i = 80",
          "set pid_pitch_d = 30",
          "set pid_yaw_p = 40",
          "set pid_yaw_i = 80",
          "set pid_yaw_d = 0",
          "",
          "# Filter Settings",
          "set gyro_lowpass_type = PT1",
          "set gyro_lowpass_hz = 120",
          "save"
        ]
      };
    }
  }
}