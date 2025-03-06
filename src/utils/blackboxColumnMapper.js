// src/utils/blackboxColumnMapper.js

/**
 * Таблиця відповідності імен колонок між текстовим форматом логів Blackbox
 * та відображенням у Betaflight Explorer
 */
export const fieldNameMap = {
    // Акселерометр
    'accSmooth[0]': 'Accel. [X]',
    'accSmooth[1]': 'Accel. [Y]',
    'accSmooth[2]': 'Accel. [Z]',
    
    // Гіроскоп
    'gyroADC[0]': 'Gyro [roll]',
    'gyroADC[1]': 'Gyro [pitch]',
    'gyroADC[2]': 'Gyro [yaw]',
    
    // Нефільтрований гіроскоп
    'gyroUnfilt[0]': 'Unfiltered Gyro [roll]',
    'gyroUnfilt[1]': 'Unfiltered Gyro [pitch]',
    'gyroUnfilt[2]': 'Unfiltered Gyro [yaw]',
    
    // Мотори
    'motor[0]': 'Motor [1]',
    'motor[1]': 'Motor [2]',
    'motor[2]': 'Motor [3]',
    'motor[3]': 'Motor [4]',
    
    // eRPM (електронні оберти моторів)
    'eRPM[0]': 'RPM [1]',
    'eRPM[1]': 'RPM [2]',
    'eRPM[2]': 'RPM [3]',
    'eRPM[3]': 'RPM [4]',
    
    // Команди пульта RC
    'rcCommand[0]': 'RC Command [roll]',
    'rcCommand[1]': 'RC Command [pitch]',
    'rcCommand[2]': 'RC Command [yaw]',
    'rcCommand[3]': 'RC Command [throttle]',
    
    // Значення заданої точки (setpoint)
    'setpoint[0]': 'Setpoint [roll]',
    'setpoint[1]': 'Setpoint [pitch]',
    'setpoint[2]': 'Setpoint [yaw]',
    'setpoint[3]': 'Setpoint [throttle]',
    
    // PID компоненти
    'axisP[0]': 'PID P [roll]',
    'axisP[1]': 'PID P [pitch]',
    'axisP[2]': 'PID P [yaw]',
    'axisI[0]': 'PID I [roll]',
    'axisI[1]': 'PID I [pitch]',
    'axisI[2]': 'PID I [yaw]',
    'axisD[0]': 'PID D [roll]',
    'axisD[1]': 'PID D [pitch]',
    'axisD[2]': 'PID D [yaw]',
    'axisF[0]': 'PID Feedforward [roll]',
    'axisF[1]': 'PID Feedforward [pitch]',
    'axisF[2]': 'PID Feedforward [yaw]',
    
    // PID Суми
    'axisSum[0]': 'PID Sum [roll]',
    'axisSum[1]': 'PID Sum [pitch]',
    'axisSum[2]': 'PID Sum [yaw]',
    
    // Помилки PID
    'axisError[0]': 'PID Error [roll]',
    'axisError[1]': 'PID Error [pitch]',
    'axisError[2]': 'PID Error [yaw]',
    
    // Інші датчики/змінні
    'vbatLatest': 'Battery volt.',
    'amperageLatest': 'Amperage',
    'baroAlt': 'Barometer',
    'rssi': 'RSSI',
    
    // Напрямок (heading)
    'heading[0]': 'Heading [roll]',
    'heading[1]': 'Heading [pitch]',
    'heading[2]': 'Heading [yaw]',
    
    // Лічильник ітерацій і час
    'loopIteration': 'loopIteration',
    'time': 'time'
  };
  
  // Створюємо зворотню мапу для пошуку в обох напрямках
  const reverseFieldNameMap = Object.entries(fieldNameMap).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
  }, {});
  
  /**
   * Знаходить колонку в наборі даних з урахуванням різних імен у Blackbox і Betaflight Explorer
   * 
   * @param {string} columnName - Ім'я колонки для пошуку (може бути як з логу, так і з Betaflight Explorer)
   * @param {string[]} dataHeaders - Доступні заголовки колонок
   * @param {boolean} caseSensitive - Враховувати регістр при пошуку (за замовчуванням true)
   * @param {boolean} logWarning - Виводити попередження, якщо колонку не знайдено (за замовчуванням true)
   * @returns {string|null} - Знайдене ім'я колонки або null
   */
  export function findColumnName(columnName, dataHeaders, caseSensitive = true, logWarning = true) {
    if (!columnName || !dataHeaders || !dataHeaders.length) {
      return null;
    }
  
    // Функція для порівняння рядків з урахуванням регістру
    const compareStrings = (a, b) => {
      if (caseSensitive) {
        return a === b;
      }
      return a.toLowerCase() === b.toLowerCase();
    };
  
    // 1. Пряме співпадіння (Найбільш надійний спосіб)
    const directMatch = dataHeaders.find(header => compareStrings(header, columnName));
    if (directMatch) {
      return directMatch;
    }
  
    // 2. Пошук через таблицю відповідності (від логу до Betaflight)
    const mappedName = fieldNameMap[columnName];
    if (mappedName) {
      const mappedMatch = dataHeaders.find(header => compareStrings(header, mappedName));
      if (mappedMatch) {
        return mappedMatch;
      }
    }
  
    // 3. Пошук через зворотню таблицю відповідності (від Betaflight до логу)
    const reverseMappedName = reverseFieldNameMap[columnName];
    if (reverseMappedName) {
      const reverseMappedMatch = dataHeaders.find(header => compareStrings(header, reverseMappedName));
      if (reverseMappedMatch) {
        return reverseMappedMatch;
      }
    }
  
    // 4. Нечіткий пошук (без урахування індексів)
    // Для випадків коли назви трохи відрізняються, наприклад "gyroADC[0]" vs "gyroAdc_0"
    const baseColumnName = columnName.replace(/[\[\]0-9]/g, '').toLowerCase();
    const baseMatch = dataHeaders.find(header => 
      header.replace(/[\[\]0-9]/g, '').toLowerCase() === baseColumnName &&
      header.includes(columnName.match(/\d+/)?.[0] || '')
    );
    
    if (baseMatch) {
      return baseMatch;
    }
  
    // Якщо колонку не знайдено і потрібно вивести попередження
    if (logWarning) {
      console.warn(`Колонку не знайдено: ${columnName}`);
    }
  
    return null;
  }
  
  /**
   * Знаходить індекс колонки в наборі даних з урахуванням різних імен
   * @param {string} columnName - Ім'я колонки для пошуку
   * @param {string[]} dataHeaders - Доступні заголовки колонок 
   * @returns {number} - Індекс колонки або -1 якщо не знайдено
   */
  export function findColumnIndex(columnName, dataHeaders) {
    const name = findColumnName(columnName, dataHeaders, true, false);
    if (name) {
      return dataHeaders.indexOf(name);
    }
    return -1;
  }
  
  /**
   * Знаходить значення з заданої колонки в рядку даних
   * @param {Object} row - Об'єкт з даними рядка
   * @param {string} columnName - Ім'я колонки для пошуку 
   * @param {string[]} dataHeaders - Доступні заголовки колонок
   * @param {*} defaultValue - Значення за замовчуванням, якщо колонку не знайдено
   * @returns {*} - Значення з колонки або значення за замовчуванням
   */
  export function getColumnValue(row, columnName, dataHeaders, defaultValue = 0) {
    const name = findColumnName(columnName, dataHeaders, true, false);
    if (name && row[name] !== undefined) {
      return row[name];
    }
    
    // Спробуємо прямий доступ через оригінальне ім'я
    if (row[columnName] !== undefined) {
      return row[columnName];
    }
    
    return defaultValue;
  }
  
  /**
   * Знаходить числове значення з заданої колонки в рядку даних
   * @param {Object} row - Об'єкт з даними рядка
   * @param {string} columnName - Ім'я колонки для пошуку
   * @param {string[]} dataHeaders - Доступні заголовки колонок 
   * @param {number} defaultValue - Числове значення за замовчуванням
   * @returns {number} - Числове значення з колонки або значення за замовчуванням
   */
  export function getNumericColumnValue(row, columnName, dataHeaders, defaultValue = 0) {
    const value = getColumnValue(row, columnName, dataHeaders, null);
    if (value === null) {
      return defaultValue;
    }
    
    const numValue = parseFloat(value);
    return isNaN(numValue) ? defaultValue : numValue;
  }
  
  /**
   * Отримує колонки для всіх трьох осей (roll, pitch, yaw)
   * @param {string} baseColumnName - Базова назва колонки без індексу
   * @param {string[]} dataHeaders - Доступні заголовки колонок
   * @returns {Object} - Об'єкт з колонками для всіх осей {roll, pitch, yaw}
   */
  export function getAxisColumns(baseColumnName, dataHeaders) {
    return {
      roll: findColumnName(`${baseColumnName}[0]`, dataHeaders, true, false),
      pitch: findColumnName(`${baseColumnName}[1]`, dataHeaders, true, false),
      yaw: findColumnName(`${baseColumnName}[2]`, dataHeaders, true, false)
    };
  }
  
  /**
   * Отримує значення для всіх трьох осей (roll, pitch, yaw) з рядка даних
   * @param {Object} row - Рядок даних
   * @param {string} baseColumnName - Базова назва колонки без індексу
   * @param {string[]} dataHeaders - Доступні заголовки колонок
   * @returns {Object} - Об'єкт зі значеннями для всіх осей {roll, pitch, yaw}
   */
  export function getAxisValues(row, baseColumnName, dataHeaders) {
    const columns = getAxisColumns(baseColumnName, dataHeaders);
    
    return {
      roll: columns.roll ? parseFloat(row[columns.roll] || 0) : 0,
      pitch: columns.pitch ? parseFloat(row[columns.pitch] || 0) : 0,
      yaw: columns.yaw ? parseFloat(row[columns.yaw] || 0) : 0
    };
  }