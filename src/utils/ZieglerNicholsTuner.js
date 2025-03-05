/**
 * Клас для налаштування PID-регуляторів за методом Зіглера-Нікольса
 * Метод базується на визначенні критичних параметрів системи та обчисленні оптимальних параметрів PID
 */
export class ZieglerNicholsTuner {
    /**
     * Конструктор
     * @param {Object} options - Додаткові опції
     */
    constructor(options = {}) {
      this.options = {
        // Коефіцієнти для мультикоптерів можуть відрізнятися від стандартних
        coefficients: {
          P: { Kp: 0.5, Ki: 0, Kd: 0 },
          PI: { Kp: 0.45, Ki: 0.54, Kd: 0 },
          PD: { Kp: 0.8, Ki: 0, Kd: 0.1 },
          PID: { Kp: 0.6, Ki: 1.2, Kd: 0.075 },
          // Модифіковані коефіцієнти для квадрокоптерів
          PIDQuad: { Kp: 0.45, Ki: 0.9, Kd: 0.06 },
        },
        ...options
      };
    }
  
    /**
     * Розрахунок параметрів PID за методом Зіглера-Нікольса на основі критичного підсилення та періоду
     * @param {number} Ku - Критичне підсилення (ultimate gain)
     * @param {number} Tu - Критичний період (ultimate period)
     * @param {string} controllerType - Тип регулятора: "P", "PI", "PD", "PID", або "PIDQuad"
     * @returns {Object} - Розраховані параметри PID
     */
    calculate(Ku, Tu, controllerType = "PIDQuad") {
      if (!Ku || !Tu || Ku <= 0 || Tu <= 0) {
        console.warn("Неправильні параметри для методу Зіглера-Нікольса. Використовуємо значення за замовчуванням.");
        // Повернемо типові значення, якщо критичні параметри неправильні
        return { 
          Kp: 30, 
          Ki: 50, 
          Kd: 20,
          notes: ["Використано значення за замовчуванням через неможливість точно розрахувати параметри."]
        };
      }
  
      const coeffs = this.options.coefficients[controllerType];
      if (!coeffs) {
        throw new Error(`Невідомий тип регулятора: ${controllerType}`);
      }
  
      // Розрахунок параметрів за формулами Зіглера-Нікольса
      const Kp = Math.round(coeffs.Kp * Ku);
      const Ki = Math.round(coeffs.Ki * Ku / Tu);
      const Kd = Math.round(coeffs.Kd * Ku * Tu);
  
      return { Kp, Ki, Kd };
    }
  
    /**
     * Аналізує дані відгуку системи для оцінки критичних параметрів
     * @param {Array} inputData - Вхідні дані (команди)
     * @param {Array} outputData - Вихідні дані (відгук, наприклад, gyro)
     * @param {number} sampleRate - Частота дискретизації в Гц
     * @returns {Object} - Критичні параметри системи
     */
    estimateCriticalParameters(inputData, outputData, sampleRate) {
      // Цей метод аналізує реакцію системи і оцінює критичні параметри
      // Перевірка на наявність даних
      if (!inputData || !outputData || inputData.length < 10 || outputData.length < 10) {
        console.warn("Недостатньо даних для оцінки критичних параметрів.");
        return { Ku: 60, Tu: 0.25, confidence: "low" };
      }
  
      try {
        // Обчислення різниці (помилки) між входом і виходом
        const errors = [];
        const normalizedLength = Math.min(inputData.length, outputData.length);
        
        for (let i = 0; i < normalizedLength; i++) {
          errors.push(inputData[i] - outputData[i]);
        }
  
        // Знаходження піків помилки для оцінки періоду
        const peaks = this.findPeaks(errors);
        
        if (peaks.length < 2) {
          console.warn("Недостатньо піків для точної оцінки періоду.");
          return { Ku: 60, Tu: 0.25, confidence: "low" };
        }
  
        // Оцінка періоду коливань
        const peakIndices = peaks.map(p => p.index);
        const periods = [];
        
        for (let i = 1; i < peakIndices.length; i++) {
          periods.push((peakIndices[i] - peakIndices[i-1]) / sampleRate);
        }
        
        // Середній період
        const avgPeriod = periods.reduce((sum, period) => sum + period, 0) / periods.length;
        
        // Оцінка амплітуди коливань
        const amplitudes = peaks.map(p => Math.abs(p.value));
        const avgAmplitude = amplitudes.reduce((sum, amp) => sum + amp, 0) / amplitudes.length;
        
        // Оцінка критичного підсилення
        // Ku обернено пропорційний амплітуді помилки при сталих коливаннях
        const estimatedKu = 100 / (avgAmplitude + 0.1); // +0.1 щоб уникнути ділення на 0
        
        // Обмеження значень до розумних меж для квадрокоптера
        const boundedKu = Math.min(Math.max(estimatedKu, 30), 120);
        const boundedTu = Math.min(Math.max(avgPeriod, 0.05), 0.5);
        
        let confidence = "medium";
        if (peaks.length > 5 && avgAmplitude > 1) {
          confidence = "high";
        } else if (peaks.length < 3 || avgAmplitude < 0.5) {
          confidence = "low";
        }
  
        return { 
          Ku: Math.round(boundedKu), 
          Tu: Math.round(boundedTu * 1000) / 1000, // Округлення до 3 знаків після коми
          confidence 
        };
      } catch (error) {
        console.error("Помилка оцінки критичних параметрів:", error);
        return { Ku: 60, Tu: 0.25, confidence: "low" };
      }
    }
  
    /**
     * Знаходить локальні максимуми (піки) в масиві даних
     * @param {Array} data - Масив даних
     * @returns {Array} - Знайдені піки з їх індексами та значеннями
     */
    findPeaks(data) {
      const peaks = [];
      
      // Мінімальна різниця, щоб вважати точку піком
      const threshold = this.calculateDynamicThreshold(data);
      
      for (let i = 1; i < data.length - 1; i++) {
        // Перевірка чи точка є локальним максимумом
        if (data[i] > data[i-1] && data[i] > data[i+1] && Math.abs(data[i]) > threshold) {
          peaks.push({ index: i, value: data[i] });
        }
      }
      
      return peaks;
    }
  
    /**
     * Обчислює динамічний поріг для виявлення піків на основі розмаху даних
     * @param {Array} data - Масив даних
     * @returns {number} - Динамічний поріг
     */
    calculateDynamicThreshold(data) {
      const values = data.filter(value => !isNaN(value));
      if (values.length === 0) return 0.1;
      
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      
      // Поріг як відсоток від розмаху даних
      return range * 0.05;
    }
  
    /**
     * Генерує рекомендації для PID налаштувань на основі аналізу даних польоту
     * @param {Object} gyroData - Дані гіроскопа (x, y, z)
     * @param {Object} rcCommandData - Дані команд пульта (roll, pitch, yaw)
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Рекомендовані PID налаштування
     */
    generatePIDRecommendations(gyroData, rcCommandData, sampleRate = 1000) {
      const recommendations = {
        roll: { P: 0, I: 0, D: 0 },
        pitch: { P: 0, I: 0, D: 0 },
        yaw: { P: 0, I: 0, D: 0 },
        notes: []
      };
  
      try {
        // Оцінка критичних параметрів для кожної осі
        const rollParams = this.estimateCriticalParameters(rcCommandData.roll, gyroData.x, sampleRate);
        const pitchParams = this.estimateCriticalParameters(rcCommandData.pitch, gyroData.y, sampleRate);
        const yawParams = this.estimateCriticalParameters(rcCommandData.yaw, gyroData.z, sampleRate);
        
        // Генерація рекомендацій за методом Зіглера-Нікольса
        const rollPID = this.calculate(rollParams.Ku, rollParams.Tu, "PIDQuad");
        const pitchPID = this.calculate(pitchParams.Ku, pitchParams.Tu, "PIDQuad");
        const yawPID = this.calculate(yawParams.Ku, yawParams.Tu, "PI"); // Для yaw зазвичай потрібно менше D
        
        // Обмеження значень до розумних меж
        recommendations.roll = {
          P: this.constrainValue(rollPID.Kp, 20, 80),
          I: this.constrainValue(rollPID.Ki, 30, 120),
          D: this.constrainValue(rollPID.Kd, 10, 50)
        };
        
        recommendations.pitch = {
          P: this.constrainValue(pitchPID.Kp, 20, 80),
          I: this.constrainValue(pitchPID.Ki, 30, 120),
          D: this.constrainValue(pitchPID.Kd, 10, 50)
        };
        
        recommendations.yaw = {
          P: this.constrainValue(yawPID.Kp, 20, 100),
          I: this.constrainValue(yawPID.Ki, 40, 120),
          D: this.constrainValue(yawPID.Kd, 0, 20)
        };
        
        // Додаємо нотатки про впевненість у рекомендаціях
        if (rollParams.confidence === "low" || pitchParams.confidence === "low") {
          recommendations.notes.push("Низька впевненість у рекомендаціях PID. Використовуйте як відправну точку і налаштовуйте поступово.");
        } else if (rollParams.confidence === "high" && pitchParams.confidence === "high") {
          recommendations.notes.push("Висока впевненість у рекомендаціях PID. Значення повинні бути близькими до оптимальних.");
        } else {
          recommendations.notes.push("Середня впевненість у рекомендаціях PID. Можливо потрібне деяке налаштування.");
        }
  
        recommendations.notes.push(`Розрахунки базуються на критичних параметрах: Roll (Ku=${rollParams.Ku}, Tu=${rollParams.Tu}s), Pitch (Ku=${pitchParams.Ku}, Tu=${pitchParams.Tu}s)`);
      } catch (error) {
        console.error("Помилка при генерації PID рекомендацій:", error);
        
        // Значення за замовчуванням у випадку помилки
        recommendations.roll = { P: 40, I: 80, D: 25 };
        recommendations.pitch = { P: 40, I: 80, D: 25 };
        recommendations.yaw = { P: 50, I: 80, D: 0 };
        recommendations.notes.push("Використано типові значення PID через помилку аналізу даних.");
      }
  
      return recommendations;
    }
  
    /**
     * Обмежує значення в заданих межах
     * @param {number} value - Значення, яке потрібно обмежити
     * @param {number} min - Мінімальна межа
     * @param {number} max - Максимальна межа
     * @returns {number} - Обмежене значення
     */
    constrainValue(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
  }