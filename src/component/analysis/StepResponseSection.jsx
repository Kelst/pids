import React from 'react';

const StepResponseSection = ({ stepResponseMetrics }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow">
      <h4 className="font-medium text-lg mb-2">Аналіз швидкості реакції</h4>
      {stepResponseMetrics && Object.keys(stepResponseMetrics).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(stepResponseMetrics).map(([axis, metrics]) => (
            <div key={axis} className="border-b pb-2">
              <p className="font-medium text-gray-700 capitalize">{axis}</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <p className="text-sm text-gray-500">Час встановлення:</p>
                  <p className="font-mono">{metrics.settlingTime.toFixed(2)} мс</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Перерегулювання:</p>
                  <p className="font-mono">{metrics.overshoot.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Час наростання:</p>
                  <p className="font-mono">{metrics.riseTime.toFixed(2)} мс</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Коефіцієнт загасання:</p>
                  <p className="font-mono">{metrics.dampingRatio?.toFixed(2) || "н/д"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Частота коливань:</p>
                  <p className="font-mono">{metrics.oscillationFreq?.toFixed(1) || "н/д"} Гц</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Швидкість загасання:</p>
                  <p className="font-mono">{metrics.decayRate?.toFixed(1) || "н/д"}%</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Немає даних для аналізу швидкості реакції.</p>
      )}
    </div>
  );
};

export default StepResponseSection;