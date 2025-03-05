/**
 * Спеціалізований парсер для логів Betaflight у текстовому форматі
 */
export class BetaflightLogParser {
    /**
     * Парсинг логу Betaflight у форматі, що міститься у файлі .txt або .csv
     * @param {string} content - Вміст файлу
     * @returns {Object} - Розібрані дані
     */
    static parseLog(content) {
      console.log("Розпочато аналіз логу Betaflight");
      
      // Розділяємо файл на рядки
      const lines = content.split('\n');
      
      // Перевіряємо, чи це лог Betaflight
      if (!this.isBetaflightLog(lines)) {
        throw new Error("Файл не розпізнано як лог Betaflight");
      }
      
      // Розбираємо заголовки (метадані)
      const headers = this.parseHeaders(lines);
      console.log("Метадані логу успішно розібрані");
      
      // Знаходимо рядок з назвами колонок даних і його індекс
      const { headerIndex, columnNames } = this.findDataHeader(lines);
      console.log(`Знайдено ${columnNames.length} колонок даних`);
      
      // Розбираємо дані
      const data = this.parseData(lines, headerIndex, columnNames);
      console.log(`Розібрано ${data.length} рядків даних`);
      
      // Повертаємо дані у форматі, що очікує BlackboxAnalyzer
      return {
        type: 'betaflight',
        headers: headers,
        data: data
      };
    }
    
    /**
     * Перевіряє, чи файл є логом Betaflight
     * @param {string[]} lines - Рядки файлу
     * @returns {boolean}
     */
    static isBetaflightLog(lines) {
      // Шукаємо характерні ознаки логу Betaflight
      for (let i = 0; i < Math.min(20, lines.length); i++) {
        if (lines[i].includes('Product,"Blackbox flight data recorder') ||
            lines[i].includes('Firmware revision,"Betaflight') ||
            lines[i].includes('firmwareType') ||
            lines[i].includes('Craft name,')) {
          return true;
        }
      }
      return false;
    }
    
    /**
     * Розбирає заголовки (метадані) логу
     * @param {string[]} lines - Рядки файлу
     * @returns {Object} - Об'єкт з метаданими
     */
    static parseHeaders(lines) {
      const headers = {};
      
      // Проходимо по рядках до тих пір, поки не знайдемо рядок з назвами колонок даних
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Якщо рядок виглядає як назви колонок даних (містить loopIteration, time і т.д.), припиняємо
        if (line.includes('loopIteration') && line.includes('time') && line.includes('gyroADC')) {
          break;
        }
        
        // Спроба розібрати рядок як пару ключ-значення
        const commaIndex = line.indexOf(',');
        if (commaIndex !== -1) {
          const key = line.substring(0, commaIndex).trim();
          let value = line.substring(commaIndex + 1).trim();
          
          // Видаляємо лапки, якщо вони є
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          
          headers[key] = value;
        }
      }
      
      return headers;
    }
    
    /**
     * Знаходить рядок з назвами колонок даних і розбирає їх
     * @param {string[]} lines - Рядки файлу
     * @returns {Object} - Індекс рядка і список назв колонок
     */
    static findDataHeader(lines) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Шукаємо рядок, що містить характерні назви колонок
        if (line.includes('loopIteration') && line.includes('time') && (
            line.includes('gyroADC') || line.includes('axisP')
        )) {
          // Розбираємо назви колонок
          const columnNames = this.parseCSVLine(line);
          return { headerIndex: i, columnNames };
        }
      }
      
      throw new Error("Не знайдено рядок з назвами колонок даних");
    }
    
    /**
     * Розбирає дані з логу
     * @param {string[]} lines - Рядки файлу
     * @param {number} headerIndex - Індекс рядка з назвами колонок
     * @param {string[]} columnNames - Назви колонок
     * @returns {Object[]} - Масив об'єктів з даними
     */
    static parseData(lines, headerIndex, columnNames) {
      const data = [];
      
      // Починаємо з рядка після заголовків
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Пропускаємо порожні рядки
        if (!line) continue;
        
        // Розбираємо значення
        const values = this.parseCSVLine(line);
        
        // Переконуємось, що у нас правильна кількість значень
        if (values.length === columnNames.length) {
          const dataPoint = {};
          
          // Створюємо об'єкт з назвами колонок і відповідними значеннями
          for (let j = 0; j < columnNames.length; j++) {
            const columnName = columnNames[j];
            const value = this.parseValue(values[j]);
            
            // Нормалізуємо ім'я колонки для BlackboxAnalyzer
            const normalizedName = this.normalizeColumnName(columnName);
            if (normalizedName) {
              dataPoint[normalizedName] = value;
            }
          }
          
          data.push(dataPoint);
        }
      }
      
      return data;
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
          // Перемикаємо стан "в лапках"
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          // Якщо знайшли кому поза лапками, додаємо поточне значення
          values.push(currentValue);
          currentValue = '';
        } else {
          // В іншому випадку додаємо символ до поточного значення
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
      
      // Спроба розібрати як число
      if (value === 'NaN') {
        return 0; // Замінюємо NaN на 0 для уникнення проблем з аналізом
      } else if (!isNaN(parseFloat(value)) && isFinite(value)) {
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
      
      // Якщо ніякої відповідності не знайдено, повертаємо null (колонка не буде використовуватися)
      return null;
    }
  }