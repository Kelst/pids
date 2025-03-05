/**
 * Утиліта для розбору бінарних файлів .bbl Betaflight
 */
export class BBLParser {
    /**
     * Парсить бінарний файл .bbl Betaflight
     * @param {ArrayBuffer} buffer - Бінарні дані з файлу .bbl
     * @returns {Object} - Розібрані дані
     */
    static parseBuffer(buffer) {
      // Перетворюємо ArrayBuffer у DataView для роботи з бінарними даними
      const dataView = new DataView(buffer);
      const view = new Uint8Array(buffer);
      
      // Перевіряємо сигнатуру заголовка "H Product:Betaflight" в ASCII
      if (!this.checkBetaflightSignature(view)) {
        throw new Error("Файл не є дійсним логом Betaflight Blackbox. Відсутня сигнатура Betaflight.");
      }
      
      console.log("Виявлено файл Betaflight Blackbox.");
      
      // Знаходимо всі заголовки
      const headers = this.extractHeaders(view);
      console.log("Витягнуті заголовки:", headers);
      
      // Отримуємо інформацію про поля з заголовків
      const fieldDefinitions = this.parseFieldDefinitions(headers);
      console.log("Визначення полів:", fieldDefinitions);
      
      // Виконуємо парсинг даних на основі визначень полів
      const parsedData = this.parseDataFrames(view, fieldDefinitions);
      console.log(`Розібрано ${parsedData.length} кадрів даних`);
      
      // Повертаємо аналізовані дані у форматі, що очікує BlackboxAnalyzer
      return {
        type: 'blackbox',
        data: parsedData,
        headers: headers
      };
    }
    
    /**
     * Перевіряє, чи файл має сигнатуру Betaflight
     * @param {Uint8Array} view - Бінарні дані
     * @returns {boolean} - true якщо знайдено сигнатуру
     */
    static checkBetaflightSignature(view) {
      // Шукаємо сигнатуру "H Product:Betaflight" або інші варіанти сигнатур Betaflight
      const signatures = [
        "H Product:Betaflight",
        "H Firmware revision:"
      ];
      
      const textDecoder = new TextDecoder();
      const asText = textDecoder.decode(view.slice(0, Math.min(1000, view.length)));
      
      for (const signature of signatures) {
        if (asText.includes(signature)) {
          return true;
        }
      }
      
      return false;
    }
    
    /**
     * Витягує заголовки з даних
     * @param {Uint8Array} view - Бінарні дані
     * @returns {Object} - Об'єкт з заголовками
     */
    static extractHeaders(view) {
      const textDecoder = new TextDecoder();
      const headerEnd = this.findHeaderEnd(view);
      
      const headerText = textDecoder.decode(view.slice(0, headerEnd));
      const headerLines = headerText.split('\n')
        .filter(line => line.startsWith('H '))
        .map(line => line.substring(2));
      
      const headers = {};
      headerLines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      });
      
      return headers;
    }
    
    /**
     * Знаходить кінець заголовка в даних
     * @param {Uint8Array} view - Бінарні дані
     * @returns {number} - Індекс кінця заголовка
     */
    static findHeaderEnd(view) {
      const textDecoder = new TextDecoder();
      
      // Шукаємо перший рядок, що починається з 'I' (внутрішній кадр)
      for (let i = 0; i < view.length - 10; i++) {
        if (view[i] === 73 && (view[i+1] === 32 || view[i+1] === 44)) { // 'I' + ' ' або ','
          return i;
        }
      }
      
      // Якщо не знайдено 'I', шукаємо 'P' (кадр периферії)
      for (let i = 0; i < view.length - 10; i++) {
        if (view[i] === 80 && (view[i+1] === 32 || view[i+1] === 44)) { // 'P' + ' ' або ','
          return i;
        }
      }
      
      // Якщо нічого не знайдено, повертаємо дефолтну позицію
      return 1000; // Емпірично визначена точка, де зазвичай закінчуються заголовки
    }
    
    /**
     * Розбирає визначення полів з заголовків
     * @param {Object} headers - Об'єкт з заголовками
     * @returns {Object} - Визначення полів
     */
    static parseFieldDefinitions(headers) {
      const fieldDefs = {
        I: [], // Internal/Looptime fields
        P: []  // Peripheral fields
      };
      
      // Спроба аналізу "Field I" (внутрішні дані)
      if (headers['Field I']) {
        fieldDefs.I = headers['Field I'].split(',').map(f => f.trim());
      } else {
        // Якщо немає явного визначення, використовуємо загальні поля Betaflight
        fieldDefs.I = [
          'loopIteration', 'time', 
          'axisP[0]', 'axisP[1]', 'axisP[2]',
          'axisI[0]', 'axisI[1]', 'axisI[2]',
          'axisD[0]', 'axisD[1]', 'axisD[2]',
          'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]',
          'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]'
        ];
      }
      
      // Спроба аналізу "Field P" (периферійні дані)
      if (headers['Field P']) {
        fieldDefs.P = headers['Field P'].split(',').map(f => f.trim());
      } else {
        // Якщо немає явного визначення, використовуємо загальні поля Betaflight
        fieldDefs.P = ['time', 'vbatLatest', 'amperageLatest', 'rssi'];
      }
      
      return fieldDefs;
    }
    
    /**
     * Розбирає кадри даних з бінарних даних
     * @param {Uint8Array} view - Бінарні дані
     * @param {Object} fieldDefs - Визначення полів
     * @returns {Array} - Масив розібраних кадрів даних
     */
    static parseDataFrames(view, fieldDefs) {
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(view);
      
      // Розділяємо на рядки і фільтруємо лише кадри даних
      const lines = text.split('\n');
      const dataLines = lines.filter(line => 
        line.startsWith('I ') || line.startsWith('P ')
      );
      
      // Розбираємо кожен рядок з даними
      const parsedFrames = [];
      
      for (const line of dataLines) {
        const frameType = line[0]; // 'I' або 'P'
        
        // Пропускаємо рядок, якщо тип кадру не підтримується
        if (frameType !== 'I' && frameType !== 'P') continue;
        
        const values = line.substring(2).split(',');
        const frame = {};
        
        // Отримуємо відповідні визначення полів для типу кадру
        const fields = fieldDefs[frameType];
        
        // Заповнюємо кадр даних
        for (let i = 0; i < Math.min(fields.length, values.length); i++) {
          const fieldName = fields[i];
          let value = parseFloat(values[i]);
          
          // Обробляємо NaN значення
          if (isNaN(value)) value = 0;
          
          // Нормалізуємо імена полів для відповідності очікуванням BlackboxAnalyzer
          const normalizedName = this.normalizeFieldName(fieldName);
          frame[normalizedName] = value;
        }
        
        parsedFrames.push(frame);
      }
      
      // Повертаємо розібрані кадри даних
      return parsedFrames;
    }
    
    /**
     * Нормалізує імена полів для відповідності очікуванням BlackboxAnalyzer
     * @param {string} fieldName - Оригінальне ім'я поля
     * @returns {string} - Нормалізоване ім'я поля
     */
    static normalizeFieldName(fieldName) {
      // Карта відповідності імен полів
      const fieldMap = {
        'loopIteration': 'loopIteration',
        'time': 'time',
        'axisP[0]': 'pidP',
        'axisI[0]': 'pidI',
        'axisD[0]': 'pidD',
        'axisP[1]': 'pidPY',
        'axisI[1]': 'pidIY',
        'axisD[1]': 'pidDY',
        'axisP[2]': 'pidPZ',
        'axisI[2]': 'pidIZ',
        'axisD[2]': 'pidDZ',
        'gyroADC[0]': 'gyroX',
        'gyroADC[1]': 'gyroY',
        'gyroADC[2]': 'gyroZ',
        'motor[0]': 'motor0',
        'motor[1]': 'motor1',
        'motor[2]': 'motor2',
        'motor[3]': 'motor3',
        'rcCommand[0]': 'rcRoll',
        'rcCommand[1]': 'rcPitch',
        'rcCommand[2]': 'rcYaw',
        'rcCommand[3]': 'rcThrottle',
        'vbatLatest': 'vbat',
        'amperageLatest': 'current'
      };
      
      // Перевіряємо, чи є відповідність у мапі
      if (fieldMap[fieldName]) {
        return fieldMap[fieldName];
      }
      
      // Якщо немає в мапі, робимо автоматичну нормалізацію
      if (fieldName.includes('gyro') && fieldName.includes('[0]')) return 'gyroX';
      if (fieldName.includes('gyro') && fieldName.includes('[1]')) return 'gyroY';
      if (fieldName.includes('gyro') && fieldName.includes('[2]')) return 'gyroZ';
      
      if (fieldName.includes('motor') && fieldName.includes('[0]')) return 'motor0';
      if (fieldName.includes('motor') && fieldName.includes('[1]')) return 'motor1';
      if (fieldName.includes('motor') && fieldName.includes('[2]')) return 'motor2';
      if (fieldName.includes('motor') && fieldName.includes('[3]')) return 'motor3';
      
      if (fieldName.includes('pid') && fieldName.includes('P')) return 'pidP';
      if (fieldName.includes('pid') && fieldName.includes('I')) return 'pidI';
      if (fieldName.includes('pid') && fieldName.includes('D')) return 'pidD';
      
      if (fieldName.includes('vbat')) return 'vbat';
      if (fieldName.includes('current') || fieldName.includes('amperage')) return 'current';
      
      // Повертаємо оригінальне ім'я, якщо немає відповідності
      return fieldName;
    }
  }