/**
 * Бібліотека для оптимізації параметрів PID-регуляторів
 * Включає реалізацію методу Зіглера-Нікольса та інших алгоритмів налаштування PID
 */

export class PIDTuner {
    /**
     * Метод Зіглера-Нікольса для налаштування PID-регуляторів
     * @param {Object} systemParams - Параметри системи
     * @param {number} systemParams.ultimateGain - Граничний коефіцієнт підсилення (Ku)
     * @param {number} systemParams.ultimatePeriod - Граничний період коливань (Tu) в секундах
     * @param {string} controllerType - Тип контролера ('P', 'PI', 'PD', або 'PID')
     * @returns {Object} - Розраховані параметри PID
     */
    static zieglerNichols(systemParams, controllerType = 'PID') {
      const { ultimateGain, ultimatePeriod } = systemParams;
      
      if (!ultimateGain || !ultimatePeriod) {
        throw new Error('Необхідно вказати граничний коефіцієнт підсилення та граничний період');
      }
      
      let Kp, Ti, Td;
      
      // Коефіцієнти згідно з методом Зіглера-Нікольса
      switch (controllerType) {
        case 'P':
          Kp = 0.5 * ultimateGain;
          Ti = 0;
          Td = 0;
          break;
        case 'PI':
          Kp = 0.45 * ultimateGain;
          Ti = 0.83 * ultimatePeriod;
          Td = 0;
          break;
        case 'PD':
          Kp = 0.8 * ultimateGain;
          Ti = 0;
          Td = 0.125 * ultimatePeriod;
          break;
        case 'PID':
        default:
          Kp = 0.6 * ultimateGain;
          Ti = 0.5 * ultimatePeriod;
          Td = 0.125 * ultimatePeriod;
          break;
      }
      
      // Перетворення Ti і Td в Ki і Kd
      let Ki = Ti !== 0 ? Kp / Ti : 0;
      let Kd = Kp * Td;
      
      // Масштабування для конкретного використання в Betaflight
      // Betaflight використовує інші одиниці і діапазони для PID
      // Це типовий діапазон для 5-дюймових квадрокоптерів
      Kp = this.scaleToBetaflight(Kp, 20, 50);
      Ki = this.scaleToBetaflight(Ki, 40, 100);
      Kd = this.scaleToBetaflight(Kd, 15, 35);
      
      return { Kp, Ki, Kd };
    }
    
    /**
     * Масштабує значення до типового діапазону Betaflight
     * @param {number} value - Вхідне значення
     * @param {number} min - Мінімальне значення у діапазоні Betaflight
     * @param {number} max - Максимальне значення у діапазоні Betaflight
     * @returns {number} - Масштабоване значення
     */
    static scaleToBetaflight(value, min, max) {
      // Нормалізуємо значення
      const normalized = Math.max(0, Math.min(1, value));
      
      // Масштабуємо до діапазону Betaflight
      return Math.round(min + normalized * (max - min));
    }
    
    /**
     * Розраховує параметри системи на основі аналізу даних гіроскопа та PID
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} pidData - Дані PID
     * @param {Object} rcData - Дані команд пульта (RC)
     * @returns {Object} - Параметри системи для методу Зіглера-Нікольса
     */
    static estimateSystemParameters(gyroData, pidData, rcData) {
      // Знайдемо максимальні відхилення гіроскопа при максимальних керуючих впливах
      const maxGyroResponses = this.findMaxDeviations(gyroData, rcData);
      
      // Оцінимо граничний коефіцієнт підсилення на основі максимальних відхилень
      const ultimateGain = this.estimateUltimateGain(maxGyroResponses, pidData);
      
      // Оцінимо граничний період на основі часу відгуку системи
      const ultimatePeriod = this.estimateUltimatePeriod(gyroData, rcData);
      
      return {
        ultimateGain,
        ultimatePeriod
      };
    }
    
    /**
     * Знаходить максимальні відхилення гіроскопа при керуючих впливах
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} rcData - Дані команд пульта (RC)
     * @returns {Object} - Максимальні відхилення по осях
     */
    static findMaxDeviations(gyroData, rcData) {
      const responses = {
        roll: { max: 0, input: 0 },
        pitch: { max: 0, input: 0 },
        yaw: { max: 0, input: 0 }
      };
      
      // Аналізуємо дані для осі Roll
      for (let i = 0; i < gyroData.x.length; i++) {
        if (Math.abs(gyroData.x[i]) > responses.roll.max && Math.abs(rcData.roll[i]) > 100) {
          responses.roll.max = Math.abs(gyroData.x[i]);
          responses.roll.input = Math.abs(rcData.roll[i]);
        }
      }
      
      // Аналізуємо дані для осі Pitch
      for (let i = 0; i < gyroData.y.length; i++) {
        if (Math.abs(gyroData.y[i]) > responses.pitch.max && Math.abs(rcData.pitch[i]) > 100) {
          responses.pitch.max = Math.abs(gyroData.y[i]);
          responses.pitch.input = Math.abs(rcData.pitch[i]);
        }
      }
      
      // Аналізуємо дані для осі Yaw
      for (let i = 0; i < gyroData.z.length; i++) {
        if (Math.abs(gyroData.z[i]) > responses.yaw.max && Math.abs(rcData.yaw[i]) > 100) {
          responses.yaw.max = Math.abs(gyroData.z[i]);
          responses.yaw.input = Math.abs(rcData.yaw[i]);
        }
      }
      
      return responses;
    }
    
    /**
     * Оцінює граничний коефіцієнт підсилення на основі відхилень гіроскопа
     * @param {Object} maxResponses - Максимальні відхилення гіроскопа
     * @param {Object} pidData - Дані PID
     * @returns {number} - Оцінка граничного коефіцієнта підсилення
     */
    static estimateUltimateGain(maxResponses, pidData) {
      // Знаходимо максимальне значення P-складової
      const maxP = Math.max(...pidData.p);
      
      // Якщо відсутні дані відхилень або PID, повертаємо значення за замовчуванням
      if (maxP === 0 || 
          (maxResponses.roll.max === 0 && 
           maxResponses.pitch.max === 0 && 
           maxResponses.yaw.max === 0)) {
        return 0.8; // Типове значення
      }
      
      // Розраховуємо граничний коефіцієнт підсилення
      // Це співвідношення між максимальною реакцією системи та поточним P-коефіцієнтом
      const rollGain = maxResponses.roll.max !== 0 ? maxResponses.roll.input / maxResponses.roll.max : 0;
      const pitchGain = maxResponses.pitch.max !== 0 ? maxResponses.pitch.input / maxResponses.pitch.max : 0;
      
      // Обираємо найбільш надійне значення (ігноруючи нульові)
      let ultimateGain = 0;
      if (rollGain > 0 && pitchGain > 0) {
        ultimateGain = (rollGain + pitchGain) / 2;
      } else if (rollGain > 0) {
        ultimateGain = rollGain;
      } else if (pitchGain > 0) {
        ultimateGain = pitchGain;
      } else {
        ultimateGain = 0.8; // Значення за замовчуванням
      }
      
      return ultimateGain;
    }
    
    /**
     * Оцінює граничний період на основі відгуку системи
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} rcData - Дані команд пульта (RC)
     * @returns {number} - Оцінка граничного періоду в секундах
     */
    static estimateUltimatePeriod(gyroData, rcData) {
      // Для спрощення, використовуємо типове значення для квадрокоптерів
      // Точний розрахунок вимагає аналізу періоду коливань або часу до перерегулювання
      
      // Типове значення для квадрокоптера з Betaflight
      return 0.05; // 50 мс
    }
    
    /**
     * Генерує рекомендації PID на основі аналізу польотних даних
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} pidData - Дані PID
     * @param {Object} rcData - Дані команд пульта (RC)
     * @param {Object} motorData - Дані моторів
     * @returns {Object} - Рекомендовані значення PID
     */
    static generatePIDRecommendations(gyroData, pidData, rcData, motorData) {
      // Оцінимо параметри системи на основі даних польоту
      const systemParams = this.estimateSystemParameters(gyroData, pidData, rcData);
      
      // Розрахуємо PID за методом Зіглера-Нікольса
      let znValues = {};
      try {
        znValues = this.zieglerNichols(systemParams, 'PID');
      } catch (error) {
        console.error("Помилка розрахунку за методом Зіглера-Нікольса:", error);
        // Використовуємо значення за замовчуванням
        znValues = { Kp: 40, Ki: 70, Kd: 25 };
      }
      
      // Коригуємо значення на основі характеристик вібрацій
      const vibrationAdjustment = this.calculateVibrationAdjustment(gyroData);
      
      // Коригуємо значення на основі характеристик двигунів
      const motorAdjustment = this.calculateMotorAdjustment(motorData);
      
      // Формуємо рекомендації для кожної осі
      const recommendations = {
        roll: {
          P: Math.round(znValues.Kp * (1 + vibrationAdjustment.roll * 0.1)),
          I: Math.round(znValues.Ki * (1 - vibrationAdjustment.roll * 0.05)),
          D: Math.round(znValues.Kd * (1 - vibrationAdjustment.roll * 0.2)),
          F: this.calculateFeedforward(rcData.roll)
        },
        pitch: {
          P: Math.round(znValues.Kp * 1.1 * (1 + vibrationAdjustment.pitch * 0.1)), // Pitch зазвичай потребує трохи більше P
          I: Math.round(znValues.Ki * (1 - vibrationAdjustment.pitch * 0.05)),
          D: Math.round(znValues.Kd * (1 - vibrationAdjustment.pitch * 0.2)),
          F: this.calculateFeedforward(rcData.pitch)
        },
        yaw: {
          P: Math.round(znValues.Kp * 0.7), // Yaw зазвичай потребує менше P
          I: Math.round(znValues.Ki * 1.2), // І більше I
          D: Math.round(znValues.Kd * 0.1), // І набагато менше D (або взагалі 0)
          F: 0 // Yaw рідко потребує feedforward
        }
      };
      
      // Враховуємо коригування моторів
      if (motorAdjustment > 0.1) {
        // Якщо двигуни демонструють нерівномірність, збільшуємо I
        recommendations.roll.I = Math.round(recommendations.roll.I * (1 + motorAdjustment * 0.2));
        recommendations.pitch.I = Math.round(recommendations.pitch.I * (1 + motorAdjustment * 0.2));
      }
      
      return recommendations;
    }
    
    /**
     * Розраховує коригування на основі вібрацій
     * @param {Object} gyroData - Дані гіроскопа
     * @returns {Object} - Коефіцієнти коригування для кожної осі
     */
    static calculateVibrationAdjustment(gyroData) {
      // Розраховуємо стандартне відхилення як міру вібрацій
      const rollStdDev = this.calculateStandardDeviation(gyroData.x);
      const pitchStdDev = this.calculateStandardDeviation(gyroData.y);
      const yawStdDev = this.calculateStandardDeviation(gyroData.z);
      
      // Нормалізуємо значення в діапазоні 0-1, де 1 - високі вібрації
      const maxStdDev = 50; // Типове максимальне значення для квадрокоптерів
      
      return {
        roll: Math.min(1, rollStdDev / maxStdDev),
        pitch: Math.min(1, pitchStdDev / maxStdDev),
        yaw: Math.min(1, yawStdDev / maxStdDev)
      };
    }
    
    /**
     * Розраховує коригування на основі характеристик двигунів
     * @param {Object} motorData - Дані моторів
     * @returns {number} - Коефіцієнт коригування для двигунів
     */
    static calculateMotorAdjustment(motorData) {
      // Розраховуємо середнє значення для кожного мотора
      const motorAvgs = [
        this.calculateAverage(motorData.motor0),
        this.calculateAverage(motorData.motor1),
        this.calculateAverage(motorData.motor2),
        this.calculateAverage(motorData.motor3)
      ];
      
      // Розраховуємо стандартне відхилення між середніми значеннями моторів
      // Це дає нам міру дисбалансу між моторами
      const avgOfAvgs = this.calculateAverage(motorAvgs);
      const squaredDiffs = motorAvgs.map(avg => Math.pow(avg - avgOfAvgs, 2));
      const avgSquaredDiff = this.calculateAverage(squaredDiffs);
      const stdDev = Math.sqrt(avgSquaredDiff);
      
      // Нормалізуємо значення
      const maxStdDev = 100; // Типове максимальне значення для дисбалансу моторів
      return Math.min(1, stdDev / maxStdDev);
    }
    
    /**
     * Розраховує значення feedforward на основі даних команд
     * @param {number[]} rcCommandData - Дані команд для однієї осі
     * @returns {number} - Рекомендоване значення feedforward
     */
    static calculateFeedforward(rcCommandData) {
      // Аналізуємо швидкість зміни команд RC
      const rcRates = [];
      for (let i = 1; i < rcCommandData.length; i++) {
        rcRates.push(Math.abs(rcCommandData[i] - rcCommandData[i-1]));
      }
      
      // Знаходимо 90-й перцентиль швидкості зміни (уникаємо екстремальних значень)
      rcRates.sort((a, b) => a - b);
      const rateIndex = Math.floor(rcRates.length * 0.9);
      const rate90 = rcRates[rateIndex] || 0;
      
      // Нормалізуємо і масштабуємо до діапазону Betaflight (0-100)
      const maxRate = 100; // Типова максимальна швидкість зміни
      const normalizedRate = Math.min(1, rate90 / maxRate);
      
      // Діапазон для F в Betaflight зазвичай 0-100
      return Math.round(normalizedRate * 75); // Максимум 75 для уникнення перерегулювання
    }
    
    /**
     * Розраховує стандартне відхилення масиву значень
     * @param {number[]} values - Масив значень
     * @returns {number} - Стандартне відхилення
     */
    static calculateStandardDeviation(values) {
      const avg = this.calculateAverage(values);
      const squaredDiffs = values.map(value => Math.pow(value - avg, 2));
      const avgSquaredDiff = this.calculateAverage(squaredDiffs);
      return Math.sqrt(avgSquaredDiff);
    }
    
    /**
     * Розраховує середнє значення масиву
     * @param {number[]} values - Масив значень
     * @returns {number} - Середнє значення
     */
    static calculateAverage(values) {
      if (!values || values.length === 0) return 0;
      const sum = values.reduce((acc, val) => acc + val, 0);
      return sum / values.length;
    }
  }