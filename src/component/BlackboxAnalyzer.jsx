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
  // Get data from store
  const { 
    flightData, 
    metadata, 
    dataHeaders 
  } = useBlackboxStore();

  // State for analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [error, setError] = useState(null);

  // Data analysis function
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

      // Check data size and log
      console.log(`Starting analysis of ${flightData.length} data rows`);

      // All analysis steps with error handling for each step
      const steps = [
        { name: 'Аналіз відхилень', func: () => analyzeErrorMetrics(flightData, dataHeaders), progress: 20 },
        { name: 'Аналіз швидкості реакції', func: () => analyzeStepResponse(flightData, dataHeaders, metadata), progress: 40 },
        { name: 'Аналіз частотної характеристики', func: () => analyzeFrequencyCharacteristics(flightData, dataHeaders, metadata), progress: 60 },
        { name: 'Аналіз гармонійності руху', func: () => analyzeHarmonicDistortion(flightData, dataHeaders, metadata), progress: 80 },
        { name: 'Аналіз фільтрів', func: () => analyzeFilters(flightData, dataHeaders, metadata), progress: 100 }
      ];

      let results = {};
      
      // Execute each analysis step sequentially
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setProgress(i > 0 ? steps[i-1].progress : 0);
        console.log(`Executing step: ${step.name}`);
        
        try {
          // Execute step with timeout for UI update
          const stepResult = await step.func();
          results = { ...results, ...stepResult };
          setProgress(step.progress);
          
          // Short pause to let browser "breathe"
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (stepError) {
          console.error(`Error in step ${step.name}:`, stepError);
          setError(`Помилка у кроці ${step.name}: ${stepError.message}`);
          // Continue with next step
        }
      }

      // Set analysis results
      setAnalysisResults(results);

      // Generate recommendations based on analysis results
      try {
        console.log('Generating recommendations');
        const generatedRecommendations = generateRecommendations(results, metadata);
        setRecommendations(generatedRecommendations);
      } catch (recError) {
        console.error("Error generating recommendations:", recError);
        setError(`Помилка генерації рекомендацій: ${recError.message}`);
      }

      // Complete analysis
      console.log('Analysis completed');
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
          {/* Analysis button */}
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

          {/* Progress bar */}
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

          {/* Error message */}
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

          {/* Analysis Results */}
          {analysisResults && <AnalysisResults analysisResults={analysisResults} />}

          {/* Recommendations */}
          {recommendations && <RecommendationPanel recommendations={recommendations} />}
        </>
      )}
    </div>
  );
};

export default BlackboxAnalyzer;