/**
 * Клас для аналізу профілю польоту, який визначає стиль пілотування
 * та пропонує відповідні коефіцієнти для PID налаштувань
 */
export class FlightProfileAnalyzer {
    /**
     * Аналізує дані польоту для визначення стилю пілотування
     * @param {Object} rcData - Дані команд пульта (roll, pitch, yaw, throttle)
     * @param {Object} gyroData - Дані гіроскопа (x, y, z)
     * @param {Object} motorData - Дані моторів
     * @returns {Object} - Результати аналізу профілю польоту
     */
    analyzeFlightProfile(rcData, gyroData, motorData) {
      try {
        // Аналіз характеристик пілотування
        const aggressiveness = this.calculateAggressiveness(rcData);
        const smoothness = this.calculateSmoothness(gyroData);
        const throttleProfile = this.analyzeThrottleProfile(rcData.throttle);
        const motorUsage = this.analyzeMotorUsage(motorData);
        
        // Визначення типу польоту на основі характеристик
        const flightStyle = this.determineFlightStyle(aggressiveness, smoothness, throttleProfile);
        
        // Коефіцієнти для налаштування PID на основі стилю польоту
        const pidAdjustments = this.getPIDAdjustments(flightStyle);
        
        // Рекомендації для фільтрів на основі стилю польоту
        const filterAdjustments = this.getFilterAdjustments(flightStyle, motorUsage);
        
        return {
          flightStyle,
          characteristics: {
            aggressiveness,
            smoothness,
            throttleProfile,
            motorUsage
          },
          pidAdjustments,
          filterAdjustments
        };
      } catch (error) {
        console.error("Помилка аналізу профілю польоту:", error);
        return {
          flightStyle: "unknown",
          characteristics: {
            aggressiveness: 0.5,
            smoothness: 0.5,
            throttleProfile: "mixed",
            motorUsage: { average: 0.5, peaks: 0.5 }
          },
          pidAdjustments: { p: 1, i: 1, d: 1 },
          filterAdjustments: { gyro: 1, dterm: 1 }
        };
      }
    }
    
    /**
     * Обчислює агресивність пілотування на основі команд пульта
     * @param {Object} rcData - Дані команд пульта
     * @returns {number} - Індекс агресивності (0-1)
     */
    calculateAggressiveness(rcData) {
      // Обчислюємо швидкість зміни стіків
      const rollRates = this.calculateRates(rcData.roll);
      const pitchRates = this.calculateRates(rcData.pitch);
      const yawRates = this.calculateRates(rcData.yaw);
      
      // Знаходимо 90-й перцентиль швидкостей для кожної осі
      const rollRate90 = this.getPercentile(rollRates, 0.9);
      const pitchRate90 = this.getPercentile(pitchRates, 0.9);
      const yawRate90 = this.getPercentile(yawRates, 0.9);
      
      // Знаходимо екстремуми команд - наскільки сильно відхиляються стіки
      const rollExtremes = this.calculateExtremes(rcData.roll);
      const pitchExtremes = this.calculateExtremes(rcData.pitch);
      const yawExtremes = this.calculateExtremes(rcData.yaw);
      
      // Обчислюємо загальний індекс агресивності
      const rateAggressiveness = (rollRate90 + pitchRate90 + yawRate90 / 3) / 100;
      const extremeAggressiveness = (rollExtremes + pitchExtremes + yawExtremes) / 3;
      
      // Зважена сума двох факторів
      return Math.min(1, (rateAggressiveness * 0.7 + extremeAggressiveness * 0.3));
    }
    
    /**
     * Обчислює швидкість зміни значень
     * @param {number[]} values - Масив значень
     * @returns {number[]} - Масив швидкостей зміни
     */
    calculateRates(values) {
      const rates = [];
      for (let i = 1; i < values.length; i++) {
        rates.push(Math.abs(values[i] - values[i - 1]));
      }
      return rates;
    }
    
    /**
     * Знаходить перцентиль у масиві значень
     * @param {number[]} values - Масив значень
     * @param {number} percentile - Перцентиль (0-1)
     * @returns {number} - Значення перцентиля
     */
    getPercentile(values, percentile) {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.floor(percentile * (sorted.length - 1));
      return sorted[index] || 0;
    }
    
    /**
     * Обчислює екстремальність команд (наскільки сильно відхиляються стіки)
     * @param {number[]} values - Масив значень
     * @returns {number} - Індекс екстремальності (0-1)
     */
    calculateExtremes(values) {
      if (values.length === 0) return 0;
      
      // Нормалізуємо значення до діапазону -1..1
      const normalized = values.map(v => {
        // Припускаємо, що RC команди в діапазоні 1000-2000
        return (v - 1500) / 500;
      });
      
      // Рахуємо скільки часу стіки знаходяться у крайніх положеннях (>80%)
      let extremeCount = 0;
      for (const value of normalized) {
        if (Math.abs(value) > 0.8) {
          extremeCount++;
        }
      }
      
      return extremeCount / normalized.length;
    }
    
    /**
     * Обчислює плавність руху на основі даних гіроскопа
     * @param {Object} gyroData - Дані гіроскопа
     * @returns {number} - Індекс плавності (0-1), де 1 - найплавніше
     */
    calculateSmoothness(gyroData) {
      // Обчислюємо другу похідну (прискорення) для кожної осі
      const xAcceleration = this.calculateSecondDerivative(gyroData.x);
      const yAcceleration = this.calculateSecondDerivative(gyroData.y);
      const zAcceleration = this.calculateSecondDerivative(gyroData.z);
      
      // Обчислюємо середньоквадратичне значення прискорень
      const xRMS = this.calculateRMS(xAcceleration);
      const yRMS = this.calculateRMS(yAcceleration);
      const zRMS = this.calculateRMS(zAcceleration);
      
      // Чим більше середньоквадратичне прискорення, тим менша плавність
      const accelerationValue = (xRMS + yRMS + zRMS) / 3;
      
      // Нормалізуємо до діапазону 0-1, де 1 - найплавніше
      // Типові значення для квадрокоптера: 5-50
      return Math.max(0, Math.min(1, 1 - accelerationValue / 50));
    }
    
    /**
     * Обчислює другу похідну масиву значень
     * @param {number[]} values - Масив значень
     * @returns {number[]} - Друга похідна (прискорення)
     */
    calculateSecondDerivative(values) {
      const result = [];
      for (let i = 2; i < values.length; i++) {
        // Друга похідна як різниця перших похідних
        const firstDerivative1 = values[i] - values[i - 1];
        const firstDerivative2 = values[i - 1] - values[i - 2];
        result.push(firstDerivative1 - firstDerivative2);
      }
      return result;
    }
    
    /**
     * Обчислює середньоквадратичне значення масиву
     * @param {number[]} values - Масив значень
     * @returns {number} - Середньоквадратичне значення
     */
    calculateRMS(values) {
      if (values.length === 0) return 0;
      const squaredSum = values.reduce((sum, value) => sum + value * value, 0);
      return Math.sqrt(squaredSum / values.length);
    }
    
    /**
     * Аналізує профіль газу для визначення стилю польоту
     * @param {number[]} throttleValues - Масив значень газу
     * @returns {string} - Тип профілю газу (punchouts, hovering, mixed)
     */
    analyzeThrottleProfile(throttleValues) {
      if (throttleValues.length === 0) return "mixed";
      
      // Нормалізуємо значення газу до діапазону 0-1
      const normalized = throttleValues.map(v => {
        // Припускаємо, що RC команди в діапазоні 1000-2000
        return (v - 1000) / 1000;
      });
      
      // Обчислюємо гістограму використання газу
      const histogram = this.calculateHistogram(normalized, 10);
      
      // Аналізуємо гістограму для визначення патернів
      
      // Перевіряємо на "punchouts" - часте використання високого газу
      const highThrottleRatio = (histogram[8] + histogram[9]) / normalized.length;
      
      // Перевіряємо на "hovering" - часте використання середнього газу
      const midThrottleRatio = (histogram[4] + histogram[5] + histogram[6]) / normalized.length;
      
      // Визначаємо тип на основі співвідношень
      if (highThrottleRatio > 0.4) {
        return "punchouts";
      } else if (midThrottleRatio > 0.5) {
        return "hovering";
      } else {
        return "mixed";
      }
    }
    
    /**
     * Обчислює гістограму значень
     * @param {number[]} values - Масив значень в діапазоні 0-1
     * @param {number} bins - Кількість сегментів гістограми
     * @returns {number[]} - Гістограма (кількість значень у кожному сегменті)
     */
    calculateHistogram(values, bins) {
      const histogram = new Array(bins).fill(0);
      
      for (const value of values) {
        const binIndex = Math.min(bins - 1, Math.floor(value * bins));
        histogram[binIndex]++;
      }
      
      return histogram;
    }
    
    /**
     * Аналізує використання моторів для виявлення проблем
     * @param {Object} motorData - Дані моторів
     * @returns {Object} - Характеристики використання моторів
     */
    analyzeMotorUsage(motorData) {
      // Обчислюємо середнє використання моторів
      const motor0Avg = this.calculateAverage(motorData.motor0);
      const motor1Avg = this.calculateAverage(motorData.motor1);
      const motor2Avg = this.calculateAverage(motorData.motor2);
      const motor3Avg = this.calculateAverage(motorData.motor3);
      
      const motorAvgs = [motor0Avg, motor1Avg, motor2Avg, motor3Avg];
      
      // Обчислюємо середнє значення всіх моторів
      const overallAvg = this.calculateAverage(motorAvgs);
      
      // Нормалізуємо до діапазону 0-1 (припускаємо, що діапазон моторів 1000-2000)
      const normalizedAvg = (overallAvg - 1000) / 1000;
      
      // Знаходимо пікове використання моторів
      const motor0Peak = this.getPercentile(motorData.motor0, 0.95);
      const motor1Peak = this.getPercentile(motorData.motor1, 0.95);
      const motor2Peak = this.getPercentile(motorData.motor2, 0.95);
      const motor3Peak = this.getPercentile(motorData.motor3, 0.95);
      
      const motorPeaks = [motor0Peak, motor1Peak, motor2Peak, motor3Peak];
      
      // Обчислюємо середнє пікове значення
      const overallPeak = this.calculateAverage(motorPeaks);
      
      // Нормалізуємо до діапазону 0-1
      const normalizedPeak = (overallPeak - 1000) / 1000;
      
      // Обчислюємо баланс моторів (ідеально, коли всі мотори працюють однаково)
      const balance = 1 - this.calculateStandardDeviation(motorAvgs) / 100;
      
      return {
        average: normalizedAvg,
        peaks: normalizedPeak,
        balance: Math.max(0, Math.min(1, balance))
      };
    }
    
    /**
     * Обчислює середнє значення масиву
     * @param {number[]} values - Масив значень
     * @returns {number} - Середнє значення
     */
    calculateAverage(values) {
      if (values.length === 0) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    
    /**
     * Обчислює стандартне відхилення масиву
     * @param {number[]} values - Масив значень
     * @returns {number} - Стандартне відхилення
     */
    calculateStandardDeviation(values) {
      if (values.length <= 1) return 0;
      
      const avg = this.calculateAverage(values);
      const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
      const variance = this.calculateAverage(squaredDiffs);
      
      return Math.sqrt(variance);
    }
    
    /**
     * Визначає стиль польоту на основі характеристик
     * @param {number} aggressiveness - Індекс агресивності
     * @param {number} smoothness - Індекс плавності
     * @param {string} throttleProfile - Профіль газу
     * @returns {string} - Стиль польоту (racing, freestyle, cinematic, mixed)
     */
    determineFlightStyle(aggressiveness, smoothness, throttleProfile) {
      // Визначаємо стиль на основі комбінації факторів
      
      // Racing: високий рівень агресивності, частий газ на максимумі
      if (aggressiveness > 0.7 && throttleProfile === "punchouts") {
        return "racing";
      }
      
      // Cinematic: високий рівень плавності, помірний газ
      if (smoothness > 0.7 && throttleProfile === "hovering") {
        return "cinematic";
      }
      
      // Freestyle: середня агресивність, змішаний газ
      if (aggressiveness > 0.4 && aggressiveness < 0.8) {
        return "freestyle";
      }
      
      // За замовчуванням
      return "mixed";
    }
    
    /**
     * Повертає рекомендовані коефіцієнти для PID на основі стилю польоту
     * @param {string} flightStyle - Стиль польоту
     * @returns {Object} - Коефіцієнти для P, I, D
     */
    getPIDAdjustments(flightStyle) {
      switch (flightStyle) {
        case "racing":
          // Для перегонів: вищий P для швидшої реакції, нижчий I, вищий D для стабілізації
          return { p: 1.2, i: 0.8, d: 1.15 };
        
        case "freestyle":
          // Для фристайлу: збалансований підхід з невеликим акцентом на D
          return { p: 1.0, i: 1.0, d: 1.1 };
        
        case "cinematic":
          // Для кіно: нижчий P для плавності, вищий I для стабільності, нижчий D
          return { p: 0.85, i: 1.15, d: 0.9 };
        
        case "mixed":
        default:
          // За замовчуванням
          return { p: 1.0, i: 1.0, d: 1.0 };
      }
    }
    
    /**
     * Повертає рекомендовані коефіцієнти для фільтрів на основі стилю польоту
     * @param {string} flightStyle - Стиль польоту
     * @param {Object} motorUsage - Характеристики використання моторів
     * @returns {Object} - Коефіцієнти для фільтрів
     */
    getFilterAdjustments(flightStyle, motorUsage) {
      let gyroAdjustment = 1.0;
      let dtermAdjustment = 1.0;
      
      switch (flightStyle) {
        case "racing":
          // Для перегонів: менше фільтрації для швидшої реакції
          gyroAdjustment = 1.2;
          dtermAdjustment = 1.1;
          break;
        
        case "freestyle":
          // Для фристайлу: стандартна фільтрація
          gyroAdjustment = 1.0;
          dtermAdjustment = 1.0;
          break;
        
        case "cinematic":
          // Для кіно: більше фільтрації для плавності
          gyroAdjustment = 0.8;
          dtermAdjustment = 0.85;
          break;
      }
      
      // Коригуємо на основі використання моторів
      // Якщо пікове використання моторів високе, збільшуємо фільтрацію
      if (motorUsage.peaks > 0.85) {
        gyroAdjustment *= 0.9;
        dtermAdjustment *= 0.9;
      }
      
      // Якщо баланс моторів поганий, збільшуємо фільтрацію
      if (motorUsage.balance < 0.7) {
        gyroAdjustment *= 0.9;
        dtermAdjustment *= 0.85;
      }
      
      return {
        gyro: gyroAdjustment,
        dterm: dtermAdjustment
      };
    }
  }