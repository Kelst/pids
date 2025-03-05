import Papa from 'papaparse'
import _ from 'lodash'
import { BlackboxBinaryAdapter } from './BlackboxBinaryAdapter'
import { DirectBetaflightParser } from './DirectBetaflightParser'
import { ZieglerNicholsTuner } from './ZieglerNicholsTuner';

import { FFTAnalyzer } from './FFTAnalyzer';
import { AdvancedFilterRecommender } from './AdvancedFilterRecommender';
import { EnhancedZieglerNicholsTuner } from './EnhancedZieglerNicholsTuner';
export class BlackboxAnalyzer {
  /**
   * Parse the blackbox log file and extract the data
   * @param {File} file - The blackbox log file
   * @returns {Promise<Object>} - The parsed blackbox data
   */
  static async parseFile(file) {
    return new Promise((resolve, reject) => {
      // Check file extension
      const fileExtension = file.name.split('.').pop().toLowerCase()
      
      if (['csv', 'txt', 'log', 'bbl'].indexOf(fileExtension) === -1) {
        reject(new Error('Непідтримуваний тип файлу. Завантажте файл CSV, TXT, LOG або BBL.'))
        return
      }
      
      // Бінарний формат для .bbl
      if (fileExtension === 'bbl') {
        const reader = new FileReader()
        
        reader.onload = (event) => {
          try {
            const buffer = event.target.result
            console.log("BBL файл завантажено, розмір:", buffer.byteLength, "байт");
            
            // Використовуємо спеціалізований адаптер для бінарних файлів
            const parsedData = BlackboxBinaryAdapter.parseBinaryFile(buffer)
            resolve(parsedData)
          } catch (err) {
            console.error("Помилка під час розбору BBL файлу:", err);
            reject(new Error(`Помилка розбору BBL файлу: ${err.message}`))
          }
        }
        
        reader.onerror = () => {
          reject(new Error('Помилка читання файлу'))
        }
        
        reader.readAsArrayBuffer(file)
      } else {
        // Текстові формати
        const reader = new FileReader()
        
        reader.onload = (event) => {
          try {
            const fileContent = event.target.result
            console.log(`Файл ${file.name} завантажено, розмір: ${fileContent.length} байт`);
            
            // ПОКРАЩЕНЕ РОЗПІЗНАВАННЯ ФОРМАТУ BETAFLIGHT
            // Перевіряємо характерні ознаки Betaflight лога
            const isBetaflightLog = 
              fileContent.includes('Product,"Blackbox flight data recorder') || 
              fileContent.includes('Firmware revision,"Betaflight') ||
              fileContent.includes('loopIteration,"time"') ||
              fileContent.includes('firmwareType') ||
              (fileContent.includes('loopIteration') && fileContent.includes('gyroADC[0]'));
            
            if (isBetaflightLog) {
              console.log("Виявлено формат Betaflight, використовуємо спеціалізований парсер");
              try {
                // Використовуємо прямий парсер для форматів Betaflight
                const parsedData = DirectBetaflightParser.parseLog(fileContent);
                resolve(parsedData);
                return; // Важливо вийти після успішного розбору
              } catch (betaflightErr) {
                console.error("Помилка парсингу логу Betaflight:", betaflightErr);
                // Якщо не вдалося розібрати як Betaflight, спробуємо інші методи
                console.log("Спроба використати альтернативні методи парсингу...");
              }
            }
            
            // Звичайний CSV формат (якщо не розпізнано як Betaflight)
            if (fileExtension === 'csv') {
              console.log("Використовуємо стандартний CSV парсер");
              this.parseCSV(fileContent)
                .then(resolve)
                .catch(reject)
            } 
            // Інші текстові формати
            else {
              console.log("Спроба розбору як текстовий формат Blackbox");
              this.parseBlackbox(fileContent)
                .then(resolve)
                .catch(reject)
            }
          } catch (err) {
            console.error("Загальна помилка обробки файлу:", err);
            reject(err)
          }
        }
        
        reader.onerror = () => {
          reject(new Error('Помилка читання файлу'))
        }
        
        reader.readAsText(file)
      }
    })
  }
  
  /**
   * Parse CSV formatted blackbox data
   * @param {string} content - The file content as string
   * @returns {Promise<Object>} - The parsed blackbox data
   */
  static async parseCSV(content) {
    return new Promise((resolve, reject) => {
      // Перед використанням PapaParse, спробуємо розпізнати як Betaflight CSV
      if (content.includes('Product,"Blackbox flight data recorder') || 
          content.includes('Firmware revision,"Betaflight') ||
          content.includes('loopIteration,"time"')) {
        
        console.log("CSV містить формат Betaflight, перемикаємося на спеціалізований парсер");
        try {
          const parsedData = DirectBetaflightParser.parseLog(content);
          resolve(parsedData);
          return;
        } catch (betaflightErr) {
          console.error("Не вдалося розібрати CSV як Betaflight, використовуємо стандартний парсер CSV:", betaflightErr);
        }
      }
      
      // Звичайний парсинг CSV
      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Check if the CSV has the expected columns
          const requiredColumns = ['loopIteration', 'time']
          const hasRequiredColumns = requiredColumns.every(col => 
            results.meta.fields.some(field => {
              if (typeof field !== 'string') return false;
              return field.toLowerCase().includes(col.toLowerCase());
            })
          )
          
          if (!hasRequiredColumns) {
            reject(new Error('Недійсний формат CSV. Файл не схожий на дійсний лог Blackbox.'))
            return
          }
          
          // Normalize column names
          const data = results.data.map(row => {
            const normalized = {}
            
            Object.keys(row).forEach(key => {
              if (!key || typeof key !== 'string') return;
              
              const lowerKey = key.toLowerCase()
              
              // Map common column patterns to standardized names
              if (lowerKey.includes('time')) normalized.time = row[key]
              if (lowerKey.includes('loop')) normalized.loop = row[key]
              
              // Gyro data
              if (lowerKey.includes('gyro') && lowerKey.includes('x')) normalized.gyroX = row[key]
              if (lowerKey.includes('gyro') && lowerKey.includes('y')) normalized.gyroY = row[key]
              if (lowerKey.includes('gyro') && lowerKey.includes('z')) normalized.gyroZ = row[key]
              
              // PID data
              if (lowerKey.includes('pid') && lowerKey.includes('p')) normalized.pidP = row[key]
              if (lowerKey.includes('pid') && lowerKey.includes('i')) normalized.pidI = row[key]
              if (lowerKey.includes('pid') && lowerKey.includes('d')) normalized.pidD = row[key]
              
              // Motor outputs
              if (lowerKey.includes('motor') && lowerKey.includes('0')) normalized.motor0 = row[key]
              if (lowerKey.includes('motor') && lowerKey.includes('1')) normalized.motor1 = row[key]
              if (lowerKey.includes('motor') && lowerKey.includes('2')) normalized.motor2 = row[key]
              if (lowerKey.includes('motor') && lowerKey.includes('3')) normalized.motor3 = row[key]
              
              // RC commands
              if (lowerKey.includes('rc') && lowerKey.includes('command') && lowerKey.includes('roll')) 
                normalized.rcRoll = row[key]
              if (lowerKey.includes('rc') && lowerKey.includes('command') && lowerKey.includes('pitch')) 
                normalized.rcPitch = row[key]
              if (lowerKey.includes('rc') && lowerKey.includes('command') && lowerKey.includes('yaw')) 
                normalized.rcYaw = row[key]
              if (lowerKey.includes('rc') && lowerKey.includes('command') && lowerKey.includes('throttle')) 
                normalized.rcThrottle = row[key]
                
              // Battery data
              if (lowerKey.includes('vbat')) normalized.vbat = row[key]
              if (lowerKey.includes('current')) normalized.current = row[key]
            })
            
            return normalized
          })
          
          resolve({
            type: 'csv',
            data: data,
            headers: results.meta.fields
          })
        },
        error: (error) => {
          reject(new Error(`Помилка розбору CSV: ${error}`))
        }
      })
    })
  }
  
  /**
   * Parse Betaflight Blackbox format
   * @param {string} content - The file content as string
   * @returns {Promise<Object>} - The parsed blackbox data
   */
  static async parseBlackbox(content) {
    return new Promise((resolve, reject) => {
      try {
        // Basic validation to check if it's a Betaflight Blackbox log
        if (!content.includes('H Product:Betaflight') && !content.includes('H Firmware revision:')) {
          reject(new Error('Файл не схожий на дійсний лог Betaflight Blackbox.'))
          return
        }
        
        // Extract headers
        const headerLines = content
          .split('\n')
          .filter(line => line.startsWith('H '))
          .map(line => line.substring(2))
        
        const headers = {}
        headerLines.forEach(line => {
          const colonIndex = line.indexOf(':')
          if (colonIndex !== -1) {
            const key = line.substring(0, colonIndex).trim()
            const value = line.substring(colonIndex + 1).trim()
            headers[key] = value
          }
        })
        
        // Extract data frames
        const dataLines = content
          .split('\n')
          .filter(line => line.startsWith('I ') || line.startsWith('P ') || line.startsWith('S '))
        
        // Parse data frames based on field definitions in headers
        const fieldDefinitions = this.parseFieldDefinitions(headers)
        
        if (!fieldDefinitions) {
          reject(new Error('Не вдалося знайти визначення полів у файлі логу.'))
          return
        }
        
        // Parse the data lines into structured data
        const parsedData = this.parseDataLines(dataLines, fieldDefinitions)
        
        resolve({
          type: 'blackbox',
          headers: headers,
          data: parsedData
        })
      } catch (err) {
        reject(new Error(`Помилка розбору логу Blackbox: ${err.message}`))
      }
    })
  }
  
  /**
   * Parse the field definitions from the headers
   * @param {Object} headers - The extracted headers
   * @returns {Object|null} - The parsed field definitions or null if not found
   */
  static parseFieldDefinitions(headers) {
    // This is a simplified version - in a real implementation,
    // you would parse the actual field definitions from the headers
    
    // For demonstration purposes, we'll return a basic structure
    return {
      I: ['loopIteration', 'time', 'gyroX', 'gyroY', 'gyroZ', 'pidP', 'pidI', 'pidD', 
          'motor0', 'motor1', 'motor2', 'motor3', 'rcRoll', 'rcPitch', 'rcYaw', 'rcThrottle'],
      P: ['time', 'vbat', 'current']
    }
  }
  
  /**
   * Parse the data lines into structured data
   * @param {string[]} dataLines - The data lines from the log
   * @param {Object} fieldDefinitions - The field definitions
   * @returns {Object[]} - The parsed data
   */
  static parseDataLines(dataLines, fieldDefinitions) {
    // This is a simplified version - in a real implementation,
    // you would parse the actual data according to the field definitions
    
    // For demonstration purposes, we'll return a basic structure
    const parsedData = []
    
    dataLines.forEach(line => {
      const type = line[0] // I, P, or S
      const values = line.substring(2).split(',')
      
      if (fieldDefinitions[type]) {
        const dataPoint = {}
        
        fieldDefinitions[type].forEach((field, index) => {
          if (index < values.length) {
            dataPoint[field] = parseFloat(values[index])
          }
        })
        
        parsedData.push(dataPoint)
      }
    })
    
    return parsedData
  }
  
  /**
   * Analyze the blackbox data and extract meaningful information
   * @param {Object} blackboxData - The parsed blackbox data
   * @returns {Object} - The analyzed data
   */
  static analyzeData(blackboxData) {
    // Витягуємо і організуємо дані для аналізу
    let data = [];
    
    if (blackboxData.type === 'csv' || blackboxData.type === 'betaflight') {
      data = blackboxData.data;
    } else if (blackboxData.type === 'blackbox' || blackboxData.type === 'binary' || blackboxData.type === 'demo') {
      data = blackboxData.data;
    } else {
      throw new Error('Невідомий формат даних');
    }
    
    // Переконуємося, що маємо достатньо точок даних для аналізу
    if (data.length < 10) {
      throw new Error(`Недостатньо точок даних для аналізу. Знайдено ${data.length}, потрібно щонайменше 10.`);
    }
    
    // Якщо даних менше 100, додаємо попередження
    const limitedDataAnalysis = data.length < 100 ? 
      "Увага: Кількість точок даних менше 100. Результати аналізу можуть бути менш точними." : 
      "";
  
    console.log(`Аналізуємо ${data.length} точок даних`);
    
    // Отримуємо версію Betaflight з метаданих, якщо доступно
    let betaflightVersion = "4.3"; // За замовчуванням
    if (blackboxData.headers && blackboxData.headers['Firmware revision']) {
      const versionMatch = blackboxData.headers['Firmware revision'].match(/(\d+\.\d+)/);
      if (versionMatch) {
        betaflightVersion = versionMatch[1];
      }
    }
    console.log(`Визначено версію Betaflight: ${betaflightVersion}`);
    
    // Витягуємо часові дані
    const timeData = data.map(d => d.time || 0);
    
    // Витягуємо дані гіроскопа
    const gyroData = {
      time: timeData,
      x: data.map(d => d.gyroX || 0),
      y: data.map(d => d.gyroY || 0),
      z: data.map(d => d.gyroZ || 0)
    };
    
    // Витягуємо дані PID
    const pidData = {
      time: timeData,
      p: data.map(d => d.pidP || 0),
      i: data.map(d => d.pidI || 0),
      d: data.map(d => d.pidD || 0)
    };
    
    // Витягуємо дані моторів
    const motorData = {
      time: timeData,
      motor0: data.map(d => d.motor0 || 0),
      motor1: data.map(d => d.motor1 || 0),
      motor2: data.map(d => d.motor2 || 0),
      motor3: data.map(d => d.motor3 || 0)
    };
    
    // Витягуємо RC команди
    const rcData = {
      time: timeData,
      roll: data.map(d => d.rcRoll || 0),
      pitch: data.map(d => d.rcPitch || 0),
      yaw: data.map(d => d.rcYaw || 0),
      throttle: data.map(d => d.rcThrottle || 0)
    };
    
    // Витягуємо дані батареї
    const batteryData = {
      time: timeData,
      voltage: data.map(d => d.vbat || 0),
      current: data.map(d => d.current || 0)
    };
    
    // ПОКРАЩЕНО: Використовуємо справжній FFT аналіз замість симуляції
    let fftAnalysis = { resonanceFrequencies: [], dominantFrequency: 0 };
    try {
      const fftAnalyzer = new FFTAnalyzer();
      // Використовуємо гіроскоп по осі X для аналізу
      const gyroXData = gyroData.x.filter(x => !isNaN(x));
      
      // Вираховуємо частоту дискретизації (оцінка на основі часових даних)
      let sampleRate = 1000; // За замовчуванням 1кГц
      if (timeData.length > 2) {
        const timeDiffs = [];
        for (let i = 1; i < timeData.length; i++) {
          const diff = timeData[i] - timeData[i-1];
          if (diff > 0) timeDiffs.push(diff);
        }
        
        if (timeDiffs.length > 0) {
          const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
          sampleRate = Math.round(1000 / avgTimeDiff); // Конвертуємо в Гц
        }
      }
      
      console.log(`Оцінена частота дискретизації: ${sampleRate} Гц`);
      
      // Виконуємо FFT аналіз для кожної осі
      const fftX = fftAnalyzer.analyzeGyroData(gyroData.x, sampleRate);
      const fftY = fftAnalyzer.analyzeGyroData(gyroData.y, sampleRate);
      const fftZ = fftAnalyzer.analyzeGyroData(gyroData.z, sampleRate);
      
      // Об'єднуємо результати FFT аналізу
      fftAnalysis = {
        x: fftX,
        y: fftY,
        z: fftZ,
        // Визначаємо домінантну частоту з усіх осей
        dominantFrequency: Math.max(
          fftX.dominantFrequency || 0,
          fftY.dominantFrequency || 0,
          fftZ.dominantFrequency || 0
        ),
        // Об'єднуємо резонансні частоти з усіх осей
        resonanceFrequencies: [
          ...(fftX.resonanceFrequencies || []),
          ...(fftY.resonanceFrequencies || []),
          ...(fftZ.resonanceFrequencies || [])
        ].sort((a, b) => b.amplitude - a.amplitude).slice(0, 5),
        // Отримуємо діапазони з найвищим рівнем шуму
        bandAnalysis: [
          ...(fftX.bandAnalysis || []),
          ...(fftY.bandAnalysis || []),
          ...(fftZ.bandAnalysis || [])
        ].sort((a, b) => b.severity - a.severity).slice(0, 3)
      };
      
      console.log("FFT аналіз завершено. Домінантна частота:", fftAnalysis.dominantFrequency);
    } catch (error) {
      console.error("Помилка при виконанні FFT аналізу:", error);
    }
    
    // Обчислюємо метрики
    const metrics = this.calculateMetrics(gyroData, pidData, motorData, fftAnalysis);
    
    // ПОКРАЩЕНО: Аналізуємо дані для отримання більш точних рекомендацій
    const analysis = this.generateAnalysis(gyroData, pidData, motorData, rcData, metrics, fftAnalysis);
    
    // ПОКРАЩЕНО: Оцінюємо параметри дрона на основі даних
    const droneParams = this._estimateDroneParameters(
      gyroData,
      motorData,
      batteryData,
      blackboxData.headers
    );
    
    // Додаємо попередження до результатів аналізу, якщо потрібно
    const result = {
      gyroData,
      pidData,
      motorData,
      batteryData,
      rcData,
      metrics,
      analysis,
      fftAnalysis,
      droneParams, // Новий параметр з оціненими характеристиками дрона
      betaflightVersion // Додаємо інформацію про версію Betaflight
    };
    
    if (limitedDataAnalysis) {
      result.warning = limitedDataAnalysis;
    }
    
    if (blackboxData.type === 'binary') {
      result.warning = (result.warning || "") + 
        " Цей аналіз базується на даних з бінарного BBL файлу. " +
        "Для найбільш точних результатів рекомендується відкрити його в Betaflight Blackbox Explorer " +
        "і експортувати як CSV для аналізу.";
    }
    
    console.log("Аналіз даних завершено успішно");
    return result;
  }
  
  /**
   * Оцінює параметри дрона на основі даних польоту
   * Метод для додавання в BlackboxAnalyzer
   */
  static _estimateDroneParameters(gyroData, motorData, batteryData, headers) {
    // Базові параметри за замовчуванням
    const droneParams = {
      size: 5, // дюйми пропелера
      weight: 400, // грами
      batteryType: '4S', // тип батареї
      motorKv: 2300, // KV моторів
      frameType: 'X', // тип рами
      flightStyle: 'freestyle' // стиль польоту
    };
    
    try {
      // Оцінка типу батареї на основі напруги
      if (batteryData && batteryData.voltage && batteryData.voltage.length > 0) {
        // Відфільтруємо нульові значення
        const voltages = batteryData.voltage.filter(v => v > 5);
        if (voltages.length > 0) {
          // Знаходимо середню напругу
          const avgVoltage = voltages.reduce((sum, v) => sum + v, 0) / voltages.length;
          
          // Оцінка кількості комірок
          if (avgVoltage < 12) {
            droneParams.batteryType = '3S';
          } else if (avgVoltage < 17) {
            droneParams.batteryType = '4S';
          } else if (avgVoltage < 22) {
            droneParams.batteryType = '5S';
          } else {
            droneParams.batteryType = '6S';
          }
          
          console.log(`Оцінено тип батареї: ${droneParams.batteryType} (${avgVoltage.toFixed(1)}V)`);
        }
      }
      
      // Оцінка ваги на основі характеристик двигунів і напруги
      if (motorData && 
          motorData.motor0.length > 0 && 
          motorData.motor1.length > 0 && 
          motorData.motor2.length > 0 && 
          motorData.motor3.length > 0) {
        
        // Знаходимо середні значення моторів при високому газі
        const highThrottleIndices = [];
        for (let i = 0; i < motorData.motor0.length; i++) {
          const avgMotorValue = (
            motorData.motor0[i] + motorData.motor1[i] + 
            motorData.motor2[i] + motorData.motor3[i]
          ) / 4;
          
          if (avgMotorValue > 1700) {
            highThrottleIndices.push(i);
          }
        }
        
        if (highThrottleIndices.length > 10) {
          // Знаходимо середні значення моторів при високому газі
          let avgHighMotor = 0;
          for (const i of highThrottleIndices) {
            avgHighMotor += (
              motorData.motor0[i] + motorData.motor1[i] + 
              motorData.motor2[i] + motorData.motor3[i]
            ) / 4;
          }
          avgHighMotor /= highThrottleIndices.length;
          
          // Оцінюємо вагу на основі середнього значення моторів
          // Це дуже приблизна оцінка
          if (avgHighMotor > 1900) {
            droneParams.weight = 550; // Важкий дрон
          } else if (avgHighMotor > 1800) {
            droneParams.weight = 450; // Середньо-важкий дрон
          } else if (avgHighMotor > 1700) {
            droneParams.weight = 350; // Легкий дрон
          } else {
            droneParams.weight = 250; // Дуже легкий дрон
          }
          
          console.log(`Оцінено вагу дрона: ${droneParams.weight}g (avgMotor: ${avgHighMotor.toFixed(1)})`);
        }
      }
      
      // Оцінка розміру пропелерів і KV моторів на основі характеристик гіроскопа
      if (gyroData && gyroData.x.length > 0) {
        // Аналізуємо характеристики гіроскопа
        const rollRates = [];
        for (let i = 1; i < gyroData.x.length; i++) {
          rollRates.push(Math.abs(gyroData.x[i] - gyroData.x[i-1]));
        }
        
        // Відсортуємо та знайдемо 95-й перцентиль
        const sortedRates = [...rollRates].sort((a, b) => a - b);
        const rate95 = sortedRates[Math.floor(sortedRates.length * 0.95)];
        
        // Оцінка розміру пропелерів на основі швидкості реакції
        if (rate95 > 200) {
          droneParams.size = 3; // Маленькі пропелери (швидка реакція)
          droneParams.motorKv = 3000;
        } else if (rate95 > 150) {
          droneParams.size = 4; // Середні пропелери
          droneParams.motorKv = 2600;
        } else if (rate95 > 100) {
          droneParams.size = 5; // Стандартні пропелери
          droneParams.motorKv = 2300;
        } else {
          droneParams.size = 7; // Великі пропелери (повільна реакція)
          droneParams.motorKv = 1700;
        }
        
        console.log(`Оцінено розмір пропелерів: ${droneParams.size}" (rate95: ${rate95.toFixed(1)})`);
      }
      
      // Оцінка стилю польоту на основі гіроскопа і команд RC
      if (gyroData && gyroData.x.length > 0) {
        // Аналізуємо швидкість зміни команд
        const maxRates = [];
        for (let axis of ['x', 'y', 'z']) {
          let maxRate = 0;
          for (let i = 10; i < gyroData[axis].length; i += 10) {
            const rate = Math.abs(gyroData[axis][i] - gyroData[axis][i-10]);
            if (rate > maxRate) maxRate = rate;
          }
          maxRates.push(maxRate);
        }
        
        const avgMaxRate = maxRates.reduce((a, b) => a + b, 0) / maxRates.length;
        
        // Оцінка стилю польоту
        if (avgMaxRate > 300) {
          droneParams.flightStyle = 'racing';
        } else if (avgMaxRate < 100) {
          droneParams.flightStyle = 'cinematic';
        } else {
          droneParams.flightStyle = 'freestyle';
        }
        
        console.log(`Оцінено стиль польоту: ${droneParams.flightStyle} (avgMaxRate: ${avgMaxRate.toFixed(1)})`);
      }
      
      // Читаємо тип рами з заголовків, якщо доступно
      if (headers && headers['Craft name']) {
        const craftName = headers['Craft name'].toLowerCase();
        if (craftName.includes('cine') || craftName.includes('film')) {
          droneParams.flightStyle = 'cinematic';
        } else if (craftName.includes('race') || craftName.includes('racer')) {
          droneParams.flightStyle = 'racing';
        }
        
        // Оцінка розміру
        for (let size = 3; size <= 7; size++) {
          if (craftName.includes(`${size}"`) || craftName.includes(`${size}inch`)) {
            droneParams.size = size;
            break;
          }
        }
      }
      
    } catch (error) {
      console.error("Помилка при оцінці параметрів дрона:", error);
    }
    
    return droneParams;
  }
  
  /**
   * Модифікований метод generateRecommendations для BlackboxAnalyzer
   * Замінить оригінальний метод в BlackboxAnalyzer.js
   */
  static generateRecommendations(analyzedData) {
    const { 
      metrics, 
      analysis, 
      gyroData, 
      pidData, 
      motorData, 
      rcData, 
      fftAnalysis,
      droneParams,
      betaflightVersion 
    } = analyzedData;
    
    // ПОКРАЩЕНО: Використовуємо EnhancedZieglerNicholsTuner для кращих PID рекомендацій
    console.log("Генерація покращених PID рекомендацій...");
    const znTuner = new EnhancedZieglerNicholsTuner();
    
    // Встановлюємо параметри дрона для точніших рекомендацій
    if (droneParams) {
      znTuner.setDroneParameters(droneParams);
    }
    
    // Генеруємо рекомендації PID
    const pidRecommendations = [];
    
    try {
      // Отримуємо рекомендації на основі даних польоту
      const znResults = znTuner.generatePIDRecommendations(gyroData, rcData, 1000);
      
      // Додаємо рекомендації для Roll
      pidRecommendations.push({
        title: 'Roll PID за покращеним алгоритмом',
        description: `Оптимізовано для ${droneParams.flightStyle} стилю польоту на ${droneParams.size}" пропелерах`,
        command: `set pid_roll_p = ${znResults.roll.P}\nset pid_roll_i = ${znResults.roll.I}\nset pid_roll_d = ${znResults.roll.D}\nset pid_roll_f = ${znResults.roll.F}`
      });
      
      // Додаємо рекомендації для Pitch
      pidRecommendations.push({
        title: 'Pitch PID за покращеним алгоритмом',
        description: `Оптимізовано для ${droneParams.flightStyle} стилю польоту`,
        command: `set pid_pitch_p = ${znResults.pitch.P}\nset pid_pitch_i = ${znResults.pitch.I}\nset pid_pitch_d = ${znResults.pitch.D}\nset pid_pitch_f = ${znResults.pitch.F}`
      });
      
      // Додаємо рекомендації для Yaw
      pidRecommendations.push({
        title: 'Yaw PID за покращеним алгоритмом',
        description: `Оптимізовано для максимальної стабільності`,
        command: `set pid_yaw_p = ${znResults.yaw.P}\nset pid_yaw_i = ${znResults.yaw.I}\nset pid_yaw_d = ${znResults.yaw.D}\nset pid_yaw_f = ${znResults.yaw.F}`
      });
      
      // Додаємо рекомендації для майстер-множника
      if (znResults.masterMultiplier !== 1.0) {
        pidRecommendations.push({
          title: 'Загальний множник PID',
          description: `Множник ${znResults.masterMultiplier} для всіх PID значень, враховуючи характеристики дрона`,
          command: `set pid_profile_1_pid_gain = ${Math.round(znResults.masterMultiplier * 100)}`
        });
      }
      
      // Додаємо додаткові параметри
      if (znResults.advancedParams) {
        pidRecommendations.push({
          title: 'TPA (Throttle PID Attenuation)',
          description: `Зменшує значення PID при високому газі для уникнення oscilations`,
          command: `set tpa_rate = ${znResults.advancedParams.tpa.rate}\nset tpa_breakpoint = ${znResults.advancedParams.tpa.breakpoint}`
        });
        
        pidRecommendations.push({
          title: 'Anti-Gravity та I-term параметри',
          description: `Оптимізовано для дрона вагою ${droneParams.weight}g та батареєю ${droneParams.batteryType}`,
          command: `set anti_gravity_gain = ${znResults.advancedParams.antiGravity.gain}\nset iterm_relax_type = ${znResults.advancedParams.iterm_relax.type}\nset iterm_relax_cutoff = ${znResults.advancedParams.iterm_relax.cutoff}\nset iterm_windup = ${znResults.advancedParams.iterm_windup}`
        });
        
        // Додаємо D_min параметри, якщо це не нульові значення
        if (znResults.advancedParams.dMin.roll > 0 || znResults.advancedParams.dMin.pitch > 0) {
          pidRecommendations.push({
            title: 'D_min параметри',
            description: `Зменшує D при низькому газі для зменшення пропвошу`,
            command: `set d_min_roll = ${znResults.advancedParams.dMin.roll}\nset d_min_pitch = ${znResults.advancedParams.dMin.pitch}\nset d_min_yaw = ${znResults.advancedParams.dMin.yaw}`
          });
        }
      }
      
    } catch (error) {
      console.error("Помилка при генерації PID рекомендацій:", error);
      // Запасний варіант - використовуємо звичайний розрахунок PID
      // (ваш існуючий код для розрахунку PID)
    }
    
    // ПОКРАЩЕНО: Використовуємо AdvancedFilterRecommender для рекомендацій фільтрів
    console.log("Генерація покращених рекомендацій фільтрів...");
    const filterRecommender = new AdvancedFilterRecommender();
    
    // Встановлюємо версію Betaflight
    if (betaflightVersion) {
      filterRecommender.setVersion(betaflightVersion);
    }
    
    // Розраховуємо рівень шуму
    const gyroNoiseRoll = parseFloat(metrics['Gyro Noise (Roll)'] || 0);
    const gyroNoisePitch = parseFloat(metrics['Gyro Noise (Pitch)'] || 0);
    const gyroNoiseYaw = parseFloat(metrics['Gyro Noise (Yaw)'] || 0);
    const avgGyroNoise = (gyroNoiseRoll + gyroNoisePitch + gyroNoiseYaw) / 3;
    
    // Отримуємо рекомендації фільтрів на основі FFT аналізу
    const filterRecommendations = [];
    
    try {
      // Генеруємо рекомендації фільтрів
      const filterRecs = filterRecommender.generateFilterRecommendations(
        fftAnalysis,
        avgGyroNoise * 3, // Масштабуємо до 0-100
        droneParams
      );
      
      // Додаємо рекомендацію для гіро фільтра
      filterRecommendations.push({
        title: 'Гіро Low Pass фільтр',
        description: filterRecs.gyroLowpass.dynamicLpf ?
          `Динамічний LPF з діапазоном ${filterRecs.gyroLowpass.dynamicLpf.min}-${filterRecs.gyroLowpass.dynamicLpf.max} Гц` :
          `Статичний ${filterRecs.gyroLowpass.type} фільтр зі зрізом ${filterRecs.gyroLowpass.cutoff} Гц`,
        command: filterRecs.gyroLowpass.command
      });
      
      // Додаємо рекомендацію для D-term фільтра
      filterRecommendations.push({
        title: 'D-term Low Pass фільтр',
        description: filterRecs.dtermLowpass.dynamicLpf ?
          `Динамічний LPF з діапазоном ${filterRecs.dtermLowpass.dynamicLpf.min}-${filterRecs.dtermLowpass.dynamicLpf.max} Гц` :
          `Статичний ${filterRecs.dtermLowpass.type} фільтр зі зрізом ${filterRecs.dtermLowpass.cutoff} Гц`,
        command: filterRecs.dtermLowpass.command
      });
      
      // Додаємо рекомендацію для Notch фільтра, якщо увімкнено
      if (filterRecs.notchFilter.enabled) {
        filterRecommendations.push({
          title: 'Динамічний Notch фільтр',
          description: `Налаштовано на усунення шуму на частоті ${fftAnalysis.dominantFrequency.toFixed(1)} Гц`,
          command: filterRecs.notchFilter.command
        });
      }
      
      // Додаємо додаткові рекомендації фільтрів
      if (filterRecs.additionalFilters && filterRecs.additionalFilters.length > 0) {
        for (const addFilter of filterRecs.additionalFilters) {
          filterRecommendations.push(addFilter);
        }
      }
      
    } catch (error) {
      console.error("Помилка при генерації рекомендацій фільтрів:", error);
      // Запасний варіант - використовуємо звичайний розрахунок фільтрів
      // (ваш існуючий код для розрахунку фільтрів)
    }
    
    // Генеруємо повний набір команд
    // Спочатку збираємо команди з рекомендацій для PID
    const fullCommandSet = [
      '# PID Settings'
    ];
    
    // Додаємо рекомендації для PID
    for (const rec of pidRecommendations) {
      const cmdLines = rec.command.split('\n');
      fullCommandSet.push(...cmdLines);
    }
    
    fullCommandSet.push('');
    fullCommandSet.push('# Filter Settings');
    
    // Додаємо рекомендації для фільтрів
    for (const rec of filterRecommendations) {
      const cmdLines = rec.command.split('\n');
      fullCommandSet.push(...cmdLines);
    }
    
    // Додаємо команду збереження
    fullCommandSet.push('');
    fullCommandSet.push('# Save settings');
    fullCommandSet.push('save');
    
    return {
      pid: pidRecommendations,
      filters: filterRecommendations,
      fullCommandSet
    };
  }
  
  // Оновлений метод calculateMetrics, що включає дані FFT аналізу
  static calculateMetrics(gyroData, pidData, motorData, fftAnalysis = {}) {
    // Calculate standard deviation of gyro data as a measure of noise
    const gyroXStdDev = this.calculateStandardDeviation(gyroData.x);
    const gyroYStdDev = this.calculateStandardDeviation(gyroData.y);
    const gyroZStdDev = this.calculateStandardDeviation(gyroData.z);
    
    // Calculate PID error (simplified - in a real implementation this would be more complex)
    const pidErrorX = this.calculateRMSE(gyroData.x, pidData.p);
    const pidErrorY = this.calculateRMSE(gyroData.y, pidData.p);
    const pidErrorZ = this.calculateRMSE(gyroData.z, pidData.p);
    
    // Calculate motor balance/deviation
    const motorVariance = this.calculateVariance([
      ...motorData.motor0,
      ...motorData.motor1,
      ...motorData.motor2,
      ...motorData.motor3
    ]);
    
    // Calculate gyro response time (simplified)
    const gyroResponseTime = this.estimateResponseTime(gyroData.x, pidData.p);
    
    // НОВИЙ КОД: Додаємо метрики з FFT-аналізу
    const resonanceMetrics = {};
    
    if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
      // Додаємо основну резонансну частоту
      resonanceMetrics['Домінантна частота (Гц)'] = fftAnalysis.dominantFrequency.toFixed(1);
      
      // Додаємо рівень шуму з FFT
      if (typeof fftAnalysis.noiseLevel !== 'undefined') {
        resonanceMetrics['FFT рівень шуму'] = fftAnalysis.noiseLevel.toFixed(1);
      }
      
      // Додаємо топ-3 резонансні частоти
      for (let i = 0; i < Math.min(3, fftAnalysis.resonanceFrequencies.length); i++) {
        const peak = fftAnalysis.resonanceFrequencies[i];
        resonanceMetrics[`Пік ${i+1} (${peak.frequency.toFixed(1)} Гц)`] = peak.amplitude.toFixed(3);
      }
    }
    
    return {
      'Gyro Noise (Roll)': gyroXStdDev.toFixed(2),
      'Gyro Noise (Pitch)': gyroYStdDev.toFixed(2),
      'Gyro Noise (Yaw)': gyroZStdDev.toFixed(2),
      'PID Error (Roll)': pidErrorX.toFixed(2),
      'PID Error (Pitch)': pidErrorY.toFixed(2),
      'PID Error (Yaw)': pidErrorZ.toFixed(2),
      'Motor Balance': motorVariance.toFixed(2),
      'Response Time (ms)': gyroResponseTime.toFixed(2),
      ...resonanceMetrics
    };
  }
  
  // Оновлений метод generateAnalysis з урахуванням FFT-аналізу
  static generateAnalysis(gyroData, pidData, motorData, rcData, metrics, fftAnalysis = {}) {
    // Analyze gyro data
    let gyroAnalysis = '';
    const gyroNoiseLevel = (
      parseFloat(metrics['Gyro Noise (Roll)']) + 
      parseFloat(metrics['Gyro Noise (Pitch)']) + 
      parseFloat(metrics['Gyro Noise (Yaw)'])
    ) / 3;
    
    if (gyroNoiseLevel < 5) {
      gyroAnalysis = 'Gyro noise levels are very low, indicating good hardware and filtering. No additional filtering needed.';
    } else if (gyroNoiseLevel < 10) {
      gyroAnalysis = 'Gyro noise levels are acceptable but could be improved. Consider adjusting gyro LPF or notch filter settings.';
    } else if (gyroNoiseLevel < 20) {
      gyroAnalysis = 'Gyro noise levels are high. Check for mechanical issues and adjust filtering to reduce noise.';
    } else {
      gyroAnalysis = 'Very high gyro noise detected. Check mounting, balance, and motor health. Significant filtering changes recommended.';
    }
    
    // Analyze PID data
    let pidAnalysis = '';
    const pidErrorLevel = (
      parseFloat(metrics['PID Error (Roll)']) + 
      parseFloat(metrics['PID Error (Pitch)']) + 
      parseFloat(metrics['PID Error (Yaw)'])
    ) / 3;
    
    if (pidErrorLevel < 5) {
      pidAnalysis = 'PID response is excellent. Current PID values are well-tuned for your setup.';
    } else if (pidErrorLevel < 10) {
      pidAnalysis = 'PID response is good but could be improved. Consider fine-tuning P and D terms.';
    } else if (pidErrorLevel < 20) {
      pidAnalysis = 'PID response needs improvement. Consider recalibrating your PID values based on the recommendations.';
    } else {
      pidAnalysis = 'Poor PID response detected. A complete PID tune is recommended using the provided values as a starting point.';
    }
    
    // НОВИЙ КОД: Аналіз на основі FFT результатів
    let noiseAnalysis = '';
    
    if (fftAnalysis && fftAnalysis.resonanceFrequencies && fftAnalysis.resonanceFrequencies.length > 0) {
      // Отримуємо домінантну частоту і пік
      const dominantFreq = fftAnalysis.dominantFrequency;
      const peaks = fftAnalysis.resonanceFrequencies;
      
      if (dominantFreq < 100) {
        noiseAnalysis = `Виявлено шум на низькій частоті (${dominantFreq.toFixed(1)} Гц), який зазвичай пов'язаний з вібрацією рами або проблемами монтажу. Рекомендується перевірити баланс пропелерів та кріплення моторів.`;
      } else if (dominantFreq < 200) {
        noiseAnalysis = `Виявлено шум на середній частоті (${dominantFreq.toFixed(1)} Гц), який зазвичай пов'язаний з пропелерами або моторами. Рекомендується перевірити стан пропелерів та підшипників.`;
      } else {
        noiseAnalysis = `Виявлено високочастотний шум (${dominantFreq.toFixed(1)} Гц), який зазвичай є електричним або походить від пошкоджених підшипників. Перевірте стан моторів та електричну систему.`;
      }
      
      // Аналіз піків
      if (peaks.length > 1) {
        noiseAnalysis += ` Також виявлено додаткові резонансні піки на ${peaks[1].frequency.toFixed(1)} Гц та ${peaks.length > 2 ? peaks[2].frequency.toFixed(1) + ' Гц' : ''}. `;
      }
      
      // Аналіз діапазонів частот
      if (fftAnalysis.bandAnalysis) {
        const problemBands = fftAnalysis.bandAnalysis
          .filter(band => band.severity > 5)
          .sort((a, b) => b.severity - a.severity);
        
        if (problemBands.length > 0) {
          noiseAnalysis += ` Виявлено проблемний діапазон частот ${problemBands[0].name} (${problemBands[0].min}-${problemBands[0].max} Гц), який може бути спричинений ${problemBands[0].source}.`;
        }
      }
    } else {
      // Запасний варіант, якщо FFT-аналіз не містить даних
      const gyroFFT = this.simulateFFT(gyroData.x, gyroData.y, gyroData.z);
      
      if (gyroFFT.peakFrequency < 100) {
        noiseAnalysis = 'Low-frequency noise detected, likely from frame vibrations or mounting issues. Consider softer mounting or improved damping.';
      } else if (gyroFFT.peakFrequency < 200) {
        noiseAnalysis = 'Mid-frequency noise detected, often from props or motors. Check balance and consider adjusting D term filtering.';
      } else {
        noiseAnalysis = 'High-frequency noise detected, typically electrical or from damaged bearings/motors. Check motor health and electrical setup.';
      }
    }
    
    return {
      gyro: gyroAnalysis,
      pid: pidAnalysis,
      noise: noiseAnalysis
    };
  }
  
  // Замініть метод generateRecommendations наступним, оновленим методом:
  static generateRecommendations(analyzedData) {
    const { metrics, analysis, gyroData, pidData, motorData, rcData } = analyzedData;
    
    // Parse metrics into numbers for calculations
    const gyroNoiseRoll = parseFloat(metrics['Gyro Noise (Roll)']);
    const gyroNoisePitch = parseFloat(metrics['Gyro Noise (Pitch)']);
    const gyroNoiseYaw = parseFloat(metrics['Gyro Noise (Yaw)']);
    const pidErrorRoll = parseFloat(metrics['PID Error (Roll)']);
    const pidErrorPitch = parseFloat(metrics['PID Error (Pitch)']);
    const pidErrorYaw = parseFloat(metrics['PID Error (Yaw)']);
    const motorBalance = parseFloat(metrics['Motor Balance']);
    const responseTime = parseFloat(metrics['Response Time (ms)']);
    
    // НОВИЙ КОД: Використання Зіглера-Нікольса для PID рекомендацій
    let pidRecommendations = [];
    
    try {
      // Створюємо екземпляр тунера Зіглера-Нікольса
      const znTuner = new ZieglerNicholsTuner();
      
      // Генеруємо рекомендації на основі даних польоту
      const znRecommendations = znTuner.generatePIDRecommendations(
        gyroData, 
        rcData,
        // Визначаємо частоту дискретизації (за замовчуванням 1кГц)
        1000
      );
      
      if (znRecommendations.roll && znRecommendations.pitch && znRecommendations.yaw) {
        // Додаємо рекомендації для Roll
        pidRecommendations.push({
          title: 'Roll PID за Зіглером-Нікольсом',
          description: `Оптимізовано на основі методу Зіглера-Нікольса. ${znRecommendations.notes[0] || ''}`,
          command: `set pid_roll_p = ${znRecommendations.roll.P}\nset pid_roll_i = ${znRecommendations.roll.I}\nset pid_roll_d = ${znRecommendations.roll.D}`
        });
        
        // Додаємо рекомендації для Pitch
        pidRecommendations.push({
          title: 'Pitch PID за Зіглером-Нікольсом',
          description: `Оптимізовано на основі методу Зіглера-Нікольса. ${znRecommendations.notes[0] || ''}`,
          command: `set pid_pitch_p = ${znRecommendations.pitch.P}\nset pid_pitch_i = ${znRecommendations.pitch.I}\nset pid_pitch_d = ${znRecommendations.pitch.D}`
        });
        
        // Додаємо рекомендації для Yaw
        pidRecommendations.push({
          title: 'Yaw PID за Зіглером-Нікольсом',
          description: `Оптимізовано з меншим D для Yaw. ${znRecommendations.notes[0] || ''}`,
          command: `set pid_yaw_p = ${znRecommendations.yaw.P}\nset pid_yaw_i = ${znRecommendations.yaw.I}\nset pid_yaw_d = ${znRecommendations.yaw.D}`
        });
      } else {
        throw new Error("Зіглер-Нікольс не видав повні рекомендації");
      }
    } catch (error) {
      console.error("Помилка при генерації PID за методом Зіглера-Нікольса:", error);
      
      // Запасний варіант - старий алгоритм розрахунку PID
      // Roll PID recommendations
      const rollPValue = this.calculateOptimalP(gyroNoiseRoll, pidErrorRoll, responseTime);
      const rollIValue = this.calculateOptimalI(pidErrorRoll, responseTime);
      const rollDValue = this.calculateOptimalD(gyroNoiseRoll, responseTime);
      
      pidRecommendations.push({
        title: 'Roll PID Adjustments',
        description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoiseRoll}`,
        command: `set pid_roll_p = ${rollPValue}\nset pid_roll_i = ${rollIValue}\nset pid_roll_d = ${rollDValue}`
      });
      
      // Pitch PID recommendations
      const pitchPValue = this.calculateOptimalP(gyroNoisePitch, pidErrorPitch, responseTime);
      const pitchIValue = this.calculateOptimalI(pidErrorPitch, responseTime);
      const pitchDValue = this.calculateOptimalD(gyroNoisePitch, responseTime);
      
      pidRecommendations.push({
        title: 'Pitch PID Adjustments',
        description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoisePitch}`,
        command: `set pid_pitch_p = ${pitchPValue}\nset pid_pitch_i = ${pitchIValue}\nset pid_pitch_d = ${pitchDValue}`
      });
      
      // Yaw PID recommendations
      const yawPValue = this.calculateOptimalP(gyroNoiseYaw, pidErrorYaw, responseTime, 0.8); // Yaw typically needs less P
      const yawIValue = this.calculateOptimalI(pidErrorYaw, responseTime, 1.2); // Yaw typically needs more I
      const yawDValue = this.calculateOptimalD(gyroNoiseYaw, responseTime, 0.5); // Yaw typically needs less D
      
      pidRecommendations.push({
        title: 'Yaw PID Adjustments',
        description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoiseYaw}`,
        command: `set pid_yaw_p = ${yawPValue}\nset pid_yaw_i = ${yawIValue}\nset pid_yaw_d = ${yawDValue}`
      });
    }
    
    // Стандартні рекомендації для фільтрів (без FFT)
    const filterRecommendations = [];
    
    // Gyro filter recommendations
    const avgGyroNoise = (gyroNoiseRoll + gyroNoisePitch + gyroNoiseYaw) / 3;
    const gyroLpf = this.calculateOptimalGyroLpf(avgGyroNoise);
    
    filterRecommendations.push({
      title: 'Gyro Low Pass Filter',
      description: `Optimized based on average gyro noise level of ${avgGyroNoise.toFixed(2)}`,
      command: `set gyro_lowpass_type = PT1\nset gyro_lowpass_hz = ${gyroLpf}`
    });
    
    // D-term filter recommendations
    const dTermLpf = this.calculateOptimalDtermLpf(avgGyroNoise, responseTime);
    
    filterRecommendations.push({
      title: 'D-term Low Pass Filter',
      description: 'Optimized to reduce D-term noise while maintaining responsiveness',
      command: `set dterm_lowpass_type = PT1\nset dterm_lowpass_hz = ${dTermLpf}`
    });
    
    // Notch filter recommendations
    const { peakFrequency } = this.simulateFFT(
      gyroData.x, 
      gyroData.y, 
      gyroData.z
    );
    
    if (avgGyroNoise > 10 && peakFrequency > 0) {
      const notchCenter = Math.round(peakFrequency);
      const notchWidth = Math.max(20, Math.round(notchCenter * 0.15)); // 15% width or at least 20Hz
      
      filterRecommendations.push({
        title: 'Dynamic Notch Filter',
        description: `Configured to target noise peak around ${notchCenter}Hz`,
        command: `set dyn_notch_width_percent = ${Math.round(notchWidth / notchCenter * 100)}\nset dyn_notch_q = 250\nset dyn_notch_min_hz = ${Math.max(80, notchCenter - notchWidth)}\nset dyn_notch_max_hz = ${notchCenter + notchWidth * 2}`
      });
    }
    
    // Generate the full command set
    // Спочатку зібирати команди з рекомендацій для PID
    const fullCommandSet = [
      '# PID Settings'
    ];
    
    // Додаємо рекомендації для PID
    for (const rec of pidRecommendations) {
      const cmdLines = rec.command.split('\n');
      fullCommandSet.push(...cmdLines);
    }
    
    fullCommandSet.push('');
    fullCommandSet.push('# Filter Settings');
    
    // Додаємо рекомендації для фільтрів
    for (const rec of filterRecommendations) {
      const cmdLines = rec.command.split('\n');
      fullCommandSet.push(...cmdLines);
    }
    
    // Add save command
    fullCommandSet.push('');
    fullCommandSet.push('# Save settings');
    fullCommandSet.push('save');
    
    return {
      pid: pidRecommendations,
      filters: filterRecommendations,
      fullCommandSet
    };
  }
  
  
  /**
   * Calculate performance metrics from the data
   * @param {Object} gyroData - The gyro data
   * @param {Object} pidData - The PID data
   * @param {Object} motorData - The motor data
   * @returns {Object} - The calculated metrics
   */
  static calculateMetrics(gyroData, pidData, motorData) {
    // Calculate standard deviation of gyro data as a measure of noise
    const gyroXStdDev = this.calculateStandardDeviation(gyroData.x)
    const gyroYStdDev = this.calculateStandardDeviation(gyroData.y)
    const gyroZStdDev = this.calculateStandardDeviation(gyroData.z)
    
    // Calculate PID error (simplified - in a real implementation this would be more complex)
    const pidErrorX = this.calculateRMSE(gyroData.x, pidData.p)
    const pidErrorY = this.calculateRMSE(gyroData.y, pidData.p)
    const pidErrorZ = this.calculateRMSE(gyroData.z, pidData.p)
    
    // Calculate motor balance/deviation
    const motorVariance = this.calculateVariance([
      ...motorData.motor0,
      ...motorData.motor1,
      ...motorData.motor2,
      ...motorData.motor3
    ])
    
    // Calculate gyro response time (simplified)
    const gyroResponseTime = this.estimateResponseTime(gyroData.x, pidData.p)
    
    return {
      'Gyro Noise (Roll)': gyroXStdDev.toFixed(2),
      'Gyro Noise (Pitch)': gyroYStdDev.toFixed(2),
      'Gyro Noise (Yaw)': gyroZStdDev.toFixed(2),
      'PID Error (Roll)': pidErrorX.toFixed(2),
      'PID Error (Pitch)': pidErrorY.toFixed(2),
      'PID Error (Yaw)': pidErrorZ.toFixed(2),
      'Motor Balance': motorVariance.toFixed(2),
      'Response Time (ms)': gyroResponseTime.toFixed(2)
    }
  }
  
  /**
   * Generate analysis insights from the data
   * @param {Object} gyroData - The gyro data
   * @param {Object} pidData - The PID data
   * @param {Object} motorData - The motor data
   * @param {Object} rcData - The RC command data
   * @param {Object} metrics - The calculated metrics
   * @returns {Object} - The analysis results
   */
  static generateAnalysis(gyroData, pidData, motorData, rcData, metrics) {
    // Analyze gyro data
    let gyroAnalysis = ''
    const gyroNoiseLevel = (
      parseFloat(metrics['Gyro Noise (Roll)']) + 
      parseFloat(metrics['Gyro Noise (Pitch)']) + 
      parseFloat(metrics['Gyro Noise (Yaw)'])
    ) / 3
    
    if (gyroNoiseLevel < 5) {
      gyroAnalysis = 'Gyro noise levels are very low, indicating good hardware and filtering. No additional filtering needed.'
    } else if (gyroNoiseLevel < 10) {
      gyroAnalysis = 'Gyro noise levels are acceptable but could be improved. Consider adjusting gyro LPF or notch filter settings.'
    } else if (gyroNoiseLevel < 20) {
      gyroAnalysis = 'Gyro noise levels are high. Check for mechanical issues and adjust filtering to reduce noise.'
    } else {
      gyroAnalysis = 'Very high gyro noise detected. Check mounting, balance, and motor health. Significant filtering changes recommended.'
    }
    
    // Analyze PID data
    let pidAnalysis = ''
    const pidErrorLevel = (
      parseFloat(metrics['PID Error (Roll)']) + 
      parseFloat(metrics['PID Error (Pitch)']) + 
      parseFloat(metrics['PID Error (Yaw)'])
    ) / 3
    
    if (pidErrorLevel < 5) {
      pidAnalysis = 'PID response is excellent. Current PID values are well-tuned for your setup.'
    } else if (pidErrorLevel < 10) {
      pidAnalysis = 'PID response is good but could be improved. Consider fine-tuning P and D terms.'
    } else if (pidErrorLevel < 20) {
      pidAnalysis = 'PID response needs improvement. Consider recalibrating your PID values based on the recommendations.'
    } else {
      pidAnalysis = 'Poor PID response detected. A complete PID tune is recommended using the provided values as a starting point.'
    }
    
    // Analyze noise characteristics
    let noiseAnalysis = ''
    const gyroFFT = this.simulateFFT(gyroData.x, gyroData.y, gyroData.z)
    
    if (gyroFFT.peakFrequency < 100) {
      noiseAnalysis = 'Low-frequency noise detected, likely from frame vibrations or mounting issues. Consider softer mounting or improved damping.'
    } else if (gyroFFT.peakFrequency < 200) {
      noiseAnalysis = 'Mid-frequency noise detected, often from props or motors. Check balance and consider adjusting D term filtering.'
    } else {
      noiseAnalysis = 'High-frequency noise detected, typically electrical or from damaged bearings/motors. Check motor health and electrical setup.'
    }
    
    return {
      gyro: gyroAnalysis,
      pid: pidAnalysis,
      noise: noiseAnalysis
    }
  }
  
  /**
   * Generate PID and filter recommendations based on the analysis
   * @param {Object} analyzedData - The analyzed data
   * @returns {Object} - The recommendations
   */
  static generateRecommendations(analyzedData) {
    const { metrics, analysis } = analyzedData
    
    // Parse metrics into numbers for calculations
    const gyroNoiseRoll = parseFloat(metrics['Gyro Noise (Roll)'])
    const gyroNoisePitch = parseFloat(metrics['Gyro Noise (Pitch)'])
    const gyroNoiseYaw = parseFloat(metrics['Gyro Noise (Yaw)'])
    const pidErrorRoll = parseFloat(metrics['PID Error (Roll)'])
    const pidErrorPitch = parseFloat(metrics['PID Error (Pitch)'])
    const pidErrorYaw = parseFloat(metrics['PID Error (Yaw)'])
    const motorBalance = parseFloat(metrics['Motor Balance'])
    const responseTime = parseFloat(metrics['Response Time (ms)'])
    
    // Generate PID recommendations
    const pidRecommendations = []
    
    // Roll PID recommendations
    const rollPValue = this.calculateOptimalP(gyroNoiseRoll, pidErrorRoll, responseTime)
    const rollIValue = this.calculateOptimalI(pidErrorRoll, responseTime)
    const rollDValue = this.calculateOptimalD(gyroNoiseRoll, responseTime)
    
    pidRecommendations.push({
      title: 'Roll PID Adjustments',
      description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoiseRoll}`,
      command: `set pid_roll_p = ${rollPValue}\nset pid_roll_i = ${rollIValue}\nset pid_roll_d = ${rollDValue}`
    })
    
    // Pitch PID recommendations
    const pitchPValue = this.calculateOptimalP(gyroNoisePitch, pidErrorPitch, responseTime)
    const pitchIValue = this.calculateOptimalI(pidErrorPitch, responseTime)
    const pitchDValue = this.calculateOptimalD(gyroNoisePitch, responseTime)
    
    pidRecommendations.push({
      title: 'Pitch PID Adjustments',
      description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoisePitch}`,
      command: `set pid_pitch_p = ${pitchPValue}\nset pid_pitch_i = ${pitchIValue}\nset pid_pitch_d = ${pitchDValue}`
    })
    
    // Yaw PID recommendations
    const yawPValue = this.calculateOptimalP(gyroNoiseYaw, pidErrorYaw, responseTime, 0.8) // Yaw typically needs less P
    const yawIValue = this.calculateOptimalI(pidErrorYaw, responseTime, 1.2) // Yaw typically needs more I
    const yawDValue = this.calculateOptimalD(gyroNoiseYaw, responseTime, 0.5) // Yaw typically needs less D
    
    pidRecommendations.push({
      title: 'Yaw PID Adjustments',
      description: `Optimized based on response time of ${responseTime}ms and noise level of ${gyroNoiseYaw}`,
      command: `set pid_yaw_p = ${yawPValue}\nset pid_yaw_i = ${yawIValue}\nset pid_yaw_d = ${yawDValue}`
    })
    
    // Generate filter recommendations based on noise levels
    const filterRecommendations = []
    
    // Gyro filter recommendations
    const avgGyroNoise = (gyroNoiseRoll + gyroNoisePitch + gyroNoiseYaw) / 3
    const gyroLpf = this.calculateOptimalGyroLpf(avgGyroNoise)
    
    filterRecommendations.push({
      title: 'Gyro Low Pass Filter',
      description: `Optimized based on average gyro noise level of ${avgGyroNoise.toFixed(2)}`,
      command: `set gyro_lowpass_type = PT1\nset gyro_lowpass_hz = ${gyroLpf}`
    })
    
    // D-term filter recommendations
    const dTermLpf = this.calculateOptimalDtermLpf(avgGyroNoise, responseTime)
    
    filterRecommendations.push({
      title: 'D-term Low Pass Filter',
      description: 'Optimized to reduce D-term noise while maintaining responsiveness',
      command: `set dterm_lowpass_type = PT1\nset dterm_lowpass_hz = ${dTermLpf}`
    })
    
    // Notch filter recommendations
    const { peakFrequency } = this.simulateFFT(
      analyzedData.gyroData.x, 
      analyzedData.gyroData.y, 
      analyzedData.gyroData.z
    )
    
    if (avgGyroNoise > 10 && peakFrequency > 0) {
      const notchCenter = Math.round(peakFrequency)
      const notchWidth = Math.max(20, Math.round(notchCenter * 0.15)) // 15% width or at least 20Hz
      
      filterRecommendations.push({
        title: 'Dynamic Notch Filter',
        description: `Configured to target noise peak around ${notchCenter}Hz`,
        command: `set dyn_notch_width_percent = ${Math.round(notchWidth / notchCenter * 100)}\nset dyn_notch_q = 250\nset dyn_notch_min_hz = ${Math.max(80, notchCenter - notchWidth)}\nset dyn_notch_max_hz = ${notchCenter + notchWidth * 2}`
      })
    }
    
    // Generate the full command set
    const fullCommandSet = [
      '# PID Settings',
      `set pid_roll_p = ${rollPValue}`,
      `set pid_roll_i = ${rollIValue}`,
      `set pid_roll_d = ${rollDValue}`,
      `set pid_pitch_p = ${pitchPValue}`,
      `set pid_pitch_i = ${pitchIValue}`,
      `set pid_pitch_d = ${pitchDValue}`,
      `set pid_yaw_p = ${yawPValue}`,
      `set pid_yaw_i = ${yawIValue}`,
      `set pid_yaw_d = ${yawDValue}`,
      '',
      '# Filter Settings',
      `set gyro_lowpass_type = PT1`,
      `set gyro_lowpass_hz = ${gyroLpf}`,
      `set dterm_lowpass_type = PT1`,
      `set dterm_lowpass_hz = ${dTermLpf}`
    ]
    
    // Add notch filter if needed
    if (avgGyroNoise > 10 && peakFrequency > 0) {
      const notchCenter = Math.round(peakFrequency)
      const notchWidth = Math.max(20, Math.round(notchCenter * 0.15))
      
      fullCommandSet.push('')
      fullCommandSet.push('# Dynamic Notch Filter')
      fullCommandSet.push(`set dyn_notch_width_percent = ${Math.round(notchWidth / notchCenter * 100)}`)
      fullCommandSet.push(`set dyn_notch_q = 250`)
      fullCommandSet.push(`set dyn_notch_min_hz = ${Math.max(80, notchCenter - notchWidth)}`)
      fullCommandSet.push(`set dyn_notch_max_hz = ${notchCenter + notchWidth * 2}`)
    }
    
    // Add save command
    fullCommandSet.push('')
    fullCommandSet.push('# Save settings')
    fullCommandSet.push('save')
    
    return {
      pid: pidRecommendations,
      filters: filterRecommendations,
      fullCommandSet
    }
  }
  
  // Utility functions for data analysis
  
  /**
   * Calculate the standard deviation of an array of values
   * @param {number[]} values - The array of values
   * @returns {number} - The standard deviation
   */
  static calculateStandardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
    return Math.sqrt(variance)
  }
  
  /**
   * Calculate the variance of an array of values
   * @param {number[]} values - The array of values
   * @returns {number} - The variance
   */
  static calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
  }
  
  /**
   * Calculate the root mean square error between two arrays
   * @param {number[]} actual - The actual values
   * @param {number[]} expected - The expected values
   * @returns {number} - The RMSE
   */
  static calculateRMSE(actual, expected) {
    if (actual.length !== expected.length) {
      throw new Error('Arrays must have the same length')
    }
    
    const squaredDiffs = actual.map((val, i) => Math.pow(val - expected[i], 2))
    const meanSquaredError = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length
    return Math.sqrt(meanSquaredError)
  }
  
  /**
   * Estimate the response time between signal and response
   * @param {number[]} input - The input signal
   * @param {number[]} output - The output signal
   * @returns {number} - The estimated response time in milliseconds
   */
  static estimateResponseTime(input, output) {
    // This is a simplified estimation - in a real implementation
    // you would use cross-correlation or similar techniques
    
    // For demonstration, we'll return a plausible value
    return 20 + Math.random() * 10 // 20-30ms is typical for a well-tuned quad
  }
  
  /**
   * Simulate an FFT analysis to find dominant noise frequencies
   * @param {number[]} x - X-axis gyro data
   * @param {number[]} y - Y-axis gyro data
   * @param {number[]} z - Z-axis gyro data
   * @returns {Object} - The FFT analysis results
   */
  static simulateFFT(x, y, z) {
    // This is a simplified simulation - in a real implementation
    // you would perform an actual FFT analysis
    
    // For demonstration, we'll return plausible values
    const peakAmplitude = Math.max(
      this.calculateStandardDeviation(x),
      this.calculateStandardDeviation(y),
      this.calculateStandardDeviation(z)
    )
    
    // Generate a plausible peak frequency based on the noise level
    let peakFrequency = 0
    if (peakAmplitude < 5) {
      peakFrequency = 50 + Math.random() * 50 // 50-100Hz for low noise
    } else if (peakAmplitude < 15) {
      peakFrequency = 100 + Math.random() * 100 // 100-200Hz for medium noise
    } else {
      peakFrequency = 200 + Math.random() * 300 // 200-500Hz for high noise
    }
    
    return {
      peakFrequency,
      peakAmplitude,
      frequencies: [
        { freq: peakFrequency, amplitude: peakAmplitude },
        { freq: peakFrequency * 0.5, amplitude: peakAmplitude * 0.6 },
        { freq: peakFrequency * 2, amplitude: peakAmplitude * 0.4 }
      ]
    }
  }
  
  /**
   * Calculate the optimal P value based on noise and response time
   * @param {number} noiseLevel - The gyro noise level
   * @param {number} errorLevel - The PID error level
   * @param {number} responseTime - The response time in milliseconds
   * @param {number} [factor=1.0] - Adjustment factor
   * @returns {number} - The recommended P value
   */
  static calculateOptimalP(noiseLevel, errorLevel, responseTime, factor = 1.0) {
    // Base P value calculation
    let pValue = 40
    
    // Adjust based on noise level (lower P for higher noise)
    if (noiseLevel > 15) {
      pValue = 35
    } else if (noiseLevel < 5) {
      pValue = 45
    }
    
    // Adjust based on error level (higher P for higher error)
    if (errorLevel > 15) {
      pValue += 5
    } else if (errorLevel < 5) {
      pValue -= 5
    }
    
    // Adjust based on response time (higher P for slower response)
    if (responseTime > 25) {
      pValue += 5
    } else if (responseTime < 15) {
      pValue -= 5
    }
    
    // Apply factor and round to integer
    return Math.round(pValue * factor)
  }
  
  /**
   * Calculate the optimal I value based on error and response time
   * @param {number} errorLevel - The PID error level
   * @param {number} responseTime - The response time in milliseconds
   * @param {number} [factor=1.0] - Adjustment factor
   * @returns {number} - The recommended I value
   */
  static calculateOptimalI(errorLevel, responseTime, factor = 1.0) {
    // Base I value calculation
    let iValue = 60
    
    // Adjust based on error level (higher I for higher error)
    if (errorLevel > 15) {
      iValue += 10
    } else if (errorLevel < 5) {
      iValue -= 10
    }
    
    // Apply factor and round to integer
    return Math.round(iValue * factor)
  }
  
  /**
   * Calculate the optimal D value based on noise and response time
   * @param {number} noiseLevel - The gyro noise level
   * @param {number} responseTime - The response time in milliseconds
   * @param {number} [factor=1.0] - Adjustment factor
   * @returns {number} - The recommended D value
   */
  static calculateOptimalD(noiseLevel, responseTime, factor = 1.0) {
    // Base D value calculation
    let dValue = 30
    
    // Adjust based on noise level (lower D for higher noise)
    if (noiseLevel > 15) {
      dValue = 25
    } else if (noiseLevel < 5) {
      dValue = 35
    }
    
    // Adjust based on response time (higher D for slower response)
    if (responseTime > 25) {
      dValue += 5
    } else if (responseTime < 15) {
      dValue -= 5
    }
    
    // Apply factor and round to integer
    return Math.round(dValue * factor)
  }
  
  /**
   * Calculate the optimal gyro LPF cutoff frequency
   * @param {number} noiseLevel - The gyro noise level
   * @returns {number} - The recommended cutoff frequency in Hz
   */
  static calculateOptimalGyroLpf(noiseLevel) {
    if (noiseLevel > 20) {
      return 90 // More filtering for high noise
    } else if (noiseLevel > 10) {
      return 120 // Moderate filtering for medium noise
    } else {
      return 150 // Less filtering for low noise
    }
  }
  
  /**
   * Calculate the optimal D-term LPF cutoff frequency
   * @param {number} noiseLevel - The gyro noise level
   * @param {number} responseTime - The response time in milliseconds
   * @returns {number} - The recommended cutoff frequency in Hz
   */
  static calculateOptimalDtermLpf(noiseLevel, responseTime) {
    if (noiseLevel > 20) {
      return 70 // More filtering for high noise
    } else if (noiseLevel > 10) {
      return 100 // Moderate filtering for medium noise
    } else {
      return 130 // Less filtering for low noise
    }
  }
}