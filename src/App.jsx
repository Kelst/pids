import React, { useState } from 'react'
import { FileUploader } from './components/FileUploader'
import { DataVisualizer } from './components/DataVisualizer'
import { BlackboxAnalyzer } from './utils/BlackboxAnalyzer'
import { ImprovedRecommendationGenerator } from './components/RecommendationGenerator'

function App() {
  const [blackBoxData, setBlackBoxData] = useState(null)
  const [processedData, setProcessedData] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

 // Змініть код обробки завантаження файлу в App.jsx
const handleFileUpload = async (file) => {
  setLoading(true)
  setError(null)
  
  try {
    // Parse and process the blackbox data
    const data = await BlackboxAnalyzer.parseFile(file)
    setBlackBoxData(data)
    
    // Перевіряємо кількість точок даних
    const dataPoints = data.data ? data.data.length : 0;
    
    // Показуємо інформацію про файл
    console.log(`Файл містить ${dataPoints} точок даних`);
    
    try {
      // Process and analyze the data
      const processed = BlackboxAnalyzer.analyzeData(data)
      setProcessedData(processed)
      
      // Generate recommendations based on the analysis
      const recs = BlackboxAnalyzer.generateRecommendations(processed)
      setRecommendations(recs)
      
      // Показуємо попередження, якщо є
      if (processed.warning) {
        setError(processed.warning);
      }
    } catch (analysisErr) {
      console.error('Error analyzing data:', analysisErr)
      setError(`${analysisErr.message} Спробуйте інший файл з більшою кількістю даних.`)
      // Продовжуємо виконання без вивалювання з помилкою
    }
  } catch (err) {
    console.error('Error processing blackbox data:', err)
    setError(`Помилка обробки даних: ${err.message}`)
  } finally {
    setLoading(false)
  }
}

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Betaflight Blackbox Analyzer</h1>
          <p className="text-gray-600">Upload your blackbox logs to analyze and generate PID and filter recommendations</p>
        </header>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <FileUploader onFileUpload={handleFileUpload} loading={loading} />
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}
        </div>

        {processedData && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Data Analysis</h2>
            <DataVisualizer data={processedData} />
          </div>
        )}

        {recommendations && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
            <ImprovedRecommendationGenerator recommendations={recommendations} />
          </div>
        )}
      </div>
    </div>
  )
}

export default App