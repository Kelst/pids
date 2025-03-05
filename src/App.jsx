import React from 'react'
import { useState } from 'react'
import BlackboxLogViewer from './component/BlackboxLogViewer'
import BlackboxSummary from './component/BlackboxSummary'

function App() {
  const [activeSection, setActiveSection] = useState('viewer')
  
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="bg-gray-800 text-white p-4 rounded-lg mb-4">
        <h1 className="text-2xl font-bold">Blackbox Log Analyzer</h1>
        <p className="text-gray-300">Аналіз та візуалізація логів Betaflight Blackbox</p>
      </header>
      
      {/* Навігація */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveSection('viewer')}
            className={`mr-8 py-4 px-1 ${
              activeSection === 'viewer'
                ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Перегляд логів
          </button>
          <button
            onClick={() => setActiveSection('summary')}
            className={`mr-8 py-4 px-1 ${
              activeSection === 'summary'
                ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Зведена інформація
          </button>
        </nav>
      </div>
      
      {/* Умовний рендеринг відповідного компонента */}
      {activeSection === 'viewer' && <BlackboxLogViewer />}
      {activeSection === 'summary' && <BlackboxSummary />}
    </div>
  )
}

export default App