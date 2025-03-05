/**
 * Покращений клас для налаштування PID-регуляторів за методом Зіглера-Нікольса
 * з додатковими адаптаціями для квадрокоптерів
 */
export class EnhancedZieglerNicholsTuner {
    /**
     * Конструктор
     * @param {Object} options - Налаштування
     */
    constructor(options = {}) {
      this.options = {
        // Базові коефіцієнти для різних типів регуляторів
        coefficients: {
          P: { Kp: 0.5, Ki: 0, Kd: 0 },
          PI: { Kp: 0.45, Ki: 0.54, Kd: 0 },
          PD: { Kp: 0.8, Ki: 0, Kd: 0.1 },
          PID: { Kp: 0.6, Ki: 1.2, Kd: 0.075 },
          // Адаптовані коефіцієнти для різних типів квадрокоптерів
          PIDFreeStyle: { Kp: 0.45, Ki: 0.9, Kd: 0.06 },
          PIDCinematic: { Kp: 0.35, Ki: 0.75, Kd: 0.05 },
          PIDRacing: { Kp: 0.5, Ki: 0.9, Kd: 0.075 }
        },
        // Типова частота оновлення PID в Betaflight
        pidFrequency: 8000,
        // Типові налаштування Feed Forward
        feedForward: {
          base: 30,
          maxLimit: 100,
          transitionFactor: 0.7
        },
        ...options
      };
      
      // Параметри дрона (за замовчуванням - середній 5" квадрокоптер)
      this.droneParams = {
        size: 5, // дюйми пропелера
        weight: 400, // грами ваги
        batteryType: '4S', // тип батареї
        motorKv: 2300, // KV моторів
        frameType: 'X', // X рама
        flightStyle: 'freestyle', // стиль польоту
        betaflightVersion: '4.3' // версія Betaflight
      };
    }
    
    /**
     * Встановлює параметри дрона для більш точного налаштування
     * @param {Object} params - Параметри дрона
     */
    setDroneParameters(params) {
      this.droneParams = {
        ...this.droneParams,
        ...params
      };
      
      console.log('Параметри дрона оновлено:', this.droneParams);
    }
    
    /**
     * Розрахунок параметрів PID за методом Зіглера-Нікольса
     * @param {number} Ku - Критичне підсилення
     * @param {number} Tu - Критичний період в секундах
     * @param {string} controllerType - Тип регулятора
     * @returns {Object} - Розраховані параметри PID
     */
    calculate(Ku, Tu, controllerType = 'PIDFreeStyle') {
      // Визначення типу регулятора на основі стилю польоту, якщо не вказано явно
      if (['PIDFreeStyle', 'PIDCinematic', 'PIDRacing'].indexOf(controllerType) === -1) {
        controllerType = this._determineControllerType();
      }
      
      console.log(`Використовую режим регулятора: ${controllerType}`);
      
      // Отримання коефіцієнтів для вибраного типу регулятора
      const coeffs = this.options.coefficients[controllerType];
      if (!coeffs) {
        throw new Error(`Невідомий тип регулятора: ${controllerType}`);
      }
      
      // Розрахунок базових значень PID
      let Kp = coeffs.Kp * Ku;
      let Ki = (coeffs.Ki * Ku) / Tu;
      let Kd = coeffs.Kd * Ku * Tu;
      
      // Адаптація на основі параметрів дрона
      const adjustedValues = this._adjustForDroneParams(Kp, Ki, Kd);
      
      // Масштабування для використання в Betaflight
      return this._scaleToBetaflight(adjustedValues);
    }
    
    /**
     * Визначає тип регулятора на основі параметрів дрона
     * @returns {string} - Тип регулятора
     */
    _determineControllerType() {
      const { flightStyle, size, weight, batteryType, motorKv } = this.droneParams;
      
      // Базовий вибір на основі стилю польоту
      if (flightStyle && flightStyle.toLowerCase().includes('cine')) {
        return 'PIDCinematic';
      } else if (flightStyle && flightStyle.toLowerCase().includes('rac')) {
        return 'PIDRacing';
      } else {
        return 'PIDFreeStyle'; // за замовчуванням
      }
    }
    
    /**
     * Коригує значення PID на основі параметрів дрона
     * @param {number} Kp - Пропорційний коефіцієнт
     * @param {number} Ki - Інтегральний коефіцієнт
     * @param {number} Kd - Диференціальний коефіцієнт
     * @returns {Object} - Скориговані значення
     */
    _adjustForDroneParams(Kp, Ki, Kd) {
      const { size, weight, batteryType, motorKv, frameType } = this.droneParams;
      
      // Коефіцієнти адаптації
      let Kp_factor = 1.0;
      let Ki_factor = 1.0;
      let Kd_factor = 1.0;
      
      // Адаптація на основі розміру пропелерів
      if (size <= 3) {
        // Маленькі дрони зазвичай потребують більший P і D
        Kp_factor *= 1.3;
        Kd_factor *= 1.2;
        Ki_factor *= 0.8;
      } else if (size >= 7) {
        // Великі дрони зазвичай потребують менший P і більший I
        Kp_factor *= 0.8;
        Ki_factor *= 1.3;
        Kd_factor *= 0.7;
      }
      
      // Адаптація на основі ваги
      if (weight < 250) {
        Kp_factor *= 1.2;
        Ki_factor *= 0.9;
      } else if (weight > 600) {
        // Важчі дрони потребують більше I для подолання інерції
        Kp_factor *= 0.9;
        Ki_factor *= 1.3;
        Kd_factor *= 0.8;
      }
      
      // Адаптація на основі типу батареї
      const batteryVoltage = this._getBatteryVoltage(batteryType);
      if (batteryVoltage > 14.8) { // >4S
        // Вищі напруги дають більше енергії - потрібно зменшити посилення
        Kp_factor *= 0.9;
      } else if (batteryVoltage < 11.1) { // <3S
        Kp_factor *= 1.1;
      }
      
      // Адаптація на основі KV моторів
      if (motorKv > 2500) {
        // Високий KV - більш гостра реакція
        Kp_factor *= 0.9;
        Kd_factor *= 1.1;
      } else if (motorKv < 1800) {
        // Низький KV - менш гостра реакція
        Kp_factor *= 1.1;
        Ki_factor *= 1.1;
      }
      
      // Адаптація на основі типу рами
      if (frameType === 'H') {
        // H-рами зазвичай мають більший момент інерції по roll
        // Робимо невелике розділення між roll і pitch
        return {
          roll: {
            Kp: Kp * Kp_factor * 0.95,
            Ki: Ki * Ki_factor * 1.05,
            Kd: Kd * Kd_factor
          },
          pitch: {
            Kp: Kp * Kp_factor,
            Ki: Ki * Ki_factor,
            Kd: Kd * Kd_factor
          },
          yaw: {
            Kp: Kp * Kp_factor * 0.8,
            Ki: Ki * Ki_factor * 1.2,
            Kd: Kd * Kd_factor * 0.5
          }
        };
      }
      
      // Стандартна X-рама або інші
      return {
        roll: {
          Kp: Kp * Kp_factor,
          Ki: Ki * Ki_factor,
          Kd: Kd * Kd_factor
        },
        pitch: {
          Kp: Kp * Kp_factor,
          Ki: Ki * Ki_factor,
          Kd: Kd * Kd_factor
        },
        yaw: {
          Kp: Kp * Kp_factor * 0.8,
          Ki: Ki * Ki_factor * 1.2,
          Kd: Kd * Kd_factor * 0.5
        }
      };
    }
    
    /**
     * Отримує напругу батареї на основі її типу
     * @param {string} batteryType - Тип батареї (nS)
     * @returns {number} - Напруга
     */
    _getBatteryVoltage(batteryType) {
      const cellVoltage = 3.7; // Середня напруга Li-Po комірки
      const cellMatch = batteryType.match(/(\d+)S/i);
      
      if (cellMatch) {
        const cells = parseInt(cellMatch[1], 10);
        return cells * cellVoltage;
      }
      
      // За замовчуванням 4S
      return 4 * cellVoltage;
    }
    
    /**
     * Масштабує значення PID для використання в Betaflight
     * @param {Object} values - Розраховані значення PID
     * @returns {Object} - Значення, масштабовані для Betaflight
     */
    _scaleToBetaflight(values) {
      // Функція масштабування для одного значення
      const scaleSingleValue = (value, min, max) => {
        return Math.max(min, Math.min(max, Math.round(value)));
      };
      
      const scaled = {};
      
      // Масштабування для кожної осі
      for (const axis of ['roll', 'pitch', 'yaw']) {
        scaled[axis] = {
          P: scaleSingleValue(values[axis].Kp * 25, 20, 80),
          I: scaleSingleValue(values[axis].Ki * 35, 30, 120),
          D: scaleSingleValue(values[axis].Kd * 400, axis === 'yaw' ? 0 : 10, axis === 'yaw' ? 20 : 50)
        };
        
        // Додаємо Feed Forward
        scaled[axis].F = this._calculateFeedForward(axis);
      }
      
      return scaled;
    }
    
    /**
     * Обчислює значення Feed Forward для кожної осі
     * @param {string} axis - Вісь (roll, pitch, yaw)
     * @returns {number} - Значення Feed Forward
     */
    _calculateFeedForward(axis) {
      const { base, maxLimit, transitionFactor } = this.options.feedForward;
      const { flightStyle, size, weight } = this.droneParams;
      
      let ffValue = base;
      
      // Різні значення для різних осей
      if (axis === 'yaw') {
        ffValue = Math.round(base * 0.5); // Yaw зазвичай потребує менше FF
      } else if (axis === 'pitch') {
        ffValue = Math.round(base * 1.1); // Pitch трохи більше ніж roll
      }
      
      // Модифікація на основі стилю польоту
      if (flightStyle === 'racing') {
        ffValue = Math.round(ffValue * 1.3); // Гострий відгук для перегонів
      } else if (flightStyle === 'cinematic') {
        ffValue = Math.round(ffValue * 0.7); // М'якший відгук для зйомки
      }
      
      // Модифікація на основі розміру пропелерів
      if (size <= 3) {
        ffValue = Math.round(ffValue * 1.2); // Малі пропелери потребують більше FF
      } else if (size >= 7) {
        ffValue = Math.round(ffValue * 0.8); // Великі пропелери потребують менше FF
      }
      
      // Модифікація на основі ваги
      if (weight > 600) {
        ffValue = Math.round(ffValue * 0.9); // Важкі дрони потребують менше FF
      } else if (weight < 250) {
        ffValue = Math.round(ffValue * 1.1); // Легкі дрони можуть мати більше FF
      }
      
      // Фінальне обмеження значення
      return Math.max(0, Math.min(maxLimit, ffValue));
    }
    
    /**
     * Генерує повний набір рекомендацій PID на основі аналізу польотних даних
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} rcData - Дані команд пульта
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Рекомендації PID
     */
    generatePIDRecommendations(gyroData, rcData, sampleRate = 1000) {
      try {
        // Оцінюємо критичні параметри системи
        const criticalParams = this._estimateCriticalParameters(gyroData, rcData, sampleRate);
        
        // Отримуємо тип регулятора на основі параметрів дрона
        const controllerType = this._determineControllerType();
        
        // Розраховуємо PID на основі критичних параметрів
        const pidValues = this.calculate(
          criticalParams.Ku,
          criticalParams.Tu,
          controllerType
        );
        
        // Аналізуємо виміряні характеристики для точного налаштування
        const tuningNotes = this._analyzeTuningCharacteristics(gyroData, rcData);
        
        // Формуємо повний набір рекомендацій
        return {
          roll: pidValues.roll,
          pitch: pidValues.pitch,
          yaw: pidValues.yaw,
          masterMultiplier: this._calculateMasterMultiplier(),
          notes: [
            `Критичні параметри: Ku=${criticalParams.Ku.toFixed(2)}, Tu=${criticalParams.Tu.toFixed(3)} сек (впевненість: ${criticalParams.confidence})`,
            ...tuningNotes
          ],
          advancedParams: this._generateAdvancedParameters()
        };
        
      } catch (error) {
        console.error("Помилка генерації PID рекомендацій:", error);
        
        // Повертаємо типові значення у випадку помилки
        return {
          roll: { P: 40, I: 80, D: 25, F: 30 },
          pitch: { P: 40, I: 80, D: 25, F: 30 },
          yaw: { P: 50, I: 80, D: 0, F: 0 },
          masterMultiplier: 1.0,
          notes: ["Використано типові значення PID через помилку аналізу даних."],
          advancedParams: this._generateAdvancedParameters(true)
        };
      }
    }
    
    /**
     * Оцінює критичні параметри системи на основі даних польоту
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} rcData - Дані команд пульта
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Оцінені критичні параметри
     */
    _estimateCriticalParameters(gyroData, rcData, sampleRate) {
      // Реалізація цього методу вже є в ZieglerNicholsTuner.js
      // Ця версія містить більш точний алгоритм оцінки
      
      // Аналізуємо перехідні процеси для roll і pitch
      const rollParams = this._analyzeAxisResponse(gyroData.x, rcData.roll, sampleRate);
      const pitchParams = this._analyzeAxisResponse(gyroData.y, rcData.pitch, sampleRate);
      
      // Обираємо найбільш надійні параметри
      if (rollParams.confidence === 'high' || 
          (rollParams.confidence === 'medium' && pitchParams.confidence !== 'high')) {
        return rollParams;
      } else if (pitchParams.confidence === 'high' || pitchParams.confidence === 'medium') {
        return pitchParams;
      }
      
      // Якщо обидва ненадійні, беремо середнє значення
      return {
        Ku: (rollParams.Ku + pitchParams.Ku) / 2,
        Tu: (rollParams.Tu + pitchParams.Tu) / 2,
        confidence: 'low'
      };
    }
    
    /**
     * Аналізує відгук системи для однієї осі
     * @param {number[]} gyroData - Дані гіроскопа для осі
     * @param {number[]} rcData - Дані команд для осі
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Параметри осі
     */
    _analyzeAxisResponse(gyroData, rcData, sampleRate) {
      // Ця функція може бути складною, спрощена версія:
      
      if (!gyroData || !rcData || gyroData.length < 100 || rcData.length < 100) {
        return { Ku: 60, Tu: 0.025, confidence: 'low' };
      }
      
      // Знаходимо ділянки з найбільшою зміною rcData
      const transitionSegments = this._findTransitionSegments(rcData);
      
      if (transitionSegments.length < 2) {
        return { Ku: 60, Tu: 0.025, confidence: 'low' };
      }
      
      // Аналізуємо відгук системи на зміни керування
      let bestKu = 0;
      let bestTu = 0;
      let bestConfidence = 'low';
      
      for (const segment of transitionSegments) {
        // Аналізуємо перехідний процес
        const response = this._analyzeTransitionResponse(
          gyroData.slice(segment.start, segment.end),
          rcData.slice(segment.start, segment.end),
          sampleRate
        );
        
        if (response.confidence === 'high' || 
            (response.confidence === 'medium' && bestConfidence !== 'high')) {
          bestKu = response.Ku;
          bestTu = response.Tu;
          bestConfidence = response.confidence;
        }
      }
      
      if (bestKu === 0) {
        // Якщо не вдалося знайти хороший сегмент, використовуємо значення за замовчуванням
        return { Ku: 60, Tu: 0.025, confidence: 'low' };
      }
      
      return {
        Ku: bestKu,
        Tu: bestTu,
        confidence: bestConfidence
      };
    }
    
    /**
     * Знаходить сегменти переходу в даних команд
     * @param {number[]} rcData - Дані команд пульта
     * @returns {Object[]} - Знайдені сегменти
     */
    _findTransitionSegments(rcData) {
      const segments = [];
      const threshold = 50; // Мінімальна зміна команди для виявлення переходу
      let inTransition = false;
      let startIndex = 0;
      
      for (let i = 1; i < rcData.length; i++) {
        const change = Math.abs(rcData[i] - rcData[i-1]);
        
        if (!inTransition && change > threshold) {
          inTransition = true;
          startIndex = Math.max(0, i - 20); // Починаємо трохи раніше
        } else if (inTransition && change < threshold / 2) {
          // Кілька послідовних малих змін означають кінець переходу
          let stableCount = 0;
          for (let j = i; j < i + 10 && j < rcData.length; j++) {
            if (Math.abs(rcData[j] - rcData[j-1]) < threshold / 2) {
              stableCount++;
            }
          }
          
          if (stableCount >= 5) {
            inTransition = false;
            // Завершуємо трохи пізніше для аналізу затухань
            const endIndex = Math.min(rcData.length - 1, i + 30);
            
            // Додаємо сегмент, якщо він достатньо довгий
            if (endIndex - startIndex > 30) {
              segments.push({ start: startIndex, end: endIndex });
            }
          }
        }
      }
      
      return segments;
    }
    
    /**
     * Аналізує перехідний процес для оцінки параметрів системи
     * @param {number[]} gyroData - Дані гіроскопа
     * @param {number[]} rcData - Дані команд
     * @param {number} sampleRate - Частота дискретизації
     * @returns {Object} - Параметри системи
     */
    _analyzeTransitionResponse(gyroData, rcData, sampleRate) {
      // Обчислюємо різницю між цільовим сигналом і відгуком
      const errors = [];
      for (let i = 0; i < Math.min(gyroData.length, rcData.length); i++) {
        errors.push(rcData[i] - gyroData[i]);
      }
      
      // Знаходимо піки в помилці (перерегулювання)
      const peaks = [];
      for (let i = 2; i < errors.length - 2; i++) {
        if ((errors[i] > errors[i-1] && errors[i] > errors[i+1]) ||
            (errors[i] < errors[i-1] && errors[i] < errors[i+1])) {
          // Локальний максимум або мінімум
          peaks.push({ index: i, value: errors[i] });
        }
      }
      
      if (peaks.length < 2) {
        return { Ku: 60, Tu: 0.025, confidence: 'low' };
      }
      
      // Обчислюємо період коливань
      const periods = [];
      for (let i = 1; i < peaks.length; i++) {
        periods.push((peaks[i].index - peaks[i-1].index) / sampleRate);
      }
      
      // Середній період
      const avgPeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
      
      // Оцінюємо затухання коливань для визначення критичного підсилення
      const dampingRatio = this._estimateDampingRatio(peaks);
      
      // Оцінка критичного підсилення на основі відношення затухання
      // Ku близько до 1 при стійких коливаннях
      const estimatedKu = 1 / (1 - dampingRatio);
      
      // Обмежуємо значення до розумних меж
      const boundedKu = Math.min(Math.max(estimatedKu, 40), 120);
      const boundedTu = Math.min(Math.max(avgPeriod, 0.01), 0.1);
      
      // Визначаємо впевненість в результаті
      let confidence = 'medium';
      if (peaks.length > 3 && dampingRatio < 0.3) {
        confidence = 'high';
      } else if (peaks.length < 3 || dampingRatio > 0.7) {
        confidence = 'low';
      }
      
      return {
        Ku: boundedKu,
        Tu: boundedTu,
        confidence
      };
    }
    
    /**
     * Оцінює коефіцієнт затухання коливань
     * @param {Object[]} peaks - Знайдені піки
     * @returns {number} - Коефіцієнт затухання (0-1)
     */
    _estimateDampingRatio(peaks) {
      if (peaks.length < 3) {
        return 0.5; // Типове значення
      }
      
      // Обчислюємо відношення амплітуд послідовних піків
      const amplitudeRatios = [];
      for (let i = 2; i < peaks.length; i += 2) {
        const amp1 = Math.abs(peaks[i-2].value);
        const amp2 = Math.abs(peaks[i].value);
        
        if (amp1 > 0) {
          amplitudeRatios.push(amp2 / amp1);
        }
      }
      
      if (amplitudeRatios.length === 0) {
        return 0.5;
      }
      
      // Середнє відношення амплітуд
      const avgRatio = amplitudeRatios.reduce((sum, r) => sum + r, 0) / amplitudeRatios.length;
      
      // Обчислюємо коефіцієнт затухання
      // δ = -ln(r) / (2π), де r - відношення амплітуд
      const dampingRatio = -Math.log(avgRatio) / (2 * Math.PI);
      
      // Обмежуємо до діапазону 0-1
      return Math.min(Math.max(dampingRatio, 0), 1);
    }
    
    /**
     * Аналізує характеристики налаштування для генерації порад
     * @param {Object} gyroData - Дані гіроскопа
     * @param {Object} rcData - Дані команд пульта
     * @returns {string[]} - Рекомендації щодо налаштування
     */
    _analyzeTuningCharacteristics(gyroData, rcData) {
      const notes = [];
      
      // Аналіз відношення шуму в дані гіроскопу
      const rollNoiseLevel = this._calculateNoiseLevel(gyroData.x);
      const pitchNoiseLevel = this._calculateNoiseLevel(gyroData.y);
      const yawNoiseLevel = this._calculateNoiseLevel(gyroData.z);
      
      const avgNoiseLevel = (rollNoiseLevel + pitchNoiseLevel + yawNoiseLevel) / 3;
      
      if (avgNoiseLevel > 0.5) {
        notes.push("Виявлено високий рівень шуму. Рекомендується зменшити D-компоненту і покращити фільтрацію.");
      }
      
      // Аналіз часу відгуку
      const responseTime = this._estimateResponseTime(gyroData.x, rcData.roll);
      if (responseTime > 0.15) {
        notes.push("Повільний відгук системи. Спробуйте збільшити P-компоненту для швидшої реакції.");
      } else if (responseTime < 0.05) {
        notes.push("Дуже швидкий відгук системи. Можливо, варто зменшити P-компоненту, щоб уникнути перерегулювання.");
      }
      
      // Рекомендації щодо Feed Forward
      if (this.droneParams.flightStyle === 'racing') {
        notes.push("Для перегонів рекомендується збільшити Feed Forward (F) для швидшої реакції на керування.");
      } else if (this.droneParams.flightStyle === 'cinematic') {
        notes.push("Для плавного відео рекомендується знизити Feed Forward (F) і D-компоненту.");
      }
      
      return notes;
    }
    
    /**
     * Обчислює рівень шуму в даних
     * @param {number[]} data - Аналізовані дані
     * @returns {number} - Рівень шуму (0-1)
     */
    _calculateNoiseLevel(data) {
      if (!data || data.length < 10) return 0;
      
      // Фільтруємо явні аномалії
      const filteredData = data.filter(val => !isNaN(val) && isFinite(val));
      if (filteredData.length < 10) return 0;
      
      // Обчислюємо середнє значення
      const mean = filteredData.reduce((sum, val) => sum + val, 0) / filteredData.length;
      
      // Обчислюємо середньоквадратичне відхилення
      const squaredDiffs = filteredData.map(val => Math.pow(val - mean, 2));
      const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
      const stdDev = Math.sqrt(variance);
      
      // Нормалізуємо до діапазону 0-1
      return Math.min(1, stdDev / 100);
    }
    
    /**
     * Оцінює час відгуку системи
     * @param {number[]} gyroData - Дані гіроскопа
     * @param {number[]} rcData - Дані команд пульта
     * @returns {number} - Час відгуку в секундах
     */
    _estimateResponseTime(gyroData, rcData) {
      if (!gyroData || !rcData || gyroData.length < 100 || rcData.length < 100) {
        return 0.1; // Типове значення за замовчуванням
      }
      
      // Знаходимо найбільшу зміну в rcData
      let maxChangeIndex = 0;
      let maxChange = 0;
      
      for (let i = 10; i < rcData.length - 10; i++) {
        const change = Math.abs(rcData[i] - rcData[i-10]);
        if (change > maxChange) {
          maxChange = change;
          maxChangeIndex = i;
        }
      }
      
      if (maxChange < 50) {
        return 0.1; // Недостатньо даних для аналізу
      }
      
      // Визначаємо стартову точку зміни
      const startIndex = maxChangeIndex - 10;
      
      // Шукаємо момент, коли гіроскоп досяг 63% від зміни (часова константа)
      const targetChange = 0.63 * maxChange;
      let responseIndex = startIndex;
      
      for (let i = startIndex; i < Math.min(gyroData.length, startIndex + 100); i++) {
        const gyroChange = Math.abs(gyroData[i] - gyroData[startIndex]);
        if (gyroChange >= targetChange) {
          responseIndex = i;
          break;
        }
      }
      
      // Обчислюємо час відгуку в секундах (приблизно, залежно від частоти дискретизації)
      const sampleTime = 0.001; // Припускаємо 1 кГц
      const responseTime = (responseIndex - startIndex) * sampleTime;
      
      return Math.min(Math.max(responseTime, 0.01), 0.3);
    }
    
    /**
     * Обчислює загальний множник для всіх PID значень
     * @returns {number} - Множник (0.5-1.5)
     */
    _calculateMasterMultiplier() {
      const { weight, size, batteryType, motorKv } = this.droneParams;
      
      // Базовий множник
      let multiplier = 1.0;
      
      // Вносимо корективи на основі ваги
      if (weight > 600) {
        multiplier *= 0.9;
      } else if (weight < 250) {
        multiplier *= 1.1;
      }
      
      // Вносимо корективи на основі розміру пропелерів
      if (size < 3) {
        multiplier *= 1.2;
      } else if (size > 6) {
        multiplier *= 0.85;
      }
      
      // Вносимо корективи на основі KV моторів
      if (motorKv > 2500) {
        multiplier *= 0.9;
      } else if (motorKv < 1800) {
        multiplier *= 1.1;
      }
      
      // Обмежуємо до розумного діапазону
      return Math.round(Math.min(Math.max(multiplier, 0.5), 1.5) * 100) / 100;
    }
    
    /**
     * Генерує рекомендації для додаткових параметрів PID
     * @param {boolean} useDefaults - Використовувати значення за замовчуванням
     * @returns {Object} - Додаткові параметри
     */
    _generateAdvancedParameters(useDefaults = false) {
      const { weight, batteryType, flightStyle } = this.droneParams;
      
      if (useDefaults) {
        return {
          // Типові значення
          tpa: { breakpoint: 1500, rate: 0.65 },
          antiGravity: { gain: 3500 },
          dMin: { roll: 0, pitch: 0, yaw: 0 },
          iterm_relax: { type: 'RPY_GYRO', cutoff: 15 },
          iterm_windup: 50,
          throttleLimitType: 'OFF',
          throttleLimitPercent: 100
        };
      }
      
      // TPA (Throttle PID Attenuation)
      const tpa = {};
      if (weight > 600) {
        tpa.breakpoint = 1350; // Раніше початок ослаблення для важких дронів
        tpa.rate = 0.7; // Сильніше ослаблення
      } else if (weight < 250) {
        tpa.breakpoint = 1600; // Пізніший початок для легких дронів
        tpa.rate = 0.5; // Легше ослаблення
      } else {
        tpa.breakpoint = 1500; // Типове значення
        tpa.rate = 0.65; // Типове значення
      }
      
      // Anti-Gravity
      const antiGravity = {};
      if (weight > 600) {
        antiGravity.gain = 4000; // Більший коефіцієнт для важких дронів
      } else if (weight < 250) {
        antiGravity.gain = 3000; // Менший коефіцієнт для легких дронів
      } else {
        antiGravity.gain = 3500; // Типове значення
      }
      
      // D_min (D term at low throttle)
      const dMin = {};
      if (flightStyle === 'racing') {
        dMin.roll = 20; // Нижче D для більшої стабільності
        dMin.pitch = 22;
        dMin.yaw = 0;
      } else if (flightStyle === 'cinematic') {
        dMin.roll = 15; // Нижче D для плавності
        dMin.pitch = 17;
        dMin.yaw = 0;
      } else {
        dMin.roll = 18; // Типові значення
        dMin.pitch = 20;
        dMin.yaw = 0;
      }
      
      // I-term relax
      const iterm_relax = {
        type: 'RPY_GYRO', // Типовий тип
        cutoff: 15 // Типове значення
      };
      
      if (flightStyle === 'racing') {
        iterm_relax.cutoff = 20; // Вище для перегонів (швидша реакція)
      } else if (flightStyle === 'cinematic') {
        iterm_relax.cutoff = 10; // Нижче для плавного відео
      }
      
      // I-term windup
      let iterm_windup = 50; // Типове значення
      if (weight > 600) {
        iterm_windup = 60; // Більше для важких дронів
      } else if (weight < 250) {
        iterm_windup = 40; // Менше для легких дронів
      }
      
      // Throttle limit
      let throttleLimitType = 'OFF';
      let throttleLimitPercent = 100;
      
      if (flightStyle === 'cinematic') {
        throttleLimitType = 'SCALE';
        throttleLimitPercent = 80; // Обмеження газу для плавного відео
      }
      
      return {
        tpa,
        antiGravity,
        dMin,
        iterm_relax,
        iterm_windup,
        throttleLimitType,
        throttleLimitPercent
      };
    }
  }