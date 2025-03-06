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
  };

import React, { useState, useEffect } from 'react';
import useBlackboxStore from '../store/blackboxStore';
import * as FFT from 'fft.js';
import * as math from 'mathjs';
import _ from 'lodash';

// Імпортуємо нову утиліту для пошуку колонок
import { 
  findColumnName, 
  getNumericColumnValue, 
  getAxisValues, 
  getAxisColumns 
} from '../utils/blackboxColumnMapper';

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
    // Шукаємо потрібні колонки в даних з використанням нової утиліти
    const axisColumns = {
      roll: {
        setpoint: findColumnName('setpoint[0]', dataHeaders),
        actual: findColumnName('gyroADC[0]', dataHeaders),
        error: findColumnName('axisError[0]', dataHeaders),
        p: findColumnName('axisP[0]', dataHeaders),
        i: findColumnName('axisI[0]', dataHeaders),
        d: findColumnName('axisD[0]', dataHeaders),
        f: findColumnName('axisF[0]', dataHeaders),
        sum: findColumnName('axisSum[0]', dataHeaders)
      },
      pitch: {
        setpoint: findColumnName('setpoint[1]', dataHeaders),
        actual: findColumnName('gyroADC[1]', dataHeaders),
        error: findColumnName('axisError[1]', dataHeaders),
        p: findColumnName('axisP[1]', dataHeaders),
        i: findColumnName('axisI[1]', dataHeaders),
        d: findColumnName('axisD[1]', dataHeaders),
        f: findColumnName('axisF[1]', dataHeaders),
        sum: findColumnName('axisSum[1]', dataHeaders)
      },
      yaw: {
        setpoint: findColumnName('setpoint[2]', dataHeaders),
        actual: findColumnName('gyroADC[2]', dataHeaders),
        error: findColumnName('axisError[2]', dataHeaders),
        p: findColumnName('axisP[2]', dataHeaders),
        i: findColumnName('axisI[2]', dataHeaders),
        d: findColumnName('axisD[2]', dataHeaders),
        f: findColumnName('axisF[2]', dataHeaders),
        sum: findColumnName('axisSum[2]', dataHeaders)
      }
    };

    // Діагностичний лог для перевірки знайдених колонок
    console.log("Знайдені колонки для аналізу відхилень:", axisColumns);

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
          const useDirectError = columns.error && columns.error in dataHeaders;
          
          // Обробляємо дані порціями
          await processInChunks(flightData, chunkSize, (chunk) => {
            for (const row of chunk) {
              let error;
              
              if (useDirectError) {
                // Використовуємо getNumericColumnValue замість безпосереднього доступу
                error = getNumericColumnValue(row, `axisError[${axis === 'roll' ? 0 : axis === 'pitch' ? 1 : 2}]`, dataHeaders);
              } else {
                // Обчислюємо похибку як різницю між setpoint і actual
                const setpoint = getNumericColumnValue(row, columns.setpoint, dataHeaders);
                const actual = getNumericColumnValue(row, columns.actual, dataHeaders);
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
                const p = getNumericColumnValue(row, columns.p, dataHeaders);
                const i = getNumericColumnValue(row, columns.i, dataHeaders);
                const d = getNumericColumnValue(row, columns.d, dataHeaders);
                const f = columns.f ? getNumericColumnValue(row, columns.f, dataHeaders) : 0;
                const sum = columns.sum ? getNumericColumnValue(row, columns.sum, dataHeaders) : (p + i + d + f);
                
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
/**
 * Рекомендує оптимальний D-термін на основі аналізу загасання
 * замість простої залежності від перерегулювання
 */

  
  // Функція аналізу швидкості реакції системи з покращеним використанням даних
  const analyzeStepResponse = async () => {
    // Базова структура як у оригінальному методі
    const stepResponseMetrics = {
      roll: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 },
      pitch: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 },
      yaw: { settlingTime: 0, overshoot: 0, riseTime: 0, delay: 0, dampingRatio: 0, oscillationFreq: 0, decayRate: 0 }
    };
  
    // Історія відповіді для візуалізації та аналізу
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
      
      // Використовуємо функцію пошуку колонок
      const rcCommandCol = findColumnName(`rcCommand[${axisIndex}]`, dataHeaders);
      const setpointCol = findColumnName(`setpoint[${axisIndex}]`, dataHeaders);
      const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
      const pTermCol = findColumnName(`axisP[${axisIndex}]`, dataHeaders);
      const dTermCol = findColumnName(`axisD[${axisIndex}]`, dataHeaders);
      const errorCol = findColumnName(`axisError[${axisIndex}]`, dataHeaders);
      
      // Перевіряємо чи існують необхідні колонки
      const columnsExist = setpointCol && gyroCol && (rcCommandCol || errorCol);
      
      if (columnsExist) {
        try {
          // Знаходимо значні зміни команд
          const stepChanges = [];
          const threshold = 30; // Поріг для виявлення різкої зміни
          
          // Буфер для відстеження попередніх значень
          let prevSetpoint = null;
          
          // Проходимо дані для виявлення різких змін
          await processInChunks(flightData, chunkSize, (chunk, chunkIndex, startIndex) => {
            for (let i = 0; i < chunk.length; i++) {
              const row = chunk[i];
              const globalIndex = startIndex + i;
              
              // Використовуємо getNumericColumnValue для отримання значень
              const currentTime = getNumericColumnValue(row, 'time', dataHeaders) || (globalIndex * sampleTimeMs * 1000);
              const currentSetpoint = getNumericColumnValue(row, setpointCol, dataHeaders);
              const currentGyro = getNumericColumnValue(row, gyroCol, dataHeaders);
              
              // Якщо це не перший запис і є суттєва зміна у setpoint
              if (prevSetpoint !== null && Math.abs(currentSetpoint - prevSetpoint) > threshold) {
                // Знайдена різка зміна
                const startIndex = globalIndex;
                const startTime = currentTime;
                const targetValue = currentSetpoint;
                const startGyro = currentGyro;
                
                // Збираємо реакцію системи (до 200 точок після зміни для кращого аналізу загасання)
                const response = [];
                
                for (let j = 0; j < 200 && (globalIndex + j) < flightData.length; j++) {
                  if (globalIndex + j >= flightData.length) break;
                  
                  // Якщо не вийшли за межі поточної порції
                  if (i + j < chunk.length) {
                    const responseRow = chunk[i + j];
                    const time = getNumericColumnValue(responseRow, 'time', dataHeaders);
                    const gyroValue = getNumericColumnValue(responseRow, gyroCol, dataHeaders);
                    const dTerm = dTermCol ? getNumericColumnValue(responseRow, dTermCol, dataHeaders) : null;
                    response.push({ 
                      time: (time - startTime) / 1000, // час в мс
                      value: gyroValue,
                      dTerm
                    });
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
                if (response.length >= 50) {
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
              
              // Оновлюємо попереднє значення
              prevSetpoint = currentSetpoint;
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
              // ----- ПОКРАЩЕНИЙ АНАЛІЗ ЗАГАСАННЯ -----
              
              // Знаходимо піки і западини для аналізу загасання
              const peaks = [];
              const valleys = [];
              
              // Перші 5 мс пропускаємо для уникнення шуму в початковій фазі
              let startAnalysisIdx = 0;
              while (startAnalysisIdx < response.length && response[startAnalysisIdx].time < 5) {
                startAnalysisIdx++;
              }
              
              // Знаходимо піки і западини
              for (let i = startAnalysisIdx + 1; i < response.length - 1; i++) {
                const prev = response[i-1].value;
                const curr = response[i].value;
                const next = response[i+1].value;
                
                // Виявляємо локальні максимуми (піки)
                if (curr > prev && curr > next) {
                  peaks.push({
                    index: i,
                    time: response[i].time,
                    value: curr
                  });
                }
                
                // Виявляємо локальні мінімуми (западини)
                if (curr < prev && curr < next) {
                  valleys.push({
                    index: i,
                    time: response[i].time,
                    value: curr
                  });
                }
              }
              
              // Обчислюємо логарифмічний декремент загасання, якщо є достатньо піків
              let dampingRatio = 0;
              let oscillationFreq = 0;
              let decayRate = 0;
              
              if (peaks.length >= 2) {
                // Обчислюємо співвідношення амплітуд послідовних піків
                const amplitudeRatios = [];
                for (let i = 0; i < peaks.length - 1; i++) {
                  const currentPeakAmp = Math.abs(peaks[i].value - targetValue);
                  const nextPeakAmp = Math.abs(peaks[i+1].value - targetValue);
                  
                  if (nextPeakAmp > 0) {
                    amplitudeRatios.push(currentPeakAmp / nextPeakAmp);
                  }
                }
                
                // Обчислюємо середнє співвідношення амплітуд
                if (amplitudeRatios.length > 0) {
                  const avgAmplitudeRatio = amplitudeRatios.reduce((sum, ratio) => sum + ratio, 0) / amplitudeRatios.length;
                  
                  // Логарифмічний декремент загасання
                  const logDecrement = Math.log(avgAmplitudeRatio);
                  
                  // Коефіцієнт загасання (damping ratio)
                  dampingRatio = logDecrement / (2 * Math.PI * Math.sqrt(1 + (logDecrement / (2 * Math.PI)) ** 2));
                  
                  // Коефіцієнт спаду (швидкість загасання)
                  decayRate = logDecrement * 100; // у відсотках на період
                }
                
                // Обчислюємо частоту коливань
                if (peaks.length >= 2) {
                  const periods = [];
                  for (let i = 0; i < peaks.length - 1; i++) {
                    periods.push(peaks[i+1].time - peaks[i].time);
                  }
                  
                  const avgPeriod = periods.reduce((sum, period) => sum + period, 0) / periods.length;
                  oscillationFreq = avgPeriod > 0 ? 1000 / avgPeriod : 0; // Частота в Гц
                }
              }
              
              // Стандартні метрики step response
              // Значення стабілізації (95% від цільового)
              const settlingThreshold = 0.05 * Math.abs(actualRange);
              
              // Час стабілізації
              let settlingTime = 0;
              for (let i = 0; i < response.length; i++) {
                if (Math.abs(response[i].value - targetValue) <= settlingThreshold) {
                  // Перевіряємо, чи значення залишається стабільним
                  let stable = true;
                  for (let j = i; j < Math.min(i + 10, response.length); j++) {
                    if (Math.abs(response[j].value - targetValue) > settlingThreshold) {
                      stable = false;
                      break;
                    }
                  }
                  
                  if (stable) {
                    settlingTime = response[i].time;
                    break;
                  }
                }
              }
              
              // Перерегулювання
              let maxValue = startGyro;
              let maxIndex = 0;
              
              for (let i = 0; i < response.length; i++) {
                if (Math.abs(response[i].value - startGyro) > Math.abs(maxValue - startGyro)) {
                  maxValue = response[i].value;
                  maxIndex = i;
                }
              }
              
              const overshoot = actualRange !== 0 ? 
                ((maxValue - targetValue) / actualRange) * 100 : 0;
              
              // Час наростання (10% - 90%)
              const riseStartThreshold = startGyro + 0.1 * actualRange;
              const riseEndThreshold = startGyro + 0.9 * actualRange;
              
              let riseStartTime = 0;
              let riseEndTime = 0;
              let riseStartFound = false;
              let riseEndFound = false;
              
              for (let i = 0; i < response.length; i++) {
                // Для позитивного діапазону
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
                // Для негативного діапазону
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
                riseEndTime - riseStartTime : settlingTime * 0.6;
              
              // Затримка
              const delay = riseStartFound ? riseStartTime : 0;
              
              // Оновлюємо метрики з додатковою інформацією про загасання
              stepResponseMetrics[axis] = {
                settlingTime,
                overshoot,
                riseTime,
                delay,
                dampingRatio,
                oscillationFreq,
                decayRate,
                peaks,
                valleys
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
  
  /**
   * Рекомендує оптимальний D-термін на основі аналізу загасання
   * замість простої залежності від перерегулювання
   */
  const recommendDTerm = (axis, currentDTerm, stepResponse) => {
    // Якщо немає даних аналізу, повертаємо поточне значення
    if (!stepResponse) return currentDTerm;
    
    const { overshoot, dampingRatio, oscillationFreq, decayRate } = stepResponse;
    
    // Оптимальний коефіцієнт загасання для квадрокоптера - близько 0.6-0.7
    // (компроміс між швидкістю відгуку та стабільністю)
    const optimalDampingRatio = 0.65;
    
    // Фактори коригування D-терміну
    let dCorrection = 1.0; // За замовчуванням без змін
    
    // 1. Корекція на основі коефіцієнта загасання
    if (dampingRatio > 0) {
      if (dampingRatio < optimalDampingRatio - 0.15) {
        // Недостатнє згасання: збільшуємо D
        dCorrection *= 1.15 + (0.05 * ((optimalDampingRatio - dampingRatio) / 0.15));
      } else if (dampingRatio > optimalDampingRatio + 0.15) {
        // Надмірне загасання: зменшуємо D
        dCorrection *= 0.9 - (0.05 * ((dampingRatio - optimalDampingRatio) / 0.15));
      }
    }
    
    // 2. Корекція на основі швидкості спаду амплітуди
    if (decayRate > 0) {
      const optimalDecayRate = 50; // Ідеальне значення швидкості спаду (%)
      
      if (decayRate < optimalDecayRate * 0.7) {
        // Занадто повільне загасання: збільшуємо D
        dCorrection *= 1.1;
      } else if (decayRate > optimalDecayRate * 1.5) {
        // Занадто швидке загасання: зменшуємо D
        dCorrection *= 0.95;
      }
    }
    
    // 3. Корекція на основі перерегулювання (з меншою вагою)
    if (overshoot > 25) {
      dCorrection *= 1.05;
    } else if (overshoot < 5) {
      dCorrection *= 0.95;
    }
    
    // 4. Корекція на основі частоти коливань
    if (oscillationFreq > 0) {
      if (oscillationFreq > 30) {
        // Високочастотні коливання можуть потребувати нижчого D
        dCorrection *= 0.95;
      }
    }
    
    // Обмеження максимальної зміни D для уникнення різких перепадів
    dCorrection = Math.max(0.8, Math.min(dCorrection, 1.3));
    
    // Застосовуємо корекцію з округленням
    const newDTerm = Math.round(currentDTerm * dCorrection);
    
    return newDTerm;
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
      
      // Використовуємо нову функцію пошуку колонок
      const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
      const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
      
      // Діагностичний лог
      console.log(`Колонки для аналізу частотної характеристики осі ${axis}:`, {
        gyro: gyroCol,
        gyroUnfilt: gyroUnfiltCol
      });
      
      // Перевіряємо наявність колонок
      const hasFiltered = gyroCol !== null;
      const hasUnfiltered = gyroUnfiltCol !== null;
      
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
                // Використовуємо getNumericColumnValue замість прямого доступу
                const value = getNumericColumnValue(row, gyroCol, dataHeaders);
                if (!isNaN(value)) {
                  gyroData[dataCollected] = value;
                  
                  // Якщо доступні нефільтровані дані, також їх зберігаємо
                  if (hasUnfiltered) {
                    const unfiltValue = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
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
      yaw: { thd: 0, stabilityScore: 0, oscillationDetected: false, pidHarmonics: {} },
      // Додаємо секцію для аналізу взаємодії між осями
      axisInteractions: {
        roll_pitch: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
        roll_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 },
        pitch_yaw: { correlation: 0, phaseRelation: 0, couplingStrength: 0 }
      },
      // Спільні гармоніки - коли одна й та сама частота з'являється на кількох осях
      commonHarmonics: []
    };
  
    // Орієнтовна частота запису даних
    const looptimeUs = parseFloat(metadata.looptime) || 312;
    const sampleRate = Math.round(1000000 / looptimeUs);
  
    // Збираємо дані гіроскопа для всіх осей
    const gyroData = {
      roll: [],
      pitch: [],
      yaw: []
    };
    
    // Розмір FFT для гармонічного аналізу
    const fftSize = 1024;
    const chunkSize = 2000;
    const collectSize = Math.min(flightData.length, fftSize * 2);
    
    // Збираємо дані по всіх осях
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
      
      if (gyroCol) {
        const axisData = [];
        
        await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
          for (const row of chunk) {
            const value = getNumericColumnValue(row, gyroCol, dataHeaders);
            axisData.push(value);
            if (axisData.length >= fftSize) break;
          }
        });
        
        gyroData[axis] = axisData.slice(0, fftSize);
      }
    }
    
    // Аналіз гармонік для кожної осі окремо (базовий аналіз)
    const axisSpectrums = {};
    const axisDominantFreqs = {};
    
    for (const axis of ['roll', 'pitch', 'yaw']) {
      if (gyroData[axis].length > 0) {
        // Вікно Ханна для зменшення витоку спектру
        const windowedData = applyHannWindow(gyroData[axis]);
        
        // Проводимо FFT аналіз
        const { spectrum, dominantFrequencies } = performFFTAnalysis(
          windowedData, sampleRate, fftSize
        );
        
        axisSpectrums[axis] = spectrum;
        axisDominantFreqs[axis] = dominantFrequencies;
        
        // Базовий THD аналіз, як у оригінальній функції
        const { thd, stabilityScore, oscillationDetected } = calculateTHD(spectrum, dominantFrequencies);
        
        harmonicAnalysis[axis] = {
          thd,
          stabilityScore,
          oscillationDetected,
          dominantFrequencies
        };
      }
    }
    
    // ----- АНАЛІЗ ВЗАЄМОДІЇ МІЖ ОСЯМИ -----
    
    // 1. Крос-кореляційний аналіз між осями у часовому домені
    const axesPairs = [
      ['roll', 'pitch'],
      ['roll', 'yaw'],
      ['pitch', 'yaw']
    ];
    
    for (const [axis1, axis2] of axesPairs) {
      const key = `${axis1}_${axis2}`;
      
      if (gyroData[axis1].length > 0 && gyroData[axis2].length > 0) {
        // Обчислюємо нормалізовану крос-кореляцію
        const correlation = calculateNormalizedCrossCorrelation(
          gyroData[axis1], gyroData[axis2]
        );
        
        // Обчислюємо фазові відносини між осями
        const phaseRelation = calculatePhaseRelation(
          axisSpectrums[axis1], axisSpectrums[axis2], axisDominantFreqs[axis1], axisDominantFreqs[axis2]
        );
        
        // Оцінюємо силу зв'язку між осями (механічне з'єднання)
        const couplingStrength = calculateCouplingStrength(
          axisDominantFreqs[axis1], axisDominantFreqs[axis2], correlation, phaseRelation
        );
        
        harmonicAnalysis.axisInteractions[key] = {
          correlation,
          phaseRelation,
          couplingStrength
        };
      }
    }
    
    // 2. Знаходимо спільні гармоніки, які проявляються на кількох осях
    const commonFreqs = findCommonFrequencies(
      axisDominantFreqs.roll, 
      axisDominantFreqs.pitch, 
      axisDominantFreqs.yaw
    );
    
    harmonicAnalysis.commonHarmonics = commonFreqs;
    
    // 3. Аналіз поширення коливань між осями
    if (commonFreqs.length > 0) {
      const propagationAnalysis = analyzeOscillationPropagation(
        gyroData, commonFreqs, sampleRate
      );
      
      harmonicAnalysis.oscillationPropagation = propagationAnalysis;
    }
    
    return { harmonicAnalysis };
  };
  
  /**
   * Застосовує вікно Ханна до даних
   */
  const applyHannWindow = (data) => {
    const windowedData = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // Вікно Ханна: 0.5 * (1 - cos(2π*n/(N-1)))
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (data.length - 1)));
      windowedData[i] = data[i] * window;
    }
    return windowedData;
  };
  
  /**
   * Виконує FFT аналіз та знаходить домінантні частоти
   */
  const performFFTAnalysis = (windowedData, sampleRate, fftSize) => {
    // Налаштовуємо FFT
    const fft = new FFT(fftSize);
    const out = new Array(fftSize * 2);
    
    // Копіюємо дані до комплексного масиву
    const complexData = new Array(fftSize * 2).fill(0);
    for (let i = 0; i < fftSize; i++) {
      complexData[i * 2] = windowedData[i]; // Real part
      complexData[i * 2 + 1] = 0;           // Imaginary part
    }
    
    // Запускаємо FFT
    fft.transform(out, complexData);
    
    // Обчислюємо спектр
    const spectrum = [];
    for (let i = 0; i < fftSize / 2; i++) {
      const real = out[i * 2];
      const imag = out[i * 2 + 1];
      const frequency = i * (sampleRate / fftSize);
      const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
      const phase = Math.atan2(imag, real);
      
      spectrum.push({ frequency, magnitude, phase });
    }
    
    // Знаходимо домінуючі частоти (локальні максимуми)
    const dominantFrequencies = [];
    for (let i = 1; i < spectrum.length - 1; i++) {
      if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
          spectrum[i].magnitude > spectrum[i+1].magnitude &&
          spectrum[i].magnitude > 0.01) {
        dominantFrequencies.push({
          frequency: spectrum[i].frequency,
          magnitude: spectrum[i].magnitude,
          phase: spectrum[i].phase
        });
      }
    }
    
    // Сортуємо за магнітудою і беремо топ-10
    dominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
    
    return {
      spectrum,
      dominantFrequencies: dominantFrequencies.slice(0, 10)
    };
  };
  
  /**
   * Обчислює нормалізовану крос-кореляцію між двома сигналами
   */
  const calculateNormalizedCrossCorrelation = (signal1, signal2) => {
    // Нормалізуємо сигнали
    const mean1 = signal1.reduce((sum, val) => sum + val, 0) / signal1.length;
    const mean2 = signal2.reduce((sum, val) => sum + val, 0) / signal2.length;
    
    const normalized1 = signal1.map(val => val - mean1);
    const normalized2 = signal2.map(val => val - mean2);
    
    // Обчислюємо стандартні відхилення
    const std1 = Math.sqrt(normalized1.reduce((sum, val) => sum + val * val, 0) / normalized1.length);
    const std2 = Math.sqrt(normalized2.reduce((sum, val) => sum + val * val, 0) / normalized2.length);
    
    // Крос-кореляція при нульовому зсуві
    let correlation = 0;
    for (let i = 0; i < normalized1.length; i++) {
      correlation += (normalized1[i] / std1) * (normalized2[i] / std2);
    }
    
    correlation /= normalized1.length;
    
    return correlation;
  };
  
  /**
   * Обчислює фазові відносини між домінантними частотами двох осей
   */
  const calculatePhaseRelation = (spectrum1, spectrum2, dominantFreqs1, dominantFreqs2) => {
    // Шукаємо спільні частоти між осями
    const commonFreqs = [];
    
    for (const freq1 of dominantFreqs1) {
      for (const freq2 of dominantFreqs2) {
        // Якщо частоти досить близькі (в межах 5%)
        if (Math.abs(freq1.frequency - freq2.frequency) / freq1.frequency < 0.05) {
          // Обчислюємо фазову різницю
          let phaseDiff = freq1.phase - freq2.phase;
          
          // Нормалізуємо до діапазону [-π, π]
          while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
          while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
          
          commonFreqs.push({
            frequency: (freq1.frequency + freq2.frequency) / 2,
            phaseDiff,
            magnitude1: freq1.magnitude,
            magnitude2: freq2.magnitude
          });
        }
      }
    }
    
    // Обчислюємо зважену середню фазову різницю
    if (commonFreqs.length > 0) {
      let totalWeight = 0;
      let weightedPhaseDiff = 0;
      
      for (const freq of commonFreqs) {
        // Вага залежить від амплітуди обох сигналів
        const weight = freq.magnitude1 * freq.magnitude2;
        weightedPhaseDiff += freq.phaseDiff * weight;
        totalWeight += weight;
      }
      
      return totalWeight > 0 ? weightedPhaseDiff / totalWeight : 0;
    }
    
    return 0; // Немає спільних частот
  };
  
  // Функція аналізу фільтрів з покращеним використанням даних
  /**
 * Покращений аналіз фільтрів з адаптивними Q-факторами для notch-фільтрів
 */
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
        identifiedNoiseFrequencies: [],
        classifiedNoises: [], // Додаємо класифіковані шуми
        recommendedQFactors: {} // Додаємо рекомендовані Q-фактори
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
      const hasUnfilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
        const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
        return findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders) !== null;
      });
      
      const hasFilteredGyro = ['roll', 'pitch', 'yaw'].some(axis => {
        const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
        return findColumnName(`gyroADC[${axisIndex}]`, dataHeaders) !== null;
      });
      
      // Діагностичний лог
      console.log(`Наявність даних гіроскопа: filtered=${hasFilteredGyro}, unfiltered=${hasUnfilteredGyro}`);
      
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
              x: getNumericColumnValue(row, 'gyroUnfilt[0]', dataHeaders),
              y: getNumericColumnValue(row, 'gyroUnfilt[1]', dataHeaders),
              z: getNumericColumnValue(row, 'gyroUnfilt[2]', dataHeaders)
            };
            
            const filteredData = {
              x: getNumericColumnValue(row, 'gyroADC[0]', dataHeaders),
              y: getNumericColumnValue(row, 'gyroADC[1]', dataHeaders),
              z: getNumericColumnValue(row, 'gyroADC[2]', dataHeaders)
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
        const hasERPM = dataHeaders.some(h => findColumnName('eRPM[0]', dataHeaders) !== null);
        const hasMotor = dataHeaders.some(h => findColumnName('motor[0]', dataHeaders) !== null);
        
        if (hasERPM && hasMotor) {
          // Збираємо дані моторів та їх обертів
          const motorData = [];
          const eRpmData = [];
          
          for (let motorIdx = 0; motorIdx < 4; motorIdx++) {
            const motorCol = findColumnName(`motor[${motorIdx}]`, dataHeaders);
            const eRpmCol = findColumnName(`eRPM[${motorIdx}]`, dataHeaders);
            
            if (motorCol && eRpmCol) {
              const motorValues = [];
              const eRpmValues = [];
              
              // Збираємо дані порційно
              await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                for (const row of chunk) {
                  const motorValue = getNumericColumnValue(row, motorCol, dataHeaders);
                  const eRpmValue = getNumericColumnValue(row, eRpmCol, dataHeaders);
                  
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
          for (const axis of ['roll', 'pitch', 'yaw']) {
            const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
            const gyroUnfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
            
            if (gyroUnfiltCol) {
              try {
                const fftSize = 1024;
                const gyroData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const value = getNumericColumnValue(row, gyroUnfiltCol, dataHeaders);
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
                  const freqSpectrum = [];
                  for (let i = 0; i < fftSize / 2; i++) {
                    const freq = i * (sampleRate / fftSize);
                    const real = out[i * 2];
                    const imag = out[i * 2 + 1];
                    const magnitude = Math.sqrt(real * real + imag * imag) / (fftSize/2);
                    freqSpectrum.push({ frequency: freq, magnitude });
                  }
                  
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
                          // Додаємо цей пік шуму до списку
                          const noiseData = {
                            frequency: freq,
                            magnitude,
                            axis,
                            freqSpectrum // Додаємо весь спектр для аналізу ширини шуму
                          };
                          
                          identifiedNoiseFrequencies.push(noiseData);
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
              const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
              
              try {
                const fftSizeSmall = 256; // Менший розмір для швидшого обчислення
                
                // Отримуємо назви колонок
                const unfiltCol = findColumnName(`gyroUnfilt[${axisIndex}]`, dataHeaders);
                const filtCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
                
                // Нефільтровані дані
                const rawData = [];
                // Фільтровані дані
                const filteredData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const rawValue = getNumericColumnValue(row, unfiltCol, dataHeaders);
                    const filteredValue = getNumericColumnValue(row, filtCol, dataHeaders);
                    
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
          
          // Класифікуємо шуми на основі їх характеристик
          const classifiedNoises = identifiedNoiseFrequencies.map(noise => {
            try {
              // Ширина шуму - знаходимо напівширину на висоті 70.7% від максимуму (-3dB)
              const noiseWidth = determineNoiseWidth(noise);
              
              // Стабільність частоти - оцінюємо наскільки стабільна частота у часі
              const frequencyStability = determineFrequencyStability(noise, filterAnalysis.rpmFilters);
              
              // Клас шуму та рекомендований Q-фактор
              let noiseClass;
              let recommendedQ;
              
              if (noiseWidth < 5 && frequencyStability > 0.8) {
                // Вузькосмуговий стабільний шум (типово від моторів)
                noiseClass = 'narrowband_stable';
                recommendedQ = 500; // Високий Q-фактор для вузького notch
              } else if (noiseWidth < 10 && frequencyStability > 0.6) {
                // Середній стабільний шум
                noiseClass = 'mediumband_stable';
                recommendedQ = 300; // Середній Q-фактор
              } else if (noiseWidth > 20 || frequencyStability < 0.4) {
                // Широкосмуговий або нестабільний шум
                noiseClass = 'wideband_or_unstable';
                recommendedQ = 120; // Низький Q-фактор для широкого notch
              } else {
                // Стандартний варіант
                noiseClass = 'standard';
                recommendedQ = 250;
              }
              
              return {
                ...noise,
                noiseWidth,
                frequencyStability,
                noiseClass,
                recommendedQ
              };
            } catch (error) {
              console.error("Помилка класифікації шуму:", error);
              return {
                ...noise,
                noiseWidth: 10,
                frequencyStability: 0.5,
                noiseClass: 'standard',
                recommendedQ: 250
              };
            }
          });
          
          // Оновлюємо аналіз з класифікованими шумами
          filterAnalysis.notchFilters = {
            effectiveness: notchEffectiveness,
            identifiedNoiseFrequencies: identifiedNoiseFrequencies.slice(0, 5),
            classifiedNoises: classifiedNoises
          };
          
          // Обчислюємо середній рекомендований Q-фактор
          if (classifiedNoises.length > 0) {
            const avgRecommendedQ = classifiedNoises.reduce((sum, noise) => sum + noise.recommendedQ, 0) / 
                                  classifiedNoises.length;
            
            filterAnalysis.notchFilters.recommendedQFactors = {
              average: Math.round(avgRecommendedQ),
              perNoiseType: {
                narrowband_stable: 500,
                mediumband_stable: 300,
                standard: 250,
                wideband_or_unstable: 120
              }
            };
          }
        }
        
        // Аналіз D-term фільтрів
        // В даному випадку робимо спрощений аналіз через відсутність прямого доступу до D-term сигналів
        const dTermCol = findColumnName('axisD[0]', dataHeaders) || 
                        findColumnName('axisD[1]', dataHeaders) || 
                        findColumnName('axisD[2]', dataHeaders);
        
        if (dtermLowpassHz > 0) {
          const phaseDelay = 1000 / (2 * Math.PI * dtermLowpassHz);
          
          if (dTermCol) {
            // Спробуємо проаналізувати D-term сигнали безпосередньо
            const dTermData = [];
            
            // Збираємо D-term дані для всіх осей
            for (let axisIdx = 0; axisIdx < 3; axisIdx++) {
              const dTermAxisCol = findColumnName(`axisD[${axisIdx}]`, dataHeaders);
              
              if (dTermAxisCol) {
                const axisData = [];
                
                // Збираємо дані порційно
                await processInChunks(flightData.slice(0, collectSize), chunkSize, (chunk) => {
                  for (const row of chunk) {
                    const value = getNumericColumnValue(row, dTermAxisCol, dataHeaders);
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
  
  /**
   * Визначає ширину шуму за спектром частот
   */
  const determineNoiseWidth = (noise) => {
    // Пошук спектральної ширини шуму на рівні -3dB (70.7% від максимуму)
    const peakMagnitude = noise.magnitude;
    const thresholdMagnitude = peakMagnitude * 0.707;
    const freqSpectrum = noise.freqSpectrum || [];
    
    // Якщо спектр не доступний, повертаємо значення за замовчуванням
    if (!freqSpectrum.length) return 10;
    
    // Знаходимо індекс частоти шуму у спектрі
    const peakIdx = freqSpectrum.findIndex(point => Math.abs(point.frequency - noise.frequency) < 1);
    
    if (peakIdx === -1) return 10; // За замовчуванням, якщо пік не знайдено
    
    // Пошук лівої границі
    let leftIdx = -1;
    for (let i = peakIdx - 1; i >= 0; i--) {
      if (freqSpectrum[i].magnitude < thresholdMagnitude) {
        leftIdx = i;
        break;
      }
    }
    
    // Пошук правої границі
    let rightIdx = -1;
    for (let i = peakIdx + 1; i < freqSpectrum.length; i++) {
      if (freqSpectrum[i].magnitude < thresholdMagnitude) {
        rightIdx = i;
        break;
      }
    }
    
    // Обчислюємо ширину в Гц
    if (leftIdx !== -1 && rightIdx !== -1) {
      return freqSpectrum[rightIdx].frequency - freqSpectrum[leftIdx].frequency;
    } else {
      // Якщо не знайдено границі, використовуємо емпіричну оцінку
      return 10; // Середнє значення за замовчуванням
    }
  };
  
  /**
   * Оцінює стабільність частоти шуму в часі
   */
  const determineFrequencyStability = (noise, rpmFilters) => {
    // Оцінка стабільності частоти залежить від зміни частоти у часі
    // Для RPM-залежних шумів стабільність буде нижчою
    
    // Якщо частота близька до гармонік RPM
    const isRpmRelated = rpmFilters && rpmFilters.detectedHarmonics 
      ? rpmFilters.detectedHarmonics.some(h => Math.abs(h.frequency - noise.frequency) < 5)
      : false;
    
    if (isRpmRelated) {
      // RPM-залежні шуми мають нижчу стабільність, особливо при маневрах
      return 0.4; // Нижча стабільність для RPM-залежних шумів
    }
    
    // Перевіряємо близькість до механічних резонансів рами
    // (зазвичай 80-150 Гц для більшості рам)
    if (noise.frequency > 80 && noise.frequency < 150) {
      // Резонанси рами відносно стабільні
      return 0.7;
    }
    
    // Вищі частоти часто більш стабільні (можуть бути від статичних джерел шуму)
    if (noise.frequency > 200) {
      return 0.8;
    }
    
    // За замовчуванням - середня стабільність
    return 0.6;
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
        motor.frequencies?.map(f => f.frequency) || []
      );
      
      // Аналізуємо, наскільки ці частоти фільтруються в гіроскопі
      const fftSize = 512;
      let totalReduction = 0;
      let validFreqCount = 0;
      
      for (const axis of ['x', 'y', 'z']) {
        // Нефільтровані дані
        const rawData = gyroDataRaw.map(d => d[axis]).slice(0, fftSize);
        // Доповнюємо нулями
        const paddedRawData = [...rawData, ...Array(fftSize - rawData.length).fill(0)];
        
        // Фільтровані дані
        const filteredData = gyroDataFiltered.map(d => d[axis]).slice(0, fftSize);
        // Доповнюємо нулями
        const paddedFilteredData = [...filteredData, ...Array(fftSize - filteredData.length).fill(0)];
        
        // FFT для сирих даних
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
        dyn_notch_max_hz: 0,
        // Додаємо можливість різних Q-факторів
        dynamic_notch_q_factors: []
      },
      betaflightCommands: [],
      // Додаємо детальні пояснення для рекомендацій
      explanations: {
        pid: {},
        filters: {},
        interactions: {}
      }
    };
    
    try {
      // Отримуємо поточні налаштування PID з метаданих
      const currentPid = {
        roll: { p: 0, i: 0, d: 0, f: 0 },
        pitch: { p: 0, i: 0, d: 0, f: 0 },
        yaw: { p: 0, i: 0, d: 0, f: 0 }
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
      
      // 1. Базовий аналіз відхилень і рекомендації для PID
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
            
            // Додаємо пояснення
            recommendations.explanations.pid[`${axis}_p`] = 
              `P термін ${recommendations.pid[axis].p > currentPid[axis].p ? 'збільшено' : 'зменшено'} на основі ` +
              `RMS-відхилення (${rmsError.toFixed(2)}).`;
            
            // Рекомендації для I-терму
            if (meanError > 10) {
              // Якщо середнє відхилення велике, збільшуємо I
              recommendations.pid[axis].i = Math.round(currentPid[axis].i * 1.15);
            } else {
              // Залишаємо без змін
              recommendations.pid[axis].i = currentPid[axis].i;
            }
            
            // Додаємо пояснення
            if (meanError > 10) {
              recommendations.explanations.pid[`${axis}_i`] = 
                `I термін збільшено через високе середнє відхилення (${meanError.toFixed(2)}).`;
            }
            
            // Рекомендації для F-терміну
            recommendations.pid[axis].f = currentPid[axis].f;
          }
        }
      }
      
      // 2. Рекомендації для D-терміну на основі аналізу загасання
      if (analysisResults.stepResponseMetrics) {
        for (const axis of ['roll', 'pitch', 'yaw']) {
          if (analysisResults.stepResponseMetrics[axis]) {
            const stepResponse = analysisResults.stepResponseMetrics[axis];
            const { overshoot, settlingTime, riseTime, dampingRatio, oscillationFreq, decayRate } = stepResponse;
            
            // Оптимальний коефіцієнт загасання для квадрокоптера - близько 0.6-0.7
            const optimalDampingRatio = 0.65;
            
            // Фактори коригування D-терміну
            let dCorrection = 1.0; // За замовчуванням без змін
            
            // 1. Корекція на основі коефіцієнта загасання
            if (dampingRatio > 0) {
              if (dampingRatio < optimalDampingRatio - 0.15) {
                // Недостатнє згасання: збільшуємо D
                dCorrection *= 1.15 + (0.05 * ((optimalDampingRatio - dampingRatio) / 0.15));
                
                recommendations.explanations.pid[`${axis}_d_damping`] = 
                  `D термін збільшено через недостатнє демпфування (${dampingRatio.toFixed(2)}).`;
              } else if (dampingRatio > optimalDampingRatio + 0.15) {
                // Надмірне загасання: зменшуємо D
                dCorrection *= 0.9 - (0.05 * ((dampingRatio - optimalDampingRatio) / 0.15));
                
                recommendations.explanations.pid[`${axis}_d_damping`] = 
                  `D термін зменшено через надмірне демпфування (${dampingRatio.toFixed(2)}).`;
              }
            }
            
            // 2. Корекція на основі швидкості спаду амплітуди
            if (decayRate > 0) {
              const optimalDecayRate = 50; // Ідеальне значення швидкості спаду (%)
              
              if (decayRate < optimalDecayRate * 0.7) {
                // Занадто повільне загасання: збільшуємо D
                dCorrection *= 1.1;
                
                recommendations.explanations.pid[`${axis}_d_decay`] = 
                  `D термін збільшено через повільне загасання коливань (${decayRate.toFixed(1)}%/період).`;
              } else if (decayRate > optimalDecayRate * 1.5) {
                // Занадто швидке загасання: зменшуємо D
                dCorrection *= 0.95;
                
                recommendations.explanations.pid[`${axis}_d_decay`] = 
                  `D термін зменшено через занадто швидке загасання (${decayRate.toFixed(1)}%/період).`;
              }
            }
            
            // 3. Корекція на основі перерегулювання (з меншою вагою)
            if (overshoot > 25) {
              dCorrection *= 1.05;
              
              recommendations.explanations.pid[`${axis}_d_overshoot`] = 
                `D термін збільшено через високе перерегулювання (${overshoot.toFixed(1)}%).`;
            } else if (overshoot < 5) {
              dCorrection *= 0.95;
              
              recommendations.explanations.pid[`${axis}_d_overshoot`] = 
                `D термін зменшено через низьке перерегулювання (${overshoot.toFixed(1)}%).`;
            }
            
            // 4. Корекція на основі частоти коливань
            if (oscillationFreq > 0) {
              if (oscillationFreq > 30) {
                // Високочастотні коливання можуть потребувати нижчого D
                dCorrection *= 0.95;
                
                recommendations.explanations.pid[`${axis}_d_freq`] = 
                  `D термін зменшено через високочастотні коливання (${oscillationFreq.toFixed(1)} Гц).`;
              }
            }
            
            // Обмеження максимальної зміни D для уникнення різких перепадів
            dCorrection = Math.max(0.8, Math.min(dCorrection, 1.3));
            
            // Застосовуємо корекцію з округленням
            recommendations.pid[axis].d = Math.round(currentPid[axis].d * dCorrection);
            
            // Загальне пояснення
            recommendations.explanations.pid[`${axis}_d_summary`] = 
              `D термін ${recommendations.pid[axis].d > currentPid[axis].d ? 'збільшено' : 'зменшено'} до ${recommendations.pid[axis].d} ` +
              `(було ${currentPid[axis].d}) на основі аналізу загасання коливань: ` +
              `демпфування=${dampingRatio ? dampingRatio.toFixed(2) : 'н/д'}, ` +
              `швидкість загасання=${decayRate ? decayRate.toFixed(1) : 'н/д'}%/період, ` +
              `частота=${oscillationFreq ? oscillationFreq.toFixed(1) : 'н/д'} Гц`;
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
              const currentP = recommendations.pid[axis].p;
              const currentD = recommendations.pid[axis].d;
              
              recommendations.pid[axis].p = Math.round(currentP * 0.92);
              recommendations.pid[axis].d = Math.round(currentD * 0.92);
              
              recommendations.explanations.pid[`${axis}_oscillation`] = 
                `P і D терміни зменшено через виявлені небажані коливання (THD=${thd.toFixed(1)}%).`;
            }
            
            // Додаткова корекція на основі THD
            if (thd > 40) {
              // Високий THD вказує на нелінійність, зменшуємо P
              const currentP = recommendations.pid[axis].p;
              recommendations.pid[axis].p = Math.round(currentP * 0.95);
              
              recommendations.explanations.pid[`${axis}_thd`] = 
                `P термін зменшено через високі гармонічні спотворення (THD=${thd.toFixed(1)}%).`;
            }
          }
        }
        
        // Аналіз взаємодії між осями
        if (analysisResults.harmonicAnalysis.axisInteractions) {
          const interactions = analysisResults.harmonicAnalysis.axisInteractions;
          
          // Знаходимо сильні зв'язки між осями
          const strongCouplings = [];
          for (const [axes, data] of Object.entries(interactions)) {
            if (data.couplingStrength > 0.6) {
              strongCouplings.push({
                axes: axes.split('_'),
                strength: data.couplingStrength,
                correlation: data.correlation,
                phaseRelation: data.phaseRelation
              });
            }
          }
          
          // Аналізуємо поширення коливань
          if (analysisResults.harmonicAnalysis.oscillationPropagation) {
            const propagation = analysisResults.harmonicAnalysis.oscillationPropagation;
            
            // Знаходимо основні джерела коливань
            const mainSources = {};
            
            for (const prop of propagation) {
              if (prop.sourceAxis) {
                mainSources[prop.sourceAxis] = (mainSources[prop.sourceAxis] || 0) + 1;
              }
            }
            
            // Формуємо рекомендації на основі джерел коливань
            const sourcesEntries = Object.entries(mainSources);
            if (sourcesEntries.length > 0) {
              // Сортуємо за кількістю випадків, коли вісь є джерелом
              sourcesEntries.sort((a, b) => b[1] - a[1]);
              const primarySource = sourcesEntries[0][0];
              
              // Додаємо пояснення щодо основного джерела коливань
              recommendations.explanations.interactions.primary_source = 
                `Основне джерело коливань: ${primarySource}. ` +
                `Рекомендується зосередити увагу на налаштуванні PID для цієї осі.`;
              
              // Коригуємо PID для первинного джерела коливань
              if (recommendations.pid[primarySource]) {
                // Обережно зменшуємо P і D для зменшення поширення коливань
                const currentP = recommendations.pid[primarySource].p;
                const currentD = recommendations.pid[primarySource].d;
                
                recommendations.pid[primarySource].p = Math.round(currentP * 0.95);
                recommendations.pid[primarySource].d = Math.round(currentD * 0.97);
                
                recommendations.explanations.interactions[`${primarySource}_source_correction`] = 
                  `Зменшено P і D для осі ${primarySource}, оскільки вона є основним джерелом коливань.`;
              }
            }
          }
          
          // Формуємо рекомендації на основі сильних зв'язків
          if (strongCouplings.length > 0) {
            recommendations.explanations.interactions.strong_couplings = 
              `Виявлено сильні зв'язки між осями: ` +
              strongCouplings.map(c => 
                `${c.axes[0]}-${c.axes[1]} (сила: ${(c.strength * 100).toFixed(0)}%)`
              ).join(', ');
            
            // Якщо є сильний зв'язок між roll і pitch, коригуємо налаштування
            const rollPitchCoupling = strongCouplings.find(
              c => (c.axes.includes('roll') && c.axes.includes('pitch'))
            );
            
            if (rollPitchCoupling && rollPitchCoupling.strength > 0.7) {
              // Підлаштовуємо параметри обох осей для кращої збалансованості
              recommendations.explanations.interactions.roll_pitch = 
                `Сильний зв'язок між roll і pitch (${(rollPitchCoupling.strength * 100).toFixed(0)}%). ` +
                `Рекомендується збалансування PID для цих осей.`;
              
              // Збалансовуємо D-термін між осями для зменшення спільних коливань
              const avgD = Math.round(
                (recommendations.pid.roll.d + recommendations.pid.pitch.d) / 2
              );
              
              recommendations.pid.roll.d = avgD;
              recommendations.pid.pitch.d = avgD;
              
              recommendations.explanations.interactions.roll_pitch_d_balance = 
                `D терміни для roll і pitch збалансовані до ${avgD} для зменшення взаємних коливань.`;
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
            
            recommendations.explanations.filters.gyro_lowpass = 
              `Частота фільтра гіроскопа рекомендована ${recommendedFrequency} Гц ` +
              `(було ${currentFilters.gyro_lowpass_hz} Гц).`;
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
            
            recommendations.explanations.filters.dterm_lowpass = 
              `Частота D-term фільтра рекомендована ${recommendedFrequency} Гц ` +
              `(було ${currentFilters.dterm_lowpass_hz} Гц).`;
          } else {
            recommendations.filters.dterm_lowpass_hz = currentFilters.dterm_lowpass_hz;
          }
        }
        
        // Notch фільтри з адаптивним Q-фактором
        if (analysisResults.filterAnalysis.notchFilters) {
          const { identifiedNoiseFrequencies, classifiedNoises, recommendedQFactors } = 
            analysisResults.filterAnalysis.notchFilters;
          
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
            
            // Рекомендуємо адаптивні Q-фактори, якщо класифікація доступна
            if (classifiedNoises && classifiedNoises.length > 0) {
              // Вибираємо топ-N шумів для фільтрації
              const topNoises = classifiedNoises
                .sort((a, b) => b.magnitude - a.magnitude)
                .slice(0, recommendations.filters.dyn_notch_count);
              
              // Формуємо масив рекомендованих Q-факторів для кожного шуму
              recommendations.filters.dynamic_notch_q_factors = topNoises.map(noise => ({
                frequency: noise.frequency,
                q_factor: noise.recommendedQ,
                noise_class: noise.noiseClass
              }));
              
              // Усереднений Q-фактор для сумісності
              recommendations.filters.dyn_notch_q = recommendedQFactors
                ? recommendedQFactors.average
                : 250;
              
              // Додаємо пояснення для адаптивних Q-факторів
              recommendations.explanations.filters.notch_q_factors = 
                `Адаптивні Q-фактори для різних типів шуму: ` +
                topNoises.map(noise => 
                  `${noise.frequency.toFixed(1)} Гц: Q=${noise.recommendedQ} (${noise.noiseClass})`
                ).join(', ');
            } else {
              // Стандартний Q-фактор
              recommendations.filters.dyn_notch_q = 250;
            }
            
            // Додаємо загальне пояснення для notch фільтрів
            recommendations.explanations.filters.notch = 
              `Notch фільтри: кількість=${recommendations.filters.dyn_notch_count}, ` +
              `діапазон=${recommendations.filters.dyn_notch_min_hz}-${recommendations.filters.dyn_notch_max_hz} Гц, ` +
              `середній Q=${recommendations.filters.dyn_notch_q}.`;
            
          } else {
            // Використовуємо поточні налаштування, якщо шуми не виявлені
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
      
      // Додаткові команди для Betaflight 4.3+ з підтримкою різних Q-факторів
      if (recommendations.filters.dynamic_notch_q_factors && 
          recommendations.filters.dynamic_notch_q_factors.length > 0) {
        commands.push('# Додаткові команди для Betaflight 4.3+ (індивідуальні Q-фактори)');
        for (let i = 0; i < Math.min(recommendations.filters.dyn_notch_count, 
                                  recommendations.filters.dynamic_notch_q_factors.length); i++) {
          const qFactor = recommendations.filters.dynamic_notch_q_factors[i];
          commands.push(`set dyn_notch_q_${i+1} = ${qFactor.q_factor} # Для частоти ~${qFactor.frequency.toFixed(1)} Гц`);
        }
      }
      
      // Зберегти налаштування
      commands.push('save');
      
      recommendations.betaflightCommands = commands;
    } catch (err) {
      console.error("Помилка генерації покращених рекомендацій:", err);
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
