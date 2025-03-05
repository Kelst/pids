import React, { useState } from 'react'
import { FileUploader } from './components/FileUploader'
import { DataVisualizer } from './components/DataVisualizer'
import { BlackboxAnalyzer } from './utils/BlackboxAnalyzer'
import { ImprovedRecommendationGenerator } from './components/RecommendationGenerator'

function App() {
  // State management
  const [blackBoxData, setBlackBoxData] = useState(null)
  const [processedData, setProcessedData] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Handle file upload and data processing
   * @param {File} file - The uploaded blackbox log file
   */
  const handleFileUpload = async (file) => {
    setLoading(true)
    setError(null)
    
    try {
      // Parse and process the blackbox data
      const data = await BlackboxAnalyzer.parseFile(file)
      setBlackBoxData(data)
      
      // Check the number of data points
      const dataPoints = data.data ? data.data.length : 0
      console.log(`Файл містить ${dataPoints} точок даних`)
      
      try {
        // Analyze the parsed data
        const processed = BlackboxAnalyzer.analyzeData(data)
        setProcessedData(processed)
        
        // Generate recommendations based on the analysis
        const recs = BlackboxAnalyzer.generateRecommendations(processed)
        setRecommendations(recs)
        
        // Display warnings if present
        if (processed.warning) {
          setError(processed.warning)
        }
      } catch (analysisErr) {
        console.error('Error analyzing data:', analysisErr)
        setError(`${analysisErr.message} Спробуйте інший файл з більшою кількістю даних.`)
      }
    } catch (err) {
      console.error('Error processing blackbox data:', err)
      setError(`Помилка обробки даних: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-700 via-gray-800 to-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header Section */}
        <header className="mb-8 bg-black bg-opacity-30 rounded-lg p-6 backdrop-blur-sm shadow-xl border border-gray-700">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <h1 className="text-3xl font-bold text-white">Betaflight Blackbox Analyzer</h1>
          </div>
          <p className="text-blue-200">Upload your blackbox logs to analyze and generate PID and filter recommendations</p>
        </header>

        {/* File Upload Section */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-white flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Завантаження файлу логу
          </h2>
          
          <FileUploader onFileUpload={handleFileUpload} loading={loading} />
          
          {error && (
            <div className="mt-4 p-4 bg-red-900 bg-opacity-25 border-l-4 border-red-500 text-red-200 rounded-md flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Analysis Section */}
        {processedData && (
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Аналіз даних
            </h2>
            <DataVisualizer data={processedData} />
          </div>
        )}

        {/* Recommendations Section */}
        {recommendations && (
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Рекомендації
            </h2>
            <ImprovedRecommendationGenerator recommendations={recommendations} />
          </div>
        )}
        
        {/* Footer */}
        <footer className="mt-12 text-center text-gray-400 text-sm py-4">
          <p>Betaflight Blackbox Analyzer &copy; {new Date().getFullYear()}</p>
          <p className="mt-1">Лише для освітніх та налагоджувальних цілей</p>
        </footer>
      </div>
    </div>
  )
}

export default App