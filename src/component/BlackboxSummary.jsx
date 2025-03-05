import React from 'react';
import useBlackboxStore from '../store/blackboxStore';

// Спрощена версія компонента для уникнення рекурсії
const BlackboxSummary = () => {
  // Отримуємо тільки базові дані, використовуючи селектори для запобігання зайвих ререндерів
  const metadata = useBlackboxStore(state => state.metadata);
  const flightData = useBlackboxStore(state => state.flightData);
  const dataHeaders = useBlackboxStore(state => state.dataHeaders);
  const isLoading = useBlackboxStore(state => state.isLoading);

  // Знаходимо основну інформацію без складних обчислень
  let flightTimeSeconds = 0;
  let maxGyroX = 0;
  let maxGyroY = 0;
  let maxGyroZ = 0;
  const avgMotorValues = {};
  const maxMotorValues = {};

  if (flightData.length && dataHeaders.length) {
    // Знаходимо важливі стовпці, якщо вони є
    const timeColumn = dataHeaders.find(h => h.toLowerCase() === 'time');
    const gyroX = dataHeaders.find(h => h.toLowerCase() === 'gyroadc[0]');
    const gyroY = dataHeaders.find(h => h.toLowerCase() === 'gyroadc[1]');
    const gyroZ = dataHeaders.find(h => h.toLowerCase() === 'gyroadc[2]');
    const motors = dataHeaders.filter(h => h.toLowerCase().startsWith('motor['));

    // Прості розрахунки - без useMemo
    if (timeColumn) {
      const lastTimeEntry = parseFloat(flightData[flightData.length - 1][timeColumn]);
      const firstTimeEntry = parseFloat(flightData[0][timeColumn]);
      flightTimeSeconds = (lastTimeEntry - firstTimeEntry) / 1000000; // Припускаємо, що час у мікросекундах
    }

    // Базова статистика гіроскопа
    if (gyroX) {
      // Обмежуємо обчислення на 100 записах для швидкості, це просто для прикладу
      const sampleSize = Math.min(100, flightData.length);
      for (let i = 0; i < sampleSize; i++) {
        const value = Math.abs(parseFloat(flightData[i][gyroX]) || 0);
        if (value > maxGyroX) maxGyroX = value;
      }
    }
    
    if (gyroY) {
      const sampleSize = Math.min(100, flightData.length);
      for (let i = 0; i < sampleSize; i++) {
        const value = Math.abs(parseFloat(flightData[i][gyroY]) || 0);
        if (value > maxGyroY) maxGyroY = value;
      }
    }
    
    if (gyroZ) {
      const sampleSize = Math.min(100, flightData.length);
      for (let i = 0; i < sampleSize; i++) {
        const value = Math.abs(parseFloat(flightData[i][gyroZ]) || 0);
        if (value > maxGyroZ) maxGyroZ = value;
      }
    }

    // Базова статистика моторів - тільки на перших 100 записах
    if (motors.length) {
      const sampleSize = Math.min(100, flightData.length);
      
      motors.forEach(motor => {
        let sum = 0;
        let max = 0;
        
        for (let i = 0; i < sampleSize; i++) {
          const value = parseFloat(flightData[i][motor]) || 0;
          sum += value;
          if (value > max) max = value;
        }
        
        avgMotorValues[motor] = sum / sampleSize;
        maxMotorValues[motor] = max;
      });
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-4 my-4">
        <h2 className="text-lg font-semibold mb-3">Зведена інформація</h2>
        <div className="text-center py-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Обробка даних логу...</p>
        </div>
      </div>
    );
  }

  if (!flightData.length) {
    return (
      <div className="bg-white shadow rounded-lg p-4 my-4">
        <h2 className="text-lg font-semibold mb-3">Зведена інформація</h2>
        <p className="text-gray-500">Завантажте лог-файл Blackbox для перегляду зведеної інформації.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-4 my-4">
      <h2 className="text-lg font-semibold mb-3">Зведена інформація Blackbox</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Базова інформація */}
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-md font-medium mb-2">Загальна інформація</h3>
          <ul className="space-y-1">
            <li className="text-sm"><span className="font-medium">Кількість рядків даних:</span> {flightData.length.toLocaleString()}</li>
            <li className="text-sm"><span className="font-medium">Час польоту:</span> {flightTimeSeconds.toFixed(2)} сек</li>
            {metadata['firmwareVersion'] && (
              <li className="text-sm"><span className="font-medium">Версія прошивки:</span> {metadata['firmwareVersion']}</li>
            )}
            {metadata['Craft name'] && (
              <li className="text-sm"><span className="font-medium">Назва апарату:</span> {metadata['Craft name']}</li>
            )}
          </ul>
        </div>
        
        {/* Інформація про гіроскоп */}
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-md font-medium mb-2">Гіроскоп (Вибіркові максимальні значення)</h3>
          <ul className="space-y-1">
            <li className="text-sm"><span className="font-medium">X-вісь:</span> {maxGyroX.toFixed(2)}</li>
            <li className="text-sm"><span className="font-medium">Y-вісь:</span> {maxGyroY.toFixed(2)}</li>
            <li className="text-sm"><span className="font-medium">Z-вісь:</span> {maxGyroZ.toFixed(2)}</li>
          </ul>
        </div>
        
        {/* Інформація про мотори (середні значення) */}
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-md font-medium mb-2">Мотори (Вибіркові середні значення)</h3>
          <ul className="space-y-1">
            {Object.entries(avgMotorValues).map(([motor, value]) => (
              <li key={motor} className="text-sm">
                <span className="font-medium">{motor}:</span> {value.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Інформація про мотори (максимальні значення) */}
        <div className="bg-gray-50 p-3 rounded-md">
          <h3 className="text-md font-medium mb-2">Мотори (Вибіркові максимальні значення)</h3>
          <ul className="space-y-1">
            {Object.entries(maxMotorValues).map(([motor, value]) => (
              <li key={motor} className="text-sm">
                <span className="font-medium">{motor}:</span> {value.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* PID налаштування з метаданих, якщо доступні */}
      {(metadata['rollPID'] || metadata['pitchPID'] || metadata['yawPID']) && (
        <div className="mt-4 bg-gray-50 p-3 rounded-md">
          <h3 className="text-md font-medium mb-2">PID Налаштування</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {metadata['rollPID'] && (
              <div>
                <h4 className="text-sm font-medium">Roll PID</h4>
                <p className="text-sm font-mono">{metadata['rollPID']}</p>
              </div>
            )}
            {metadata['pitchPID'] && (
              <div>
                <h4 className="text-sm font-medium">Pitch PID</h4>
                <p className="text-sm font-mono">{metadata['pitchPID']}</p>
              </div>
            )}
            {metadata['yawPID'] && (
              <div>
                <h4 className="text-sm font-medium">Yaw PID</h4>
                <p className="text-sm font-mono">{metadata['yawPID']}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlackboxSummary;