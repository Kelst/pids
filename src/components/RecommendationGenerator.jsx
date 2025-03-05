import React, { useState } from 'react'

export function RecommendationGenerator({ recommendations }) {
  const [copiedCommand, setCopiedCommand] = useState(null)
  
  const copyToClipboard = (command, index) => {
    navigator.clipboard.writeText(command)
    setCopiedCommand(index)
    setTimeout(() => setCopiedCommand(null), 2000)
  }
  
  return (
    <div>
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="text-lg font-medium text-yellow-800 mb-2">⚠️ Recommendation Notes</h3>
        <p className="text-sm text-yellow-700">
          These recommendations are generated based on analysis of your Blackbox log data. 
          Always test new settings gradually and in a safe environment. Backup your current
          configuration before making changes.
        </p>
      </div>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-3">PID Tuning Recommendations</h3>
          <div className="space-y-3">
            {recommendations.pid.map((rec, index) => (
              <div 
                key={index} 
                className="flex items-start justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100"
              >
                <div>
                  <p className="font-medium">{rec.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className={`px-3 py-1 text-sm rounded ${
                      copiedCommand === `pid-${index}` 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                    onClick={() => copyToClipboard(rec.command, `pid-${index}`)}
                  >
                    {copiedCommand === `pid-${index}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium mb-3">Filter Recommendations</h3>
          <div className="space-y-3">
            {recommendations.filters.map((rec, index) => (
              <div 
                key={index} 
                className="flex items-start justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100"
              >
                <div>
                  <p className="font-medium">{rec.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    className={`px-3 py-1 text-sm rounded ${
                      copiedCommand === `filter-${index}` 
                        ? 'bg-green-500 text-white' 
                        : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                    onClick={() => copyToClipboard(rec.command, `filter-${index}`)}
                  >
                    {copiedCommand === `filter-${index}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium mb-3">Full CLI Command Set</h3>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-x-auto text-sm">
              {recommendations.fullCommandSet.join('\n')}
            </pre>
            <button
              className={`absolute top-2 right-2 px-3 py-1 text-sm rounded ${
                copiedCommand === 'full-set' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
              }`}
              onClick={() => copyToClipboard(recommendations.fullCommandSet.join('\n'), 'full-set')}
            >
              {copiedCommand === 'full-set' ? 'Copied!' : 'Copy All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}