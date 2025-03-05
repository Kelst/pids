/**
 * Вдосконалена реалізація методу Зіглера-Нікольса для квадрокоптерів
 * з додатковими алгоритмами для підвищення точності та адаптації до різних умов
 */
export class EnhancedZieglerNicholsTuner {
    /**
     * Конструктор
     * @param {Object} options - Опції налаштування
     */
    constructor(options = {}) {
      this.options = {
        // Набори коефіцієнтів під різні стилі польоту
        coefficients: {
          // Стандартні коефіцієнти Зіглера-Нікольса
          classic: {
            P: { Kp: 0.5, Ki: 0, Kd: 0 },
            PI: { Kp: 0.45, Ki: 0.54, Kd: 0 },
            PD: { Kp: 0.8, Ki: 0, Kd: 0.1 },
            PID: { Kp: 0.6, Ki: 1.2, Kd: 0.075 }
          },
          
          // Оптимізовано для швидкої реакції (перегони)
          racing: {
            PID: { Kp: 0.7, Ki: 0.9, Kd: 0.13 }
          },
          
          // Оптимізовано для плавності (кіно)
          cinematic: {
            PID: { Kp: 0.4, Ki: 1.4, Kd: 0.06 }
          },
          
          // Оптимізовано для фристайлу
          freestyle: {
            PID: { Kp: 0.55, Ki: 1.1, Kd: 0.09 }
          }
        },
        
        // Частотний діапазон для аналізу
        frequencyRange: {
          min: 5,  // Мінімальна частота для аналізу (Гц)
          max: 50  // Максимальна частота для аналізу (Гц)
        },
        
        // Порогові значення для різних характеристик
        thresholds: {
          peakAmplitude: 3.0,   // Мінімальна амплітуда для розпізнавання піку
          minPeakDistance: 3,   // Мінімальна відстань між піками (у вибірках)
          confidenceThreshold: 0.6  // Поріг впевненості для використання результатів
        },
        
        ...options
      };
      
      // Генератор випадкових чисел з фіксованим зерном для відтворюваності
      this.random = this.createSeededRandom(24601);
    }
    
    /**
     * Створює генератор випадкових чисел з фіксованим зерном
     * @param {number} seed - Зерно для генератора
     * @returns {Function} - Функція-генератор випадкових чисел
     */
    createSeededRandom(seed) {
      return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    }
    
    /**
     * Генерує повний набір PID-рекомендацій для всіх осей
     * @param {Object} gyroData - Дані гіроскопа (x, y, z)
     * @param {Object} rcData - Дані команд пульта (roll, pitch, yaw)
     * @param {number} sampleRate - Частота дискретизації (Гц)
     * @param {Object} flightProfile - Профіль польоту (необов'язково)
     * @returns {Object} - Повний набір PID-рекомендацій
     */
    generatePIDRecommendations(gyroData, rcData, sampleRate = 1000, flightProfile = null) {
      console.log("Аналіз даних для генерації PID коефіцієнтів методом Зіглера-Нікольса");
      
      // Результати для всіх осей
      const recommendations = {
        roll: null,
        pitch: null,
        yaw: null,
        notes: []
      };
      
      try {
        // Визначаємо стиль налаштування на основі профілю польоту
        const tuningStyle = this.determineTuningStyle(flightProfile);
        recommendations.notes.push(`Використовується стиль налаштування: ${tuningStyle}`);
        
        // Аналізуємо дані для кожної осі
        const rollAnalysis = this.analyzeAxisData(gyroData.x, rcData.roll, sampleRate);
        const pitchAnalysis = this.analyzeAxisData(gyroData.y, rcData.pitch, sampleRate);
        const yawAnalysis = this.analyzeAxisData(gyroData.z, rcData.yaw, sampleRate);
        
        // Оцінюємо взаємозв'язок між осями
        const axisCorrelation = this.calculateAxisCorrelation(gyroData, rcData);
        
        // Генеруємо PID для кожної осі
        recommendations.roll = this.calculateAxisPID(rollAnalysis, 'roll', tuningStyle, axisCorrelation);
        recommendations.pitch = this.calculateAxisPID(pitchAnalysis, 'pitch', tuningStyle, axisCorrelation);
        recommendations.yaw = this.calculateAxisPID(yawAnalysis, 'yaw', tuningStyle, axisCorrelation);
        
        // Аналізуємо результати та додаємо примітки
        this.analyzeResults(recommendations, { rollAnalysis, pitchAnalysis, yawAnalysis });
        
        // Якщо є профіль польоту, додаємо коригування
        if (flightProfile) {
          this.applyFlightProfileAdjustments(recommendations, flightProfile);
        }
        
        // Додаємо дані для налаштування feed-forward
        recommendations.feedforward = this.calculateFeedforwardSettings(rcData, gyroData, sampleRate);
        
        return recommendations;
      } catch (error) {
        console.error("Помилка генерації PID-рекомендацій:", error);
        
        // У випадку помилки повертаємо значення за замовчуванням
        return this.getDefaultPIDRecommendations();
      }
    }
    
    /**
     * Визначає стиль налаштування на основі профілю польоту
     * @param {Object} flightProfile - Профіль польоту
     * @returns {string} - Стиль налаштування ('classic', 'racing', 'freestyle', 'cinematic')
     */
    determineTuningStyle(flightProfile) {
      if (!flightProfile || !flightProfile.flightStyle) {
        return 'classic';
      }
      
      // Відображаємо стиль польоту на стиль налаштування
      switch (flightProfile.flightStyle) {
        case 'racing':
          return 'racing';
        case 'freestyle':
          return 'freestyle';
        case 'cinematic':
          return 'cinematic';
        default:
          return 'classic';
      }
    }
    
    /**
     * Аналізує дані для однієї осі та знаходить критичні параметри
     * @param {number[]} gyroData - Дані гіроскопа для осі
     * @param {number[]} rcData - Дані команд пульта для осі
     * @param {number} sampleRate - Частота дискретизації (Гц)
     * @returns {Object} - Результати аналізу
     */
    analyzeAxisData(gyroData, rcData, sampleRate) {
      // Перевірка на наявність достатньої кількості даних
      if (!gyroData || !rcData || gyroData.length < 100 || rcData.length < 100) {
        console.warn("Недостатньо даних для аналізу осі");
        return {
          ultimateGain: 60,
          ultimatePeriod: 0.05,
          confidence: 0.2,
          characteristics: {
            responsiveness: 0.5,
            overshoot: 0.5,
            settling: 0.5
          }
        };
      }
      
      // Нормалізуємо та підготуємо дані
      const { normalizedGyro, normalizedRC } = this.prepareData(gyroData, rcData);
      
      // Знаходимо моменти різких змін команд (step inputs)
      const stepInputs = this.findStepInputs(normalizedRC);
      
      // Аналізуємо реакцію на step inputs
      const stepResponses = this.analyzeStepResponses(normalizedGyro, normalizedRC, stepInputs, sampleRate);
      
      // Аналізуємо спектр частот (для оцінки резонансу)
      const frequencyAnalysis = this.analyzeFrequencyResponse(normalizedGyro, sampleRate);
      
      // Розраховуємо характеристики осі
      const characteristics = this.calculateAxisCharacteristics(stepResponses, frequencyAnalysis);
      
      // Оцінюємо критичні параметри Зіглера-Нікольса
      const { ultimateGain, ultimatePeriod, confidence } = this.estimateCriticalParameters(
        characteristics, 
        stepResponses,
        frequencyAnalysis
      );
      
      return {
        ultimateGain,
        ultimatePeriod,
        confidence,
        characteristics,
        stepResponses,
        frequencyAnalysis
      };
    }
    
    /**
     * Підготовлює дані для аналізу, нормалізуючи їх
     * @param {number[]} gyroData - Дані гіроскопа
     * @param {number[]} rcData - Дані команд пульта
     * @returns {Object} - Нормалізовані дані
     */
    prepareData(gyroData, rcData) {
      // Вирівнюємо довжину даних
      const length = Math.min(gyroData.length, rcData.length);
      
      // Функція для нормалізації даних гіроскопа (в діапазоні -1..1)
      const normalizeGyro = (data) => {
        const maxAbs = Math.max(...data.map(Math.abs));
        return data.slice(0, length).map(v => v / (maxAbs || 1));
      };
      
      // Функція для нормалізації команд пульта (в діапазоні -1..1)
      const normalizeRC = (data) => {
        return data.slice(0, length).map(v => {
          // Припускаємо, що команди в діапазоні 1000-2000
          return (v - 1500) / 500;
        });
      };
      
      return {
        normalizedGyro: normalizeGyro(gyroData),
        normalizedRC: normalizeRC(rcData)
      };
    }
    
    /**
     * Знаходить моменти різких змін команд (step inputs)
     * @param {number[]} rcData - Нормалізовані дані команд
     * @returns {Array} - Масив індексів кроків
     */
    findStepInputs(rcData) {
      const stepInputs = [];
      const threshold = 0.3; // Мінімальна зміна для визначення кроку
      
      for (let i = 1; i < rcData.length - 5; i++) {
        const prevValue = rcData[i - 1];
        const currentValue = rcData[i];
        const change = Math.abs(currentValue - prevValue);
        
        // Перевіряємо, чи є це різким кроком
        if (change > threshold) {
          // Перевіряємо, чи команда залишається стабільною протягом деякого часу
          let stable = true;
          for (let j = 1; j < 5; j++) {
            if (Math.abs(rcData[i + j] - currentValue) > 0.1) {
              stable = false;
              break;
            }
          }
          
          if (stable) {
            stepInputs.push({
              index: i,
              direction: currentValue > prevValue ? 1 : -1,
              magnitude: change
            });
          }
        }
      }
      
      return stepInputs;
    }
    
    /**
     * Аналізує реакцію на step inputs
     * @param {number[]} gyroData - Нормалізовані дані гіроскопа
     * @param {number[]} rcData - Нормалізовані дані команд
     * @param {Array} stepInputs - Масив кроків
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Array} - Масив характеристик реакції
     */
    analyzeStepResponses(gyroData, rcData, stepInputs, sampleRate) {
      const responses = [];
      
      // Для кожного кроку
      for (const step of stepInputs) {
        // Перевіряємо, чи є достатньо даних після кроку
        if (step.index + 100 >= gyroData.length) continue;
        
        // Отримуємо цільове значення (команда після кроку)
        const targetValue = rcData[step.index];
        
        // Аналізуємо реакцію протягом наступних 100 вибірок
        const responseData = gyroData.slice(step.index, step.index + 100);
        
        // Знаходимо пік реакції
        let peakValue = 0;
        let peakIndex = 0;
        
        for (let i = 0; i < responseData.length; i++) {
          const value = responseData[i] * step.direction;
          if (value > peakValue) {
            peakValue = value;
            peakIndex = i;
          }
        }
        
        // Час до піку (в секундах)
        const timeToPeak = peakIndex / sampleRate;
        
        // Перерегулювання (overshoot)
        const overshoot = Math.max(0, (peakValue - targetValue * step.direction) / (targetValue * step.direction || 1));
        
        // Час встановлення (settling time)
        let settlingIndex = responseData.length - 1;
        const settlingThreshold = 0.05; // Поріг для встановлення (5%)
        
        for (let i = peakIndex; i < responseData.length; i++) {
          const error = Math.abs(responseData[i] * step.direction - targetValue * step.direction);
          if (error <= settlingThreshold * Math.abs(targetValue)) {
            settlingIndex = i;
            break;
          }
        }
        
        const settlingTime = settlingIndex / sampleRate;
        
        // Зберігаємо параметри реакції
        responses.push({
          stepIndex: step.index,
          direction: step.direction,
          magnitude: step.magnitude,
          timeToPeak,
          peakValue,
          overshoot,
          settlingTime,
          response: responseData
        });
      }
      
      return responses;
    }
    
    /**
     * Аналізує частотний відгук гіроскопа
     * @param {number[]} gyroData - Нормалізовані дані гіроскопа
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Результати частотного аналізу
     */
    analyzeFrequencyResponse(gyroData, sampleRate) {
      // Спрощений аналіз частотного відгуку
      // У реальному застосуванні використайте FFT для повного аналізу
      
      // Підраховуємо кількість нульових перетинів (zero-crossings)
      let zeroCrossings = 0;
      for (let i = 1; i < gyroData.length; i++) {
        if ((gyroData[i] > 0 && gyroData[i - 1] <= 0) || 
            (gyroData[i] < 0 && gyroData[i - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      
      // Оцінюємо основну частоту на базі кількості перетинів
      const estimatedFrequency = (zeroCrossings / 2) * (sampleRate / gyroData.length);
      
      // Знаходимо амплітуду (розмах) сигналу
      const min = Math.min(...gyroData);
      const max = Math.max(...gyroData);
      const amplitude = max - min;
      
      return {
        estimatedFrequency,
        amplitude,
        zeroCrossings
      };
    }
    
    /**
     * Розраховує характеристики осі на основі аналізу реакції
     * @param {Array} stepResponses - Результати аналізу step-реакцій
     * @param {Object} frequencyAnalysis - Результати частотного аналізу
     * @returns {Object} - Характеристики осі
     */
    calculateAxisCharacteristics(stepResponses, frequencyAnalysis) {
      // Якщо немає даних реакції, повертаємо значення за замовчуванням
      if (stepResponses.length === 0) {
        return {
          responsiveness: 0.5,
          overshoot: 0.5,
          settling: 0.5,
          naturalFrequency: frequencyAnalysis.estimatedFrequency || 10
        };
      }
      
      // Обчислюємо середні значення характеристик
      let totalTimeToPeak = 0;
      let totalOvershoot = 0;
      let totalSettlingTime = 0;
      let validResponses = 0;
      
      for (const response of stepResponses) {
        // Використовуємо лише значимі реакції
        if (response.magnitude > 0.3) {
          totalTimeToPeak += response.timeToPeak;
          totalOvershoot += response.overshoot;
          totalSettlingTime += response.settlingTime;
          validResponses++;
        }
      }
      
      if (validResponses === 0) {
        return {
          responsiveness: 0.5,
          overshoot: 0.5,
          settling: 0.5,
          naturalFrequency: frequencyAnalysis.estimatedFrequency || 10
        };
      }
      
      // Середні значення
      const avgTimeToPeak = totalTimeToPeak / validResponses;
      const avgOvershoot = totalOvershoot / validResponses;
      const avgSettlingTime = totalSettlingTime / validResponses;
      
      // Нормалізація характеристик
      // - responsiveness: обернено пропорційна часу до піку (0-1, де 1 - найшвидша реакція)
      const responsiveness = Math.max(0, Math.min(1, 0.05 / (avgTimeToPeak || 0.05)));
      
      // - overshoot: пропорційний перерегулюванню (0-1, де 0 - немає перерегулювання)
      const overshoot = Math.max(0, Math.min(1, avgOvershoot));
      
      // - settling: обернено пропорційна часу встановлення (0-1, де 1 - найшвидше встановлення)
      const settling = Math.max(0, Math.min(1, 0.2 / (avgSettlingTime || 0.2)));
      
      // Оцінка природної частоти системи
      const naturalFrequency = 1 / (avgTimeToPeak * 4) || frequencyAnalysis.estimatedFrequency || 10;
      
      return {
        responsiveness,
        overshoot,
        settling,
        naturalFrequency
      };
    }
    
    /**
     * Оцінює критичні параметри для методу Зіглера-Нікольса
     * @param {Object} characteristics - Характеристики осі
     * @param {Array} stepResponses - Результати аналізу step-реакцій
     * @param {Object} frequencyAnalysis - Результати частотного аналізу
     * @returns {Object} - Критичні параметри та впевненість
     */
    estimateCriticalParameters(characteristics, stepResponses, frequencyAnalysis) {
      // Оцінка критичного періоду на основі природної частоти
      const ultimatePeriod = 1 / characteristics.naturalFrequency;
      
      // Оцінка критичного підсилення на основі перерегулювання та амплітуди
      let ultimateGain = 60; // Значення за замовчуванням
      
      if (characteristics.overshoot > 0.1) {
        // Якщо є перерегулювання, оцінюємо критичне підсилення на його основі
        // Чим більше перерегулювання, тим ближче система до критичного підсилення
        ultimateGain = 30 / (characteristics.overshoot + 0.1);
      } else if (stepResponses.length > 0) {
        // Якщо немає перерегулювання, оцінюємо на основі швидкості реакції
        ultimateGain = 60 * characteristics.responsiveness;
      }
      
      // Обмежуємо значення до розумних меж
      ultimateGain = Math.max(30, Math.min(120, ultimateGain));
      
      // Обчислюємо впевненість в оцінці
      let confidence = 0.5; // Середня впевненість за замовчуванням
      
      if (stepResponses.length > 3 && characteristics.overshoot > 0.2) {
        confidence = 0.8; // Висока впевненість, якщо є багато даних і чітке перерегулювання
      } else if (stepResponses.length > 0) {
        confidence = 0.6; // Середня впевненість, якщо є хоч якісь дані
      } else {
        confidence = 0.3; // Низька впевненість, якщо даних мало
      }
      
      return {
        ultimateGain,
        ultimatePeriod,
        confidence
      };
    }
    
    /**
     * Обчислює кореляцію між осями для врахування взаємного впливу
     * @param {Object} gyroData - Дані гіроскопа для всіх осей
     * @param {Object} rcData - Дані команд пульта для всіх осей
     * @returns {Object} - Матриця кореляції між осями
     */
    calculateAxisCorrelation(gyroData, rcData) {
      // Спрощений розрахунок кореляції
      // Обчислюємо кореляцію між осями гіроскопа
      const rollPitchCorr = this.calculateCorrelation(gyroData.x, gyroData.y);
      const rollYawCorr = this.calculateCorrelation(gyroData.x, gyroData.z);
      const pitchYawCorr = this.calculateCorrelation(gyroData.y, gyroData.z);
      
      return {
        rollPitch: rollPitchCorr,
        rollYaw: rollYawCorr,
        pitchYaw: pitchYawCorr
      };
    }
    
    /**
     * Обчислює кореляцію між двома масивами
     * @param {number[]} a - Перший масив
     * @param {number[]} b - Другий масив
     * @returns {number} - Коефіцієнт кореляції (-1 до 1)
     */
    calculateCorrelation(a, b) {
      const length = Math.min(a.length, b.length);
      if (length < 10) return 0;
      
      let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
      
      for (let i = 0; i < length; i++) {
        sumA += a[i];
        sumB += b[i];
        sumAB += a[i] * b[i];
        sumA2 += a[i] * a[i];
        sumB2 += b[i] * b[i];
      }
      
      const avgA = sumA / length;
      const avgB = sumB / length;
      
      let numerator = sumAB - length * avgA * avgB;
      let denominator = Math.sqrt((sumA2 - length * avgA * avgA) * (sumB2 - length * avgB * avgB));
      
      if (denominator === 0) return 0;
      
      return numerator / denominator;
    }
    
    /**
     * Розраховує PID коефіцієнти для однієї осі
     * @param {Object} axisAnalysis - Результати аналізу для осі
     * @param {string} axis - Назва осі ('roll', 'pitch', 'yaw')
     * @param {string} tuningStyle - Стиль налаштування
     * @param {Object} axisCorrelation - Кореляція між осями
     * @returns {Object} - PID коефіцієнти для осі
     */
    calculateAxisPID(axisAnalysis, axis, tuningStyle, axisCorrelation) {
      // Якщо аналіз не проведено, повертаємо значення за замовчуванням
      if (!axisAnalysis) {
        return this.getDefaultPIDForAxis(axis);
      }
      
      const { ultimateGain, ultimatePeriod, confidence } = axisAnalysis;
      
      // Отримуємо відповідний набір коефіцієнтів
      const coefficientSet = 
        this.options.coefficients[tuningStyle]?.PID || 
        this.options.coefficients.classic.PID;
      
      // Розраховуємо базові значення за формулами Зіглера-Нікольса
      let Kp = Math.round(coefficientSet.Kp * ultimateGain);
      let Ki = Math.round(coefficientSet.Ki * ultimateGain / ultimatePeriod);
      let Kd = Math.round(coefficientSet.Kd * ultimateGain * ultimatePeriod);
      
      // Коригуємо значення за віссю
      if (axis === 'yaw') {
        // Для Yaw зазвичай знижений D-term
        Kd = Math.round(Kd * 0.2);
        // Та підвищений I-term
        Ki = Math.round(Ki * 1.2);
      }
      
      // Коригуємо на основі кореляції осей
      if (axis === 'roll' || axis === 'pitch') {
        // Якщо осі сильно корелюють, коригуємо значення
        const correlation = Math.abs(axisCorrelation.rollPitch);
        if (correlation > 0.6) {
          // Зменшуємо P і D, збільшуємо I для меншої взаємодії між осями
          Kp = Math.round(Kp * (1 - correlation * 0.1));
          Ki = Math.round(Ki * (1 + correlation * 0.1));
          Kd = Math.round(Kd * (1 - correlation * 0.2));
        }
      }
      
      // Обмежуємо значення розумними межами
      Kp = this.constrainPIDValue(Kp, axis, 'P');
      Ki = this.constrainPIDValue(Ki, axis, 'I');
      Kd = this.constrainPIDValue(Kd, axis, 'D');
      
      return {
        P: Kp,
        I: Ki,
        D: Kd,
        confidence
      };
    }
    
    /**
     * Обмежує значення PID-коефіцієнта в розумних межах
     * @param {number} value - Значення коефіцієнта
     * @param {string} axis - Назва осі ('roll', 'pitch', 'yaw')
     * @param {string} term - Назва терму ('P', 'I', 'D')
     * @returns {number} - Обмежене значення
     */
    constrainPIDValue(value, axis, term) {
      // Базові обмеження для всіх осей
      const limits = {
        P: { min: 20, max: 100 },
        I: { min: 30, max: 150 },
        D: { min: 0, max: 70 }
      };
      
      // Спеціальні обмеження для Yaw
      if (axis === 'yaw' && term === 'D') {
        limits.D.max = 30; // Для Yaw зазвичай менший D
      }
      
      return Math.max(limits[term].min, Math.min(limits[term].max, value));
    }
    
    /**
     * Аналізує результати та додає примітки
     * @param {Object} recommendations - Рекомендації PID
     * @param {Object} analysisData - Дані аналізу для всіх осей
     */
    analyzeResults(recommendations, analysisData) {
      const { rollAnalysis, pitchAnalysis, yawAnalysis } = analysisData;
      
      // Перевіряємо впевненість у результатах
      if (rollAnalysis?.confidence < 0.4 || pitchAnalysis?.confidence < 0.4) {
        recommendations.notes.push("Низька впевненість у рекомендаціях. Потрібно більше даних з чіткими ручними командами для точних результатів.");
      }
      
      // Перевіряємо характеристики реакції
      if (rollAnalysis?.characteristics.overshoot > 0.7 || pitchAnalysis?.characteristics.overshoot > 0.7) {
        recommendations.notes.push("Виявлено високе перерегулювання. Рекомендується зменшити P або збільшити D для кращого контролю.");
      }
      
      if (rollAnalysis?.characteristics.responsiveness < 0.3 || pitchAnalysis?.characteristics.responsiveness < 0.3) {
        recommendations.notes.push("Виявлено повільну реакцію системи. Рекомендовані значення підвищують чутливість квадрокоптера.");
      }
      
      // Аналіз для осі Yaw
      if (yawAnalysis && yawAnalysis.characteristics.settling < 0.3) {
        recommendations.notes.push("Вісь Yaw має повільне встановлення. Рекомендується збільшити I-складову для кращого утримання напрямку.");
      }
    }
    
    /**
     * Застосовує коригування на основі профілю польоту
     * @param {Object} recommendations - Рекомендації PID
     * @param {Object} flightProfile - Профіль польоту
     */
    applyFlightProfileAdjustments(recommendations, flightProfile) {
      // Якщо немає профілю, нічого не робимо
      if (!flightProfile || !flightProfile.pidAdjustments) return;
      
      const { p, i, d } = flightProfile.pidAdjustments;
      
      // Коригуємо значення PID для кожної осі
      ['roll', 'pitch', 'yaw'].forEach(axis => {
        if (recommendations[axis]) {
          recommendations[axis].P = Math.round(recommendations[axis].P * p);
          recommendations[axis].I = Math.round(recommendations[axis].I * i);
          recommendations[axis].D = Math.round(recommendations[axis].D * d);
          
          // Переобмежуємо значення
          recommendations[axis].P = this.constrainPIDValue(recommendations[axis].P, axis, 'P');
          recommendations[axis].I = this.constrainPIDValue(recommendations[axis].I, axis, 'I');
          recommendations[axis].D = this.constrainPIDValue(recommendations[axis].D, axis, 'D');
        }
      });
      
      // Додаємо примітку про застосування коригувань
      recommendations.notes.push(`Застосовано коригування для стилю польоту "${flightProfile.flightStyle}" (P=${p.toFixed(2)}, I=${i.toFixed(2)}, D=${d.toFixed(2)})`);
    }
    
    /**
     * Розраховує налаштування для feed-forward
     * @param {Object} rcData - Дані команд пульта
     * @param {Object} gyroData - Дані гіроскопа
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Налаштування feed-forward
     */
    calculateFeedforwardSettings(rcData, gyroData, sampleRate) {
      // Розраховуємо швидкість зміни команд RC
      const calculateRates = (data) => {
        const rates = [];
        for (let i = 1; i < data.length; i++) {
          rates.push(Math.abs(data[i] - data[i - 1]));
        }
        return rates;
      };
      
      const rollRates = calculateRates(rcData.roll);
      const pitchRates = calculateRates(rcData.pitch);
      
      // Знаходимо 90-й перцентиль швидкостей для кожної осі
      const getPercentile = (values, percentile) => {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.floor(percentile * (sorted.length - 1));
        return sorted[index] || 0;
      };
      
      const rollRate90 = getPercentile(rollRates, 0.9);
      const pitchRate90 = getPercentile(pitchRates, 0.9);
      
      // Нормалізуємо і масштабуємо до діапазону Betaflight (0-100)
      const maxRate = 100; // Типова максимальна швидкість зміни
      
      const rollFF = Math.min(100, Math.round(rollRate90 / maxRate * 75));
      const pitchFF = Math.min(100, Math.round(pitchRate90 / maxRate * 75));
      
      // Для Yaw зазвичай менший FF
      const yawFF = Math.round(Math.min(rollFF, pitchFF) * 0.5);
      
      return {
        roll: rollFF,
        pitch: pitchFF,
        yaw: yawFF,
        transition: Math.min(100, Math.max(0, Math.round((rollFF + pitchFF) / 4))),
        boost: 15
      };
    }
    
    /**
     * Повертає значення PID за замовчуванням для осі
     * @param {string} axis - Назва осі ('roll', 'pitch', 'yaw')
     * @returns {Object} - PID значення за замовчуванням
     */
    getDefaultPIDForAxis(axis) {
      const defaults = {
        roll: { P: 45, I: 80, D: 30, confidence: 0.4 },
        pitch: { P: 45, I: 80, D: 30, confidence: 0.4 },
        yaw: { P: 40, I: 80, D: 0, confidence: 0.4 }
      };
      
      return defaults[axis] || defaults.roll;
    }
    
    /**
     * Повертає повний набір рекомендацій PID за замовчуванням
     * @returns {Object} - Рекомендації PID за замовчуванням
     */
    getDefaultPIDRecommendations() {
      return {
        roll: this.getDefaultPIDForAxis('roll'),
        pitch: this.getDefaultPIDForAxis('pitch'),
        yaw: this.getDefaultPIDForAxis('yaw'),
        feedforward: {
          roll: 40,
          pitch: 40,
          yaw: 20,
          transition: 20,
          boost: 15
        },
        notes: [
          "Використано значення PID за замовчуванням через недостатню кількість даних для аналізу.",
          "Для отримання точніших рекомендацій виконайте політ з чіткими ручними командами по всіх осях."
        ]
      };
    }
    
    /**
     * Генерує CLI-команди для налаштування PID
     * @param {Object} recommendations - Рекомендації PID
     * @returns {string[]} - Масив CLI-команд
     */
    generatePIDCommands(recommendations) {
      const commands = [];
      
      // PID команди
      commands.push('# PID values');
      commands.push(`set pid_roll_p = ${recommendations.roll.P}`);
      commands.push(`set pid_roll_i = ${recommendations.roll.I}`);
      commands.push(`set pid_roll_d = ${recommendations.roll.D}`);
      commands.push(`set pid_pitch_p = ${recommendations.pitch.P}`);
      commands.push(`set pid_pitch_i = ${recommendations.pitch.I}`);
      commands.push(`set pid_pitch_d = ${recommendations.pitch.D}`);
      commands.push(`set pid_yaw_p = ${recommendations.yaw.P}`);
      commands.push(`set pid_yaw_i = ${recommendations.yaw.I}`);
      commands.push(`set pid_yaw_d = ${recommendations.yaw.D}`);
      
      // Feed-forward команди
      if (recommendations.feedforward) {
        commands.push('');
        commands.push('# Feed-forward values');
        commands.push(`set feed_forward_roll = ${recommendations.feedforward.roll}`);
        commands.push(`set feed_forward_pitch = ${recommendations.feedforward.pitch}`);
        commands.push(`set feed_forward_yaw = ${recommendations.feedforward.yaw}`);
        commands.push(`set ff_transition = ${recommendations.feedforward.transition}`);
        commands.push(`set ff_boost = ${recommendations.feedforward.boost}`);
      }
      
      return commands;
    }
  }