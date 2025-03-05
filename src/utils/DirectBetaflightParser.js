/**
 * Покращений прямий парсер для специфічного формату CSV-логів Betaflight
 */
export class DirectBetaflightParser {
    /**
     * Розбирає лог Betaflight напряму без використання зовнішніх бібліотек
     * @param {string} content - Вміст файлу
     * @returns {Object} - Розібрані дані
     */
    static parseLog(content) {
      console.log("Пряме розбирання логу Betaflight...");
  
      try {
        // Розділяємо вміст на рядки
        const lines = content.split('\n');
        
        // Метадані логу (заголовки)
        const metadata = {};
        let dataHeaderLine = -1;
        let columnNames = [];
        
        // Спочатку знайдемо рядок з іменами колонок
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Шукаємо рядок, що містить імена колонок (завжди є "loopIteration" першим)
          if (line.startsWith('loopIteration') || (line.includes('loopIteration') && (line.includes('time') || line.includes('"time"')))) {
            dataHeaderLine = i;
            // Розбираємо імена колонок, розділених комами, враховуючи лапки
            columnNames = this.parseCSVHeader(line);
            console.log(`Знайдено ${columnNames.length} колонок у рядку ${i + 1}`);
            
            // Збираємо метадані з попередніх рядків
            for (let j = 0; j < i; j++) {
              const metaLine = lines[j].trim();
              if (!metaLine) continue;
              
              const commaIndex = metaLine.indexOf(',');
              if (commaIndex !== -1) {
                const key = metaLine.substring(0, commaIndex).trim();
                let value = metaLine.substring(commaIndex + 1).trim();
                
                // Видаляємо лапки, якщо вони є
                if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.substring(1, value.length - 1);
                }
                
                metadata[key] = value;
              }
            }
            
            break;
          }
        }
        
        if (dataHeaderLine === -1 || columnNames.length === 0) {
          throw new Error("Не знайдено рядок заголовків даних у файлі");
        }
        
        console.log(`Заголовок знайдено на рядку ${dataHeaderLine + 1}. Починаємо розбирати дані...`);
        
        // Розбираємо рядки даних після заголовка
        const data = [];
        let parsedRowCount = 0;
        
        for (let i = dataHeaderLine + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Розбираємо рядок CSV
          const values = this.parseCSVLine(line);
          
          // Перевіряємо, чи правильна кількість значень
          if (values.length >= columnNames.length - 5) { // Допускаємо невелику різницю в кількості колонок
            const dataPoint = {};
            
            // Додаємо значення відповідно до імен колонок
            for (let j = 0; j < Math.min(values.length, columnNames.length); j++) {
              // Нормалізуємо ім'я колонки
              const colName = this.normalizeColumnName(columnNames[j]);
              if (colName) {
                // Перетворюємо значення в правильний тип
                dataPoint[colName] = this.parseValue(values[j]);
              }
            }
            
            // Додаємо точку даних до результату
            data.push(dataPoint);
            parsedRowCount++;
            
            // Обмежимо кількість рядків для продуктивності (якщо файл дуже великий)
            if (parsedRowCount >= 10000) {
              console.log(`Досягнуто ліміту 10000 рядків. Додаткові дані пропущено.`);
              break;
            }
          }
        }
        
        console.log(`Успішно розібрано ${data.length} рядків даних`);
        
        if (data.length === 0) {
          throw new Error("Не знайдено дані після заголовка колонок");
        }
        
        return {
          type: 'betaflight',
          headers: metadata,
          data: data
        };
      } catch (err) {
        console.error("Помилка при розборі Betaflight логу:", err);
        throw new Error(`Помилка розбору Betaflight логу: ${err.message}`);
      }
    }
    
    /**
     * Розбирає заголовок CSV з урахуванням особливостей формату Betaflight
     * @param {string} headerLine - Рядок заголовка CSV
     * @returns {string[]} - Масив імен колонок
     */
    static parseCSVHeader(headerLine) {
      // Спеціальна обробка для заголовків Betaflight
      const columnNames = [];
      let currentName = '';
      let inQuotes = false;
      
      for (let i = 0; i < headerLine.length; i++) {
        const char = headerLine[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          // Завершення імені колонки
          columnNames.push(currentName.trim());
          currentName = '';
        } else {
          currentName += char;
        }
      }
      
      // Додаємо останню колонку
      if (currentName.trim()) {
        columnNames.push(currentName.trim());
      }
      
      // Видаляємо зайві лапки
      return columnNames.map(name => {
        if (name.startsWith('"') && name.endsWith('"')) {
          return name.substring(1, name.length - 1);
        }
        return name;
      });
    }
    
    /**
     * Розбирає рядок CSV з урахуванням лапок
     * @param {string} line - Рядок CSV
     * @returns {string[]} - Масив значень
     */
    static parseCSVLine(line) {
      const values = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          // Додаємо поточне значення до результату
          values.push(currentValue);
          currentValue = '';
        } else {
          // Додаємо символ до поточного значення
          currentValue += char;
        }
      }
      
      // Додаємо останнє значення
      values.push(currentValue);
      
      return values;
    }
    
    /**
     * Перетворює значення з рядка в правильний тип
     * @param {string} value - Значення у вигляді рядка
     * @returns {number|string|boolean} - Перетворене значення
     */
    static parseValue(value) {
      // Видаляємо лапки, якщо вони є
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      
      // Спеціальна обробка NaN
      if (value === 'NaN') {
        return 0; // Замінюємо NaN на 0 для аналізу
      }
      
      // Спроба розібрати як число
      if (!isNaN(parseFloat(value)) && isFinite(value)) {
        return parseFloat(value);
      }
      
      // Повертаємо оригінальне значення
      return value;
    }
    
    /**
     * Нормалізує ім'я колонки для BlackboxAnalyzer
     * @param {string} columnName - Оригінальне ім'я колонки
     * @returns {string|null} - Нормалізоване ім'я або null, якщо колонка не потрібна
     */
    static normalizeColumnName(columnName) {
      // Карта відповідності імен колонок
      const columnMap = {
        'loopIteration': 'loopIteration',
        'time': 'time',
        'axisP[0]': 'pidP',
        'axisP[1]': 'pidPY',
        'axisP[2]': 'pidPZ',
        'axisI[0]': 'pidI',
        'axisI[1]': 'pidIY',
        'axisI[2]': 'pidIZ',
        'axisD[0]': 'pidD',
        'axisD[1]': 'pidDY',
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
      
      // Спочатку перевіряємо пряму відповідність
      if (columnMap[columnName]) {
        return columnMap[columnName];
      }
      
      // Якщо прямої відповідності немає, спробуємо знайти за шаблоном
      if (columnName.includes('gyro') && columnName.includes('[0]')) return 'gyroX';
      if (columnName.includes('gyro') && columnName.includes('[1]')) return 'gyroY';
      if (columnName.includes('gyro') && columnName.includes('[2]')) return 'gyroZ';
      
      if (columnName.includes('motor') && columnName.includes('[0]')) return 'motor0';
      if (columnName.includes('motor') && columnName.includes('[1]')) return 'motor1';
      if (columnName.includes('motor') && columnName.includes('[2]')) return 'motor2';
      if (columnName.includes('motor') && columnName.includes('[3]')) return 'motor3';
      
      if (columnName.includes('pid') && columnName.includes('P')) return 'pidP';
      if (columnName.includes('pid') && columnName.includes('I')) return 'pidI';
      if (columnName.includes('pid') && columnName.includes('D')) return 'pidD';
      
      if (columnName.includes('vbat')) return 'vbat';
      if (columnName.includes('current') || columnName.includes('amperage')) return 'current';
      
      // Повертаємо null для колонок, які не будуть використовуватися
      return null;
    }
  }