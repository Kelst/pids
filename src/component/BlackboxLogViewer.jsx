import React, { useState, useEffect, useRef } from 'react';
import _ from 'lodash';
import useBlackboxStore from '../store/blackboxStore';

const BlackboxLogViewer = () => {
  // Отримуємо дані та функції зі сховища Zustand
  const {
    logData,
    metadata,
    flightData,
    dataHeaders,
    selectedColumns,
    isLoading,
    errorMessage,
    parseBlackboxLog,
    toggleColumnSelection,
    resetColumnSelection,
    setErrorMessage
  } = useBlackboxStore();

  // Локальний стан для UI компонента
  const [activeTab, setActiveTab] = useState('metadata');
  const [visibleFlightData, setVisibleFlightData] = useState([]);
  const [columnSelectOpen, setColumnSelectOpen] = useState(false);
  
  // Стан для віртуального скролінгу
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const tableRef = useRef(null);
  const bodyRef = useRef(null);
  const headerRef = useRef(null);
  const rowHeight = 40; // Висота кожного рядка в пікселях
  const bufferSize = 20; // Кількість додаткових рядків для рендерингу вище та нижче вікна перегляду
  
  // Оновлюємо видимі рядки на основі позиції прокрутки
  const updateVisibleData = (scrollPosition, data = flightData, height = viewportHeight) => {
    if (!data.length) return;
    
    const startIndex = Math.max(0, Math.floor(scrollPosition / rowHeight) - bufferSize);
    const visibleRowsCount = Math.ceil(height / rowHeight) + 2 * bufferSize;
    const endIndex = Math.min(data.length, startIndex + visibleRowsCount);
    
    setVisibleFlightData(data.slice(startIndex, endIndex));
  };

  // Обробка подій прокрутки
  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
    updateVisibleData(e.target.scrollTop);
    
    // Синхронізуємо горизонтальну прокрутку
    if (e.target === bodyRef.current && headerRef.current) {
      headerRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  // Розрахунок загальної висоти прокрутки
  const scrollHeight = flightData.length * rowHeight;
  
  // Розрахунок початкової позиції для видимих рядків
  const startOffset = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferSize) * rowHeight;

  // Отримання опису для параметрів метаданих
  const getMetadataDescription = (key) => {
    const descriptions = {
      'Product': 'Назва та виробник рекордера blackbox',
      'firmwareType': 'Тип прошивки, яка використовується на польотному контролері',
      'firmware': 'Мажорна і мінорна версія прошивки Betaflight',
      'firmwarePatch': 'Рівень патчу прошивки Betaflight',
      'firmwareVersion': 'Повний номер версії прошивки',
      'Firmware revision': 'Повний ідентифікатор прошивки включно з інформацією про збірку',
      'Firmware date': 'Дата та час компіляції прошивки',
      'Board information': 'Модель та виробник плати польотного контролера',
      'Log start datetime': 'Коли розпочався запис логу',
      'Craft name': 'Ім\'я, присвоєне апарату в Betaflight Configurator',
      'minthrottle': 'Мінімальне значення газу (PWM сигнал)',
      'maxthrottle': 'Максимальне значення газу (PWM сигнал)',
      'gyroScale': 'Коефіцієнт масштабування для показів гіроскопа',
      'motorOutput': 'Діапазон вихідного сигналу мотора',
      'acc_1G': 'Показання акселерометра, що відповідає 1G (гравітації)',
      'vbatscale': 'Коефіцієнт масштабування для напруги батареї',
      'vbatmincellvoltage': 'Мінімально допустима напруга комірки (у 0.01В)',
      'vbatwarningcellvoltage': 'Поріг попередження для напруги комірки (у 0.01В)',
      'vbatmaxcellvoltage': 'Максимальна очікувана напруга комірки (у 0.01В)',
      'looptime': 'Тривалість основного контрольного циклу в мікросекундах',
      'gyro_sync_denom': 'Дільник для частоти вибірки гіроскопа',
      'pid_process_denom': 'Дільник для частоти розрахунку PID',
      'thrMid': 'Середня точка газу для кривої expo (відсоток)',
      'thrExpo': 'Значення expo газу - вище дає більшу чутливість у середньому діапазоні',
      'tpa_rate': 'Швидкість послаблення PID від газу',
      'tpa_breakpoint': 'Значення газу, де починається TPA',
      'rc_rates': 'Налаштування RC rate для крену, тангажу, рискання (впливає на чутливість стіків)',
      'rc_expo': 'Налаштування RC expo для крену, тангажу, рискання (впливає на чутливість біля центру)',
      'rates': 'Налаштування швидкості, що визначають максимальну швидкість обертання',
      'rollPID': 'Значення PID для осі крену (P, I, D, Feed Forward, Transition)',
      'pitchPID': 'Значення PID для осі тангажу (P, I, D, Feed Forward, Transition)',
      'yawPID': 'Значення PID для осі рискання (P, I, D, Feed Forward, Transition)',
      'levelPID': 'Значення PID для самовирівнювання (angle mode)',
      'anti_gravity_gain': 'Сила функції анти-гравітації (запобігає падінню I-терм під час швидких змін газу)',
      'anti_gravity_cutoff_hz': 'Частота зрізу для фільтра анти-гравітації',
      'deadband': 'Мертва зона RC в мікросекундах (область навколо центру без відповіді)',
      'yaw_deadband': 'Мертва зона RC спеціально для осі рискання',
      'gyro_lowpass_hz': 'Частота зрізу для низькочастотного фільтра гіроскопа в Гц',
      'dterm_lowpass_hz': 'Частота зрізу для низькочастотного фільтра D-терму в Гц',
      'dyn_notch_count': 'Кількість динамічних режекторних фільтрів',
      'dyn_notch_q': 'Q-фактор (ширина) динамічних режекторних фільтрів',
      'dshot_bidir': 'Увімкнено двонаправлений DShot (для RPM фільтрації)',
      'motor_poles': 'Кількість полюсів мотора (для RPM фільтрації)',
      'rpm_filter_fade_range_hz': 'Діапазон частот, у якому RPM фільтрація зменшується',
      'features': 'Увімкнені функції Betaflight (бітова маска)',
      'motor_pwm_rate': 'Частота PWM для моторів',
      'dyn_idle_min_rpm': 'Мінімальні оберти для функції динамічного холостого ходу',
      'motor_output_limit': 'Максимальний вихід мотора як відсоток'
    };

    // Повертаємо опис, якщо він доступний, інакше порожній рядок
    return descriptions[key] || '';
  };

  // Ефект для вимірювання області перегляду
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

  // Ефект для оновлення видимих даних при зміні даних польоту
  useEffect(() => {
    if (flightData.length > 0) {
      updateVisibleData(scrollTop);
    }
  }, [flightData]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      parseBlackboxLog(content);
    };
    reader.onerror = () => {
      setErrorMessage('Не вдалося прочитати файл. Будь ласка, спробуйте ще раз.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="container mx-auto p-4 bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">Betaflight Blackbox Log Viewer</h1>
      
      {/* Секція завантаження файлу */}
      <div className="mb-6 bg-gray-50 p-4 rounded-md">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Завантажити файл логів Betaflight Blackbox
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

      {/* Повідомлення про помилку */}
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

      {/* Індикатор завантаження */}
      {isLoading && (
        <div className="text-center py-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-gray-600">Обробка даних логу...</p>
        </div>
      )}

      {logData && !isLoading && (
        <>
          {/* Навігація по вкладках */}
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
                Метадані ({Object.keys(metadata).length})
              </button>
              <button
                onClick={() => setActiveTab('flightData')}
                className={`py-2 px-3 ${
                  activeTab === 'flightData'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Дані польоту ({flightData.length.toLocaleString()} рядків)
              </button>
            </nav>
          </div>

          {/* Контент на основі активної вкладки */}
          {activeTab === 'metadata' && (
            <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Параметр
                    </th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Значення
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
              {/* Селектор стовпців */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center">
                <div className="relative inline-block text-left mr-2 mb-2">
                  <button
                    type="button"
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={() => setColumnSelectOpen(!columnSelectOpen)}
                  >
                    Вибрати стовпці
                    <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {columnSelectOpen && (
                    <div className="origin-top-left absolute left-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 max-h-96 overflow-y-auto">
                      <div className="py-1 divide-y divide-gray-200">
                        <div className="px-4 py-2">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-700">Доступні стовпці</span>
                            <button 
                              onClick={resetColumnSelection}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Скинути до стандартних
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
                                disabled={column === dataHeaders[0]} // Перший стовпець не можна деактивувати
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
                  Показано {selectedColumns.length} з {dataHeaders.length} стовпців
                </div>
                
                <div className="ml-auto text-sm text-gray-500">
                  <span className="font-medium">{flightData.length.toLocaleString()}</span> рядків
                </div>
              </div>
              
              {/* Таблиця з віртуальним скролінгом */}
              <div className="relative">
                {/* Фіксований заголовок таблиці */}
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
                
                {/* Тіло таблиці з віртуальним скролінгом */}
                <div 
                  ref={bodyRef}
                  onScroll={handleScroll}
                  className="overflow-auto"
                  style={{ height: '60vh', position: 'relative' }}
                >
                  {/* Div-проміжок для підтримки правильної висоти прокрутки */}
                  <div style={{ height: scrollHeight, width: '1px' }}></div>
                  
                  {/* Фактичні видимі рядки з трансформацією */}
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
                    <span className="font-medium">{flightData.length.toLocaleString()}</span> рядків даних польоту
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