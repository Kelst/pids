import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import useBlackboxStore from '../store/blackboxStore';
import { generateOptimalPidSettings, generateBetaflightCommands } from '../services/pidOptimizerService';

const PidOptimizer = () => {
  const { flightData, dataHeaders, metadata } = useBlackboxStore();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [mode, setMode] = useState('standard');
  const [error, setError] = useState(null);
  
  // Процес аналізу даних польоту
  const analyzeFlightData = async () => {
    if (!flightData || flightData.length === 0) {
      setError("Немає даних для аналізу. Спочатку завантажте лог-файл.");
      return;
    }
    
    try {
      setIsAnalyzing(true);
      setProgress(0);
      setError(null);
      
      // Імітація прогресу аналізу
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 5;
          return newProgress > 90 ? 90 : newProgress;
        });
      }, 300);
      
      // Виконання аналізу
      const analyzedResults = await generateOptimalPidSettings(flightData, dataHeaders, metadata, mode);
      
      // Генерація команд CLI
      analyzedResults.betaflightCommands = generateBetaflightCommands(analyzedResults.recommendedPid);
      
      // Завершення аналізу
      clearInterval(progressInterval);
      setProgress(100);
      setResults(analyzedResults);
      
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 500);
      
    } catch (err) {
      setError(`Помилка аналізу: ${err.message}`);
      setIsAnalyzing(false);
    }
  };
  
  // Копіювання CLI команд
  const copyCliCommands = () => {
    if (!results?.betaflightCommands) return;
    
    const commands = results.betaflightCommands.join('\n');
    navigator.clipboard.writeText(commands)
      .then(() => {
        alert('Команди CLI скопійовано до буфера обміну!');
      })
      .catch(err => {
        console.error('Помилка копіювання: ', err);
        setError('Не вдалося скопіювати команди. Спробуйте вручну.');
      });
  };
  
  // Графіки для візуалізації оптимізації
  const getPerformanceChartData = () => {
    if (!results) return null;
    
    const labels = ['Чутливість', 'Стабільність', 'Точність', 'Усунення шуму', 'Час стабілізації'];
    
    // Дані для Roll осі
    const rollData = {
      labels,
      datasets: [
        {
          label: 'Поточні налаштування',
          backgroundColor: 'rgba(160, 160, 160, 0.2)',
          borderColor: 'rgba(160, 160, 160, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(160, 160, 160, 1)',
          data: [0.6, 0.7, 0.65, 0.6, 0.7],
          fill: true,
        },
        {
          label: 'Оптимізовані налаштування',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(54, 162, 235, 1)',
          data: [
            0.6 + (results.performanceChange.responsiveness.roll || 0),
            0.7 + (results.performanceChange.stability.roll || 0),
            0.65 - (results.performanceChange.overshoot.roll || 0) / 100,
            0.6 + (results.performanceChange.noiseRejection.roll || 0),
            0.7 - (results.performanceChange.settlingTime.roll || 0) / 500
          ],
          fill: true,
        }
      ]
    };
    
    return rollData;
  };
  
  const chartOptions = {
    scales: {
      r: {
        angleLines: {
          display: true
        },
        suggestedMin: 0,
        suggestedMax: 1
      }
    }
  };
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Оптимізатор PID налаштувань</h2>
      
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
                Завантажте лог-файл Blackbox перш ніж запускати аналіз.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Вибір режиму оптимізації */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Режим оптимізації:</label>
            <div className="flex space-x-4">
              <div className="flex items-center">
                <input
                  id="mode-standard"
                  name="optimization-mode"
                  type="radio"
                  checked={mode === 'standard'}
                  onChange={() => setMode('standard')}
                  className="h-4 w-4 text-blue-600"
                />
                <label htmlFor="mode-standard" className="ml-2 block text-sm text-gray-700">
                  Стандартний режим
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="mode-cinematic"
                  name="optimization-mode"
                  type="radio"
                  checked={mode === 'cinematic'}
                  onChange={() => setMode('cinematic')}
                  className="h-4 w-4 text-blue-600"
                />
                <label htmlFor="mode-cinematic" className="ml-2 block text-sm text-gray-700">
                  Режим відеозйомки
                </label>
              </div>
            </div>
            {mode === 'cinematic' && (
              <div className="mt-2 p-2 bg-blue-50 text-sm text-blue-700 rounded">
                Режим відеозйомки оптимізує PID для плавного польоту, зменшення вібрацій та запобігання перегріву моторів.
              </div>
            )}
          </div>
          
          {/* Кнопка запуску аналізу */}
          <div className="mb-6">
            <button
              onClick={analyzeFlightData}
              disabled={isAnalyzing}
              className={`py-2 px-4 rounded-md font-medium ${
                isAnalyzing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isAnalyzing ? 'Аналіз...' : 'Оптимізувати PID параметри'}
            </button>
            <p className="mt-2 text-sm text-gray-600">
              Аналіз вашого польоту з {flightData.length.toLocaleString()} записів для створення оптимальних PID налаштувань.
            </p>
          </div>
          
          {/* Індикатор прогресу */}
          {isAnalyzing && (
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
          
          {/* Результати оптимізації */}
          {results && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Оптимізовані PID налаштування</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Зліва: Roll PID */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Roll Axis</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {['P', 'I', 'D', 'F'].map((term, index) => {
                      const lowerTerm = term.toLowerCase();
                      const currentValue = results.originalPid.roll[lowerTerm];
                      const newValue = results.recommendedPid.roll[lowerTerm];
                      const isIncrease = newValue > currentValue;
                      
                      return (
                        <div key={index} className="text-center">
                          <p className="text-sm font-semibold text-gray-700">{term}</p>
                          <div className="flex items-center justify-center mt-1">
                            <span className="text-gray-500 text-sm">{currentValue}</span>
                            <span className="mx-2 text-gray-400">→</span>
                            <span className={`font-medium ${isIncrease ? 'text-green-600' : 'text-blue-600'}`}>
                              {newValue}
                            </span>
                          </div>
                          <div className="text-xs mt-1">
                            {isIncrease ? (
                              <span className="text-green-600">+{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            ) : (
                              <span className="text-blue-600">{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs text-gray-600">
                    <p>{results.explanations.roll.p}</p>
                    <p className="mt-1">{results.explanations.roll.i}</p>
                    <p className="mt-1">{results.explanations.roll.d}</p>
                  </div>
                </div>
                
                {/* Центр: Pitch PID */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Pitch Axis</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {['P', 'I', 'D', 'F'].map((term, index) => {
                      const lowerTerm = term.toLowerCase();
                      const currentValue = results.originalPid.pitch[lowerTerm];
                      const newValue = results.recommendedPid.pitch[lowerTerm];
                      const isIncrease = newValue > currentValue;
                      
                      return (
                        <div key={index} className="text-center">
                          <p className="text-sm font-semibold text-gray-700">{term}</p>
                          <div className="flex items-center justify-center mt-1">
                            <span className="text-gray-500 text-sm">{currentValue}</span>
                            <span className="mx-2 text-gray-400">→</span>
                            <span className={`font-medium ${isIncrease ? 'text-green-600' : 'text-blue-600'}`}>
                              {newValue}
                            </span>
                          </div>
                          <div className="text-xs mt-1">
                            {isIncrease ? (
                              <span className="text-green-600">+{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            ) : (
                              <span className="text-blue-600">{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs text-gray-600">
                    <p>{results.explanations.pitch.p}</p>
                    <p className="mt-1">{results.explanations.pitch.i}</p>
                    <p className="mt-1">{results.explanations.pitch.d}</p>
                  </div>
                </div>
                
                {/* Справа: Yaw PID */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Yaw Axis</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {['P', 'I', 'D', 'F'].map((term, index) => {
                      const lowerTerm = term.toLowerCase();
                      const currentValue = results.originalPid.yaw[lowerTerm];
                      const newValue = results.recommendedPid.yaw[lowerTerm];
                      const isIncrease = newValue > currentValue;
                      
                      return (
                        <div key={index} className="text-center">
                          <p className="text-sm font-semibold text-gray-700">{term}</p>
                          <div className="flex items-center justify-center mt-1">
                            <span className="text-gray-500 text-sm">{currentValue}</span>
                            <span className="mx-2 text-gray-400">→</span>
                            <span className={`font-medium ${isIncrease ? 'text-green-600' : 'text-blue-600'}`}>
                              {newValue}
                            </span>
                          </div>
                          <div className="text-xs mt-1">
                            {isIncrease ? (
                              <span className="text-green-600">+{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            ) : (
                              <span className="text-blue-600">{Math.round((newValue - currentValue) / currentValue * 100)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs text-gray-600">
                    <p>{results.explanations.yaw.p}</p>
                    <p className="mt-1">{results.explanations.yaw.i}</p>
                    <p className="mt-1">{results.explanations.yaw.d}</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Графік ефективності */}
                <div className="bg-gray-50 p-4 rounded-lg shadow">
                  <h4 className="font-medium text-lg mb-3">Очікувані покращення</h4>
                  <div className="h-64">
                    {getPerformanceChartData() && (
                      <div className="radar-chart-container">
                        <Line
                          data={getPerformanceChartData()}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: {
                                position: 'bottom',
                              }
                            },
                            scales: {
                              y: {
                                min: 0,
                                max: 1,
                                ticks: {
                                  stepSize: 0.2
                                }
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-600">
                      Графік показує очікувані покращення продуктивності з оптимізованими PID.
                      Вищі значення означають краще.
                    </p>
                  </div>
                </div>
                
                {/* Команди CLI */}
                <div className="bg-gray-800 rounded-lg p-4 text-white">
                  <h4 className="font-medium text-lg mb-3 text-gray-200">Команди CLI для Betaflight</h4>
                  <div className="bg-gray-900 p-3 rounded h-56 overflow-y-auto font-mono text-sm">
                    {results.betaflightCommands && results.betaflightCommands.map((command, index) => (
                      <div key={index} className={command.startsWith('#') ? 'text-gray-400 mt-2' : 'text-green-400'}>
                        {command}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={copyCliCommands}
                    className="mt-3 py-1 px-3 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                  >
                    Копіювати команди
                  </button>
                </div>
              </div>
              
              {/* Загальні рекомендації */}
              {results.explanations.general && results.explanations.general.length > 0 && (
                <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
                  <h4 className="font-medium text-blue-700 mb-2">Загальні рекомендації</h4>
                  {results.explanations.general.map((explanation, index) => (
                    <p key={index} className="text-sm text-blue-700 mb-1">{explanation}</p>
                  ))}
                </div>
              )}
              
              {/* Рівень впевненості */}
              <div className="mt-6 bg-gray-50 p-3 rounded-md">
                <div className="flex items-center mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">Рівень впевненості в рекомендаціях</h4>
                  <div className="ml-auto flex items-center">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${((results.confidentLevel.roll + results.confidentLevel.pitch + results.confidentLevel.yaw) / 3) * 100}%` }}
                      ></div>
                    </div>
                    <span className="ml-2 text-xs text-gray-600">
                      {Math.round(((results.confidentLevel.roll + results.confidentLevel.pitch + results.confidentLevel.yaw) / 3) * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  Алгоритм оптимізації проаналізував {flightData.length.toLocaleString()} точок даних для створення цих рекомендацій.
                  Вищий рівень впевненості вказує на більш надійні рекомендації.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PidOptimizer;