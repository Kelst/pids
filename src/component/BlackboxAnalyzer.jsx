import React, { useState, useEffect } from 'react';
import useBlackboxStore from '../store/blackboxStore';
import { FFT } from 'dsp.js';
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

      // Усі кроки аналізу
      const steps = [
        () => analyzeErrorMetrics(), // 25%
        () => analyzeStepResponse(), // 50%
        () => analyzeFrequencyCharacteristics(), // 75%
        () => analyzeHarmonicDistortion(), // 90%
        () => analyzeFilters(), // 100%
      ];

      let results = {};
      
      // Виконуємо кожен крок аналізу
      for (let i = 0; i < steps.length; i++) {
        setProgress(Math.floor((i / steps.length) * 100));
        const stepResult = await steps[i]();
        results = { ...results, ...stepResult };
        
        // Імітація затримки для прогрес-бару
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setProgress(100);
      setAnalysisResults(results);

      // Генеруємо рекомендації на основі результатів аналізу
      const generatedRecommendations = generateRecommendations(results);
      setRecommendations(generatedRecommendations);

      // Завершуємо аналіз після короткої затримки
      setTimeout(() => {
        setAnalyzing(false);
      }, 500);

    } catch (err) {
      console.error("Помилка аналізу:", err);
      setError(`Помилка аналізу: ${err.message}`);
      setAnalyzing(false);
    }
  };

  // Функція аналізу відхилень для кожної осі
  const analyzeErrorMetrics = () => {
    // Шукаємо потрібні колонки в даних
    const axisColumns = {
      roll: {
        setpoint: dataHeaders.find(h => h === 'setpoint[0]'),
        actual: dataHeaders.find(h => h === 'gyroADC[0]'),
        error: dataHeaders.find(h => h === 'axisError[0]')
      },
      pitch: {
        setpoint: dataHeaders.find(h => h === 'setpoint[1]'),
        actual: dataHeaders.find(h => h === 'gyroADC[1]'),
        error: dataHeaders.find(h => h === 'axisError[1]')
      },
      yaw: {
        setpoint: dataHeaders.find(h => h === 'setpoint[2]'),
        actual: dataHeaders.find(h => h === 'gyroADC[2]'),
        error: dataHeaders.find(h => h === 'axisError[2]')
      }
    };

    // Розраховуємо середньоквадратичне відхилення та інші метрики
    const errorMetrics = {};
    
    for (const [axis, columns] of Object.entries(axisColumns)) {
      if (columns.setpoint && columns.actual) {
        const errors = flightData.map(row => {
          const setpoint = parseFloat(row[columns.setpoint]) || 0;
          const actual = parseFloat(row[columns.actual]) || 0;
          return setpoint - actual;
        });

        // Відфільтруємо недійсні значення
        const validErrors = errors.filter(e => !isNaN(e));
        
        if (validErrors.length > 0) {
          // Середньоквадратичне відхилення
          const squaredErrors = validErrors.map(e => e * e);
          const meanSquaredError = squaredErrors.reduce((sum, val) => sum + val, 0) / validErrors.length;
          const rmsError = Math.sqrt(meanSquaredError);
          
          // Максимальне відхилення
          const maxError = Math.max(...validErrors.map(Math.abs));
          
          // Середнє відхилення
          const meanError = validErrors.reduce((sum, val) => sum + Math.abs(val), 0) / validErrors.length;
          
          // Стандартне відхилення
          const variance = squaredErrors.reduce((sum, val) => sum + val, 0) / validErrors.length - (meanError * meanError);
          const stdDeviation = Math.sqrt(variance);
          
          errorMetrics[axis] = {
            rmsError,
            maxError,
            meanError,
            stdDeviation
          };
        }
      }
    }

    return { errorMetrics };
  };

  // Функція аналізу швидкості реакції системи
  const analyzeStepResponse = () => {
    // Шукаємо точки різкої зміни в командах
    const stepResponseMetrics = {
      roll: { settlingTime: 0, overshoot: 0, riseTime: 0 },
      pitch: { settlingTime: 0, overshoot: 0, riseTime: 0 },
      yaw: { settlingTime: 0, overshoot: 0, riseTime: 0 }
    };

    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      
      const rcCommandCol = `rcCommand[${axisIndex}]`;
      const gyroCol = `gyroADC[${axisIndex}]`;
      
      if (dataHeaders.includes(rcCommandCol) && dataHeaders.includes(gyroCol)) {
        // Знаходимо значні зміни в командах
        const stepChanges = [];
        const threshold = 50; // Поріг для виявлення різкої зміни
        
        for (let i = 1; i < flightData.length - 10; i++) {
          const prevCommand = parseFloat(flightData[i-1][rcCommandCol]) || 0;
          const currentCommand = parseFloat(flightData[i][rcCommandCol]) || 0;
          
          if (Math.abs(currentCommand - prevCommand) > threshold) {
            // Знайдена різка зміна
            const startIndex = i;
            const startTime = parseFloat(flightData[i].time) || 0;
            const targetValue = currentCommand;
            
            // Збираємо реакцію системи
            const response = [];
            for (let j = 0; j < 50 && (i + j) < flightData.length; j++) {
              const time = parseFloat(flightData[i + j].time) || 0;
              const gyroValue = parseFloat(flightData[i + j][gyroCol]) || 0;
              response.push({ time: time - startTime, value: gyroValue });
            }
            
            if (response.length > 0) {
              stepChanges.push({ startIndex, targetValue, response });
            }
            
            // Пропускаємо наступні кілька точок, щоб не реагувати кілька разів на ту саму зміну
            i += 5;
          }
        }
        
        // Аналізуємо знайдені зміни
        if (stepChanges.length > 0) {
          // Для спрощення, обчислюємо метрики на основі першої знайденої різкої зміни
          const { targetValue, response } = stepChanges[0];
          
          // Значення стабілізації (95% від цільового)
          const settlingThreshold = 0.05 * Math.abs(targetValue);
          
          // Знаходимо час стабілізації
          let settlingTime = 0;
          for (let i = response.length - 1; i >= 0; i--) {
            if (Math.abs(response[i].value - targetValue) > settlingThreshold) {
              settlingTime = response[i].time;
              break;
            }
          }
          
          // Знаходимо перерегулювання
          const maxValue = Math.max(...response.map(r => r.value));
          const overshoot = maxValue > targetValue ? 
            ((maxValue - targetValue) / targetValue) * 100 : 0;
          
          // Знаходимо час наростання (від 10% до 90% цільового значення)
          const riseStartThreshold = 0.1 * targetValue;
          const riseEndThreshold = 0.9 * targetValue;
          
          let riseStartTime = 0;
          let riseEndTime = 0;
          
          for (let i = 0; i < response.length; i++) {
            if (response[i].value >= riseStartThreshold && riseStartTime === 0) {
              riseStartTime = response[i].time;
            }
            if (response[i].value >= riseEndThreshold && riseEndTime === 0) {
              riseEndTime = response[i].time;
              break;
            }
          }
          
          const riseTime = riseEndTime - riseStartTime;
          
          stepResponseMetrics[axis] = {
            settlingTime,
            overshoot,
            riseTime
          };
        }
      }
    }

    return { stepResponseMetrics };
  };

  // Функція аналізу частотної характеристики (FFT)
  const analyzeFrequencyCharacteristics = () => {
    const frequencyAnalysis = {
      roll: { dominantFrequencies: [], noiseLevel: 0 },
      pitch: { dominantFrequencies: [], noiseLevel: 0 },
      yaw: { dominantFrequencies: [], noiseLevel: 0 }
    };

    // Аналіз для кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      const gyroCol = `gyroADC[${axisIndex}]`;
      
      if (dataHeaders.includes(gyroCol)) {
        // Отримуємо дані гіроскопа для FFT
        let gyroData = flightData.map(row => parseFloat(row[gyroCol]) || 0);
        
        // Для FFT потрібна довжина, що є степенем 2
        const fftSize = 1024;
        if (gyroData.length > fftSize) {
          gyroData = gyroData.slice(0, fftSize);
        } else if (gyroData.length < fftSize) {
          // Доповнюємо нулями, якщо даних менше
          gyroData = [...gyroData, ...Array(fftSize - gyroData.length).fill(0)];
        }
        
        // Виконуємо FFT
        try {
          const fft = new FFT(fftSize, 1000); // Припускаємо частоту дискретизації 1000 Гц
          fft.forward(gyroData);
          
          // Отримуємо амплітудний спектр
          const spectrum = [];
          for (let i = 0; i < fftSize / 2; i++) {
            const frequency = i * (1000 / fftSize);
            const magnitude = Math.sqrt(fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]);
            spectrum.push({ frequency, magnitude });
          }
          
          // Знаходимо домінуючі частоти (локальні максимуми)
          const dominantFrequencies = [];
          for (let i = 1; i < spectrum.length - 1; i++) {
            if (spectrum[i].magnitude > spectrum[i-1].magnitude && 
                spectrum[i].magnitude > spectrum[i+1].magnitude &&
                spectrum[i].magnitude > 10) { // Поріг для фільтрації шуму
              dominantFrequencies.push({
                frequency: spectrum[i].frequency,
                magnitude: spectrum[i].magnitude
              });
            }
          }
          
          // Сортуємо за величиною і беремо топ-5
          dominantFrequencies.sort((a, b) => b.magnitude - a.magnitude);
          const top5Frequencies = dominantFrequencies.slice(0, 5);
          
          // Оцінюємо загальний рівень шуму
          const noiseLevel = spectrum.reduce((sum, s) => sum + s.magnitude, 0) / spectrum.length;
          
          frequencyAnalysis[axis] = {
            dominantFrequencies: top5Frequencies,
            noiseLevel
          };
        } catch (err) {
          console.error(`Помилка FFT для осі ${axis}:`, err);
        }
      }
    }

    return { frequencyAnalysis };
  };

  // Функція аналізу гармонійності руху
  const analyzeHarmonicDistortion = () => {
    const harmonicAnalysis = {
      roll: { thd: 0, stabilityScore: 0, oscillationDetected: false },
      pitch: { thd: 0, stabilityScore: 0, oscillationDetected: false },
      yaw: { thd: 0, stabilityScore: 0, oscillationDetected: false }
    };

    // Для кожної осі
    for (const axis of ['roll', 'pitch', 'yaw']) {
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
      const gyroCol = `gyroADC[${axisIndex}]`;
      
      if (dataHeaders.includes(gyroCol)) {
        // Отримуємо дані гіроскопа
        const gyroData = flightData.map(row => parseFloat(row[gyroCol]) || 0);
        
        // Розрахунок THD (Total Harmonic Distortion)
        try {
          const fftSize = 1024;
          const dataSegment = gyroData.slice(0, Math.min(fftSize, gyroData.length));
          
          if (dataSegment.length > 0) {
            // Доповнюємо нулями, якщо потрібно
            const paddedData = [...dataSegment, ...Array(fftSize - dataSegment.length).fill(0)];
            
            const fft = new FFT(fftSize, 1000);
            fft.forward(paddedData);
            
            // Отримуємо амплітудний спектр
            const spectrum = [];
            for (let i = 0; i < fftSize / 2; i++) {
              const magnitude = Math.sqrt(fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]);
              spectrum.push(magnitude);
            }
            
            // Знаходимо фундаментальну частоту (найбільша амплітуда)
            const fundamentalIndex = spectrum.indexOf(Math.max(...spectrum));
            const fundamentalMagnitude = spectrum[fundamentalIndex];
            
            // Розраховуємо THD
            let harmonicPower = 0;
            for (let i = 2; i * fundamentalIndex < spectrum.length; i++) {
              const harmonicIndex = i * fundamentalIndex;
              harmonicPower += spectrum[harmonicIndex] * spectrum[harmonicIndex];
            }
            
            const thd = Math.sqrt(harmonicPower) / fundamentalMagnitude * 100;
            
            // Оцінка стабільності (вища THD означає меншу стабільність)
            const stabilityScore = 100 - Math.min(100, thd);
            
            // Виявлення небажаних коливань
            const oscillationThreshold = 30; // Поріг для виявлення коливань
            const oscillationDetected = thd > oscillationThreshold;
            
            harmonicAnalysis[axis] = {
              thd,
              stabilityScore,
              oscillationDetected
            };
          }
        } catch (err) {
          console.error(`Помилка аналізу гармонік для осі ${axis}:`, err);
        }
      }
    }

    return { harmonicAnalysis };
  };

  // Функція аналізу фільтрів
  const analyzeFilters = () => {
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
        motorNoiseFrequencies: []
      }
    };

    // Отримуємо налаштування фільтрів з метаданих
    const gyroLowpassHz = parseFloat(metadata['gyro_lowpass_hz']) || 0;
    const dtermLowpassHz = parseFloat(metadata['dterm_lowpass_hz']) || 0;
    const dynNotchMinHz = parseFloat(metadata['dyn_notch_min_hz']) || 0;
    const dynNotchMaxHz = parseFloat(metadata['dyn_notch_max_hz']) || 0;
    
    // Аналіз даних гіроскопа
    const gyroDataRaw = flightData.map(row => ({
      x: parseFloat(row['gyroUnfilt[0]']) || 0,
      y: parseFloat(row['gyroUnfilt[1]']) || 0,
      z: parseFloat(row['gyroUnfilt[2]']) || 0
    }));
    
    const gyroDataFiltered = flightData.map(row => ({
      x: parseFloat(row['gyroADC[0]']) || 0,
      y: parseFloat(row['gyroADC[1]']) || 0,
      z: parseFloat(row['gyroADC[2]']) || 0
    }));
    
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
      const recommendedFrequency = calculateRecommendedGyroFrequency(gyroDataRaw);
      
      filterAnalysis.gyroFilters = {
        effectiveness: gyroFilterEffectiveness,
        phaseDelay,
        recommendedFrequency
      };
    }
    
    // Аналіз шуму моторів
    const motorData = [];
    for (let i = 0; i < 4; i++) {
      const colName = `motor[${i}]`;
      if (dataHeaders.includes(colName)) {
        const data = flightData.map(row => parseFloat(row[colName]) || 0);
        motorData.push(data);
      }
    }
    
    // Ідентифікація шумів моторів
    if (motorData.length > 0) {
      const motorNoiseFrequencies = [];
      
      for (let motorIndex = 0; motorIndex < motorData.length; motorIndex++) {
        try {
          const fftSize = 1024;
          const data = motorData[motorIndex].slice(0, Math.min(fftSize, motorData[motorIndex].length));
          
          if (data.length > 0) {
            // Доповнюємо нулями
            const paddedData = [...data, ...Array(fftSize - data.length).fill(0)];
            
            const fft = new FFT(fftSize, 1000);
            fft.forward(paddedData);
            
            // Знаходимо пікові частоти шуму
            const peakFrequencies = [];
            
            for (let i = 1; i < fftSize / 2 - 1; i++) {
              const magnitude = Math.sqrt(fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]);
              const freq = i * (1000 / fftSize);
              
              if (magnitude > 10 && 
                  magnitude > Math.sqrt(fft.real[i-1] * fft.real[i-1] + fft.imag[i-1] * fft.imag[i-1]) &&
                  magnitude > Math.sqrt(fft.real[i+1] * fft.real[i+1] + fft.imag[i+1] * fft.imag[i+1])) {
                peakFrequencies.push({ frequency: freq, magnitude });
              }
            }
            
            // Сортуємо за амплітудою і беремо топ-3
            peakFrequencies.sort((a, b) => b.magnitude - a.magnitude);
            const topFrequencies = peakFrequencies.slice(0, 3);
            
            motorNoiseFrequencies.push({
              motorIndex,
              frequencies: topFrequencies
            });
          }
        } catch (err) {
          console.error(`Помилка аналізу шуму мотора ${motorIndex}:`, err);
        }
      }
      
      filterAnalysis.rpmFilters.motorNoiseFrequencies = motorNoiseFrequencies;
      filterAnalysis.rpmFilters.effectiveness = calculateRpmFilterEffectiveness(motorNoiseFrequencies, gyroDataRaw, gyroDataFiltered);
    }
    
    // Доповнюємо аналіз notch-фільтрів
    if (dynNotchMinHz > 0 && dynNotchMaxHz > 0) {
      const identifiedNoiseFrequencies = [];
      
      // Аналізуємо спектр гіроскопа для виявлення шумів, які потрібно фільтрувати
      for (const axis of ['x', 'y', 'z']) {
        const axisIndex = { x: 0, y: 1, z: 2 }[axis];
        const gyroCol = `gyroUnfilt[${axisIndex}]`;
        
        if (dataHeaders.includes(gyroCol)) {
          try {
            const fftSize = 1024;
            const data = flightData.map(row => parseFloat(row[gyroCol]) || 0).slice(0, fftSize);
            
            if (data.length > 0) {
              // Доповнюємо нулями
              const paddedData = [...data, ...Array(fftSize - data.length).fill(0)];
              
              const fft = new FFT(fftSize, 1000);
              fft.forward(paddedData);
              
              // Шукаємо шумові піки в діапазоні dynNotchMinHz до dynNotchMaxHz
              for (let i = 1; i < fftSize / 2 - 1; i++) {
                const freq = i * (1000 / fftSize);
                
                if (freq >= dynNotchMinHz && freq <= dynNotchMaxHz) {
                  const magnitude = Math.sqrt(fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]);
                  
                  if (magnitude > 20 && 
                      magnitude > Math.sqrt(fft.real[i-1] * fft.real[i-1] + fft.imag[i-1] * fft.imag[i-1]) &&
                      magnitude > Math.sqrt(fft.real[i+1] * fft.real[i+1] + fft.imag[i+1] * fft.imag[i+1])) {
                    
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
        
        for (const noiseFreq of identifiedNoiseFrequencies) {
          const axis = noiseFreq.axis;
          const axisIndex = { x: 0, y: 1, z: 2 }[axis];
          
          try {
            const fftSizeSmall = 256; // Менший розмір для швидшого обчислення
            
            // Нефільтровані дані
            const rawData = flightData.map(row => parseFloat(row[`gyroUnfilt[${axisIndex}]`]) || 0).slice(0, fftSizeSmall);
            const rawFft = new FFT(fftSizeSmall, 1000);
            rawFft.forward([...rawData, ...Array(fftSizeSmall - rawData.length).fill(0)]);
            
            // Фільтровані дані
            const filteredData = flightData.map(row => parseFloat(row[`gyroADC[${axisIndex}]`]) || 0).slice(0, fftSizeSmall);
            const filteredFft = new FFT(fftSizeSmall, 1000);
            filteredFft.forward([...filteredData, ...Array(fftSizeSmall - filteredData.length).fill(0)]);
            
            // Знаходимо амплітуду на частоті шуму
            const freqIndex = Math.round(noiseFreq.frequency / (1000 / fftSizeSmall));
            
            if (freqIndex > 0 && freqIndex < fftSizeSmall / 2) {
              const rawMagnitude = Math.sqrt(rawFft.real[freqIndex] * rawFft.real[freqIndex] + 
                                            rawFft.imag[freqIndex] * rawFft.imag[freqIndex]);
              
              const filteredMagnitude = Math.sqrt(filteredFft.real[freqIndex] * filteredFft.real[freqIndex] + 
                                                 filteredFft.imag[freqIndex] * filteredFft.imag[freqIndex]);
              
              if (rawMagnitude > 0) {
                const reductionRatio = 1 - (filteredMagnitude / rawMagnitude);
                reductionRatios.push(reductionRatio);
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
    if (dtermLowpassHz > 0) {
      const phaseDelay = 1000 / (2 * Math.PI * dtermLowpassHz);
      
      // Оцінка балансу між фільтрацією та затримкою
      const effectiveness = calculateDtermFilterEffectiveness(dtermLowpassHz);
      
      // Рекомендована частота D-term фільтра
      const recommendedFrequency = calculateRecommendedDtermFrequency(gyroDataRaw);
      
      filterAnalysis.dtermFilters = {
        effectiveness,
        phaseDelay,
        recommendedFrequency
      };
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
      
      const fft = new FFT(fftSize, 1000);
      fft.forward(combinedData);
      
      // Отримуємо амплітудний спектр
      const spectrum = [];
      for (let i = 0; i < fftSize / 2; i++) {
        const frequency = i * (1000 / fftSize);
        const magnitude = Math.sqrt(fft.real[i] * fft.real[i] + fft.imag[i] * fft.imag[i]);
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
        const rawFft = new FFT(fftSize, 1000);
        rawFft.forward(paddedRawData);
        
        // FFT для фільтрованих даних
        const filteredFft = new FFT(fftSize, 1000);
        filteredFft.forward(paddedFilteredData);
        
        // Перевіряємо кожну частоту мотора
        for (const freq of motorFrequencies) {
          const freqIndex = Math.round(freq / (1000 / fftSize));
          
          if (freqIndex > 0 && freqIndex < fftSize / 2) {
            const rawMagnitude = Math.sqrt(
              rawFft.real[freqIndex] * rawFft.real[freqIndex] + 
              rawFft.imag[freqIndex] * rawFft.imag[freqIndex]
            );
            
            const filteredMagnitude = Math.sqrt(
              filteredFft.real[freqIndex] * filteredFft.real[freqIndex] + 
              filteredFft.imag[freqIndex] * filteredFft.imag[freqIndex]
            );
            
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