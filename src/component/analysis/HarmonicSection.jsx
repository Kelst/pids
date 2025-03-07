import React from 'react';

const HarmonicSection = ({ harmonicAnalysis }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow">
      <h4 className="font-medium text-lg mb-2">Аналіз гармонійності руху</h4>
      {harmonicAnalysis && Object.keys(harmonicAnalysis).filter(key => !key.includes('axis')).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(harmonicAnalysis)
            .filter(([key]) => !key.includes('axis'))
            .map(([axis, analysis]) => (
              <div key={axis} className="border-b pb-2">
                <p className="font-medium text-gray-700 capitalize">{axis}</p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <p className="text-sm text-gray-500">THD (коеф. гарм. спотворень):</p>
                    <p className="font-mono">{analysis.thd?.toFixed(2) || 'н/д'}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Оцінка стабільності:</p>
                    <p className="font-mono">{analysis.stabilityScore?.toFixed(1) || 'н/д'}/100</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Небажані коливання:</p>
                    <p className={`font-medium ${analysis.oscillationDetected ? 'text-red-500' : 'text-green-500'}`}>
                      {analysis.oscillationDetected ? 'Виявлено' : 'Не виявлено'}
                    </p>
                  </div>
                </div>
              </div>
          ))}
          
          {/* Axis Interactions */}
          {harmonicAnalysis.axisInteractions && (
            <div className="mt-2">
              <p className="font-medium text-gray-700">Взаємодія між осями</p>
              <div className="mt-1 space-y-1">
                {Object.entries(harmonicAnalysis.axisInteractions).map(([axesPair, data]) => (
                  <div key={axesPair}>
                    <p className="text-sm">
                      <span className="text-gray-500">{axesPair.replace('_', '-')}:</span>
                      <span className="ml-2 font-mono">
                        кореляція: {data.correlation?.toFixed(2) || 'н/д'}, 
                        сила зв'язку: {(data.couplingStrength * 100)?.toFixed(0) || 'н/д'}%
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Common Harmonics */}
          {harmonicAnalysis.commonHarmonics && harmonicAnalysis.commonHarmonics.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-gray-700">Спільні гармоніки</p>
              <ul className="list-disc list-inside pl-2 text-sm">
                {harmonicAnalysis.commonHarmonics.slice(0, 3).map((harmonic, idx) => (
                  <li key={idx} className="font-mono">
                    {harmonic.frequency?.toFixed(1) || 'н/д'} Гц 
                    (присутня на осях: {harmonic.axes?.join(', ') || 'н/д'})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Немає даних для аналізу гармонійності руху.</p>
      )}
    </div>
  );
};

export default HarmonicSection;