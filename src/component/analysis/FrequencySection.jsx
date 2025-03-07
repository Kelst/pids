import React from 'react';

const FrequencySection = ({ frequencyAnalysis }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow">
      <h4 className="font-medium text-lg mb-2">Частотна характеристика</h4>
      {frequencyAnalysis && Object.keys(frequencyAnalysis).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(frequencyAnalysis).map(([axis, analysis]) => (
            <div key={axis} className="border-b pb-2">
              <p className="font-medium text-gray-700 capitalize">{axis}</p>
              <div className="mt-1">
                <p className="text-sm text-gray-500">Домінуючі частоти:</p>
                {analysis.dominantFrequencies && analysis.dominantFrequencies.length > 0 ? (
                  <ul className="list-disc list-inside pl-2 text-sm">
                    {analysis.dominantFrequencies.map((freq, idx) => (
                      <li key={idx} className="font-mono">
                        {freq.frequency.toFixed(1)} Гц (амплітуда: {freq.magnitude.toFixed(1)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">Не виявлено.</p>
                )}
                <p className="text-sm text-gray-500 mt-1">Рівень шуму:</p>
                <p className="font-mono">{analysis.noiseLevel.toFixed(2)}</p>
                
                {analysis.filteredVsUnfiltered && analysis.filteredVsUnfiltered.ratio && (
                  <div>
                    <p className="text-sm text-gray-500 mt-1">Відношення шуму (фільтр./нефільтр.):</p>
                    <p className="font-mono">{analysis.filteredVsUnfiltered.ratio.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Немає даних для аналізу частотної характеристики.</p>
      )}
    </div>
  );
};

export default FrequencySection;