import React, { useState } from 'react'

export function ImprovedRecommendationGenerator({ recommendations, issues }) {
  const [copiedCommand, setCopiedCommand] = useState(null)
  const [activeTab, setActiveTab] = useState('pid')
  
  const copyToClipboard = (command, index) => {
    navigator.clipboard.writeText(command)
    setCopiedCommand(index)
    setTimeout(() => setCopiedCommand(null), 2000)
  }
  
  // Допоміжна функція для відображення іконки відповідно до важкості проблеми
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
      case 'medium':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
    }
  }
  
  return (
    <div>
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="text-lg font-medium text-yellow-800 mb-2">⚠️ Примітки щодо рекомендацій</h3>
        <p className="text-sm text-yellow-700">
          Ці рекомендації згенеровані на основі аналізу даних логу Blackbox. 
          Завжди тестуйте нові налаштування поступово і в безпечному середовищі. 
          Зробіть резервну копію поточної конфігурації перед внесенням змін.
        </p>
      </div>
      
      {issues && issues.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Виявлені проблеми</h3>
          <div className="space-y-3">
            {issues.map((issue, index) => (
              <div 
                key={index} 
                className={`p-3 rounded-md flex items-start ${
                  issue.severity === 'high' 
                    ? 'bg-red-50 border border-red-200' 
                    : issue.severity === 'medium' 
                      ? 'bg-yellow-50 border border-yellow-200' 
                      : 'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className="mr-3 mt-1">
                  {getSeverityIcon(issue.severity)}
                </div>
                <div>
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                  <p className="text-sm font-medium mt-2">Рішення: {issue.solution}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="mb-4 border-b border-gray-200">
        <ul className="flex flex-wrap -mb-px">
          <li className="mr-2">
            <button
              className={`inline-block py-2 px-4 font-medium text-sm rounded-t-lg ${
                activeTab === 'pid' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-600 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('pid')}
            >
              PID налаштування
            </button>
          </li>
          <li className="mr-2">
            <button
              className={`inline-block py-2 px-4 font-medium text-sm rounded-t-lg ${
                activeTab === 'filters' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-600 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('filters')}
            >
              Фільтри
            </button>
          </li>
          <li>
            <button
              className={`inline-block py-2 px-4 font-medium text-sm rounded-t-lg ${
                activeTab === 'cli' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-600 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('cli')}
            >
              CLI команди
            </button>
          </li>
        </ul>
      </div>
      
      <div className="space-y-6">
        {activeTab === 'pid' && (
          <div>
            <h3 className="text-lg font-medium mb-3">Рекомендації PID налаштувань</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-2 text-center">Roll</h4>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">P:</span>
                  <span className="font-medium">{recommendations.pid.roll?.P || '-'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">I:</span>
                  <span className="font-medium">{recommendations.pid.roll?.I || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">D:</span>
                  <span className="font-medium">{recommendations.pid.roll?.D || '-'}</span>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-2 text-center">Pitch</h4>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">P:</span>
                  <span className="font-medium">{recommendations.pid.pitch?.P || '-'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">I:</span>
                  <span className="font-medium">{recommendations.pid.pitch?.I || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">D:</span>
                  <span className="font-medium">{recommendations.pid.pitch?.D || '-'}</span>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-2 text-center">Yaw</h4>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">P:</span>
                  <span className="font-medium">{recommendations.pid.yaw?.P || '-'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">I:</span>
                  <span className="font-medium">{recommendations.pid.yaw?.I || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">D:</span>
                  <span className="font-medium">{recommendations.pid.yaw?.D || '-'}</span>
                </div>
              </div>
            </div>
            
            {recommendations.pid.feedforward && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Feed-Forward налаштування</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Roll:</span>
                      <span className="font-medium">{recommendations.pid.feedforward.roll}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pitch:</span>
                      <span className="font-medium">{recommendations.pid.feedforward.pitch}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-md">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Yaw:</span>
                      <span className="font-medium">{recommendations.pid.feedforward.yaw}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {recommendations.pid.notes && recommendations.pid.notes.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="font-medium mb-1">Примітки</h4>
                <ul className="text-sm text-blue-800 list-disc pl-5">
                  {recommendations.pid.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'filters' && (
          <div>
            <h3 className="text-lg font-medium mb-3">Рекомендації фільтрів</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-3">Фільтри гіроскопа</h4>
                {recommendations.filters.gyro && Object.entries(recommendations.filters.gyro).map(([key, value]) => (
                  <div key={key} className="flex justify-between mb-2">
                    <span className="text-gray-600">{key}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-3">Фільтри D-term</h4>
                {recommendations.filters.dterm && Object.entries(recommendations.filters.dterm).map(([key, value]) => (
                  <div key={key} className="flex justify-between mb-2">
                    <span className="text-gray-600">{key}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-medium mb-3">Динамічний Notch-фільтр</h4>
                {recommendations.filters.dynamic_notch && Object.entries(recommendations.filters.dynamic_notch).map(([key, value]) => (
                  <div key={key} className="flex justify-between mb-2">
                    <span className="text-gray-600">{key}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              
              {recommendations.filters.rpm_filter && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="font-medium mb-3">RPM фільтр</h4>
                  {Object.entries(recommendations.filters.rpm_filter).map(([key, value]) => (
                    <div key={key} className="flex justify-between mb-2">
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {recommendations.filters.notes && recommendations.filters.notes.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="font-medium mb-1">Примітки</h4>
                <ul className="text-sm text-blue-800 list-disc pl-5">
                  {recommendations.filters.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'cli' && (
          <div>
            <h3 className="text-lg font-medium mb-3">Повний набір CLI команд</h3>
            <div className="relative">
              <pre className="bg-gray-800 text-gray-200 p-4 rounded-md overflow-x-auto text-sm font-mono">
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
                {copiedCommand === 'full-set' ? 'Скопійовано!' : 'Копіювати все'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}