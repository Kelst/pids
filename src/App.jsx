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
      console.log(`File contains ${dataPoints} data points`)
      
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
        setError(`${analysisErr.message} Try another file with more data points.`)
      }
    } catch (err) {
      console.error('Error processing blackbox data:', err)
      setError(`Data processing error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-gray-800 py-8 p-10" >
      <div className="max-w-6xl mx-auto px-4">
        {/* Header Section */}
        <header className="mb-8 bg-white bg-opacity-10 rounded-lg p-6 backdrop-blur-sm shadow-lg">
          <div className="flex items-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <h1 className="text-3xl font-bold text-white">Betaflight Blackbox Analyzer</h1>
          </div>
          <p className="text-blue-200">Upload your blackbox logs to analyze flight data and generate optimized PID and filter recommendations</p>
        </header>

        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8 transition-all duration-300 hover:shadow-xl">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Upload Log File
          </h2>
          
          <FileUploader onFileUpload={handleFileUpload} loading={loading} />
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Analysis Section */}
        {processedData && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v12.59l1.95-2.1a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 111.1-1.02l1.95 2.1V2.75A.75.75 0 0110 2z" clipRule="evenodd" />
                <path d="M2 13a2 2 0 012-2h4.586a1 1 0 00.707-.293l2-2a1 1 0 10-1.414-1.414l-2 2a1 1 0 01-.707.293H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-4.586a1 1 0 01-.707-.293l-2-2a1 1 0 00-1.414 1.414l2 2a1 1 0 01.707.293H16a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
              </svg>
              Flight Data Analysis
            </h2>
            <DataVisualizer data={processedData} />
          </div>
        )}

        {/* Recommendations Section */}
        {recommendations && (
          <div className="bg-white rounded-lg shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Tuning Recommendations
            </h2>
            <ImprovedRecommendationGenerator recommendations={recommendations} />
          </div>
        )}
        
        {/* Footer */}
        <footer className="mt-12 text-center text-blue-200 text-sm opacity-80">
          <p>Betaflight Blackbox Analyzer &copy; {new Date().getFullYear()}</p>
          <p className="mt-1">For educational and tuning purposes only</p>
        </footer>
      </div>
    </div>
  )
}

export default App