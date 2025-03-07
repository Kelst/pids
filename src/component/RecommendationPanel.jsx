import React, { useState } from 'react';

const RecommendationPanel = ({ recommendations }) => {
  const [showExplanations, setShowExplanations] = useState(false);

  if (!recommendations) return null;

  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Рекомендації</h3>
      
      <div className="mb-4 flex justify-between items-center">
        <button
          onClick={() => setShowExplanations(!showExplanations)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
        >
          {showExplanations ? 'Сховати пояснення' : 'Показати пояснення'}
          <svg 
            className={`ml-1 h-4 w-4 transform ${showExplanations ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* PID Recommendations */}
        <div className="bg-gray-50 p-4 rounded-lg shadow">
          <h4 className="font-medium text-lg mb-2">Рекомендовані PID</h4>
          <div className="space-y-4">
            {/* Roll */}
            <div className="border-b pb-2">
              <p className="font-medium text-gray-700">Roll</p>
              <div className="grid grid-cols-4 gap-2 mt-1">
                <div className="text-center">
                  <p className="text-sm text-gray-500">P</p>
                  <p className="font-mono">{recommendations.pid.roll.p}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">I</p>
                  <p className="font-mono">{recommendations.pid.roll.i}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">D</p>
                  <p className="font-mono">{recommendations.pid.roll.d}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">F</p>
                  <p className="font-mono">{recommendations.pid.roll.f}</p>
                </div>
              </div>
              {showExplanations && recommendations.explanations?.pid && (
                <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded">
                  {Object.entries(recommendations.explanations.pid)
                    .filter(([key]) => key.startsWith('roll'))
                    .map(([key, explanation]) => (
                      <p key={key} className="mb-1">{explanation}</p>
                    ))}
                </div>
              )}
            </div>
            
            {/* Pitch */}
            <div className="border-b pb-2">
              <p className="font-medium text-gray-700">Pitch</p>
              <div className="grid grid-cols-4 gap-2 mt-1">
                <div className="text-center">
                  <p className="text-sm text-gray-500">P</p>
                  <p className="font-mono">{recommendations.pid.pitch.p}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">I</p>
                  <p className="font-mono">{recommendations.pid.pitch.i}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">D</p>
                  <p className="font-mono">{recommendations.pid.pitch.d}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">F</p>
                  <p className="font-mono">{recommendations.pid.pitch.f}</p>
                </div>
              </div>
              {showExplanations && recommendations.explanations?.pid && (
                <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded">
                  {Object.entries(recommendations.explanations.pid)
                    .filter(([key]) => key.startsWith('pitch'))
                    .map(([key, explanation]) => (
                      <p key={key} className="mb-1">{explanation}</p>
                    ))}
                </div>
              )}
            </div>
            
            {/* Yaw */}
            <div className="border-b pb-2">
              <p className="font-medium text-gray-700">Yaw</p>
              <div className="grid grid-cols-4 gap-2 mt-1">
                <div className="text-center">
                  <p className="text-sm text-gray-500">P</p>
                  <p className="font-mono">{recommendations.pid.yaw.p}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">I</p>
                  <p className="font-mono">{recommendations.pid.yaw.i}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">D</p>
                  <p className="font-mono">{recommendations.pid.yaw.d}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">F</p>
                  <p className="font-mono">{recommendations.pid.yaw.f}</p>
                </div>
              </div>
              {showExplanations && recommendations.explanations?.pid && (
                <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded">
                  {Object.entries(recommendations.explanations.pid)
                    .filter(([key]) => key.startsWith('yaw'))
                    .map(([key, explanation]) => (
                      <p key={key} className="mb-1">{explanation}</p>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Filter Recommendations */}
        <div className="bg-gray-50 p-4 rounded-lg shadow">
          <h4 className="font-medium text-lg mb-2">Рекомендовані фільтри</h4>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-sm text-gray-500">Gyro Lowpass:</p>
                <p className="font-mono">{recommendations.filters.gyro_lowpass_hz} Гц</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">D-term Lowpass:</p>
                <p className="font-mono">{recommendations.filters.dterm_lowpass_hz} Гц</p>
              </div>
            </div>
            
            {showExplanations && recommendations.explanations?.filters && (
              <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded mt-1">
                {recommendations.explanations.filters.gyro_lowpass && (
                  <p className="mb-1">{recommendations.explanations.filters.gyro_lowpass}</p>
                )}
                {recommendations.explanations.filters.dterm_lowpass && (
                  <p className="mb-1">{recommendations.explanations.filters.dterm_lowpass}</p>
                )}
              </div>
            )}
            
            <div className="border-t pt-2 mt-2">
              <p className="font-medium text-gray-700 mb-1">Dynamic Notch фільтри</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm text-gray-500">Кількість:</p>
                  <p className="font-mono">{recommendations.filters.dyn_notch_count}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Q-фактор:</p>
                  <p className="font-mono">{recommendations.filters.dyn_notch_q}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Мін. частота:</p>
                  <p className="font-mono">{recommendations.filters.dyn_notch_min_hz} Гц</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Макс. частота:</p>
                  <p className="font-mono">{recommendations.filters.dyn_notch_max_hz} Гц</p>
                </div>
              </div>
              
              {showExplanations && recommendations.explanations?.filters && (
                <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded mt-1">
                  {recommendations.explanations.filters.notch && (
                    <p className="mb-1">{recommendations.explanations.filters.notch}</p>
                  )}
                  {recommendations.explanations.filters.notch_q_factors && (
                    <p className="mb-1">{recommendations.explanations.filters.notch_q_factors}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Axis Interaction Explanations */}
      {showExplanations && recommendations.explanations?.interactions && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
          <h4 className="font-medium text-blue-700 mb-1">Взаємодія між осями</h4>
          <div className="text-sm text-blue-700">
            {Object.entries(recommendations.explanations.interactions).map(([key, explanation]) => (
              <p key={key} className="mb-1">{explanation}</p>
            ))}
          </div>
        </div>
      )}
      
      {/* CLI Commands for Betaflight */}
      <div className="bg-gray-800 rounded-lg p-4 shadow text-white font-mono overflow-x-auto">
        <h4 className="font-medium text-lg mb-2 text-gray-200">Команди CLI для Betaflight</h4>
        <div className="whitespace-pre-wrap text-sm">
          {recommendations.betaflightCommands.join('\n')}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(recommendations.betaflightCommands.join('\n'))
              .then(() => alert('Команди скопійовано до буфера обміну!'))
              .catch(err => console.error('Помилка копіювання: ', err));
          }}
          className="mt-3 py-1 px-3 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
        >
          Копіювати команди
        </button>
      </div>
    </div>
  );
};

export default RecommendationPanel;