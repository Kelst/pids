import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import useBlackboxStore from '../store/blackboxStore';
import _ from 'lodash';

const PidSimulator = () => {
  const { flightData, dataHeaders, metadata } = useBlackboxStore();
  
  // Стан для управління симуляцією
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simulationResults, setSimulationResults] = useState(null);
  const [simulationSegment, setSimulationSegment] = useState('all');
  const [simulationAxis, setSimulationAxis] = useState('roll');
  const [error, setError] = useState(null);
  
  // Стан для PID значень
  const [currentPids, setCurrentPids] = useState({
    roll: { p: 0, i: 0, d: 0, f: 0 },
    pitch: { p: 0, i: 0, d: 0, f: 0 },
    yaw: { p: 0, i: 0, d: 0, f: 0 }
  });
  
  const [simulatedPids, setSimulatedPids] = useState({
    roll: { p: 0, i: 0, d: 0, f: 0 },
    pitch: { p: 0, i: 0, d: 0, f: 0 },
    yaw: { p: 0, i: 0, d: 0, f: 0 }
  });
  
  // Референси для графіків
  const stepResponseChartRef = useRef(null);
  const frequencyResponseChartRef = useRef(null);
  const trackingChartRef = useRef(null);
  
  // Завантаження PID значень з метаданих
  useEffect(() => {
    if (metadata) {
      const extractedPids = extractPidsFromMetadata(metadata);
      setCurrentPids(extractedPids);
      setSimulatedPids(extractedPids);
    }
  }, [metadata]);
  
  // Функція для вилучення PID параметрів з метаданих
  const extractPidsFromMetadata = (metadata) => {
    const pids = {
      roll: { p: 40, i: 40, d: 30, f: 0 },
      pitch: { p: 40, i: 40, d: 30, f: 0 },
      yaw: { p: 40, i: 40, d: 0, f: 0 }
    };
    
    try {
      // Розбір рядків PID значень з метаданих
      if (metadata.rollPID) {
        const parts = metadata.rollPID.split(',').map(p => parseInt(p.trim(), 10));
        if (parts.length >= 3) {
          pids.roll.p = parts[0] || pids.roll.p;
          pids.roll.i = parts[1] || pids.roll.i;
          pids.roll.d = parts[2] || pids.roll.d;
          if (parts.length >= 4) {
            pids.roll.f = parts[3] || pids.roll.f;
          }
        }
      }
      
      if (metadata.pitchPID) {
        const parts = metadata.pitchPID.split(',').map(p => parseInt(p.trim(), 10));
        if (parts.length >= 3) {
          pids.pitch.p = parts[0] || pids.pitch.p;
          pids.pitch.i = parts[1] || pids.pitch.i;
          pids.pitch.d = parts[2] || pids.pitch.d;
          if (parts.length >= 4) {
            pids.pitch.f = parts[3] || pids.pitch.f;
          }
        }
      }
      
      if (metadata.yawPID) {
        const parts = metadata.yawPID.split(',').map(p => parseInt(p.trim(), 10));
        if (parts.length >= 3) {
          pids.yaw.p = parts[0] || pids.yaw.p;
          pids.yaw.i = parts[1] || pids.yaw.i;
          pids.yaw.d = parts[2] || pids.yaw.d;
          if (parts.length >= 4) {
            pids.yaw.f = parts[3] || pids.yaw.f;
          }
        }
      }
    } catch (e) {
      console.error("Помилка читання PID з метаданих:", e);
    }
    
    return pids;
  };
  
  // Функція для запуску симуляції
  const runSimulation = async () => {
    if (!flightData || flightData.length === 0) {
      setError("Немає даних для симуляції. Спочатку завантажте лог-файл.");
      return;
    }
    
    try {
      setIsSimulating(true);
      setProgress(0);
      setError(null);
      setSimulationResults(null);
      
      // Визначаємо колонки даних для аналізу
      const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[simulationAxis];
      const setpointCol = findColumnName(`setpoint[${axisIndex}]`, dataHeaders);
      const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
      const timeCol = findColumnName('time', dataHeaders);
      
      if (!setpointCol || !gyroCol) {
        throw new Error(`Неможливо знайти необхідні колонки для осі ${simulationAxis}`);
      }
      
      // Вибір сегмента даних для симуляції
      let dataSegment = [...flightData];
      if (simulationSegment !== 'all') {
        const segmentSize = parseInt(simulationSegment, 10);
        if (!isNaN(segmentSize) && segmentSize > 0) {
          // Знаходимо найцікавішу частину логу (з найбільшими змінами setpoint)
          const interestingSegment = findInterestingSegment(flightData, setpointCol, segmentSize);
          dataSegment = interestingSegment;
        }
      }
      
      // Оновлюємо прогрес
      setProgress(10);
      
      // Отримання вхідних даних з логу
      const timeData = dataSegment.map(row => parseFloat(row[timeCol]) / 1000000); // мікросекунди в секунди
      const setpointData = dataSegment.map(row => parseFloat(row[setpointCol]));
      const actualData = dataSegment.map(row => parseFloat(row[gyroCol]));
      
      // Нормалізація часу (починаємо з 0)
      const startTime = timeData[0];
      const normalizedTime = timeData.map(t => t - startTime);
      
      // Оновлюємо прогрес
      setProgress(25);
      
      // Проводимо симуляцію з поточними PID
      const currentSimulation = simulatePidResponse(
        normalizedTime,
        setpointData,
        currentPids[simulationAxis]
      );
      
      setProgress(50);
      
      // Проводимо симуляцію з новими PID
      const newSimulation = simulatePidResponse(
        normalizedTime,
        setpointData,
        simulatedPids[simulationAxis]
      );
      
      setProgress(75);
      
      // Аналіз поточного і симульованого відгуку
      const currentAnalysis = analyzeResponse(normalizedTime, setpointData, currentSimulation);
      const newAnalysis = analyzeResponse(normalizedTime, setpointData, newSimulation);
      
      // Частотний аналіз
      const frequencyAnalysis = performFrequencyAnalysis(actualData, currentSimulation, newSimulation);
      
      // Формуємо результати симуляції
      const results = {
        time: normalizedTime,
        setpoint: setpointData,
        actual: actualData,
        currentSimulation,
        newSimulation,
        metrics: {
          current: currentAnalysis,
          new: newAnalysis
        },
        frequencyAnalysis
      };
      
      setSimulationResults(results);
      setProgress(100);
      
      // Малюємо графіки, якщо є результати
      if (results) {
        setTimeout(() => {
          drawStepResponseChart(results);
          drawFrequencyResponseChart(results.frequencyAnalysis);
          drawTrackingChart(results);
        }, 500);
      }
      
      setTimeout(() => {
        setIsSimulating(false);
      }, 300);
      
    } catch (err) {
      console.error("Помилка симуляції:", err);
      setError(`Помилка симуляції: ${err.message}`);
      setIsSimulating(false);
    }
  };
  
  // Функція для пошуку найцікавішого сегмента даних (з найбільшими змінами)
  const findInterestingSegment = (data, setpointCol, segmentSize) => {
    if (data.length <= segmentSize) return data;
    
    let maxVariance = 0;
    let bestStartIndex = 0;
    
    for (let i = 0; i <= data.length - segmentSize; i += Math.max(1, Math.floor(segmentSize / 10))) {
      const segment = data.slice(i, i + segmentSize);
      const setpoints = segment.map(row => parseFloat(row[setpointCol]));
      
      // Розраховуємо варіативність (зміну) даних у сегменті
      const variance = calculateVariance(setpoints);
      
      if (variance > maxVariance) {
        maxVariance = variance;
        bestStartIndex = i;
      }
    }
    
    return data.slice(bestStartIndex, bestStartIndex + segmentSize);
  };
  
  // Розрахунок варіації (дисперсії) значень
  const calculateVariance = (values) => {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  };
  
  // Функція симуляції PID відгуку
  const simulatePidResponse = (timeData, setpointData, pidParams) => {
    const { p, i, d, f } = pidParams;
    
    const dt = timeData.length > 1 ? (timeData[1] - timeData[0]) : 0.001; // Крок часу
    
    const output = new Array(timeData.length).fill(0);
    let integralError = 0;
    let prevError = 0;
    
    for (let j = 1; j < timeData.length; j++) {
      // Актуальний час і завдання
      const currentSetpoint = setpointData[j];
      
      // Розрахунок помилки
      const error = currentSetpoint - output[j-1];
      
      // Інтегральна складова (з обмеженням)
      integralError += error * dt;
      integralError = Math.max(-500, Math.min(500, integralError)); // Anti-windup
      
      // Диференціальна складова
      const errorDerivative = (error - prevError) / dt;
      
      // Feed-forward (використовуємо похідну setpoint)
      const setpointDerivative = j > 1 ? (setpointData[j] - setpointData[j-1]) / dt : 0;
      
      // PID формула
      const pTerm = p * error;
      const iTerm = i * integralError;
      const dTerm = d * errorDerivative;
      const fTerm = f * setpointDerivative;
      
      // Загальний вихід PID регулятора
      let pidOutput = pTerm + iTerm + dTerm + fTerm;
      
      // Обмеження виходу (симуляція обмежень фізичної системи)
      pidOutput = Math.max(-1000, Math.min(1000, pidOutput));
      
      // Моделюємо інерцію і затримки фізичної системи
      const systemResponse = 0.9 * output[j-1] + 0.1 * pidOutput;
      
      // Зберігаємо вихід симуляції
      output[j] = systemResponse;
      
      // Зберігаємо поточну помилку для наступної ітерації
      prevError = error;
    }
    
    return output;
  };
  
  // Функція аналізу відгуку системи
  const analyzeResponse = (timeData, setpointData, responseData) => {
    // Визначення часу наростання (rise time)
    let riseTime = 0;
    const setpointChange = Math.abs(setpointData[setpointData.length-1] - setpointData[0]);
    
    if (setpointChange > 0) {
      const threshold10 = setpointData[0] + 0.1 * setpointChange;
      const threshold90 = setpointData[0] + 0.9 * setpointChange;
      
      let idx10 = -1;
      let idx90 = -1;
      
      for (let i = 0; i < responseData.length; i++) {
        if (idx10 === -1 && responseData[i] >= threshold10) {
          idx10 = i;
        }
        if (idx10 !== -1 && responseData[i] >= threshold90) {
          idx90 = i;
          break;
        }
      }
      
      if (idx10 !== -1 && idx90 !== -1) {
        riseTime = timeData[idx90] - timeData[idx10];
      }
    }
    
    // Визначення перерегулювання (overshoot)
    let overshoot = 0;
    if (setpointChange > 0) {
      const finalSetpoint = setpointData[setpointData.length-1];
      const maxResponse = Math.max(...responseData);
      
      if (maxResponse > finalSetpoint) {
        overshoot = ((maxResponse - finalSetpoint) / setpointChange) * 100;
      }
    }
    
    // Визначення часу встановлення (settling time)
    let settlingTime = 0;
    const finalValue = setpointData[setpointData.length-1];
    const settleBand = 0.05 * setpointChange; // 5% band
    
    for (let i = 0; i < responseData.length; i++) {
      if (Math.abs(responseData[i] - finalValue) <= settleBand) {
        // Перевіряємо, чи залишається в межах діапазону
        let isSettled = true;
        for (let j = i; j < Math.min(i + 20, responseData.length); j++) {
          if (Math.abs(responseData[j] - finalValue) > settleBand) {
            isSettled = false;
            break;
          }
        }
        
        if (isSettled) {
          settlingTime = timeData[i];
          break;
        }
      }
    }
    
    // Розрахунок RMSE (Root Mean Square Error)
    let sumSquaredError = 0;
    for (let i = 0; i < responseData.length; i++) {
      const error = setpointData[i] - responseData[i];
      sumSquaredError += error * error;
    }
    const rmse = Math.sqrt(sumSquaredError / responseData.length);
    
    return {
      riseTime,
      overshoot,
      settlingTime,
      rmse
    };
  };
  
  // Частотний аналіз відгуку системи
  const performFrequencyAnalysis = (actualData, currentSimulation, newSimulation) => {
    // Спрощений частотний аналіз - показуємо спектр потужності для кожного відгуку
    
    // Використовуємо FFT для розрахунку спектра (спрощена реалізація)
    // У реальній системі можна використати бібліотеку FFT
    const calculateSpectrum = (data) => {
      const spectrum = [];
      const n = data.length;
      
      // Для простоти розрахуємо авто-кореляцію сигналу для кількох лагів
      // Це дасть нам грубе наближення спектра
      for (let freq = 0; freq < 20; freq++) {
        let power = 0;
        
        // Розраховуємо потужність на цій частоті
        for (let i = 0; i < n - freq; i++) {
          power += data[i] * data[i + freq];
        }
        
        spectrum.push({
          frequency: freq,
          power: power / (n - freq)
        });
      }
      
      return spectrum;
    };
    
    return {
      actualSpectrum: calculateSpectrum(actualData),
      currentSimulationSpectrum: calculateSpectrum(currentSimulation),
      newSimulationSpectrum: calculateSpectrum(newSimulation)
    };
  };
  
  // Рисування графіка перехідної характеристики
  const drawStepResponseChart = (results) => {
    if (!stepResponseChartRef.current) return;
    
    const ctx = stepResponseChartRef.current.getContext('2d');
    
    // Очищаємо старий графік, якщо є
    if (window.stepResponseChart) {
      window.stepResponseChart.destroy();
    }
    
    // Визначаємо кількість точок для візуалізації (обмежуємо для продуктивності)
    const maxPoints = 300;
    const skipPoints = Math.max(1, Math.floor(results.time.length / maxPoints));
    
    // Підготовка даних для графіка
    const data = {
      labels: results.time.filter((_, i) => i % skipPoints === 0).map(t => t.toFixed(2)),
      datasets: [
        {
          label: 'Setpoint',
          data: results.setpoint.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(0, 0, 0, 0.7)',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Фактичний відгук',
          data: results.actual.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(128, 128, 128, 0.9)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Поточні PID',
          data: results.currentSimulation.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(54, 162, 235, 0.8)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Нові PID',
          data: results.newSimulation.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(255, 99, 132, 0.8)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    };
    
    // Налаштування графіка
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Перехідна характеристика для ${simulationAxis.toUpperCase()} осі`
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Час (секунди)'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Значення'
          }
        }
      }
    };
    
    // Створюємо графік
    window.stepResponseChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: options
    });
  };
  
  // Рисування графіка частотної характеристики
  const drawFrequencyResponseChart = (frequencyAnalysis) => {
    if (!frequencyResponseChartRef.current) return;
    
    const ctx = frequencyResponseChartRef.current.getContext('2d');
    
    // Очищаємо старий графік, якщо є
    if (window.frequencyResponseChart) {
      window.frequencyResponseChart.destroy();
    }
    
    // Підготовка даних для графіка
    const data = {
      labels: frequencyAnalysis.actualSpectrum.map(point => point.frequency),
      datasets: [
        {
          label: 'Фактичний спектр',
          data: frequencyAnalysis.actualSpectrum.map(point => point.power),
          borderColor: 'rgba(128, 128, 128, 0.9)',
          backgroundColor: 'rgba(128, 128, 128, 0.2)',
          borderWidth: 2,
          fill: true
        },
        {
          label: 'Поточні PID',
          data: frequencyAnalysis.currentSimulationSpectrum.map(point => point.power),
          borderColor: 'rgba(54, 162, 235, 0.8)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          fill: true
        },
        {
          label: 'Нові PID',
          data: frequencyAnalysis.newSimulationSpectrum.map(point => point.power),
          borderColor: 'rgba(255, 99, 132, 0.8)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderWidth: 2,
          fill: true
        }
      ]
    };
    
    // Налаштування графіка
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Частотний спектр відгуку'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Частота'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Потужність'
          },
          beginAtZero: true
        }
      }
    };
    
    // Створюємо графік
    window.frequencyResponseChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: options
    });
  };
  
  // Рисування графіка відстеження
  const drawTrackingChart = (results) => {
    if (!trackingChartRef.current) return;
    
    const ctx = trackingChartRef.current.getContext('2d');
    
    // Очищаємо старий графік, якщо є
    if (window.trackingChart) {
      window.trackingChart.destroy();
    }
    
    // Розраховуємо помилки відстеження
    const actualError = results.setpoint.map((sp, i) => sp - results.actual[i]);
    const currentError = results.setpoint.map((sp, i) => sp - results.currentSimulation[i]);
    const newError = results.setpoint.map((sp, i) => sp - results.newSimulation[i]);
    
    // Визначаємо кількість точок для візуалізації (обмежуємо для продуктивності)
    const maxPoints = 300;
    const skipPoints = Math.max(1, Math.floor(results.time.length / maxPoints));
    
    // Підготовка даних для графіка
    const data = {
      labels: results.time.filter((_, i) => i % skipPoints === 0).map(t => t.toFixed(2)),
      datasets: [
        {
          label: 'Фактична помилка',
          data: actualError.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(128, 128, 128, 0.9)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Помилка (поточні PID)',
          data: currentError.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(54, 162, 235, 0.8)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Помилка (нові PID)',
          data: newError.filter((_, i) => i % skipPoints === 0),
          borderColor: 'rgba(255, 99, 132, 0.8)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    };
    
    // Налаштування графіка
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Помилка відстеження'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Час (секунди)'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Відхилення'
          }
        }
      }
    };
    
    // Створюємо графік
    window.trackingChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: options
    });
  };
  
  // Допоміжна функція для пошуку назви колонки
  const findColumnName = (name, headers) => {
    const directMatch = headers.includes(name) ? name : null;
    if (directMatch) return directMatch;
    
    // Пошук альтернативних назв
    const lowerName = name.toLowerCase();
    const alternatives = {
      'time': ['time', 'timestamp', 'looptime'],
      'setpoint[0]': ['setpoint[0]', 'setpoint[roll]', 'rcCommand[0]'],
      'setpoint[1]': ['setpoint[1]', 'setpoint[pitch]', 'rcCommand[1]'],
      'setpoint[2]': ['setpoint[2]', 'setpoint[yaw]', 'rcCommand[2]'],
      'gyroADC[0]': ['gyroADC[0]', 'gyro[0]', 'gyroData[0]'],
      'gyroADC[1]': ['gyroADC[1]', 'gyro[1]', 'gyroData[1]'],
      'gyroADC[2]': ['gyroADC[2]', 'gyro[2]', 'gyroData[2]']
    };
    
    if (alternatives[name]) {
      for (const alt of alternatives[name]) {
        const altMatch = headers.find(h => h.toLowerCase() === alt.toLowerCase());
        if (altMatch) return altMatch;
      }
    }
    
    return null;
  };
  
  // Обробники змін PID параметрів
  const handlePidChange = (axis, param, value) => {
    setSimulatedPids(prevPids => ({
      ...prevPids,
      [axis]: {
        ...prevPids[axis],
        [param]: parseInt(value, 10)
      }
    }));
  };
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Симуляція PID на основі польотних даних</h2>
      
      {!flightData || flightData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Завантажте лог-файл Blackbox перш ніж запускати симуляцію.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Панель налаштувань симуляції */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Зліва: Налаштування PID */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-3">Налаштування PID для симуляції</h3>
              
              {/* Вибір осі */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Вісь для симуляції:</label>
                <div className="flex space-x-4">
                  <div className="flex items-center">
                    <input
                      id="axis-roll"
                      name="simulation-axis"
                      type="radio"
                      checked={simulationAxis === 'roll'}
                      onChange={() => setSimulationAxis('roll')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="axis-roll" className="ml-2 block text-sm text-gray-700">
                      Roll
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="axis-pitch"
                      name="simulation-axis"
                      type="radio"
                      checked={simulationAxis === 'pitch'}
                      onChange={() => setSimulationAxis('pitch')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="axis-pitch" className="ml-2 block text-sm text-gray-700">
                      Pitch
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="axis-yaw"
                      name="simulation-axis"
                      type="radio"
                      checked={simulationAxis === 'yaw'}
                      onChange={() => setSimulationAxis('yaw')}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="axis-yaw" className="ml-2 block text-sm text-gray-700">
                      Yaw
                    </label>
                  </div>
                </div>
              </div>
              
              {/* PID слайдери для обраної осі */}
              <div className="space-y-4 mb-4">
                {/* P-term */}
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-medium">P-term</label>
                    <span className="text-sm text-gray-500">
                      Поточний: {currentPids[simulationAxis].p} | 
                      Новий: {simulatedPids[simulationAxis].p}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={simulatedPids[simulationAxis].p}
                    onChange={(e) => handlePidChange(simulationAxis, 'p', e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                {/* I-term */}
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-medium">I-term</label>
                    <span className="text-sm text-gray-500">
                      Поточний: {currentPids[simulationAxis].i} | 
                      Новий: {simulatedPids[simulationAxis].i}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={simulatedPids[simulationAxis].i}
                    onChange={(e) => handlePidChange(simulationAxis, 'i', e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                {/* D-term */}
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-medium">D-term</label>
                    <span className="text-sm text-gray-500">
                      Поточний: {currentPids[simulationAxis].d} | 
                      Новий: {simulatedPids[simulationAxis].d}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={simulatedPids[simulationAxis].d}
                    onChange={(e) => handlePidChange(simulationAxis, 'd', e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                {/* F-term (Feed Forward) */}
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-sm font-medium">Feed Forward</label>
                    <span className="text-sm text-gray-500">
                      Поточний: {currentPids[simulationAxis].f} | 
                      Новий: {simulatedPids[simulationAxis].f}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="250"
                    value={simulatedPids[simulationAxis].f}
                    onChange={(e) => handlePidChange(simulationAxis, 'f', e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
            
            {/* Справа: Налаштування симуляції */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-lg mb-3">Налаштування симуляції</h3>
              
              {/* Вибір сегмента даних */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Сегмент даних для аналізу:</label>
                <select
                  value={simulationSegment}
                  onChange={(e) => setSimulationSegment(e.target.value)}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="all">Всі дані ({flightData.length} точок)</option>
                  <option value="1000">Найцікавіші 1000 точок</option>
                  <option value="500">Найцікавіші 500 точок</option>
                  <option value="250">Найцікавіші 250 точок</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Вибір частини логу з найбільш інформативними змінами значень.
                </p>
              </div>
              
              {/* Кнопка запуску симуляції */}
              <div className="mb-4">
                <button
                  onClick={runSimulation}
                  disabled={isSimulating}
                  className={`py-2 px-4 rounded-md font-medium w-full ${
                    isSimulating
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  {isSimulating ? 'Симуляція...' : 'Запустити симуляцію'}
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Симуляція покаже, як дрон поводився б з новими PID на основі реальних льотних даних.
                </p>
              </div>
              
              {/* Прогрес симуляції */}
              {isSimulating && (
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 text-right">{progress}% завершено</p>
                </div>
              )}
              
              {/* Відображення помилки */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
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
            </div>
          </div>
          
          {/* Результати симуляції */}
          {simulationResults && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Результати симуляції</h3>
              
              {/* Порівняльні метрики */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Час наростання */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-sm mb-1 text-gray-700">Час наростання</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Поточні PID</p>
                      <p className="text-lg font-medium">
                        {simulationResults.metrics.current.riseTime.toFixed(3)} с
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Нові PID</p>
                      <p className={`text-lg font-medium ${
                        simulationResults.metrics.new.riseTime < simulationResults.metrics.current.riseTime 
                          ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {simulationResults.metrics.new.riseTime.toFixed(3)} с
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Час наростання показує, як швидко система реагує на зміну команди.
                  </p>
                </div>
                
                {/* Перерегулювання */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-sm mb-1 text-gray-700">Перерегулювання</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Поточні PID</p>
                      <p className="text-lg font-medium">
                        {simulationResults.metrics.current.overshoot.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Нові PID</p>
                      <p className={`text-lg font-medium ${
                        simulationResults.metrics.new.overshoot < simulationResults.metrics.current.overshoot 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {simulationResults.metrics.new.overshoot.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Перерегулювання - наскільки система перевищує цільове значення.
                  </p>
                </div>
                
                {/* Час встановлення */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-sm mb-1 text-gray-700">Час встановлення</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Поточні PID</p>
                      <p className="text-lg font-medium">
                        {simulationResults.metrics.current.settlingTime.toFixed(3)} с
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Нові PID</p>
                      <p className={`text-lg font-medium ${
                        simulationResults.metrics.new.settlingTime < simulationResults.metrics.current.settlingTime 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {simulationResults.metrics.new.settlingTime.toFixed(3)} с
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Час встановлення - коли система стабілізується навколо цільового значення.
                  </p>
                </div>
                
                {/* RMSE */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-sm mb-1 text-gray-700">Точність відстеження (RMSE)</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Поточні PID</p>
                      <p className="text-lg font-medium">
                        {simulationResults.metrics.current.rmse.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Нові PID</p>
                      <p className={`text-lg font-medium ${
                        simulationResults.metrics.new.rmse < simulationResults.metrics.current.rmse 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {simulationResults.metrics.new.rmse.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    RMSE - середньоквадратична помилка відстеження цільового значення.
                  </p>
                </div>
              </div>
              
              {/* Графіки симуляції */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Графік перехідної характеристики */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Перехідна характеристика</h4>
                  <div className="aspect-video">
                    <canvas ref={stepResponseChartRef} height="300"></canvas>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Графік показує, як система реагує на зміни команд (setpoint) з різними PID.
                  </p>
                </div>
                
                {/* Графік помилки відстеження */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Помилка відстеження</h4>
                  <div className="aspect-video">
                    <canvas ref={trackingChartRef} height="300"></canvas>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Графік показує відхилення від заданого значення. Менші відхилення означають кращу точність.
                  </p>
                </div>
                
                {/* Графік частотної характеристики */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Частотний спектр</h4>
                  <div className="aspect-video">
                    <canvas ref={frequencyResponseChartRef} height="300"></canvas>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Графік показує частотні характеристики системи. Ідеальний відгук має низькі значення на високих частотах.
                  </p>
                </div>
                
                {/* Висновки симуляції */}
                <div className="bg-blue-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3 text-blue-800">Висновки симуляції</h4>
                  <div className="space-y-2 text-blue-700">
                    {simulationResults.metrics.new.riseTime < simulationResults.metrics.current.riseTime && (
                      <p className="text-sm">
                        ✓ Покращено час відгуку системи на {
                          ((simulationResults.metrics.current.riseTime - simulationResults.metrics.new.riseTime) / 
                          simulationResults.metrics.current.riseTime * 100).toFixed(1)
                        }%
                      </p>
                    )}
                    
                    {simulationResults.metrics.new.overshoot < simulationResults.metrics.current.overshoot && (
                      <p className="text-sm">
                        ✓ Зменшено перерегулювання на {
                          ((simulationResults.metrics.current.overshoot - simulationResults.metrics.new.overshoot) / 
                          Math.max(0.1, simulationResults.metrics.current.overshoot) * 100).toFixed(1)
                        }%
                      </p>
                    )}
                    
                    {simulationResults.metrics.new.settlingTime < simulationResults.metrics.current.settlingTime && (
                      <p className="text-sm">
                        ✓ Скорочено час стабілізації на {
                          ((simulationResults.metrics.current.settlingTime - simulationResults.metrics.new.settlingTime) / 
                          simulationResults.metrics.current.settlingTime * 100).toFixed(1)
                        }%
                      </p>
                    )}
                    
                    {simulationResults.metrics.new.rmse < simulationResults.metrics.current.rmse && (
                      <p className="text-sm">
                        ✓ Підвищено точність відстеження на {
                          ((simulationResults.metrics.current.rmse - simulationResults.metrics.new.rmse) / 
                          simulationResults.metrics.current.rmse * 100).toFixed(1)
                        }%
                      </p>
                    )}
                    
                    {(simulationResults.metrics.new.riseTime >= simulationResults.metrics.current.riseTime &&
                      simulationResults.metrics.new.overshoot >= simulationResults.metrics.current.overshoot &&
                      simulationResults.metrics.new.settlingTime >= simulationResults.metrics.current.settlingTime &&
                      simulationResults.metrics.new.rmse >= simulationResults.metrics.current.rmse) && (
                      <p className="text-sm">
                        ⚠️ Запропоновані зміни не покращують поведінку системи за вимірюваними параметрами.
                        Спробуйте інші налаштування PID.
                      </p>
                    )}
                    
                    <p className="text-sm mt-4">
                      Рекомендовані налаштування для {simulationAxis.toUpperCase()} осі:
                      P={simulatedPids[simulationAxis].p}, 
                      I={simulatedPids[simulationAxis].i}, 
                      D={simulatedPids[simulationAxis].d},
                      F={simulatedPids[simulationAxis].f}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Команди CLI */}
              <div className="mt-6 bg-gray-800 rounded-lg p-4 text-white">
                <h4 className="font-medium text-lg mb-3 text-gray-200">Команди CLI для Betaflight</h4>
                <div className="bg-gray-900 p-3 rounded font-mono text-sm">
                  {`# PID налаштування для ${simulationAxis.toUpperCase()} осі
set p_${simulationAxis} = ${simulatedPids[simulationAxis].p}
set i_${simulationAxis} = ${simulatedPids[simulationAxis].i}
set d_${simulationAxis} = ${simulatedPids[simulationAxis].d}
set f_${simulationAxis} = ${simulatedPids[simulationAxis].f}
save`}
                </div>
                <button
                  onClick={() => {
                    const commands = `# PID налаштування для ${simulationAxis.toUpperCase()} осі
set p_${simulationAxis} = ${simulatedPids[simulationAxis].p}
set i_${simulationAxis} = ${simulatedPids[simulationAxis].i}
set d_${simulationAxis} = ${simulatedPids[simulationAxis].d}
set f_${simulationAxis} = ${simulatedPids[simulationAxis].f}
save`;
                    
                    navigator.clipboard.writeText(commands)
                      .then(() => {
                        alert('Команди CLI скопійовано до буфера обміну!');
                      })
                      .catch(err => {
                        console.error('Помилка копіювання: ', err);
                      });
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

export default PidSimulator;