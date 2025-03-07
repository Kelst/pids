import React from 'react';
import ErrorMetricsSection from './analysis/ErrorMetricsSection';
import StepResponseSection from './analysis/StepResponseSection';
import FrequencySection from './analysis/FrequencySection';
import HarmonicSection from './analysis/HarmonicSection';
import FilterSection from './analysis/FilterSection';

const AnalysisResults = ({ analysisResults }) => {
  if (!analysisResults) return null;

  return (
    <div className="mt-6">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Результати аналізу</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Error Metrics Analysis */}
        <ErrorMetricsSection errorMetrics={analysisResults.errorMetrics} />

        {/* Step Response Analysis */}
        <StepResponseSection stepResponseMetrics={analysisResults.stepResponseMetrics} />

        {/* Frequency Analysis */}
        <FrequencySection frequencyAnalysis={analysisResults.frequencyAnalysis} />

        {/* Harmonic Analysis */}
        <HarmonicSection harmonicAnalysis={analysisResults.harmonicAnalysis} />
      </div>

      {/* Filter Analysis */}
      <FilterSection filterAnalysis={analysisResults.filterAnalysis} />
    </div>
  );
};

export default AnalysisResults;