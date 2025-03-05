import { create } from 'zustand';

// Створення сховища Zustand для даних Blackbox
const useBlackboxStore = create((set, get) => ({
  // Стан для даних логу
  logData: null,
  metadata: {},
  flightData: [],
  dataHeaders: [],
  selectedColumns: [],
  isLoading: false,
  errorMessage: '',

  // Акції для оновлення стану
  setLogData: (content) => set({ logData: content }),
  setMetadata: (metadata) => set({ metadata }),
  setFlightData: (flightData) => set({ flightData }),
  setDataHeaders: (headers) => set({ dataHeaders: headers }),
  setSelectedColumns: (columns) => set({ selectedColumns: columns }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setErrorMessage: (message) => set({ errorMessage: message }),

  // Скидання стану
  resetStore: () => set({
    logData: null,
    metadata: {},
    flightData: [],
    dataHeaders: [],
    selectedColumns: [],
    isLoading: false,
    errorMessage: '',
  }),

  // Функція парсингу лог-файлу Blackbox
  parseBlackboxLog: (content) => {
    // Встановлюємо стан завантаження
    set({ isLoading: true, errorMessage: '' });

    try {
      // Розділяємо контент на рядки
      const lines = content.split('\n');
      const newMetadata = {};
      let flightDataHeaderIndex = -1;

      // Перший прохід - витягуємо метадані та знаходимо, де починаються дані польоту
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Пропускаємо порожні рядки
        if (!line) continue;

        // Перевіряємо, чи цей рядок починає секцію даних польоту
        if (line.startsWith('loopIteration')) {
          flightDataHeaderIndex = i;
          break;
        }

        // Обробляємо рядки метаданих (формат: key | value)
        const parts = line.split(' | ');
        if (parts.length === 2) {
          newMetadata[parts[0].trim()] = parts[1].trim();
        }
      }

      // Встановлюємо метадані в стан
      set({ metadata: newMetadata });

      // Якщо ми знайшли секцію даних польоту, парсимо її
      if (flightDataHeaderIndex !== -1) {
        // Витягуємо заголовок та рядки даних
        const header = lines[flightDataHeaderIndex].split(' | ').map(h => h.trim());
        
        // Встановлюємо заголовки у стан
        set({ dataHeaders: header });

        // Встановлюємо початкові вибрані стовпці - перший стовпець плюс до 9 додаткових важливих
        let initialSelectedColumns = [header[0]]; // Завжди включаємо перший стовпець

        // Додаємо важливі стовпці, якщо вони існують
        const importantColumns = ['time', 'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]', 'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]'];
        importantColumns.forEach(col => {
          const colIndex = header.findIndex(h => h.toLowerCase() === col.toLowerCase());
          if (colIndex !== -1) {
            initialSelectedColumns.push(header[colIndex]);
          }
        });

        // Обмежуємо до 10 стовпців загалом
        initialSelectedColumns = initialSelectedColumns.slice(0, 10);
        set({ selectedColumns: initialSelectedColumns });

        // Парсимо рядки даних польоту
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

        // Встановлюємо дані польоту в стан
        set({ flightData: parsedFlightData });
      } else {
        set({ errorMessage: 'Не вдалося знайти секцію даних польоту в лог-файлі.' });
      }

      // Встановлюємо вихідні дані логу в стан
      set({ logData: content, isLoading: false });
    } catch (error) {
      console.error("Помилка парсингу лог-файлу:", error);
      set({ 
        errorMessage: `Помилка парсингу лог-файлу: ${error.message}`,
        isLoading: false 
      });
    }
  },

  // Функція скидання вибраних стовпців до значень за замовчуванням
  resetColumnSelection: () => {
    const state = get();
    const { dataHeaders } = state;
    
    if (!dataHeaders.length) return;

    // Завжди включаємо перший стовпець
    let newSelection = [dataHeaders[0]];
    
    // Додаємо важливі стовпці, якщо вони існують
    const importantColumns = ['time', 'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]', 'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]'];
    importantColumns.forEach(col => {
      const colIndex = dataHeaders.findIndex(h => h.toLowerCase() === col.toLowerCase());
      if (colIndex !== -1) {
        newSelection.push(dataHeaders[colIndex]);
      }
    });
    
    // Обмежуємо до 10 стовпців загалом
    newSelection = newSelection.slice(0, 10);
    set({ selectedColumns: newSelection });
  },

  // Увімкнення/вимкнення вибору стовпця
  toggleColumnSelection: (column) => {
    const state = get();
    const { selectedColumns, dataHeaders } = state;
    
    if (selectedColumns.includes(column)) {
      // Не дозволяємо зняти вибір з першого стовпця (loop iteration)
      if (column === dataHeaders[0]) return;
      
      set({ selectedColumns: selectedColumns.filter(col => col !== column) });
    } else {
      set({ selectedColumns: [...selectedColumns, column] });
    }
  }
}));

export default useBlackboxStore;