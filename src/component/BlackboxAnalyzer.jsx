import React, { useState, useEffect } from 'react';
import useBlackboxStore from '../store/blackboxStore';
import AnalysisResults from './AnalysisResults';
import RecommendationPanel from './RecommendationPanel';
import { 
  analyzeErrorMetrics, 
  analyzeStepResponse, 
  analyzeFrequencyCharacteristics, 
  analyzeHarmonicDistortion, 
  analyzeFilters,
  generateRecommendations
} from '../services/blackboxAnalysisService';

const BlackboxAnalyzer = () => {
  // Отримуємо дані зі сховища
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
  const [analysisStats, setAnalysisStats] = useState({
    startTime: null,
    processingTime: {},
    memoryUsage: {}
  });

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
      
      // Фіксуємо час початку аналізу
      const startTime = performance.now();
      setAnalysisStats({
        startTime,
        processingTime: {},
        memoryUsage: {}
      });

      // Виводимо інформацію про розмір даних
      console.log(`Starting analysis of ${flightData.length} data rows (full dataset)`);

      // Всі кроки аналізу з обробкою помилок для кожного кроку
      const steps = [
        { name: 'Аналіз відхилень', func: () => analyzeErrorMetrics(flightData, dataHeaders), progress: 20 },
        { name: 'Аналіз швидкості реакції', func: () => analyzeStepResponse(flightData, dataHeaders, metadata), progress: 40 },
        { name: 'Аналіз частотної характеристики', func: () => analyzeFrequencyCharacteristics(flightData, dataHeaders, metadata), progress: 60 },
        { name: 'Аналіз гармонійності руху', func: () => analyzeHarmonicDistortion(flightData, dataHeaders, metadata), progress: 80 },
        { name: 'Аналіз фільтрів', func: () => analyzeFilters(flightData, dataHeaders, metadata), progress: 100 }
      ];

      let results = {};
      const processingTimes = {};
      
      // Виконуємо кожен крок аналізу послідовно
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgress(i > 0 ? steps[i-1].progress : 0);
        console.log(`Executing step: ${step.name} (using full dataset of ${flightData.length} points)`);
        
        try {
          // Вимірюємо час виконання кроку
          const stepStartTime = performance.now();
          
          // Виконуємо крок з очищенням пам'яті
          const stepResult = await step.func();
          
          // Зберігаємо результати та час виконання
          results = { ...results, ...stepResult };
          const stepEndTime = performance.now();
          processingTimes[step.name] = (stepEndTime - stepStartTime) / 1000; // в секундах
          
          // Оновлюємо статистику
          setAnalysisStats(prev => ({
            ...prev,
            processingTime: {
              ...prev.processingTime,
              [step.name]: processingTimes[step.name]
            }
          }));
          
          setProgress(step.progress);
          
          // Короткі паузи для UI під час тривалих обчислень
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Примусове очищення пам'яті
          if (global.gc) {
            global.gc();
          }
        } catch (stepError) {
          console.error(`Error in step ${step.name}:`, stepError);
          setError(`Помилка у кроці ${step.name}: ${stepError.message}`);
          // Продовжуємо з наступним кроком
        }
      }

      // Встановлюємо результати аналізу
      setAnalysisResults(results);

      // Генеруємо рекомендації на основі результатів аналізу
      try {
        console.log('Generating recommendations based on full dataset analysis');
        const recommendStartTime = performance.now();
        const generatedRecommendations = generateRecommendations(results, metadata);
        const recommendEndTime = performance.now();
        processingTimes['Recommendations'] = (recommendEndTime - recommendStartTime) / 1000;
        
        setRecommendations(generatedRecommendations);
        
        // Оновлюємо статистику
        setAnalysisStats(prev => ({
          ...prev,
          processingTime: {
            ...prev.processingTime,
            'Recommendations': processingTimes['Recommendations']
          }
        }));
      } catch (recError) {
        console.error("Error generating recommendations:", recError);
        setError(`Помилка генерації рекомендацій: ${recError.message}`);
      }

      // Завершення аналізу
      const endTime = performance.now();
      const totalTime = (endTime - startTime) / 1000; // в секундах
      
      console.log(`Analysis of full dataset (${flightData.length} points) completed in ${totalTime.toFixed(2)} seconds`);
      console.log('Processing times per step:', processingTimes);
      
      // Оновлюємо статистику
      setAnalysisStats(prev => ({
        ...prev,
        processingTime: {
          ...prev.processingTime,
          'Total': totalTime
        }
      }));
      
      setProgress(100);
      setTimeout(() => {
        setAnalyzing(false);
      }, 200);

    } catch (err) {
      console.error("Global analysis error:", err);
      setError(`Помилка аналізу: ${err.message}`);
      setAnalyzing(false);
    }
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
          {/* Кнопка аналізу */}
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
              Аналіз повного набору даних може зайняти до кількох хвилин, залежно від обсягу даних ({flightData.length.toLocaleString()} записів).
            </p>
          </div>

          {/* Індикатор прогресу */}
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
              
              {/* Додаткова інформація про поточний крок */}
              {Object.keys(analysisStats.processingTime).length > 0 && (
                <div className="mt-2 p-2 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-500">Тривалість кроків аналізу:</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {Object.entries(analysisStats.processingTime).map(([step, time]) => (
                      <div key={step} className="text-xs">
                        <span className="font-medium">{step}:</span> {time.toFixed(2)}s
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
          {analysisResults && <AnalysisResults analysisResults={analysisResults} />}

          {/* Рекомендації */}
          {recommendations && <RecommendationPanel recommendations={recommendations} />}
          
          {/* Інформація про аналіз */}
          {analysisResults && analysisStats.processingTime.Total && (
            <div className="mt-6 p-3 bg-gray-50 rounded-md">
              <h4 className="text-sm font-semibold text-gray-700">Інформація про аналіз</h4>
              <p className="text-xs text-gray-600">
                Проаналізовано {flightData.length.toLocaleString()} записів. 
                Загальний час аналізу: {analysisStats.processingTime.Total.toFixed(2)} секунд.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BlackboxAnalyzer;