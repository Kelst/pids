import React from 'react';

const ErrorMetricsSection = ({ errorMetrics }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg shadow">
      <h4 className="font-medium text-lg mb-2">Аналіз відхилень</h4>
      {errorMetrics && Object.keys(errorMetrics).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(errorMetrics).map(([axis, metrics]) => (
            <div key={axis} className="border-b pb-2">
              <p className="font-medium text-gray-700 capitalize">{axis}</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <p className="text-sm text-gray-500">RMS відхилення:</p>
                  <p className="font-mono">{metrics.rmsError.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Макс. відхилення:</p>
                  <p className="font-mono">{metrics.maxError.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Сер. відхилення:</p>
                  <p className="font-mono">{metrics.meanError.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Станд. відхилення:</p>
                  <p className="font-mono">{metrics.stdDeviation.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Немає даних для аналізу відхилень.</p>
      )}
    </div>
  );
};

export default ErrorMetricsSection;