import React from 'react';

const FilterSection = ({ filterAnalysis }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow mb-6">
      <h4 className="font-medium text-lg mb-2">Аналіз фільтрів</h4>
      {filterAnalysis ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gyro Filters */}
          <div className="border-b pb-2">
            <p className="font-medium text-gray-700">Фільтри гіроскопа</p>
            <div className="mt-1 space-y-1">
              <p className="text-sm">
                <span className="text-gray-500">Ефективність:</span>
                <span className="ml-2 font-mono">{(filterAnalysis.gyroFilters.effectiveness * 100).toFixed(1)}%</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Фазова затримка:</span>
                <span className="ml-2 font-mono">{filterAnalysis.gyroFilters.phaseDelay.toFixed(2)} мс</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Рекомендована частота:</span>
                <span className="ml-2 font-mono">{filterAnalysis.gyroFilters.recommendedFrequency} Гц</span>
              </p>
              
              {filterAnalysis.gyroFilters.noiseReduction && (
                <div className="mt-1">
                  <p className="text-sm text-gray-500">Зниження шуму по осям:</p>
                  <div className="grid grid-cols-3 gap-1">
                    <p className="text-sm">X: {filterAnalysis.gyroFilters.noiseReduction.x.toFixed(2)}</p>
                    <p className="text-sm">Y: {filterAnalysis.gyroFilters.noiseReduction.y.toFixed(2)}</p>
                    <p className="text-sm">Z: {filterAnalysis.gyroFilters.noiseReduction.z.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* D-term Filters */}
          <div className="border-b pb-2">
            <p className="font-medium text-gray-700">D-term фільтри</p>
            <div className="mt-1 space-y-1">
              <p className="text-sm">
                <span className="text-gray-500">Ефективність:</span>
                <span className="ml-2 font-mono">{(filterAnalysis.dtermFilters.effectiveness * 100).toFixed(1)}%</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Фазова затримка:</span>
                <span className="ml-2 font-mono">{filterAnalysis.dtermFilters.phaseDelay.toFixed(2)} мс</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Рекомендована частота:</span>
                <span className="ml-2 font-mono">{filterAnalysis.dtermFilters.recommendedFrequency} Гц</span>
              </p>
              
              {filterAnalysis.dtermFilters.noiseRatio !== undefined && (
                <p className="text-sm">
                  <span className="text-gray-500">Відношення шуму:</span>
                  <span className="ml-2 font-mono">{filterAnalysis.dtermFilters.noiseRatio.toFixed(2)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Notch Filters */}
          <div className="border-b pb-2">
            <p className="font-medium text-gray-700">Notch фільтри</p>
            <div className="mt-1 space-y-1">
              <p className="text-sm">
                <span className="text-gray-500">Ефективність:</span>
                <span className="ml-2 font-mono">{(filterAnalysis.notchFilters.effectiveness * 100).toFixed(1)}%</span>
              </p>
              <p className="text-sm text-gray-500">Виявлені частоти шуму:</p>
              {filterAnalysis.notchFilters.identifiedNoiseFrequencies && 
               filterAnalysis.notchFilters.identifiedNoiseFrequencies.length > 0 ? (
                <ul className="list-disc list-inside pl-2 text-sm">
                  {filterAnalysis.notchFilters.identifiedNoiseFrequencies.map((noise, idx) => (
                    <li key={idx} className="font-mono">
                      {noise.frequency.toFixed(1)} Гц (амплітуда: {noise.magnitude.toFixed(1)}, вісь: {noise.axis})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Не виявлено.</p>
              )}
              
              {filterAnalysis.notchFilters.recommendedQFactors && (
                <div className="mt-1">
                  <p className="text-sm text-gray-500">Рекомендовані Q-фактори:</p>
                  <p className="text-sm font-mono">
                    Середній: {filterAnalysis.notchFilters.recommendedQFactors.average}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RPM Filters */}
          <div className="border-b pb-2">
            <p className="font-medium text-gray-700">RPM фільтри</p>
            <div className="mt-1 space-y-1">
              <p className="text-sm">
                <span className="text-gray-500">Ефективність:</span>
                <span className="ml-2 font-mono">{(filterAnalysis.rpmFilters.effectiveness * 100).toFixed(1)}%</span>
              </p>
              <p className="text-sm text-gray-500">Частоти шуму моторів:</p>
              {filterAnalysis.rpmFilters.motorNoiseFrequencies && 
               filterAnalysis.rpmFilters.motorNoiseFrequencies.length > 0 ? (
                <ul className="list-disc list-inside pl-2 text-sm">
                  {filterAnalysis.rpmFilters.motorNoiseFrequencies.map((motor, idx) => (
                    <li key={idx} className="font-mono">
                      Мотор {motor.motorIndex + 1}: 
                      {motor.frequencies.map((freq, i) => 
                        `${i > 0 ? ', ' : ' '}${freq.frequency.toFixed(1)} Гц`
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Не виявлено.</p>
              )}
              
              {filterAnalysis.rpmFilters.detectedHarmonics && 
               filterAnalysis.rpmFilters.detectedHarmonics.length > 0 && (
                <div className="mt-1">
                  <p className="text-sm text-gray-500">Виявлені гармоніки:</p>
                  <ul className="list-disc list-inside pl-2 text-sm">
                    {filterAnalysis.rpmFilters.detectedHarmonics.slice(0, 3).map((harmonic, idx) => (
                      <li key={idx} className="font-mono">
                        Гармоніка {harmonic.harmonic}: {harmonic.frequency.toFixed(1)} Гц 
                        (мотор {harmonic.motorIndex + 1})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Немає даних для аналізу фільтрів.</p>
      )}
    </div>
  );
};

export default FilterSection;