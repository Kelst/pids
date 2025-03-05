// Допоміжна функція для обробки даних порціями
const processInChunks = async (data, chunkSize, processFunc) => {
    const results = [];
    const totalChunks = Math.ceil(data.length / chunkSize);

    // Обробляємо дані порціями
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      
      // Обробляємо порцію
      const chunkResult = processFunc(chunk, i, start);
      results.push(chunkResult);
      
      // Даємо браузеру "подихати" між порціями
      if (i % 5 === 0) { // кожні 5 порцій
        await new Promise(resolve => setTimeout(resolve, 0)); 
      }
    }
    
    return results;
  };import React, { useState, useEffect } from 'react';
import useBlackboxStore from '../store/blackboxStore';
import * as FFT from 'fft.js';
import * as math from 'mathjs';
import _ from 'lodash';

const BlackboxAnalyzer = () => {
  // Отримуємо дані зі стора
  const { 
    flightData, 
    metadata, 
    dataHeaders 
  } = useBlackboxStore();

  // Стан для аналізу
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [error, setError] = useState(null);

  // Функція аналізу даних
  const analyzeData = async () => {
    if (!flightData || flightData.length === 0) {
      setError("Немає даних для аналізу. Спочатку завантажте лог-файл.");
      return;
    }

    try {
      setAnalyzing(true);
      setProgress(0);
      setError(null);
      setAnalysisResults(null);
      setRecommendations(null);

      // Перевіримо розмір даних і повідомимо в консоль
      console.log(`Починаємо аналіз ${flightData.length} рядків даних`);

      // Усі кроки аналізу з обробкою помилок для кожного кроку окремо
      const steps = [
        { name: 'Аналіз відхилень', func: analyzeErrorMetrics, progress: 20 },
        { name: 'Аналіз швидкості реакції', func: analyzeStepResponse, progress: 40 },
        { name: 'Аналіз частотної характеристики', func: analyzeFrequencyCharacteristics, progress: 60 },
        { name: 'Аналіз гармонійності руху', func: analyzeHarmonicDistortion, progress: 80 },
        { name: 'Аналіз фільтрів', func: analyzeFilters, progress: 100 }
      ];

      let results = {};
      
      // Виконуємо кожен крок аналізу послідовно
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgress(i > 0 ? steps[i-1].progress : 0);
        console.log(`Виконую крок: ${step.name}`);
        
        try {
          // Виконуємо крок з тайм-аутом для оновлення UI
          const stepResult = await step.func();
          results = { ...results, ...stepResult };
          setProgress(step.progress);
          
          // Коротка пауза, щоб дати браузеру "подихати"
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (stepError) {
          console.error(`Помилка у кроці ${step.name}:`, stepError);
          setError(`Помилка у кроці ${step.name}: ${stepError.message}`);
          // Продовжуємо з наступним кроком
        }
      }

      // Встановлюємо результати аналізу
      setAnalysisResults(results);

      // Генеруємо рекомендації на основі результатів аналізу
      try {
        console.log('Генерація рекомендацій');
        const generatedRecommendations = generateRecommendations(results);
        setRecommendations(generatedRecommendations);
      } catch (recError) {
        console.error("Помилка генерації рекомендацій:", recError);
        setError(`Помилка генерації рекомендацій: ${recError.message}`);
      }

      // Завершуємо аналіз
      console.log('Аналіз завершено');
      setProgress(100);
      setTimeout(() => {
        setAnalyzing(false);
      }, 200);

    } catch (err) {
      console.error("Глобальна помилка аналізу:", err);
      setError(`Помилка аналізу: ${err.message}`);
      setAnalyzing(false);
    }
  };

  // Функція аналізу відхилень для кожної осі з покращеним використанням даних
  const analyzeErrorMetrics = async () => {
    // Шукаємо потрібні колонки в даних
    const axisColumns = {
      roll: {
        setpoint: dataHeaders.find(h => h === 'setpoint[0]'),
        actual: dataHeaders.find(h => h === 'gyroADC[0]'),
        error: dataHeaders.find(h => h === 'axisError[0]'),
        p: dataHeaders.find(h => h === 'axisP[0]'),
        i: dataHeaders.find(h => h === 'axisI[0]'),
        d: dataHeaders.find(h => h === 'axisD[0]'),
        f: dataHeaders.find(h => h === 'axisF[0]'),
        sum: dataHeaders.find(h => h === 'axisSum[0]')
      },
      pitch: {
        setpoint: dataHeaders.find(h => h === 'setpoint[1]'),
        actual: dataHeaders.find(h => h === 'gyroADC[1]'),
        error: dataHeaders.find(h => h === 'axisError[1]'),
        p: dataHeaders.find(h => h === 'axisP[1]'),
        i: dataHeaders.find(h => h === 'axisI[1]'),
        d: dataHeaders.find(h => h === 'axisD[1]'),
        f: dataHeaders.find(h => h === 'axisF[1]'),
        sum: dataHeaders.find(h => h === 'axisSum[1]')
      },
      yaw: {
        setpoint: dataHeaders.find(h => h === 'setpoint[2]'),
        actual: dataHeaders.find(h => h === 'gyroADC[2]'),
        error: dataHeaders.find(h => h === 'axisError[2]'),
        p: dataHeaders.find(h => h === 'axisP[2]'),
        i: dataHeaders.find(h => h === 'axisI[2]'),
        d: dataHeaders.find(h => h === 'axisD[2]'),
        f: dataHeaders.find(h => h === 'axisF[2]'),
        sum: dataHeaders.find(h => h === 'axisSum[2]')
      }
    };

    // Розраховуємо середньоквадратичне відхилення та інші метрики
    const errorMetrics = {};
    const pidContributions = {};
    
    // Розмір порції для обробки даних
    const chunkSize = 1000;
    
    for (const [axis, columns] of Object.entries(axisColumns)) {
      if (columns.actual) {
        try {
          // Метрики для накопичення
          let sumError = 0;
          let sumSquaredError = 0;
          let maxError = 0;
          let validErrorCount = 0;
          
          // PID компоненти
          let sumP = 0;
          let sumI = 0;
          let sumD = 0;
          let sumF = 0;
          let sumTotal = 0;
          
          // Використовуємо пряме значення axisError, якщо воно доступно
          const useDirectError = columns.error && dataHeaders.includes(columns.error);
          
          // Обробляємо дані порціями
          await processInChunks(flightData, chunkSize, (chunk) => {
            for (const row of chunk) {
              let error;
              
              if (useDirectError) {
                // Використовуємо безпосередньо значення axisError з логу
                error = parseFloat(row[columns.error]) || 0;
              } else {
                // Обчислюємо похибку як різницю між setpoint і actual
                const setpoint = parseFloat(row[columns.setpoint]) || 0;
                const actual = parseFloat(row[columns.actual]) || 0;
                error = setpoint - actual;
              }
              
              if (!isNaN(error)) {
                const absError = Math.abs(error);
                sumError += absError;
                sumSquaredError += error * error;
                maxError = Math.max(maxError, absError);
                validErrorCount++;
              }
              
              // Збираємо інформацію про PID компоненти, якщо вони доступні
              if (columns.p && columns.i && columns.d) {
                const p = parseFloat(row[columns.p]) || 0;
                const i = parseFloat(row[columns.i]) || 0;
                const d = parseFloat(row[columns.d]) || 0;
                const f = parseFloat(row[columns.f]) || 0;
                const sum = parseFloat(row[columns.sum]) || (p + i + d + f);
                
                if (!isNaN(p) && !isNaN(i) && !isNaN(d)) {
                  sumP += Math.abs(p);
                  sumI += Math.abs(i);
                  sumD += Math.abs(d);
                  sumF += Math.abs(f);
                  sumTotal += Math.abs(sum);
                }
              }
            }
          });
          
          if (validErrorCount > 0) {
            // Середньоквадратичне відхилення
            const meanSquaredError = sumSquaredError / validErrorCount;
            const rmsError = Math.sqrt(meanSquaredError);
            
            // Середнє відхилення
            const meanError = sumError / validErrorCount;
            
            // Стандартне відхилення
            const variance = sumSquaredError / validErrorCount - (meanError * meanError);
            const stdDeviation = Math.sqrt(Math.max(0, variance)); // Забезпечуємо, що варіація невід'ємна
            
            errorMetrics[axis] = {
              rmsError,
              maxError,
              meanError,
              stdDeviation
            };
            
            // Розраховуємо відносний внесок кожної компоненти PID
            if (sumTotal > 0) {
              pidContributions[axis] = {
                p: sumP / sumTotal,
                i: sumI / sumTotal,
                d: sumD / sumTotal,
                f: sumF / sumTotal
              };
            } else {
              pidContributions[axis] = {
                p: 0,
                i: 0,
                d: 0,
                f: 0
              };
            }
            
          } else {
            errorMetrics[axis] = {
              rmsError: 0,
              maxError: 0,
              meanError: 0,
              stdDeviation: 0
            };
            pidContributions[axis] = {
              p: 0,
              i: 0,
              d: 0,
              f: 0
            };
          }
        } catch (e) {
          console.error(`Помилка аналізу для осі ${axis}:`, e);
          errorMetrics[axis] = {
            rmsError: 0,
            maxError: 0,
            meanError: 0,
            stdDeviation: 0
          };
          pidContributions[axis] = {
            p: 0,
            i: 0,
            d: 0,
            f: 0
          };
        }
      }
    }

    return { errorMetrics, pidContributions };
  };

  // Функція аналізу швидкості реакції системи з покращеним використанням даних
  const analyzeStepResponse = async () => {
    // Шукаємо точки різкої зміни в командах
    const stepResponseMetrics = {
      roll: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0 },
      pitch: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0 },
      yaw: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0 }
    };

    // Структура для збереження історії змін
    const responseHistory = {
      roll: [],
      pitch: [],
      yaw: []
    };

    // Розмір порції для обробки даних
    const chunkSize = 500;
    const sampleTimeUs = parseFloat(metadata.looptime) || 1000; // Час між семплами в мікросекундах
    const sampleTimeMs = sampleTimeUs / 1000; // Переводимо в мілісекунди

    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      
      // Використовуємо дані як з RC команд, так і setpoint - вони можуть відрізнятися через фільтрацію
      const rcCommandCol = `rcCommand[${axisIndex}]`;
      const setpointCol = `setpoint[${axisIndex}]`;
      const gyroCol = `gyroADC[${axisIndex}]`;
      const pTermCol = `axisP[${axisIndex}]`;
      const errorCol = `axisError[${axisIndex}]`;
      
      const columnsExist = dataHeaders.includes(setpointCol) && 
                          dataHeaders.includes(gyroCol) && 
                          (dataHeaders.includes(rcCommandCol) || dataHeaders.includes(errorCol));
      
      if (columnsExist) {
        try {
          // Знаходимо значні зміни команд
          const stepChanges = [];
          const threshold = 30; // Поріг для виявлення різкої зміни
          
          // Буфер для відстеження попередніх значень
          let prevSetpoint = null;
          let prevTime = null;
          let prevGyro = null;
          
          // Створюємо масив для відстеження змін у часі
          const timeHistory = [];
          const setpointHistory = [];
          const gyroHistory = [];
          const pTermHistory = [];
          
          // Проходимо дані для виявлення різких змін
          await processInChunks(flightData, chunkSize, (chunk, chunkIndex, startIndex) => {
            for (let i = 0; i < chunk.length; i++) {
              const row = chunk[i];
              const globalIndex = startIndex + i;
              
              const currentTime = parseFloat(row.time) || (globalIndex * sampleTimeMs * 1000); // в мікросекундах
              const currentSetpoint = parseFloat(row[setpointCol]) || 0;
              const currentGyro = parseFloat(row[gyroCol]) || 0;
              const currentPTerm = dataHeaders.includes(pTermCol) ? parseFloat(row[pTermCol]) || 0 : 0;
              
              // Зберігаємо історію для аналізу
              timeHistory.push(currentTime);
              setpointHistory.push(currentSetpoint);
              gyroHistory.push(currentGyro);
              pTermHistory.push(currentPTerm);
              
              // Якщо це не перший запис і є суттєва зміна у setpoint
              if (prevSetpoint !== null && Math.abs(currentSetpoint - prevSetpoint) > threshold) {
                // Знайдена різка зміна
                const startIndex = globalIndex;
                const startTime = currentTime;
                const targetValue = currentSetpoint;
                const startGyro = currentGyro;
                
                // Збираємо реакцію системи (до 100 точок після зміни)
                const response = [];
                
                for (let j = 0; j < 100 && (globalIndex + j) < flightData.length; j++) {
                  if (globalIndex + j >= flightData.length) break;
                  
                  // Якщо не вийшли за межі поточної порції
                  if (i + j < chunk.length) {
                    const responseRow = chunk[i + j];
                    const time = parseFloat(responseRow.time) || 0;
                    const gyroValue = parseFloat(responseRow[gyroCol]) || 0;
                    response.push({ time: (time - startTime) / 1000, value: gyroValue }); // час в мс
                  } 
                  // Якщо вийшли за межі порції - збережемо позицію для подальшого аналізу
                  else {
                    stepChanges.push({ 
                      startIndex, 
                      targetValue, 
                      startGyro,
                      startTime,
                      response,
                      complete: false
                    });
                    break;
                  }
                }
                
                // Якщо зібрали достатньо точок в межах порції, відзначаємо як завершений
                if (response.length >= 20) {
                  stepChanges.push({ 
                    startIndex, 
                    targetValue, 
                    startGyro,
                    startTime,
                    response,
                    complete: true
                  });
                }
              }
              
              // Оновлюємо попередні значення
              prevSetpoint = currentSetpoint;
              prevTime = currentTime;
              prevGyro = currentGyro;
            }
          });
          
          // Аналізуємо знайдені зміни
          if (stepChanges.length > 0) {
            // Знаходимо найкращий крок для аналізу - з найбільшою зміною
            let bestStep = stepChanges[0];
            let bestMagnitude = Math.abs(bestStep.targetValue - bestStep.startGyro);
            
            for (let i = 1; i < stepChanges.length; i++) {
              const step = stepChanges[i];
              if (step.complete) {
                const magnitude = Math.abs(step.targetValue - step.startGyro);
                if (magnitude > bestMagnitude) {
                  bestMagnitude = magnitude;
                  bestStep = step;
                }
              }
            }
            
            const { targetValue, startGyro, response } = bestStep;
            
            // Зберігаємо знайдені зміни для візуалізації
            responseHistory[axis] = response;
            
            // Визначаємо фактичний діапазон зміни (від стартового gyro до цільового значення)
            const actualRange = targetValue - startGyro;
            
            if (Math.abs(actualRange) > 5) { // Переконуємося, що зміна суттєва
              // Значення стабілізації (95% від цільового)
              const settlingThreshold = 0.05 * Math.abs(actualRange);
              
              // Знаходимо час стабілізації
              let settlingTime = 0;
              let stabilized = false;
              
              // Перевіряємо коли значення стабілізується (знаходиться в межах 5% від цільового тривалий час)
              for (let i = 0; i < response.length; i++) {
                if (Math.abs(response[i].value - targetValue) <= settlingThreshold) {
                  // Перевіряємо, чи воно залишається стабільним
                  let stable = true;
                  for (let j = i; j < Math.min(i + 10, response.length); j++) {
                    if (Math.abs(response[j].value - targetValue) > settlingThreshold) {
                      stable = false;
                      break;
                    }
                  }
                  
                  if (stable) {
                    settlingTime = response[i].time;
                    stabilized = true;
                    break;
                  }
                }
              }
              
              // Якщо не знайдено момент стабілізації, використовуємо останню точку
              if (!stabilized && response.length > 0) {
                settlingTime = response[response.length - 1].time;
              }
              
              // Знаходимо перерегулювання
              let maxValue = startGyro;
              let maxIndex = 0;
              
              for (let i = 0; i < response.length; i++) {
                if (Math.abs(response[i].value - startGyro) > Math.abs(maxValue - startGyro)) {
                  maxValue = response[i].value;
                  maxIndex = i;
                }
              }
              
              // Розраховуємо перерегулювання відносно діапазону зміни
              const overshoot = actualRange !== 0 ? 
                ((maxValue - targetValue) / actualRange) * 100 : 0;
              
              // Знаходимо час наростання (від 10% до 90% цільового значення)
              const riseStartThreshold = startGyro + 0.1 * actualRange;
              const riseEndThreshold = startGyro + 0.9 * actualRange;
              
              let riseStartTime = 0;
              let riseEndTime = 0;
              let riseStartFound = false;
              let riseEndFound = false;
              
              for (let i = 0; i < response.length; i++) {
                // Для позитивного діапазону зміни
                if (actualRange > 0) {
                  if (!riseStartFound && response[i].value >= riseStartThreshold) {
                    riseStartTime = response[i].time;
                    riseStartFound = true;
                  }
                  if (!riseEndFound && response[i].value >= riseEndThreshold) {
                    riseEndTime = response[i].time;
                    riseEndFound = true;
                    break;
                  }
                } 
                // Для негативного діапазону зміни
                else {
                  if (!riseStartFound && response[i].value <= riseStartThreshold) {
                    riseStartTime = response[i].time;
                    riseStartFound = true;
                  }
                  if (!riseEndFound && response[i].value <= riseEndThreshold) {
                    riseEndTime = response[i].time;
                    riseEndFound = true;
                    break;
                  }
                }
              }
              
              const riseTime = riseEndFound && riseStartFound ? 
                riseEndTime - riseStartTime : 
                settlingTime * 0.6; // Приблизна оцінка, якщо точні моменти не знайдено
              
              // Знаходимо затримку від зміни setpoint до початку реакції (10% зміни)
              const delay = riseStartFound ? riseStartTime : 0;
              
              stepResponseMetrics[axis] = {
                settlingTime,
                overshoot,
                riseTime,
                delay
              };
            }
          }
        } catch (err) {
          console.error(`Помилка аналізу швидкості реакції для осі ${axis}:`, err);
        }
      }
    }

    return { stepResponseMetrics, responseHistory };
  };

  // Функція аналізу частотної характеристики (FFT) з покращеним використанням даних
  const analyzeFrequencyCharacteristics = async () => {
    const frequencyAnalysis = {
      roll: { 
        dominantFrequencies: [], 
        noiseLevel: 0,
        filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
      },
      pitch: { 
        dominantFrequencies: [], 
        noiseLevel: 0,
        filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
      },
      yaw: { 
        dominantFrequencies: [], 
        noiseLevel: 0,
        filteredVsUnfiltered: { ratio: 0, noiseDiff: 0 } 
      }
    };

    // Орієнтовна частота запису даних (в Гц)
    const looptimeUs = parseFloat(metadata.looptime) || 312; // мікросекунди
    const sampleRate = Math.round(1000000 / looptimeUs); // Гц
    
    console.log(`Використовуємо частоту дискретизації: ${sampleRate} Гц`);

    // Аналіз для кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      const gyroCol = `gyroADC[${axisIndex}]`;
      const gyroUnfiltCol = `gyroUnfilt[${axisIndex}]`;
      
      // Перевіряємо наявність колонок
      const hasFiltered = dataHeaders.includes(gyroCol);
      const hasUnfiltered = dataHeaders.includes(gyroUnfiltCol);
      
      if (hasFiltered) {
        try {
          // Для FFT потрібна довжина, що є степенем 2
          const fftSize = 1024;
          
          // Отримуємо дані гіроскопа для FFT (фільтровані)
          const gyroData = new Array(fftSize).fill(0);
          // Також збираємо нефільтровані дані, якщо вони доступні
          const gyroUnfiltData = hasUnfiltered ? new Array(fftSize).fill(0) : null;
          
          // Збираємо дані порційно
          let dataCollected = 0;
          const chunkSize = 2000;
          
          // Розмір даних для збору 
          const collectSize = Math.min(flightData.length, fftSize * 2);
          
          // Обробляємо дані порціями і збираємо значення для FFT
          await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
            for (const row of chunk) {
              if (dataCollected < fftSize) {
                const value = parseFloat(row[gyroCol]) || 0;
                if (!isNaN(value)) {
                  gyroData[dataCollected] = value;
                  
                  // Якщо доступні нефільтровані дані, також їх зберігаємо
                  if (hasUnfiltered) {
                    const unfiltValue = parseFloat(row[gyroUnfiltCol]) || 0;
                    gyroUnfiltData[dataCollected] = unfiltValue;
                  }
                  
                  dataCollected++;
                }
              }
            }
          });
          
          // Застосовуємо вікно Ханна для зменшення витоку спектру
          const windowedGyroData = new Array(fftSize);
          for (let i = 0; i < fftSize; i++) {
            // Вікно Ханна: 0.5 * (1 - cos(2π*n/(N-1)))
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
            windowedGyroData[i] = gyroData[i] * window;
          }
          
          // Налаштовуємо FFT для фільтрованих даних
          const fft = new FFT(fftSize);
          const out = new Array(fftSize * 2); // Complex output array
          
          // Копіюємо дані до комплексного масиву (дійсна частина)
          const complexData = new Array(fftSize * 2).fill(0);
          for (let i = 0; i < fftSize; i++) {
            complexData[i * 2] = windowedGyroData[i]; // Real part
            complexData[i * 2 + 1] = 0;               // Imaginary part
          }
          
          // Запускаємо FFT
          fft.transform(out, complexData);
          
          // Обчислюємо спектр (амплітуда) і зберігаємо в масиві
          // Використовуємо лише половину спектру (до частоти Найквіста)
          const spectrum = new Array(Math.floor(fftSize / 2));
          for (let i = 0; i < fftSize / 2; i++) {
            const real = out[i * 2];
            const imag = out[i * 2 + 1];
            const frequency = i * (sampleRate / fftSize); // Частота в Гц
            const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2); // Нормалізація
            spectrum[i] = { frequency, magnitude };
          }
          
          // Знаходимо домінуючі частоти (локальні максимуми)
          const dominantFrequencies = [];
          for (let i = 1; i < spectrum.length - 1; i++) {
            if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
                spectrum[i].magnitude > spectrum[i+1].magnitude &&
                spectrum[i].magnitude > 0.01) { // Поріг для фільтрації шуму
              dominantFrequencies.push({
                frequency: spectrum[i].frequency,
                magnitude: spectrum[i].magnitude
              });
            }
            
            // Обмежуємо кількість домінуючих частот
            if (dominantFrequencies.length >= 25) break;
          }
          
          // Сортуємо за величиною і беремо топ-5
          dominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
          const top5Frequencies = dominantFrequencies.slice(0, 5);
          
          // Оцінюємо загальний рівень шуму (використовуємо цикл для зменшення навантаження на стек)
          let totalMagnitude = 0;
          for (let i = 0; i < spectrum.length; i++) {
            totalMagnitude += spectrum[i].magnitude;
          }
          const noiseLevel = totalMagnitude / spectrum.length;
          
          // Структура для результатів аналізу
          const analysisResult = {
            dominantFrequencies: top5Frequencies,
            noiseLevel,
            filteredVsUnfiltered: { ratio: 1, noiseDiff: 0 } // Значення за замовчуванням
          };
          
          // Якщо доступні нефільтровані дані, обчислюємо різницю між фільтрованими та нефільтрованими
          if (hasUnfiltered && gyroUnfiltData) {
            // Застосовуємо те ж саме вікно Ханна до нефільтрованих даних
            const windowedUnfiltData = new Array(fftSize);
            for (let i = 0; i < fftSize; i++) {
              const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
              windowedUnfiltData[i] = gyroUnfiltData[i] * window;
            }
            
            // Налаштовуємо FFT для нефільтрованих даних
            const unfiltFft = new FFT(fftSize);
            const unfiltOut = new Array(fftSize * 2);
            
            // Копіюємо дані до комплексного масиву
            const unfiltComplexData = new Array(fftSize * 2).fill(0);
            for (let i = 0; i < fftSize; i++) {
              unfiltComplexData[i * 2] = windowedUnfiltData[i]; // Дійсна частина
              unfiltComplexData[i * 2 + 1] = 0;                // Уявна частина
            }
            
            // Запускаємо FFT для нефільтрованих даних
            unfiltFft.transform(unfiltOut, unfiltComplexData);
            
            // Обчислюємо спектр нефільтрованих даних
            const unfiltSpectrum = new Array(Math.floor(fftSize / 2));
            for (let i = 0; i < fftSize / 2; i++) {
              const real = unfiltOut[i * 2];
              const imag = unfiltOut[i * 2 + 1];
              const frequency = i * (sampleRate / fftSize);
              const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
              unfiltSpectrum[i] = { frequency, magnitude };
            }
            
            // Обчислюємо загальний рівень шуму для нефільтрованих даних
            let unfiltTotalMagnitude = 0;
            for (let i = 0; i < unfiltSpectrum.length; i++) {
              unfiltTotalMagnitude += unfiltSpectrum[i].magnitude;
            }
            const unfiltNoiseLevel = unfiltTotalMagnitude / unfiltSpectrum.length;
            
            // Обчислюємо співвідношення та різницю шуму
            const noiseRatio = unfiltNoiseLevel > 0 ? noiseLevel / unfiltNoiseLevel : 1;
            const noiseDiff = unfiltNoiseLevel - noiseLevel;
            
            analysisResult.filteredVsUnfiltered = {
              ratio: noiseRatio,
              noiseDiff: noiseDiff,
              unfiltNoiseLevel
            };
            
            // Знаходимо домінуючі частоти в нефільтрованих даних
            const unfiltDominantFreqs = [];
            for (let i = 1; i < unfiltSpectrum.length - 1; i++) {
              if (unfiltSpectrum[i].magnitude > unfiltSpectrum[i-1].magnitude && 
                  unfiltSpectrum[i].magnitude > unfiltSpectrum[i+1].magnitude &&
                  unfiltSpectrum[i].magnitude > 0.01) {
                unfiltDominantFreqs.push({
                  frequency: unfiltSpectrum[i].frequency,
                  magnitude: unfiltSpectrum[i].magnitude
                });
              }
              
              if (unfiltDominantFreqs.length >= 10) break;
            }
            
            // Сортуємо за величиною і беремо топ-5
            unfiltDominantFreqs.sort((a, b) => b.magnitude - a.magnitude);
            analysisResult.unfilteredDominantFrequencies = unfiltDominantFreqs.slice(0, 5);
          }
          
          frequencyAnalysis[axis] = analysisResult;
        } catch (err) {
          console.error(`Помилка FFT для осі ${axis}:`, err);
          frequencyAnalysis[axis] = {
            dominantFrequencies: [],
            noiseLevel: 0,
            filteredVsUnfiltered: { ratio: 1, noiseDiff: 0 }
          };
        }
      }
    }

    return { frequencyAnalysis };
  };

  // Функція аналізу гармонійності руху з покращеним використанням даних
  const analyzeHarmonicDistortion = async () => {
    const harmonicAnalysis = {
      roll: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      pitch: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      yaw: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} }
    };

    // Орієнтовна частота запису даних (в Гц)
    const looptimeUs = parseFloat(metadata.looptime) || 312; // мікросекунди
    const sampleRate = Math.round(1000000 / looptimeUs); // Гц

    // Для кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      
      // Отримуємо всі релевантні колонки даних
      const gyroCol = `gyroADC[${axisIndex}]`;
      const pTermCol = `axisP[${axisIndex}]`;
      const iTermCol = `axisI[${axisIndex}]`;
      const dTermCol = `axisD[${axisIndex}]`;
      const sumCol = `axisSum[${axisIndex}]`;
      
      // Перевіряємо наявність колонок
      const hasGyro = dataHeaders.includes(gyroCol);
      const hasPID = dataHeaders.includes(pTermCol) && 
                    dataHeaders.includes(iTermCol) && 
                    dataHeaders.includes(dTermCol);
      const hasSum = dataHeaders.includes(sumCol);
      
      if (hasGyro) {
        try {
          // Для FFT потрібна довжина, що є степенем 2
          const fftSize = 1024;
          
          // Масиви для збору даних
          const gyroData = new Array(fftSize).fill(0);
          const pData = hasPID ? new Array(fftSize).fill(0) : null;
          const iData = hasPID ? new Array(fftSize).fill(0) : null;
          const dData = hasPID ? new Array(fftSize).fill(0) : null;
          const sumData = hasSum ? new Array(fftSize).fill(0) : null;
          
          // Збираємо дані порційно
          let dataCollected = 0;
          const chunkSize = 2000;
          
          // Розмір даних для збору 
          const collectSize = Math.min(flightData.length, fftSize * 2);
          
          // Обробляємо дані порціями і збираємо значення для FFT
          await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
            for (const row of chunk) {
              if (dataCollected < fftSize) {
                const gyroValue = parseFloat(row[gyroCol]) || 0;
                
                if (!isNaN(gyroValue)) {
                  gyroData[dataCollected] = gyroValue;
                  
                  // Якщо доступні PID-дані, збираємо і їх
                  if (hasPID) {
                    pData[dataCollected] = parseFloat(row[pTermCol]) || 0;
                    iData[dataCollected] = parseFloat(row[iTermCol]) || 0;
                    dData[dataCollected] = parseFloat(row[dTermCol]) || 0;
                  }
                  
                  // Якщо доступні дані про суму PID-компонентів
                  if (hasSum) {
                    sumData[dataCollected] = parseFloat(row[sumCol]) || 0;
                  }
                  
                  dataCollected++;
                }
              }
            }
          });
          
          // Застосовуємо вікно Ханна для зменшення витоку спектру
          const windowedGyroData = new Array(fftSize);
          for (let i = 0; i < fftSize; i++) {
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
            windowedGyroData[i] = gyroData[i] * window;
          }
          
          // Налаштовуємо FFT
          const fft = new FFT(fftSize);
          const out = new Array(fftSize * 2);
          
          // Підготовка комплексних даних
          const complexData = new Array(fftSize * 2).fill(0);
          for (let i = 0; i < fftSize; i++) {
            complexData[i * 2] = windowedGyroData[i]; // Real part
            complexData[i * 2 + 1] = 0;               // Imaginary part
          }
          
          // Запускаємо FFT
          fft.transform(out, complexData);
          
          // Обчислюємо спектр (амплітуда) - попередньо виділяємо пам'ять
          const spectrum = new Array(Math.floor(fftSize / 2));
          for (let i = 0; i < fftSize / 2; i++) {
            const real = out[i * 2];
            const imag = out[i * 2 + 1];
            const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
            spectrum[i] = magnitude;
          }
          
          // Знаходимо фундаментальну частоту (найбільша амплітуда)
          let fundamentalIndex = 0;
          let fundamentalMagnitude = 0;
          
          // Пошук максимуму без використання Math.max(...array)
          for (let i = 1; i < spectrum.length; i++) { // починаємо з 1, щоб уникнути DC-складової
            if (spectrum[i] > fundamentalMagnitude) {
              fundamentalMagnitude = spectrum[i];
              fundamentalIndex = i;
            }
          }
          
          // Якщо знайдено фундаментальну частоту
          if (fundamentalIndex > 0 && fundamentalMagnitude > 0) {
            const fundamentalFreq = fundamentalIndex * (sampleRate / fftSize);
            
            // Розраховуємо THD (Total Harmonic Distortion)
            let harmonicPower = 0;
            const harmonics = [];
            
            for (let i = 2; i * fundamentalIndex < spectrum.length; i++) {
              const harmonicIndex = i * fundamentalIndex;
              const harmonicMagnitude = spectrum[harmonicIndex];
              harmonicPower += harmonicMagnitude * harmonicMagnitude;
              
              harmonics.push({
                harmonic: i,
                frequency: harmonicIndex * (sampleRate / fftSize),
                magnitude: harmonicMagnitude,
                relativeMagnitude: harmonicMagnitude / fundamentalMagnitude
              });
            }
            
            // Запобігання діленню на нуль
            const thd = fundamentalMagnitude > 0 
              ? (Math.sqrt(harmonicPower) / fundamentalMagnitude * 100) 
              : 0;
            
            // Оцінка стабільності (вища THD означає меншу стабільність)
            const stabilityScore = 100 - Math.min(100, thd);
            
            // Виявлення небажаних коливань
            const oscillationThreshold = 30; // Поріг для виявлення коливань
            const oscillationDetected = thd > oscillationThreshold;
            
            // Результат аналізу для даної осі
            harmonicAnalysis[axis] = {
              thd,
              stabilityScore,
              oscillationDetected,
              fundamentalFrequency: fundamentalFreq,
              fundamentalMagnitude,
              harmonics: harmonics.slice(0, 5), // Берем до 5 гармонік
              pidHarmonics: {}
            };
            
            // Аналіз гармонійності для PID-компонентів
            if (hasPID) {
              const pidComponents = [
                { name: 'P', data: pData },
                { name: 'I', data: iData },
                { name: 'D', data: dData }
              ];
              
              for (const component of pidComponents) {
                if (component.data) {
                  try {
                    // Застосовуємо вікно Ханна
                    const windowedData = new Array(fftSize);
                    for (let i = 0; i < fftSize; i++) {
                      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
                      windowedData[i] = component.data[i] * window;
                    }
                    
                    // Підготовка для FFT
                    const pidFft = new FFT(fftSize);
                    const pidOut = new Array(fftSize * 2);
                    const pidComplexData = new Array(fftSize * 2).fill(0);
                    
                    for (let i = 0; i < fftSize; i++) {
                      pidComplexData[i * 2] = windowedData[i]; // Real part
                      pidComplexData[i * 2 + 1] = 0;          // Imaginary part
                    }
                    
                    // Запускаємо FFT
                    pidFft.transform(pidOut, pidComplexData);
                    
                    // Обчислюємо спектр
                    const pidSpectrum = new Array(Math.floor(fftSize / 2));
                    for (let i = 0; i < fftSize / 2; i++) {
                      const real = pidOut[i * 2];
                      const imag = pidOut[i * 2 + 1];
                      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                      pidSpectrum[i] = magnitude;
                    }
                    
                    // Перевіряємо амплітуду на фундаментальній частоті та її гармоніках
                    const fundamentalMagnitude = pidSpectrum[fundamentalIndex];
                    let harmonicPower = 0;
                    
                    for (let i = 2; i * fundamentalIndex < pidSpectrum.length; i++) {
                      const harmonicIndex = i * fundamentalIndex;
                      harmonicPower += pidSpectrum[harmonicIndex] * pidSpectrum[harmonicIndex];
                    }
                    
                    // Знаходимо THD для компонента
                    const componentThd = fundamentalMagnitude > 0 
                      ? (Math.sqrt(harmonicPower) / fundamentalMagnitude * 100) 
                      : 0;
                    
                    harmonicAnalysis[axis].pidHarmonics[component.name] = {
                      thd: componentThd,
                      fundamentalMagnitude
                    };
                  } catch (err) {
                    console.error(`Помилка аналізу ${component.name}-компонента для осі ${axis}:`, err);
                  }
                }
              }
            }
          } else {
            // Якщо фундаментальна частота не знайдена
            harmonicAnalysis[axis] = {
              thd: 0,
              stabilityScore: 100, // Припускаємо високу стабільність за відсутності сигналу
              oscillationDetected: false,
              pidHarmonics: {}
            };
          }
          
        } catch (err) {
          console.error(`Помилка аналізу гармонік для осі ${axis}:`, err);
          // Встановлюємо значення за замовчуванням при помилці
          harmonicAnalysis[axis] = {
            thd: 0,
            stabilityScore: 0,
            oscillationDetected: false,
            pidHarmonics: {}
          };
        }
      }
    }

    return { harmonicAnalysis };
  };

  // Функція аналізу фільтрів з покращеним використанням даних
  const analyzeFilters = async () => {
    const filterAnalysis = {
      gyroFilters: {
        effectiveness: 0,
        phaseDelay: 0,
        recommendedFrequency: 0
      },
      dtermFilters: {
        effectiveness: 0,
        phaseDelay: 0,
        recommendedFrequency: 0
      },
      notchFilters: {
        effectiveness: 0,
        identifiedNoiseFrequencies: []
      },
      rpmFilters: {
        effectiveness: 0,
        motorNoiseFrequencies: [],
        detectedHarmonics: []
      }
    };

    // Отримуємо налаштування фільтрів з метаданих
    const gyroLowpassHz = parseFloat(metadata['gyro_lowpass_hz']) || 0;
    const dtermLowpassHz = parseFloat(metadata['dterm_lowpass_hz']) || 0;
    const dynNotchMinHz = parseFloat(metadata['dyn_notch_min_hz']) || 0;
    const dynNotchMaxHz = parseFloat(metadata['dyn_notch_max_hz']) || 0;
    const gyroRpmNotchHarmonics = parseFloat(metadata['gyro_rpm_notch_harmonics']) || 0;
    const motorPoles = parseFloat(metadata['motor_poles']) || 14;
    const dshotBidir = parseInt(metadata['dshot_bidir']) || 0;
    
    console.log(`Метадані фільтрів: gyro_lowpass_hz=${gyroLowpassHz}, dterm_lowpass_hz=${dtermLowpassHz}`);
    console.log(`Динамічні notch-фільтри: min=${dynNotchMinHz}Hz, max=${dynNotchMaxHz}Hz`);
    console.log(`RPM фільтр: harmonics=${gyroRpmNotchHarmonics}, motor_poles=${motorPoles}, bidir=${dshotBidir}`);
    
    // Орієнтовна частота запису даних (в Гц)
    const looptimeUs = parseFloat(metadata.looptime) || 312; // мікросекунди
    const sampleRate = Math.round(1000000 / looptimeUs); // Гц
    console.log(`Частота дискретизації: ${sampleRate} Гц`);
    
    try {
      // Аналіз даних гіроскопа
      // Перевіряємо наявність як фільтрованих, так і нефільтрованих даних
      const hasUnfilteredGyro = dataHeaders.some(h => h.startsWith('gyroUnfilt['));
      const hasFilteredGyro = dataHeaders.some(h => h.startsWith('gyroADC['));
      
      if (hasUnfilteredGyro && hasFilteredGyro) {
        const gyroDataRaw = [];
        const gyroDataFiltered = [];
        
        // Розмір порції для обробки
        const chunkSize = 500;
        // Обмежуємо кількість даних для аналізу (2048 точок максимум)
        const maxSamples = 2048;
        const collectSize = Math.min(flightData.length, maxSamples);
        
        // Збираємо дані порційно
        await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
          for (const row of chunk) {
            const rawData = {
              x: parseFloat(row['gyroUnfilt[0]']) || 0,
              y: parseFloat(row['gyroUnfilt[1]']) || 0,
              z: parseFloat(row['gyroUnfilt[2]']) || 0
            };
            
            const filteredData = {
              x: parseFloat(row['gyroADC[0]']) || 0,
              y: parseFloat(row['gyroADC[1]']) || 0,
              z: parseFloat(row['gyroADC[2]']) || 0
            };
            
            gyroDataRaw.push(rawData);
            gyroDataFiltered.push(filteredData);
          }
        });
        
        // Оцінка ефективності фільтрів гіроскопа
        if (gyroDataRaw.length > 0 && gyroDataFiltered.length > 0) {
          // Розраховуємо різницю між нефільтрованими та фільтрованими даними
          const noiseReduction = {
            x: 0,
            y: 0,
            z: 0
          };
          
          for (let i = 0; i < Math.min(gyroDataRaw.length, gyroDataFiltered.length); i++) {
            noiseReduction.x += Math.abs(gyroDataRaw[i].x - gyroDataFiltered[i].x);
            noiseReduction.y += Math.abs(gyroDataRaw[i].y - gyroDataFiltered[i].y);
            noiseReduction.z += Math.abs(gyroDataRaw[i].z - gyroDataFiltered[i].z);
          }
          
          // Нормалізуємо
          const sampleCount = Math.min(gyroDataRaw.length, gyroDataFiltered.length);
          noiseReduction.x /= sampleCount;
          noiseReduction.y /= sampleCount;
          noiseReduction.z /= sampleCount;
          
          // Загальна ефективність як середнє по осям
          const gyroFilterEffectiveness = (noiseReduction.x + noiseReduction.y + noiseReduction.z) / 3;
          
          // Оцінка фазової затримки
          let phaseDelay = 0;
          if (gyroLowpassHz > 0) {
            // Груба оцінка затримки на основі частоти відсіювання
            phaseDelay = 1000 / (2 * Math.PI * gyroLowpassHz);
          }
          
          // Рекомендована частота на основі аналізу шуму
          const recommendedFrequency = await calculateRecommendedGyroFrequency(gyroDataRaw, sampleRate);
          
          filterAnalysis.gyroFilters = {
            effectiveness: gyroFilterEffectiveness,
            phaseDelay,
            recommendedFrequency,
            noiseReduction: {
              x: noiseReduction.x,
              y: noiseReduction.y,
              z: noiseReduction.z
            }
          };
        }
        
        // Аналіз шуму моторів з використанням даних eRPM
        const hasERPM = dataHeaders.some(h => h.startsWith('eRPM['));
        const hasMotor = dataHeaders.some(h => h.startsWith('motor['));
        
        if (hasERPM && hasMotor) {
          // Збираємо дані моторів та їх обертів
          const motorData = [];
          const eRpmData = [];
          
          for (let motorIdx = 0; motorIdx < 4; motorIdx++) {
            const motorCol = `motor[${motorIdx}]`;
            const eRpmCol = `eRPM[${motorIdx}]`;
            
            if (dataHeaders.includes(motorCol) && dataHeaders.includes(eRpmCol)) {
              const motorValues = [];
              const eRpmValues = [];
              
              // Збираємо дані порційно
              await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                for (const row of chunk) {
                  const motorValue = parseFloat(row[motorCol]) || 0;
                  const eRpmValue = parseFloat(row[eRpmCol]) || 0;
                  
                  motorValues.push(motorValue);
                  eRpmValues.push(eRpmValue);
                }
              });
              
              motorData.push(motorValues);
              eRpmData.push(eRpmValues);
            }
          }
          
          // Аналіз шуму моторів з урахуванням eRPM
          if (motorData.length > 0 && eRpmData.length > 0) {
            const motorNoiseFrequencies = [];
            const rpmHarmonics = [];
            
            // Аналізуємо кожен мотор
            for (let motorIndex = 0; motorIndex < motorData.length; motorIndex++) {
              try {
                const motorValues = motorData[motorIndex];
                const eRpmValues = eRpmData[motorIndex];
                
                // Знаходимо середні оберти мотора
                const avgERPM = eRpmValues.reduce((sum, rpm) => sum + rpm, 0) / eRpmValues.length;
                
                // Частота обертання в Гц (eRPM / 60)
                const rotationFreqHz = avgERPM / 60;
                
                // Базова частота шуму мотора (залежить від кількості полюсів)
                // Для безколекторних моторів з N полюсами = (eRPM * N / 60) / 2
                const baseNoiseFreq = (avgERPM * motorPoles) / (60 * 2);
                
                // Гармоніки шуму мотора
                const harmonics = [];
                for (let harmonic = 1; harmonic <= gyroRpmNotchHarmonics; harmonic++) {
                  harmonics.push({
                    harmonic,
                    frequency: baseNoiseFreq * harmonic,
                    motorIndex,
                    averageERPM: avgERPM
                  });
                }
                
                // Додаємо знайдені гармоніки
                rpmHarmonics.push(...harmonics);
                
                // Аналізуємо спектр мотора для пошуку піків шуму
                const fftSize = 512;
                if (motorValues.length >= fftSize) {
                  // Застосовуємо вікно Ханна
                  const windowedData = new Array(fftSize);
                  for (let i = 0; i < fftSize; i++) {
                    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
                    windowedData[i] = motorValues[i] * window;
                  }
                  
                  // Підготовка для FFT
                  const fft = new FFT(fftSize);
                  const out = new Array(fftSize * 2);
                  const complexData = new Array(fftSize * 2).fill(0);
                  
                  for (let i = 0; i < fftSize; i++) {
                    complexData[i * 2] = windowedData[i]; // Real part
                    complexData[i * 2 + 1] = 0;          // Imaginary part
                  }
                  
                  // Запускаємо FFT
                  fft.transform(out, complexData);
                  
                  // Обчислюємо спектр
                  const frequencies = [];
                  for (let i = 1; i < fftSize / 2; i++) {
                    const real = out[i * 2];
                    const imag = out[i * 2 + 1];
                    const freq = i * (sampleRate / fftSize);
                    const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                    frequencies.push({ frequency: freq, magnitude });
                  }
                  
                  // Знаходимо локальні максимуми
                  const peaks = [];
                  for (let i = 1; i < frequencies.length - 1; i++) {
                    if (frequencies[i].magnitude > frequencies[i-1].magnitude && 
                        frequencies[i].magnitude > frequencies[i+1].magnitude &&
                        frequencies[i].magnitude > 0.01) {
                      peaks.push(frequencies[i]);
                    }
                  }
                  
                  // Сортуємо за магнітудою і беремо топ-3
                  peaks.sort((a, b) => b.magnitude - a.magnitude);
                  const topFrequencies = peaks.slice(0, 3);
                  
                  motorNoiseFrequencies.push({
                    motorIndex,
                    frequencies: topFrequencies,
                    averageERPM: avgERPM
                  });
                }
              } catch (err) {
                console.error(`Помилка аналізу шуму мотора ${motorIndex}:`, err);
              }
            }
            
            // Обчислюємо ефективність RPM фільтрів, порівнюючи шуми на частотах гармонік
            const rpmFilterEffectiveness = await calculateRpmFilterEffectiveness(
              rpmHarmonics, gyroDataRaw, gyroDataFiltered, sampleRate
            );
            
            filterAnalysis.rpmFilters = {
              effectiveness: rpmFilterEffectiveness,
              motorNoiseFrequencies,
              detectedHarmonics: rpmHarmonics
            };
          }
        }
        
        // Аналіз notch-фільтрів
        if (dynNotchMinHz > 0 && dynNotchMaxHz > 0) {
          const identifiedNoiseFrequencies = [];
          
          // Аналізуємо спектр гіроскопа для виявлення шумів, які потрібно фільтрувати
          for (const axis of ['x', 'y', 'z']) {
            const axisIndex = { x: 0, y: 1, z: 2 }[axis];
            const gyroCol = `gyroUnfilt[${axisIndex}]`;
            
            if (dataHeaders.includes(gyroCol)) {
              try {
                const fftSize = 1024;
                const gyroData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const value = parseFloat(row[gyroCol]) || 0;
                    if (!isNaN(value)) {
                      gyroData.push(value);
                      if (gyroData.length >= fftSize) break;
                    }
                  }
                });
                
                if (gyroData.length > 0) {
                  // Застосовуємо вікно Ханна
                  const windowedData = new Array(fftSize);
                  for (let i = 0; i < Math.min(fftSize, gyroData.length); i++) {
                    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
                    windowedData[i] = gyroData[i] * window;
                  }
                  
                  // Доповнюємо нулями, якщо потрібно
                  for (let i = gyroData.length; i < fftSize; i++) {
                    windowedData[i] = 0;
                  }
                  
                  // Підготовка для FFT
                  const fft = new FFT(fftSize);
                  const out = new Array(fftSize * 2);
                  const complexData = new Array(fftSize * 2).fill(0);
                  
                  for (let i = 0; i < fftSize; i++) {
                    complexData[i * 2] = windowedData[i]; // Real part
                    complexData[i * 2 + 1] = 0;          // Imaginary part
                  }
                  
                  // Запускаємо FFT
                  fft.transform(out, complexData);
                  
                  // Обчислюємо спектр та шукаємо піки шуму в діапазоні notch фільтра
                  for (let i = 1; i < fftSize / 2 - 1; i++) {
                    const freq = i * (sampleRate / fftSize);
                    
                    if (freq >= dynNotchMinHz && freq <= dynNotchMaxHz) {
                      const real = out[i * 2];
                      const imag = out[i * 2 + 1];
                      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                      
                      const prevReal = out[(i-1) * 2];
                      const prevImag = out[(i-1) * 2 + 1];
                      const prevMagnitude = Math.sqrt(prevReal * prevReal + prevImag * prevImag) / (fftSize/2);
                      
                      const nextReal = out[(i+1) * 2];
                      const nextImag = out[(i+1) * 2 + 1];
                      const nextMagnitude = Math.sqrt(nextReal * nextReal + nextImag * nextImag) / (fftSize/2);
                      
                      // Перевіряємо, чи це локальний максимум і має суттєву амплітуду
                      if (magnitude > 0.01 && magnitude > prevMagnitude && magnitude > nextMagnitude) {
                        
                        // Перевіряємо, чи ця частота вже була додана
                        const existingFreq = identifiedNoiseFrequencies.find(f => Math.abs(f.frequency - freq) < 5);
                        
                        if (!existingFreq) {
                          identifiedNoiseFrequencies.push({
                            frequency: freq,
                            magnitude,
                            axis
                          });
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.error(`Помилка аналізу notch-фільтрів для осі ${axis}:`, err);
              }
            }
          }
          
          // Сортуємо за амплітудою
          identifiedNoiseFrequencies.sort((a, b) => b.magnitude - a.magnitude);
          
          // Оцінка ефективності notch-фільтрів
          let notchEffectiveness = 0;
          if (identifiedNoiseFrequencies.length > 0) {
            // Порівнюємо амплітуди шумів з нефільтрованими та фільтрованими даними
            const reductionRatios = [];
            
            for (const noiseFreq of identifiedNoiseFrequencies.slice(0, 3)) { // Аналізуємо топ-3 частоти
              const axis = noiseFreq.axis;
              const axisIndex = { x: 0, y: 1, z: 2 }[axis];
              
              try {
                const fftSizeSmall = 256; // Менший розмір для швидшого обчислення
                
                // Нефільтровані дані
                const rawData = [];
                // Фільтровані дані
                const filteredData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const rawValue = parseFloat(row[`gyroUnfilt[${axisIndex}]`]) || 0;
                    const filteredValue = parseFloat(row[`gyroADC[${axisIndex}]`]) || 0;
                    
                    rawData.push(rawValue);
                    filteredData.push(filteredValue);
                    
                    if (rawData.length >= fftSizeSmall) break;
                  }
                });
                
                // Застосовуємо вікно Ханна до даних
                const windowedRawData = new Array(fftSizeSmall);
                const windowedFilteredData = new Array(fftSizeSmall);
                
                for (let i = 0; i < Math.min(fftSizeSmall, rawData.length); i++) {
                  const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSizeSmall - 1)));
                  windowedRawData[i] = rawData[i] * window;
                  windowedFilteredData[i] = filteredData[i] * window;
                }
                
                // Доповнюємо нулями
                for (let i = rawData.length; i < fftSizeSmall; i++) {
                  windowedRawData[i] = 0;
                  windowedFilteredData[i] = 0;
                }
                
                // FFT для нефільтрованих даних
                const rawFft = new FFT(fftSizeSmall);
                const rawOut = new Array(fftSizeSmall * 2);
                const rawComplexData = new Array(fftSizeSmall * 2).fill(0);
                
                for (let i = 0; i < fftSizeSmall; i++) {
                  rawComplexData[i * 2] = windowedRawData[i]; // Real part
                  rawComplexData[i * 2 + 1] = 0;             // Imaginary part
                }
                
                rawFft.transform(rawOut, rawComplexData);
                
                // FFT для фільтрованих даних
                const filteredFft = new FFT(fftSizeSmall);
                const filteredOut = new Array(fftSizeSmall * 2);
                const filteredComplexData = new Array(fftSizeSmall * 2).fill(0);
                
                for (let i = 0; i < fftSizeSmall; i++) {
                  filteredComplexData[i * 2] = windowedFilteredData[i]; // Real part
                  filteredComplexData[i * 2 + 1] = 0;                  // Imaginary part
                }
                
                filteredFft.transform(filteredOut, filteredComplexData);
                
                // Знаходимо амплітуду на частоті шуму
                const freqIndex = Math.round(noiseFreq.frequency / (sampleRate / fftSizeSmall));
                
                if (freqIndex > 0 && freqIndex < fftSizeSmall / 2) {
                  const rawReal = rawOut[freqIndex * 2];
                  const rawImag = rawOut[freqIndex * 2 + 1];
                  const rawMagnitude = Math.sqrt(rawReal * rawReal + rawImag * rawImag) / (fftSizeSmall/2);
                  
                  const filteredReal = filteredOut[freqIndex * 2];
                  const filteredImag = filteredOut[freqIndex * 2 + 1];
                  const filteredMagnitude = Math.sqrt(filteredReal * filteredReal + filteredImag * filteredImag) / (fftSizeSmall/2);
                  
                  if (rawMagnitude > 0) {
                    const reductionRatio = 1 - (filteredMagnitude / rawMagnitude);
                    reductionRatios.push(reductionRatio);
                    
                    // Додаємо інформацію про ефективність фільтрації для цієї частоти
                    noiseFreq.filterEffectiveness = reductionRatio;
                  }
                }
              } catch (err) {
                console.error(`Помилка оцінки ефективності notch-фільтрів для частоти ${noiseFreq.frequency}:`, err);
              }
            }
            
            // Середня ефективність
            if (reductionRatios.length > 0) {
              notchEffectiveness = reductionRatios.reduce((sum, val) => sum + val, 0) / reductionRatios.length;
            }
          }
          
          filterAnalysis.notchFilters = {
            effectiveness: notchEffectiveness,
            identifiedNoiseFrequencies: identifiedNoiseFrequencies.slice(0, 5) // Беремо топ-5
          };
        }
        
        // Аналіз D-term фільтрів
        // В даному випадку робимо спрощений аналіз через відсутність прямого доступу до D-term сигналів
        const dTermSignal = dataHeaders.some(h => h.startsWith('axisD['));
        
        if (dtermLowpassHz > 0) {
          const phaseDelay = 1000 / (2 * Math.PI * dtermLowpassHz);
          
          if (dTermSignal) {
            // Спробуємо проаналізувати D-term сигнали безпосередньо
            const dTermData = [];
            
            // Збираємо D-term дані для всіх осей
            for (let axisIdx = 0; axisIdx < 3; axisIdx++) {
              const dTermCol = `axisD[${axisIdx}]`;
              
              if (dataHeaders.includes(dTermCol)) {
                const axisData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const value = parseFloat(row[dTermCol]) || 0;
                    axisData.push(value);
                    if (axisData.length >= 1024) break;
                  }
                });
                
                dTermData.push(axisData);
              }
            }
            
            // Аналізуємо спектр D-term, якщо є дані
            if (dTermData.length > 0 && dTermData[0].length > 0) {
              // Використаємо дані з першої осі, що має найбільше значень
              let bestAxisData = dTermData[0];
              for (let i = 1; i < dTermData.length; i++) {
                if (dTermData[i].length > bestAxisData.length) {
                  bestAxisData = dTermData[i];
                }
              }
              
              // Для FFT потрібна довжина, що є степенем 2
              const fftSize = 512;
              if (bestAxisData.length >= fftSize) {
                // Застосовуємо вікно Ханна
                const windowedData = new Array(fftSize);
                for (let i = 0; i < fftSize; i++) {
                  const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
                  windowedData[i] = bestAxisData[i] * window;
                }
                
                // Підготовка для FFT
                const fft = new FFT(fftSize);
                const out = new Array(fftSize * 2);
                const complexData = new Array(fftSize * 2).fill(0);
                
                for (let i = 0; i < fftSize; i++) {
                  complexData[i * 2] = windowedData[i]; // Real part
                  complexData[i * 2 + 1] = 0;          // Imaginary part
                }
                
                // Запускаємо FFT
                fft.transform(out, complexData);
                
                // Обчислюємо спектр та знаходимо рівень шуму
                let totalMagnitude = 0;
                let highFreqMagnitude = 0;
                
                for (let i = 1; i < fftSize / 2; i++) {
                  const real = out[i * 2];
                  const imag = out[i * 2 + 1];
                  const freq = i * (sampleRate / fftSize);
                  const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                  
                  totalMagnitude += magnitude;
                  
                  // Рахуємо окремо шум вище 100 Гц
                  if (freq > 100) {
                    highFreqMagnitude += magnitude;
                  }
                }
                
                // Оцінка ефективності - співвідношення шуму на високих частотах до загального шуму
                // Нижче значення означає краще фільтрування
                const noiseRatio = highFreqMagnitude / totalMagnitude;
                const effectiveness = 1 - Math.min(1, noiseRatio);
                
                // Рекомендована частота D-term фільтра (яка забезпечує компроміс між затримкою і шумом)
                const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw, sampleRate);
                
                filterAnalysis.dtermFilters = {
                  effectiveness,
                  phaseDelay,
                  recommendedFrequency,
                  noiseRatio
                };
              } else {
                // Використовуємо спрощений аналіз
                const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
                const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw, sampleRate);
                
                filterAnalysis.dtermFilters = {
                  effectiveness,
                  phaseDelay,
                  recommendedFrequency
                };
              }
            } else {
              // Використовуємо спрощений аналіз, якщо немає D-term даних
              const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
              const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw, sampleRate);
              
              filterAnalysis.dtermFilters = {
                effectiveness,
                phaseDelay,
                recommendedFrequency
              };
            }
          } else {
            // Оцінка балансу між фільтрацією та затримкою
            const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
            
            // Рекомендована частота D-term фільтра
            const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw, sampleRate);
            
            filterAnalysis.dtermFilters = {
              effectiveness,
              phaseDelay,
              recommendedFrequency
            };
          }
        }
      } else {
        console.warn("Відсутні дані gyroUnfilt або gyroADC для аналізу фільтрів");
      }
    } catch (error) {
      console.error("Помилка аналізу фільтрів:", error);
    }
    
    return { filterAnalysis };
  };

  // Допоміжні функції для аналізу

  // Розрахунок рекомендованої частоти гіроскопа
  const calculateRecommendedGyroFrequency = (gyroData) => {
    try {
      // Спрощений алгоритм: аналізуємо спектр і знаходимо крайню частоту до появи шуму
      const fftSize = 1024;
      const samples = Math.min(gyroData.length, 1000);
      
      // Беремо середнє значення по всіх осях
      let combinedData = [];
      for (let i = 0; i < samples; i++) {
        const magnitude = Math.sqrt(
          gyroData[i].x * gyroData[i].x + 
          gyroData[i].y * gyroData[i].y + 
          gyroData[i].z * gyroData[i].z
        );
        combinedData.push(magnitude);
      }
      
      // Доповнюємо до розміру FFT
      combinedData = [...combinedData, ...Array(fftSize - combinedData.length).fill(0)];
      
      const fft = new FFT(fftSize);
      const out = new Array(fftSize * 2);
      
      // Prepare complex data
      const complexData = new Array(fftSize * 2).fill(0);
      for (let i = 0; i < fftSize; i++) {
        complexData[i * 2] = combinedData[i]; // Real part
        complexData[i * 2 + 1] = 0;           // Imaginary part
      }
      
      // Run the FFT
      fft.transform(out, complexData);
      
      // Отримуємо амплітудний спектр
      const spectrum = [];
      for (let i = 0; i < fftSize / 2; i++) {
        const real = out[i * 2];
        const imag = out[i * 2 + 1];
        const frequency = i * (1000 / fftSize);
        const magnitude = Math.sqrt(real * real + imag * imag);
        spectrum.push({ frequency, magnitude });
      }
      
      // Знаходимо частоту, де починається шум (різке збільшення амплітуди)
      let noiseStartFrequency = 100; // Значення за замовчуванням
      
      // Згладжуємо спектр для визначення тренду
      const smoothedMagnitudes = [];
      const windowSize = 5;
      
      for (let i = 0; i < spectrum.length; i++) {
        let sum = 0;
        let count = 0;
        
        for (let j = Math.max(0, i - windowSize); j < Math.min(spectrum.length, i + windowSize); j++) {
          sum += spectrum[j].magnitude;
          count++;
        }
        
        smoothedMagnitudes.push(sum / count);
      }
      
      // Шукаємо точку, де амплітуда починає швидко зростати
      for (let i = 10; i < spectrum.length - 5; i++) {
        const currentAvg = (smoothedMagnitudes[i] + smoothedMagnitudes[i+1] + smoothedMagnitudes[i+2]) / 3;
        const nextAvg = (smoothedMagnitudes[i+3] + smoothedMagnitudes[i+4] + smoothedMagnitudes[i+5]) / 3;
        
        // Якщо є значне збільшення амплітуди
        if (nextAvg > currentAvg * 2 && nextAvg > 10) {
          noiseStartFrequency = spectrum[i].frequency;
          break;
        }
      }
      
      // Рекомендована частота фільтра - трохи нижче початку шуму
      return Math.max(50, Math.round(noiseStartFrequency * 0.8));
    } catch (err) {
      console.error("Помилка розрахунку рекомендованої частоти гіроскопа:", err);
      return 100; // Значення за замовчуванням
    }
  };

  // Оцінка ефективності D-term фільтра
  const calculateDtermFilterEffectiveness = (frequency) => {
    // Спрощена модель ефективності:
    // - Занадто низька частота (< 70 Гц) призводить до значних фазових затримок
    // - Занадто висока частота (> 150 Гц) не забезпечує достатньої фільтрації
    if (frequency < 70) {
      return 0.5 + (frequency / 70) * 0.3; // від 0.5 до 0.8
    } else if (frequency > 150) {
      return 0.8 - ((frequency - 150) / 100) * 0.3; // від 0.8 до 0.5
    } else {
      return 0.8; // оптимальна ефективність
    }
  };

  // Розрахунок рекомендованої частоти D-term фільтра
  const calculateRecommendedDtermFrequency = (gyroData) => {
    // Спрощений підхід: D-term фільтр повинен бути налаштований на нижчу частоту, ніж гіроскоп
    const gyroRecommendedFreq = calculateRecommendedGyroFrequency(gyroData);
    return Math.max(50, Math.round(gyroRecommendedFreq * 0.7));
  };

  // Оцінка ефективності RPM-фільтрів
  const calculateRpmFilterEffectiveness = (motorNoiseFrequencies, gyroDataRaw, gyroDataFiltered) => {
    if (!motorNoiseFrequencies.length) return 0;
    
    try {
      // Беремо найпотужніші шумові частоти від моторів
      const motorFrequencies = motorNoiseFrequencies.flatMap(motor => 
        motor.frequencies.map(f => f.frequency)
      );
      
      // Аналізуємо, наскільки ці частоти фільтруються в гіроскопі
      const fftSize = 512;
      let totalReduction = 0;
      let validFreqCount = 0;
      
      for (const axis of ['x', 'y', 'z']) {
        const axisIndex = { x: 0, y: 1, z: 2 }[axis];
        
        // Нефільтровані дані
        const rawData = gyroDataRaw.map(d => d[axis]).slice(0, fftSize);
        // Доповнюємо нулями
        const paddedRawData = [...rawData, ...Array(fftSize - rawData.length).fill(0)];
        
        // Фільтровані дані
        const filteredData = gyroDataFiltered.map(d => d[axis]).slice(0, fftSize);
        // Доповнюємо нулями
        const paddedFilteredData = [...filteredData, ...Array(fftSize - filteredData.length).fill(0)];
        
        // FFT для сирих даних
        const rawFft = new FFT(fftSize);
        const rawOut = new Array(fftSize * 2);
        
        // Prepare raw complex data
        const rawComplexData = new Array(fftSize * 2).fill(0);
        for (let i = 0; i < fftSize; i++) {
          rawComplexData[i * 2] = paddedRawData[i]; // Real part
          rawComplexData[i * 2 + 1] = 0;           // Imaginary part
        }
        
        // Run the FFT for raw data
        rawFft.transform(rawOut, rawComplexData);
        
        // FFT для фільтрованих даних
        const filteredFft = new FFT(fftSize);
        const filteredOut = new Array(fftSize * 2);
        
        // Prepare filtered complex data
        const filteredComplexData = new Array(fftSize * 2).fill(0);
        for (let i = 0; i < fftSize; i++) {
          filteredComplexData[i * 2] = paddedFilteredData[i]; // Real part
          filteredComplexData[i * 2 + 1] = 0;                // Imaginary part
        }
        
        // Run the FFT for filtered data
        filteredFft.transform(filteredOut, filteredComplexData);
        
        // Перевіряємо кожну частоту мотора
        for (const freq of motorFrequencies) {
          const freqIndex = Math.round(freq / (1000 / fftSize));
          
          if (freqIndex > 0 && freqIndex < fftSize / 2) {
            const rawReal = rawOut[freqIndex * 2];
            const rawImag = rawOut[freqIndex * 2 + 1];
            const rawMagnitude = Math.sqrt(rawReal * rawReal + rawImag * rawImag);
            
            const filteredReal = filteredOut[freqIndex * 2];
            const filteredImag = filteredOut[freqIndex * 2 + 1];
            const filteredMagnitude = Math.sqrt(filteredReal * filteredReal + filteredImag * filteredImag);
            
            if (rawMagnitude > 0) {
              // Коефіцієнт зменшення шуму на цій частоті
              const reduction = 1 - (filteredMagnitude / rawMagnitude);
              totalReduction += reduction;
              validFreqCount++;
            }
          }
        }
      }
      
      // Середня ефективність
      return validFreqCount > 0 ? totalReduction / validFreqCount : 0;
    } catch (err) {
      console.error("Помилка розрахунку ефективності RPM-фільтрів:", err);
      return 0;
    }
  };

  // Генерація рекомендацій на основі аналізу
  const generateRecommendations = (analysisResults) => {
    if (!analysisResults) return null;
    
    const recommendations = {
      pid: {
        roll: { p: 0, i: 0, d: 0, f: 0 },
        pitch: { p: 0, i: 0, d: 0, f: 0 },
        yaw: { p: 0, i: 0, d: 0, f: 0 }
      },
      filters: {
        gyro_lowpass_hz: 0,
        dterm_lowpass_hz: 0,
        dyn_notch_count: 0,
        dyn_notch_q: 0,
        dyn_notch_min_hz: 0,
        dyn_notch_max_hz: 0
      },
      betaflightCommands: []
    };
    
    try {
      // Отримуємо поточні налаштування PID з метаданих
      const currentPid = {
        roll: {
          p: 0, i: 0, d: 0, f: 0
        },
        pitch: {
          p: 0, i: 0, d: 0, f: 0
        },
        yaw: {
          p: 0, i: 0, d: 0, f: 0
        }
      };
      
      // Парсимо поточні PID з метаданих
      if (metadata.rollPID) {
        const parts = metadata.rollPID.split(',').map(p => parseInt(p.trim()));
        if (parts.length >= 3) {
          currentPid.roll.p = parts[0];
          currentPid.roll.i = parts[1];
          currentPid.roll.d = parts[2];
          if (parts.length >= 4) {
            currentPid.roll.f = parts[3];
          }
        }
      }
      
      if (metadata.pitchPID) {
        const parts = metadata.pitchPID.split(',').map(p => parseInt(p.trim()));
        if (parts.length >= 3) {
          currentPid.pitch.p = parts[0];
          currentPid.pitch.i = parts[1];
          currentPid.pitch.d = parts[2];
          if (parts.length >= 4) {
            currentPid.pitch.f = parts[3];
          }
        }
      }
      
      if (metadata.yawPID) {
        const parts = metadata.yawPID.split(',').map(p => parseInt(p.trim()));
        if (parts.length >= 3) {
          currentPid.yaw.p = parts[0];
          currentPid.yaw.i = parts[1];
          currentPid.yaw.d = parts[2];
          if (parts.length >= 4) {
            currentPid.yaw.f = parts[3];
          }
        }
      }
      
      // Отримуємо поточні налаштування фільтрів
      const currentFilters = {
        gyro_lowpass_hz: parseInt(metadata.gyro_lowpass_hz) || 0,
        dterm_lowpass_hz: parseInt(metadata.dterm_lowpass_hz) || 0,
        dyn_notch_count: parseInt(metadata.dyn_notch_count) || 0,
        dyn_notch_q: parseInt(metadata.dyn_notch_q) || 0,
        dyn_notch_min_hz: parseInt(metadata.dyn_notch_min_hz) || 0,
        dyn_notch_max_hz: parseInt(metadata.dyn_notch_max_hz) || 0
      };
      
      // 1. Аналіз відхилень і рекомендації для PID
      if (analysisResults.errorMetrics) {
        for (const axis of ['roll', 'pitch', 'yaw']) {
          if (analysisResults.errorMetrics[axis]) {
            const {rmsError, maxError, meanError} = analysisResults.errorMetrics[axis];
            
            // Рекомендації для P-терму
            if (rmsError > 20) {
              // Якщо відхилення великі, збільшуємо P
              recommendations.pid[axis].p = Math.round(currentPid[axis].p * 1.1);
            } else if (rmsError < 5) {
              // Якщо відхилення малі, зменшуємо P
              recommendations.pid[axis].p = Math.round(currentPid[axis].p * 0.95);
            } else {
              // Залишаємо без змін
              recommendations.pid[axis].p = currentPid[axis].p;
            }
            
            // Рекомендації для I-терму
            if (meanError > 10) {
              // Якщо середнє відхилення велике, збільшуємо I
              recommendations.pid[axis].i = Math.round(currentPid[axis].i * 1.15);
            } else {
              // Залишаємо без змін
              recommendations.pid[axis].i = currentPid[axis].i;
            }
            
            // Рекомендації для D-терму на основі максимального відхилення
            recommendations.pid[axis].d = currentPid[axis].d;
            recommendations.pid[axis].f = currentPid[axis].f;
          }
        }
      }
      
      // 2. Аналіз швидкості реакції і додаткові корекції PID
      if (analysisResults.stepResponseMetrics) {
        for (const axis of ['roll', 'pitch', 'yaw']) {
          if (analysisResults.stepResponseMetrics[axis]) {
            const {settlingTime, overshoot, riseTime} = analysisResults.stepResponseMetrics[axis];
            
            // Корекція P на основі часу наростання
            if (riseTime > 200) {
              // Якщо реакція повільна, збільшуємо P
              recommendations.pid[axis].p = Math.round(recommendations.pid[axis].p * 1.1);
            }
            
            // Корекція D на основі перерегулювання
            if (overshoot > 15) {
              // Якщо перерегулювання велике, збільшуємо D
              recommendations.pid[axis].d = Math.round(currentPid[axis].d * 1.15);
            } else if (overshoot < 5 && settlingTime > 150) {
              // Якщо малий overshoot але довгий час встановлення, зменшуємо D
              recommendations.pid[axis].d = Math.round(currentPid[axis].d * 0.9);
            }
            
            // Корекція Feed Forward на основі часу наростання
            if (riseTime > 150 && currentPid[axis].f > 0) {
              // Збільшуємо Feed Forward для швидшої реакції
              recommendations.pid[axis].f = Math.round(currentPid[axis].f * 1.2);
            }
          }
        }
      }
      
      // 3. Аналіз гармонійності і подальші корекції PID
      if (analysisResults.harmonicAnalysis) {
        for (const axis of ['roll', 'pitch', 'yaw']) {
          if (analysisResults.harmonicAnalysis[axis]) {
            const {thd, oscillationDetected} = analysisResults.harmonicAnalysis[axis];
            
            // Корекція при виявленні небажаних коливань
            if (oscillationDetected) {
              // Зменшуємо P і D при наявності коливань
              recommendations.pid[axis].p = Math.round(recommendations.pid[axis].p * 0.92);
              recommendations.pid[axis].d = Math.round(recommendations.pid[axis].d * 0.92);
            }
            
            // Додаткова корекція на основі THD
            if (thd > 40) {
              // Високий THD вказує на нелінійність, зменшуємо P
              recommendations.pid[axis].p = Math.round(recommendations.pid[axis].p * 0.95);
            }
          }
        }
      }
      
      // 4. Рекомендації для фільтрів
      if (analysisResults.filterAnalysis) {
        // Гірофільтри
        if (analysisResults.filterAnalysis.gyroFilters) {
          const {recommendedFrequency, effectiveness} = analysisResults.filterAnalysis.gyroFilters;
          
          // Рекомендуємо нову частоту фільтра гіроскопа
          if (recommendedFrequency > 0) {
            recommendations.filters.gyro_lowpass_hz = recommendedFrequency;
          } else {
            recommendations.filters.gyro_lowpass_hz = currentFilters.gyro_lowpass_hz;
          }
        }
        
        // D-term фільтри
        if (analysisResults.filterAnalysis.dtermFilters) {
          const {recommendedFrequency} = analysisResults.filterAnalysis.dtermFilters;
          
          // Рекомендуємо нову частоту фільтра D-term
          if (recommendedFrequency > 0) {
            recommendations.filters.dterm_lowpass_hz = recommendedFrequency;
          } else {
            recommendations.filters.dterm_lowpass_hz = currentFilters.dterm_lowpass_hz;
          }
        }
        
        // Notch фільтри
        if (analysisResults.filterAnalysis.notchFilters) {
          const {identifiedNoiseFrequencies} = analysisResults.filterAnalysis.notchFilters;
          
          if (identifiedNoiseFrequencies.length > 0) {
            // Знаходимо мінімальну і максимальну частоти шуму
            const minFreq = Math.floor(Math.max(10, identifiedNoiseFrequencies.reduce(
              (min, noise) => Math.min(min, noise.frequency), 1000
            )));
            
            const maxFreq = Math.ceil(Math.min(500, identifiedNoiseFrequencies.reduce(
              (max, noise) => Math.max(max, noise.frequency), 0
            )));
            
            // Рекомендуємо діапазон для notch фільтрів
            recommendations.filters.dyn_notch_min_hz = minFreq;
            recommendations.filters.dyn_notch_max_hz = maxFreq;
            
            // Рекомендуємо кількість notch фільтрів в залежності від виявлених шумів
            recommendations.filters.dyn_notch_count = Math.min(5, Math.max(3, identifiedNoiseFrequencies.length));
            
            // Q-фактор notch фільтрів
            recommendations.filters.dyn_notch_q = 350; // Стандартне значення
          } else {
            // Використовуємо поточні налаштування
            recommendations.filters.dyn_notch_min_hz = currentFilters.dyn_notch_min_hz;
            recommendations.filters.dyn_notch_max_hz = currentFilters.dyn_notch_max_hz;
            recommendations.filters.dyn_notch_count = currentFilters.dyn_notch_count;
            recommendations.filters.dyn_notch_q = currentFilters.dyn_notch_q;
          }
        }
      }
      
      // Генеруємо CLI команди для Betaflight
      const commands = [];
      
      // PID команди
      commands.push('# PID налаштування');
      commands.push(`set p_roll = ${recommendations.pid.roll.p}`);
      commands.push(`set i_roll = ${recommendations.pid.roll.i}`);
      commands.push(`set d_roll = ${recommendations.pid.roll.d}`);
      
      commands.push(`set p_pitch = ${recommendations.pid.pitch.p}`);
      commands.push(`set i_pitch = ${recommendations.pid.pitch.i}`);
      commands.push(`set d_pitch = ${recommendations.pid.pitch.d}`);
      
      commands.push(`set p_yaw = ${recommendations.pid.yaw.p}`);
      commands.push(`set i_yaw = ${recommendations.pid.yaw.i}`);
      commands.push(`set d_yaw = ${recommendations.pid.yaw.d}`);
      
      if (recommendations.pid.roll.f) {
        commands.push(`set f_roll = ${recommendations.pid.roll.f}`);
      }
      if (recommendations.pid.pitch.f) {
        commands.push(`set f_pitch = ${recommendations.pid.pitch.f}`);
      }
      if (recommendations.pid.yaw.f) {
        commands.push(`set f_yaw = ${recommendations.pid.yaw.f}`);
      }
      
      // Команди фільтрів
      commands.push('# Налаштування фільтрів');
      commands.push(`set gyro_lowpass_hz = ${recommendations.filters.gyro_lowpass_hz}`);
      commands.push(`set dterm_lowpass_hz = ${recommendations.filters.dterm_lowpass_hz}`);
      commands.push(`set dyn_notch_count = ${recommendations.filters.dyn_notch_count}`);
      commands.push(`set dyn_notch_q = ${recommendations.filters.dyn_notch_q}`);
      commands.push(`set dyn_notch_min_hz = ${recommendations.filters.dyn_notch_min_hz}`);
      commands.push(`set dyn_notch_max_hz = ${recommendations.filters.dyn_notch_max_hz}`);
      
      // Зберегти налаштування
      commands.push('save');
      
      recommendations.betaflightCommands = commands;
    } catch (err) {
      console.error("Помилка генерації рекомендацій:", err);
    }
    
    return recommendations;
  };

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Аналізатор Blackbox</h2>
      
      {!flightData || flightData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Завантажте лог-файл Blackbox перш ніж запускати аналіз.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Кнопка запуску аналізу */}
          <div className="mb-6">
            <button
              onClick={analyzeData}
              disabled={analyzing}
              className={`py-2 px-4 rounded-md font-medium ${
                analyzing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {analyzing ? 'Аналіз...' : 'Запустити аналіз даних'}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Аналіз може зайняти кілька секунд, залежно від обсягу даних.
            </p>
          </div>

          {/* Прогрес-бар */}
          {analyzing && (
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="mt-1 text-sm text-gray-600 text-right">
                {progress}% завершено
              </p>
            </div>
          )}

          {/* Повідомлення про помилку */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Результати аналізу */}
          {analysisResults && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Результати аналізу</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Аналіз відхилень */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Аналіз відхилень</h4>
                  {analysisResults.errorMetrics && Object.keys(analysisResults.errorMetrics).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(analysisResults.errorMetrics).map(([axis, metrics]) => (
                        <div key={axis} className="border-b pb-2">
                          <p className="font-medium text-gray-700 capitalize">{axis}</p>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                              <p className="text-sm text-gray-500">RMS відхилення:</p>
                              <p className="font-mono">{metrics.rmsError.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Макс. відхилення:</p>
                              <p className="font-mono">{metrics.maxError.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Сер. відхилення:</p>
                              <p className="font-mono">{metrics.meanError.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Станд. відхилення:</p>
                              <p className="font-mono">{metrics.stdDeviation.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Немає даних для аналізу відхилень.</p>
                  )}
                </div>

                {/* Аналіз швидкості реакції */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Аналіз швидкості реакції</h4>
                  {analysisResults.stepResponseMetrics && Object.keys(analysisResults.stepResponseMetrics).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(analysisResults.stepResponseMetrics).map(([axis, metrics]) => (
                        <div key={axis} className="border-b pb-2">
                          <p className="font-medium text-gray-700 capitalize">{axis}</p>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                              <p className="text-sm text-gray-500">Час встановлення:</p>
                              <p className="font-mono">{metrics.settlingTime.toFixed(2)} мс</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Перерегулювання:</p>
                              <p className="font-mono">{metrics.overshoot.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Час наростання:</p>
                              <p className="font-mono">{metrics.riseTime.toFixed(2)} мс</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Немає даних для аналізу швидкості реакції.</p>
                  )}
                </div>

                {/* Аналіз частотної характеристики */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Частотна характеристика</h4>
                  {analysisResults.frequencyAnalysis && Object.keys(analysisResults.frequencyAnalysis).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(analysisResults.frequencyAnalysis).map(([axis, analysis]) => (
                        <div key={axis} className="border-b pb-2">
                          <p className="font-medium text-gray-700 capitalize">{axis}</p>
                          <div className="mt-1">
                            <p className="text-sm text-gray-500">Домінуючі частоти:</p>
                            {analysis.dominantFrequencies && analysis.dominantFrequencies.length > 0 ? (
                              <ul className="list-disc list-inside pl-2 text-sm">
                                {analysis.dominantFrequencies.map((freq, idx) => (
                                  <li key={idx} className="font-mono">
                                    {freq.frequency.toFixed(1)} Гц (амплітуда: {freq.magnitude.toFixed(1)})
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-500">Не виявлено.</p>
                            )}
                            <p className="text-sm text-gray-500 mt-1">Рівень шуму:</p>
                            <p className="font-mono">{analysis.noiseLevel.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Немає даних для аналізу частотної характеристики.</p>
                  )}
                </div>

                {/* Аналіз гармонійності руху */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Аналіз гармонійності руху</h4>
                  {analysisResults.harmonicAnalysis && Object.keys(analysisResults.harmonicAnalysis).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(analysisResults.harmonicAnalysis).map(([axis, analysis]) => (
                        <div key={axis} className="border-b pb-2">
                          <p className="font-medium text-gray-700 capitalize">{axis}</p>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div>
                              <p className="text-sm text-gray-500">THD (коеф. гарм. спотворень):</p>
                              <p className="font-mono">{analysis.thd.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Оцінка стабільності:</p>
                              <p className="font-mono">{analysis.stabilityScore.toFixed(1)}/100</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-gray-500">Небажані коливання:</p>
                              <p className={`font-medium ${analysis.oscillationDetected ? 'text-red-500' : 'text-green-500'}`}>
                                {analysis.oscillationDetected ? 'Виявлено' : 'Не виявлено'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Немає даних для аналізу гармонійності руху.</p>
                  )}
                </div>
              </div>

              {/* Аналіз фільтрів */}
              <div className="bg-gray-50 p-4 rounded-lg shadow mb-6">
                <h4 className="font-medium text-lg mb-2">Аналіз фільтрів</h4>
                {analysisResults.filterAnalysis ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Гіро фільтри */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">Фільтри гіроскопа</p>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">Ефективність:</span>
                          <span className="ml-2 font-mono">{(analysisResults.filterAnalysis.gyroFilters.effectiveness * 100).toFixed(1)}%</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-gray-500">Фазова затримка:</span>
                          <span className="ml-2 font-mono">{analysisResults.filterAnalysis.gyroFilters.phaseDelay.toFixed(2)} мс</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-gray-500">Рекомендована частота:</span>
                          <span className="ml-2 font-mono">{analysisResults.filterAnalysis.gyroFilters.recommendedFrequency} Гц</span>
                        </p>
                      </div>
                    </div>

                    {/* D-term фільтри */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">D-term фільтри</p>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">Ефективність:</span>
                          <span className="ml-2 font-mono">{(analysisResults.filterAnalysis.dtermFilters.effectiveness * 100).toFixed(1)}%</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-gray-500">Фазова затримка:</span>
                          <span className="ml-2 font-mono">{analysisResults.filterAnalysis.dtermFilters.phaseDelay.toFixed(2)} мс</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-gray-500">Рекомендована частота:</span>
                          <span className="ml-2 font-mono">{analysisResults.filterAnalysis.dtermFilters.recommendedFrequency} Гц</span>
                        </p>
                      </div>
                    </div>

                    {/* Notch фільтри */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">Notch фільтри</p>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">Ефективність:</span>
                          <span className="ml-2 font-mono">{(analysisResults.filterAnalysis.notchFilters.effectiveness * 100).toFixed(1)}%</span>
                        </p>
                        <p className="text-sm text-gray-500">Виявлені частоти шуму:</p>
                        {analysisResults.filterAnalysis.notchFilters.identifiedNoiseFrequencies && 
                         analysisResults.filterAnalysis.notchFilters.identifiedNoiseFrequencies.length > 0 ? (
                          <ul className="list-disc list-inside pl-2 text-sm">
                            {analysisResults.filterAnalysis.notchFilters.identifiedNoiseFrequencies.map((noise, idx) => (
                              <li key={idx} className="font-mono">
                                {noise.frequency.toFixed(1)} Гц (амплітуда: {noise.magnitude.toFixed(1)}, ось: {noise.axis})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">Не виявлено.</p>
                        )}
                      </div>
                    </div>

                    {/* RPM фільтри */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">RPM фільтри</p>
                      <div className="mt-1 space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">Ефективність:</span>
                          <span className="ml-2 font-mono">{(analysisResults.filterAnalysis.rpmFilters.effectiveness * 100).toFixed(1)}%</span>
                        </p>
                        <p className="text-sm text-gray-500">Частоти шуму моторів:</p>
                        {analysisResults.filterAnalysis.rpmFilters.motorNoiseFrequencies && 
                         analysisResults.filterAnalysis.rpmFilters.motorNoiseFrequencies.length > 0 ? (
                          <ul className="list-disc list-inside pl-2 text-sm">
                            {analysisResults.filterAnalysis.rpmFilters.motorNoiseFrequencies.map((motor, idx) => (
                              <li key={idx} className="font-mono">
                                Мотор {motor.motorIndex + 1}: 
                                {motor.frequencies.map((freq, i) => 
                                  `${i > 0 ? ', ' : ' '}${freq.frequency.toFixed(1)} Гц`
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">Не виявлено.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Немає даних для аналізу фільтрів.</p>
                )}
              </div>
            </div>
          )}

          {/* Рекомендації */}
          {recommendations && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Рекомендації</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* PID рекомендації */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Рекомендовані PID</h4>
                  <div className="space-y-4">
                    {/* Roll */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">Roll</p>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        <div className="text-center">
                          <p className="text-sm text-gray-500">P</p>
                          <p className="font-mono">{recommendations.pid.roll.p}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">I</p>
                          <p className="font-mono">{recommendations.pid.roll.i}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">D</p>
                          <p className="font-mono">{recommendations.pid.roll.d}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">F</p>
                          <p className="font-mono">{recommendations.pid.roll.f}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Pitch */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">Pitch</p>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        <div className="text-center">
                          <p className="text-sm text-gray-500">P</p>
                          <p className="font-mono">{recommendations.pid.pitch.p}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">I</p>
                          <p className="font-mono">{recommendations.pid.pitch.i}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">D</p>
                          <p className="font-mono">{recommendations.pid.pitch.d}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">F</p>
                          <p className="font-mono">{recommendations.pid.pitch.f}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Yaw */}
                    <div className="border-b pb-2">
                      <p className="font-medium text-gray-700">Yaw</p>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        <div className="text-center">
                          <p className="text-sm text-gray-500">P</p>
                          <p className="font-mono">{recommendations.pid.yaw.p}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">I</p>
                          <p className="font-mono">{recommendations.pid.yaw.i}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">D</p>
                          <p className="font-mono">{recommendations.pid.yaw.d}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-500">F</p>
                          <p className="font-mono">{recommendations.pid.yaw.f}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Рекомендації для фільтрів */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-2">Рекомендовані фільтри</h4>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-sm text-gray-500">Gyro Lowpass:</p>
                        <p className="font-mono">{recommendations.filters.gyro_lowpass_hz} Гц</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">D-term Lowpass:</p>
                        <p className="font-mono">{recommendations.filters.dterm_lowpass_hz} Гц</p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-2 mt-2">
                      <p className="font-medium text-gray-700 mb-1">Dynamic Notch фільтри</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-sm text-gray-500">Кількість:</p>
                          <p className="font-mono">{recommendations.filters.dyn_notch_count}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Q-фактор:</p>
                          <p className="font-mono">{recommendations.filters.dyn_notch_q}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Мін. частота:</p>
                          <p className="font-mono">{recommendations.filters.dyn_notch_min_hz} Гц</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Макс. частота:</p>
                          <p className="font-mono">{recommendations.filters.dyn_notch_max_hz} Гц</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Команди CLI для Betaflight */}
              <div className="bg-gray-800 rounded-lg p-4 shadow text-white font-mono overflow-x-auto">
                <h4 className="font-medium text-lg mb-2 text-gray-200">Команди CLI для Betaflight</h4>
                <div className="whitespace-pre-wrap text-sm">
                  {recommendations.betaflightCommands.join('\n')}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(recommendations.betaflightCommands.join('\n'))
                      .then(() => alert('Команди скопійовано до буфера обміну!'))
                      .catch(err => console.error('Помилка копіювання: ', err));
                  }}
                  className="mt-3 py-1 px-3 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                >
                  Копіювати команди
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BlackboxAnalyzer;