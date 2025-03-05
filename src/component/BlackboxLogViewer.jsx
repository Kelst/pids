import React, { useState, useEffect, useRef } from 'react';
import _ from 'lodash';

const BlackboxLogViewer = () => {
  const [logData, setLogData] = useState(null);
  const [metadata, setMetadata] = useState({});
  const [flightData, setFlightData] = useState([]);
  const [visibleFlightData, setVisibleFlightData] = useState([]);
  const [activeTab, setActiveTab] = useState('metadata');
  const [isLoading, setIsLoading] = useState(false);
  const [dataHeaders, setDataHeaders] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const tableRef = useRef(null);
  const bodyRef = useRef(null);
  const headerRef = useRef(null);
  const rowHeight = 40; // Height of each row in pixels
  const bufferSize = 20; // Number of extra rows to render above and below the viewport
  
  // Column selection/visibility
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [columnSelectOpen, setColumnSelectOpen] = useState(false);
  
  const parseBlackboxLog = (content) => {
    setIsLoading(true);
    setErrorMessage('');
    
    // Using setTimeout to prevent UI blocking during parsing
    setTimeout(() => {
      try {
        // Split the content by lines
        const lines = content.split('\n');
        const newMetadata = {};
        let flightDataHeaderIndex = -1;
        
        // First pass - extract metadata and find where flight data begins
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Skip empty lines
          if (!line) continue;
          
          // Check if this line starts the flight data section
          if (line.startsWith('loopIteration')) {
            flightDataHeaderIndex = i;
            break;
          }
          
          // Process metadata lines (format: key | value)
          const parts = line.split(' | ');
          if (parts.length === 2) {
            newMetadata[parts[0].trim()] = parts[1].trim();
          }
        }
        
        // Set the metadata state
        setMetadata(newMetadata);
        
        // If we found the flight data section, parse it
        if (flightDataHeaderIndex !== -1) {
          // Extract the header and data rows
          const header = lines[flightDataHeaderIndex].split(' | ').map(h => h.trim());
          setDataHeaders(header);
          
          // Set initial selected columns - first column plus up to 9 more important ones
          let initialSelectedColumns = [header[0]]; // Always include first column
          
          // Add important columns if they exist
          const importantColumns = ['time', 'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]', 'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]'];
          importantColumns.forEach(col => {
            const colIndex = header.findIndex(h => h.toLowerCase() === col.toLowerCase());
            if (colIndex !== -1) {
              initialSelectedColumns.push(header[colIndex]);
            }
          });
          
          // Limit to 10 total columns
          initialSelectedColumns = initialSelectedColumns.slice(0, 10);
          setSelectedColumns(initialSelectedColumns);
          
          // Parse the flight data rows
          const parsedFlightData = [];
          
          for (let i = flightDataHeaderIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const rowData = line.split(' | ');
            if (rowData.length === header.length) {
              const rowObj = {};
              header.forEach((key, index) => {
                rowObj[key] = rowData[index].trim();
              });
              parsedFlightData.push(rowObj);
            }
          }
          
          setFlightData(parsedFlightData);
          updateVisibleData(0, parsedFlightData, viewportHeight);
        } else {
          setErrorMessage('Could not find flight data section in the log file.');
        }
        
        setLogData(content);
        setIsLoading(false);
      } catch (error) {
        console.error("Error parsing log file:", error);
        setErrorMessage(`Error parsing log file: ${error.message}`);
        setIsLoading(false);
      }
    }, 0);
  };

  // Update the visible rows based on scroll position
  const updateVisibleData = (scrollPosition, data = flightData, height = viewportHeight) => {
    if (!data.length) return;
    
    const startIndex = Math.max(0, Math.floor(scrollPosition / rowHeight) - bufferSize);
    const visibleRowsCount = Math.ceil(height / rowHeight) + 2 * bufferSize;
    const endIndex = Math.min(data.length, startIndex + visibleRowsCount);
    
    setVisibleFlightData(data.slice(startIndex, endIndex));
  };

  // Handle scroll events
  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
    updateVisibleData(e.target.scrollTop);
    
    // Sync horizontal scroll
    if (e.target === bodyRef.current && headerRef.current) {
      headerRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  // Calculate total scroll height
  const scrollHeight = flightData.length * rowHeight;
  
  // Calculate start position for visible rows
  const startOffset = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferSize) * rowHeight;

  // Toggle column selection
  const toggleColumnSelection = (column) => {
    if (selectedColumns.includes(column)) {
      // Don't allow deselecting the first column (loop iteration)
      if (column === dataHeaders[0]) return;
      
      setSelectedColumns(selectedColumns.filter(col => col !== column));
    } else {
      setSelectedColumns([...selectedColumns, column]);
    }
  };

  // Get description for metadata parameters
  const getMetadataDescription = (key) => {
    const descriptions = {
      'Product': 'Name and creator of the blackbox recorder',
      'firmwareType': 'Type of firmware used on the flight controller',
      'firmware': 'Major and minor version of Betaflight firmware',
      'firmwarePatch': 'Patch level of the Betaflight firmware',
      'firmwareVersion': 'Complete version number of the firmware',
      'Firmware revision': 'Full firmware identifier including build information',
      'Firmware date': 'Date and time when the firmware was compiled',
      'Board information': 'Model and manufacturer of the flight controller board',
      'Log start datetime': 'When the log recording began',
      'Craft name': 'Name assigned to the craft in Betaflight Configurator',
      'minthrottle': 'Minimum throttle value (PWM signal)',
      'maxthrottle': 'Maximum throttle value (PWM signal)',
      'gyroScale': 'Scaling factor for gyroscope readings',
      'motorOutput': 'Motor output range',
      'acc_1G': 'Accelerometer reading that corresponds to 1G (gravity)',
      'vbatscale': 'Scaling factor for battery voltage readings',
      'vbatmincellvoltage': 'Minimum allowed cell voltage (in 0.01V)',
      'vbatwarningcellvoltage': 'Warning threshold for cell voltage (in 0.01V)',
      'vbatmaxcellvoltage': 'Maximum expected cell voltage (in 0.01V)',
      'looptime': 'Duration of the main control loop in microseconds',
      'gyro_sync_denom': 'Gyro sampling divider',
      'pid_process_denom': 'PID calculation frequency divider',
      'thrMid': 'Throttle mid-point for expo curve (percentage)',
      'thrExpo': 'Throttle expo value - higher gives more sensitivity in middle range',
      'tpa_rate': 'Throttle PID attenuation rate',
      'tpa_breakpoint': 'Throttle value where TPA begins',
      'rc_rates': 'RC rate settings for roll, pitch, yaw (affects stick sensitivity)',
      'rc_expo': 'RC expo settings for roll, pitch, yaw (affects sensitivity around center)',
      'rates': 'Rate settings that determine maximum rotation rate',
      'rollPID': 'PID values for roll axis (P, I, D, Feed Forward, Transition)',
      'pitchPID': 'PID values for pitch axis (P, I, D, Feed Forward, Transition)',
      'yawPID': 'PID values for yaw axis (P, I, D, Feed Forward, Transition)',
      'levelPID': 'PID values for self-leveling (angle mode)',
      'anti_gravity_gain': 'Strength of anti-gravity feature (prevents I-term drop during quick throttle changes)',
      'anti_gravity_cutoff_hz': 'Cutoff frequency for anti-gravity filter',
      'deadband': 'RC deadband in microseconds (region around center with no response)',
      'yaw_deadband': 'RC deadband specific to yaw axis',
      'gyro_lowpass_hz': 'Cutoff frequency for gyro lowpass filter in Hz',
      'dterm_lowpass_hz': 'Cutoff frequency for D-term lowpass filter in Hz',
      'dyn_notch_count': 'Number of dynamic notch filters',
      'dyn_notch_q': 'Q factor (width) of dynamic notch filters',
      'dshot_bidir': 'Bidirectional DShot enabled (for RPM filtering)',
      'motor_poles': 'Number of motor poles (for RPM filtering)',
      'rpm_filter_fade_range_hz': 'Frequency range over which RPM filtering is phased out',
      'features': 'Enabled Betaflight features (bitmask)',
      'motor_pwm_rate': 'PWM frequency for motors',
      'dyn_idle_min_rpm': 'Minimum RPM for dynamic idle feature',
      'motor_output_limit': 'Maximum motor output as percentage'
    };

    // Return the description if available, otherwise empty string
    return descriptions[key] || '';
  };

  // Reset columns to default selection
  const resetColumnSelection = () => {
    // Always include first column
    let newSelection = [dataHeaders[0]]; 
    
    // Add important columns if they exist
    const importantColumns = ['time', 'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]', 'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]'];
    importantColumns.forEach(col => {
      const colIndex = dataHeaders.findIndex(h => h.toLowerCase() === col.toLowerCase());
      if (colIndex !== -1) {
        newSelection.push(dataHeaders[colIndex]);
      }
    });
    
    // Limit to 10 total columns
    newSelection = newSelection.slice(0, 10);
    setSelectedColumns(newSelection);
  };

  // Effect to measure the viewport
  useEffect(() => {
    if (bodyRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const newHeight = entry.contentRect.height;
          setViewportHeight(newHeight);
          updateVisibleData(scrollTop, flightData, newHeight);
        }
      });
      
      resizeObserver.observe(bodyRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [bodyRef, flightData, scrollTop]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      parseBlackboxLog(content);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the file. Please try again.');
      setIsLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="container mx-auto p-4 bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">Betaflight Blackbox Log Viewer</h1>
      
      {/* File upload section */}
      <div className="mb-6 bg-gray-50 p-4 rounded-md">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Betaflight Blackbox Log File
        </label>
        <input
          type="file"
          accept=".txt,.log,.csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-center py-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-gray-600">Processing log data...</p>
        </div>
      )}

      {logData && !isLoading && (
        <>
          {/* Tab navigation */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('metadata')}
                className={`mr-4 py-2 px-3 ${
                  activeTab === 'metadata'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Metadata ({Object.keys(metadata).length})
              </button>
              <button
                onClick={() => setActiveTab('flightData')}
                className={`py-2 px-3 ${
                  activeTab === 'flightData'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Flight Data ({flightData.length.toLocaleString()} rows)
              </button>
            </nav>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'metadata' && (
            <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Parameter
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(metadata).map(([key, value], index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                      <td className="px-6 py-2 text-sm font-medium text-gray-900">{key}</td>
                      <td className="px-6 py-2 text-sm text-gray-500 font-mono">
                        {value} <span className="ml-2 text-xs text-gray-400 italic">{getMetadataDescription(key)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'flightData' && dataHeaders.length > 0 && (
            <div className="shadow rounded-lg border border-gray-200">
              {/* Column selector */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center">
                <div className="relative inline-block text-left mr-2 mb-2">
                  <button
                    type="button"
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={() => setColumnSelectOpen(!columnSelectOpen)}
                  >
                    Select Columns
                    <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {columnSelectOpen && (
                    <div className="origin-top-left absolute left-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 max-h-96 overflow-y-auto">
                      <div className="py-1 divide-y divide-gray-200">
                        <div className="px-4 py-2">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-700">Available Columns</span>
                            <button 
                              onClick={resetColumnSelection}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Reset to Default
                            </button>
                          </div>
                        </div>
                        
                        {dataHeaders.map((column, index) => (
                          <div key={index} className="px-4 py-2 hover:bg-gray-100">
                            <label className="inline-flex items-center">
                              <input
                                type="checkbox"
                                className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                                checked={selectedColumns.includes(column)}
                                onChange={() => toggleColumnSelection(column)}
                                disabled={column === dataHeaders[0]} // First column cannot be deselected
                              />
                              <span className="ml-2 text-sm text-gray-700">{column}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="text-sm text-gray-500">
                  Showing {selectedColumns.length} of {dataHeaders.length} columns
                </div>
                
                <div className="ml-auto text-sm text-gray-500">
                  <span className="font-medium">{flightData.length.toLocaleString()}</span> rows
                </div>
              </div>
              
              {/* Table with virtual scrolling */}
              <div className="relative">
                {/* Fixed table header */}
                <div 
                  ref={headerRef}
                  className="overflow-x-auto bg-gray-50 border-b border-gray-200"
                >
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        {selectedColumns.map((column, index) => (
                          <th
                            key={index}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50"
                            style={{ minWidth: '120px' }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>
                
                {/* Virtual scrolling table body */}
                <div 
                  ref={bodyRef}
                  onScroll={handleScroll}
                  className="overflow-auto"
                  style={{ height: '60vh', position: 'relative' }}
                >
                  {/* Spacer div to maintain correct scroll height */}
                  <div style={{ height: scrollHeight, width: '1px' }}></div>
                  
                  {/* Actual visible rows with transform */}
                  <table 
                    className="min-w-full divide-y divide-gray-200"
                    style={{ 
                      position: 'absolute', 
                      top: 0,
                      transform: `translateY(${startOffset}px)`,
                      width: '100%'
                    }}
                  >
                    <tbody className="bg-white divide-y divide-gray-200">
                      {visibleFlightData.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                          {selectedColumns.map((column, cellIndex) => (
                            <td 
                              key={cellIndex} 
                              className="px-4 py-3 text-sm text-gray-500 font-mono whitespace-nowrap"
                              style={{ minWidth: '120px' }}
                            >
                              {row[column]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 text-xs text-gray-500 border-t border-gray-200">
                {flightData.length > 0 && (
                  <div>
                    <span className="font-medium">{flightData.length.toLocaleString()}</span> rows of flight data
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BlackboxLogViewer;