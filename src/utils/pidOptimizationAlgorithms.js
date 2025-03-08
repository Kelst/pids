/**
 * Передові алгоритми оптимізації PID для квадрокоптерів
 * Цей модуль реалізує математично обґрунтовані методи для підбору оптимальних PID
 * на основі даних польоту квадрокоптера.
 */

import * as math from 'mathjs';
import _ from 'lodash';

/**
 * Системна ідентифікація - створення математичної моделі системи на основі даних польоту
 * @param {Array} flightData - Дані польоту
 * @param {Array} dataHeaders - Заголовки колонок
 * @param {Object} options - Опції ідентифікації
 * @returns {Object} - Параметри моделі системи
 */
export function identifySystem(flightData, dataHeaders, options = {}) {
  const { 
    axis = 'roll',
    modelOrder = 2,
    samplingRate = 1000  // Припустимо, що дані записані з частотою 1000 Гц
  } = options;
  
  // Перетворення індексу осі
  const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
  
  // Знаходження потрібних колонок даних
  const setpointCol = findColumnByPattern(`setpoint[${axisIndex}]`, dataHeaders);
  const gyroCol = findColumnByPattern(`gyroADC[${axisIndex}]`, dataHeaders);
  const timeCol = findColumnByPattern('time', dataHeaders);
  
  if (!setpointCol || !gyroCol) {
    throw new Error(`Не знайдено необхідні колонки для осі ${axis}`);
  }
  
  // Вилучення та підготовка даних
  const u = flightData.map(row => parseFloat(row[setpointCol])); // Вхідний сигнал (команда)
  const y = flightData.map(row => parseFloat(row[gyroCol]));     // Вихідний сигнал (гіроскоп)
  
  // Нормалізація даних
  const uNorm = normalizeData(u);
  const yNorm = normalizeData(y);
  
  // В залежності від вибраного порядку моделі
  if (modelOrder === 1) {
    // Модель першого порядку: G(s) = K / (Ts + 1)
    const { K, T } = identifyFirstOrderModel(uNorm, yNorm, samplingRate);
    return { K, T, order: 1 };
  } else if (modelOrder === 2) {
    // Модель другого порядку: G(s) = K / (T1*s^2 + T2*s + 1)
    const { K, T1, T2, wn, zeta } = identifySecondOrderModel(uNorm, yNorm, samplingRate);
    return { K, T1, T2, wn, zeta, order: 2 };
  } else {
    // ARX модель вищого порядку
    const { A, B } = identifyARXModel(uNorm, yNorm, { na: modelOrder, nb: modelOrder });
    return { A, B, order: modelOrder };
  }
}

/**
 * Ідентифікація моделі першого порядку
 * @param {Array} u - Вхідний сигнал
 * @param {Array} y - Вихідний сигнал
 * @param {number} samplingRate - Частота дискретизації
 * @returns {Object} - Параметри моделі
 */
function identifyFirstOrderModel(u, y, samplingRate) {
  // Реалізація методу моментів або методу найменших квадратів
  
  // Спрощена реалізація - пошук константи K та постійної часу T
  // Для реальної системи використовуйте більш складні методи
  
  // Оцінка усталеного значення для кроку
  const steadyStateValue = mean(y.slice(-Math.floor(y.length * 0.1))); // Останні 10% значень
  
  // Оцінка коефіцієнта підсилення K
  const inputChange = Math.max(...u) - Math.min(...u);
  const outputChange = Math.max(...y) - Math.min(...y);
  const K = outputChange / inputChange;
  
  // Пошук часу, коли вихід досягає 63.2% від усталеного значення (для моделі першого порядку)
  const targetValue = 0.632 * steadyStateValue;
  let timeConstantIndex = 0;
  for (let i = 0; i < y.length; i++) {
    if (y[i] >= targetValue) {
      timeConstantIndex = i;
      break;
    }
  }
  
  // Розрахунок постійної часу в секундах
  const T = timeConstantIndex / samplingRate;
  
  return { K, T };
}

/**
 * Ідентифікація моделі другого порядку
 * @param {Array} u - Вхідний сигнал
 * @param {Array} y - Вихідний сигнал
 * @param {number} samplingRate - Частота дискретизації
 * @returns {Object} - Параметри моделі
 */
function identifySecondOrderModel(u, y, samplingRate) {
  // Реалізація методу логарифмічного декременту для оцінки затухання
  
  // Знаходження локальних максимумів у сигналі
  const peaks = findPeaks(y);
  
  // Коефіцієнт підсилення (аналогічно моделі першого порядку)
  const inputChange = Math.max(...u) - Math.min(...u);
  const outputChange = Math.max(...y) - Math.min(...y);
  const K = outputChange / inputChange;
  
  // Розрахунок затухання з піків
  let zeta = 0.7; // Значення за замовчуванням, якщо неможливо оцінити
  if (peaks.length >= 2) {
    const amplitude1 = peaks[0].value;
    const amplitude2 = peaks[1].value;
    
    // Логарифмічний декремент затухання
    const delta = Math.log(amplitude1 / amplitude2);
    
    // Коефіцієнт затухання
    zeta = delta / (2 * Math.PI * Math.sqrt(1 + (delta / (2 * Math.PI)) ** 2));
  }
  
  // Розрахунок природної частоти
  let wn = 1.0; // Значення за замовчуванням
  if (peaks.length >= 2) {
    const timeBetweenPeaks = (peaks[1].index - peaks[0].index) / samplingRate;
    const dampedFrequency = 1 / timeBetweenPeaks;
    wn = dampedFrequency / Math.sqrt(1 - zeta * zeta);
  }
  
  // Розрахунок параметрів T1 і T2
  const T1 = 1 / (wn * wn);
  const T2 = 2 * zeta / wn;
  
  return { K, T1, T2, wn, zeta };
}

/**
 * Ідентифікація ARX моделі
 * @param {Array} u - Вхідний сигнал
 * @param {Array} y - Вихідний сигнал
 * @param {Object} options - Опції моделі
 * @returns {Object} - Параметри ARX моделі
 */
function identifyARXModel(u, y, options = {}) {
  const { na = 2, nb = 2, nk = 1 } = options;
  
  // Побудова матриці даних для методу найменших квадратів
  const N = y.length;
  const phi = [];
  
  // Починаємо з max(na, nb + nk - 1) щоб у нас були всі необхідні попередні точки
  const startIdx = Math.max(na, nb + nk - 1);
  
  for (let i = startIdx; i < N; i++) {
    const row = [];
    
    // Додаємо попередні виходи (-y(t-1), -y(t-2), ..., -y(t-na))
    for (let j = 1; j <= na; j++) {
      row.push(-y[i - j]);
    }
    
    // Додаємо попередні входи (u(t-nk), u(t-nk-1), ..., u(t-nk-nb+1))
    for (let j = 0; j < nb; j++) {
      row.push(u[i - nk - j]);
    }
    
    phi.push(row);
  }
  
  // Вектор виходів для відповідних часових точок
  const Y = y.slice(startIdx);
  
  // Застосування методу найменших квадратів для визначення параметрів
  // theta = (phi^T * phi)^(-1) * phi^T * Y
  const phiMatrix = math.matrix(phi);
  const phiTranspose = math.transpose(phiMatrix);
  const Yvector = math.matrix(Y);
  
  const phiTPhi = math.multiply(phiTranspose, phiMatrix);
  const phiTPhiInv = math.inv(phiTPhi);
  const phiTY = math.multiply(phiTranspose, Yvector);
  const theta = math.multiply(phiTPhiInv, phiTY);
  
  // Розділяємо параметри на A і B
  const a = Array(na).fill(0);
  const b = Array(nb).fill(0);
  
  // a[0] = 1 за визначенням ARX моделі
  const thetaArray = theta.toArray();
  for (let i = 0; i < na; i++) {
    a[i + 1] = thetaArray[i][0]; // +1 тому що a[0] = 1
  }
  
  for (let i = 0; i < nb; i++) {
    b[i] = thetaArray[na + i][0];
  }
  
  // Повертаємо коефіцієнти
  return { A: [1, ...a.slice(1)], B: b };
}

/**
 * Розрахунок PID-налаштувань на основі моделі системи (метод IMC)
 * @param {Object} systemModel - Модель системи
 * @param {Object} options - Опції налаштування
 * @returns {Object} - PID-параметри
 */
export function designPidController(systemModel, options = {}) {
  const { 
    tuningMethod = 'imc', 
    responseTime = 0.2,    // Бажаний час відгуку в секундах
    dampingRatio = 0.7,    // Бажаний коефіцієнт затухання
    robustness = 0.5       // Коефіцієнт робастності (0-1)
  } = options;
  
  // Вибір методу налаштування PID
  if (tuningMethod === 'imc') {
    return designPidIMC(systemModel, responseTime, robustness);
  } else if (tuningMethod === 'zn') {
    return designPidZieglerNichols(systemModel);
  } else if (tuningMethod === 'cc') {
    return designPidCohenCoon(systemModel);
  } else if (tuningMethod === 'robust') {
    return designPidRobust(systemModel, dampingRatio, robustness);
  } else {
    throw new Error(`Невідомий метод налаштування PID: ${tuningMethod}`);
  }
}

/**
 * Розрахунок PID за методом внутрішньої моделі (IMC)
 * @param {Object} model - Модель системи
 * @param {number} lambda - Параметр налаштування (бажаний час відгуку)
 * @param {number} robustness - Коефіцієнт робастності
 * @returns {Object} - PID-параметри
 */
function designPidIMC(model, lambda, robustness) {
  // Адаптуємо параметр lambda (час відгуку) на основі робастності
  // Більше значення lambda дає більш робастне, але повільніше налаштування
  const adjustedLambda = lambda * (1 + 2 * robustness);
  
  let Kp, Ki, Kd, Tf;
  
  if (model.order === 1) {
    // Налаштування для моделі першого порядку
    const { K, T } = model;
    
    Kp = (T / (K * adjustedLambda));
    Ki = Kp / T;
    Kd = 0;
    Tf = 0;
  } else if (model.order === 2) {
    // Налаштування для моделі другого порядку
    const { K, T1, T2, wn, zeta } = model;
    
    // Для моделі другого порядку, використовуємо формули IMC
    Kp = (T1 / (K * adjustedLambda));
    Ki = Kp / (T1 + T2);
    Kd = (Kp * T2) / (T1 + T2);
    Tf = adjustedLambda / 10; // Фільтр для D-терміну
  } else {
    // Для моделей вищого порядку використовуємо спрощену апроксимацію
    // Зазвичай в таких випадках потрібен повний синтез, вони за рамками цього прикладу
    throw new Error('Моделі вищого порядку не підтримуються для IMC синтезу');
  }
  
  // Конвертуємо в стандартні PID терміни
  return {
    p: scaleAndRound(Kp),
    i: scaleAndRound(Ki * 100), // Масштабування для формату Betaflight
    d: scaleAndRound(Kd * 100), // Масштабування для формату Betaflight
    f: 0 // Feed Forward зазвичай налаштовується окремо
  };
}

/**
 * Розрахунок PID за методом Зіглера-Ніколса
 * @param {Object} model - Модель системи
 * @returns {Object} - PID-параметри
 */
function designPidZieglerNichols(model) {
  let Ku, Tu;
  
  if (model.order === 1) {
    // Для моделі першого порядку ZN не зовсім підходить, але можемо зробити наближення
    const { K, T } = model;
    Ku = 4 * T / (K * Math.PI);
    Tu = 4 * T;
  } else if (model.order === 2) {
    // Для моделі другого порядку це більш точно
    const { K, wn, zeta } = model;
    
    // Розрахунок критичного підсилення і періоду коливань
    Ku = 1 / K;
    Tu = 2 * Math.PI / wn;
  } else {
    throw new Error('Моделі вищого порядку не підтримуються для Ziegler-Nichols');
  }
  
  // Класичні формули Зіглера-Ніколса
  const Kp = 0.6 * Ku;
  const Ki = Kp / (0.5 * Tu);
  const Kd = Kp * (0.125 * Tu);
  
  return {
    p: scaleAndRound(Kp),
    i: scaleAndRound(Ki * 100),
    d: scaleAndRound(Kd * 100),
    f: 0
  };
}

/**
 * Розрахунок PID за методом Коена-Куна
 * @param {Object} model - Модель системи
 * @returns {Object} - PID-параметри
 */
function designPidCohenCoon(model) {
  if (model.order !== 1) {
    throw new Error('Метод Cohen-Coon підтримується тільки для моделей першого порядку');
  }
  
  const { K, T } = model;
  const tau = T * 0.1; // Приблизне запізнення (для квадрокоптерів воно мале)
  
  const r = tau / T;
  
  // Формули Коена-Куна
  const Kp = (1 / K) * (1.33 + (0.33 * r)) / (1 + r);
  const Ki = Kp / (T * (1.35 + (0.27 * r)) / (1 + 0.6 * r));
  const Kd = Kp * T * (0.37 + 0.22 * r) / (1 + 0.6 * r);
  
  return {
    p: scaleAndRound(Kp),
    i: scaleAndRound(Ki * 100),
    d: scaleAndRound(Kd * 100),
    f: 0
  };
}

/**
 * Розрахунок робастних PID-налаштувань
 * @param {Object} model - Модель системи
 * @param {number} zeta - Бажаний коефіцієнт затухання
 * @param {number} robustness - Коефіцієнт робастності
 * @returns {Object} - PID-параметри
 */
function designPidRobust(model, zeta, robustness) {
  // Для простої робастної настройки використовуємо метод AMIGO
  // (Approximate M-constrained Integral Gain Optimization)
  
  if (model.order === 1) {
    const { K, T } = model;
    
    // Модифікуємо параметри моделі для врахування невизначеностей
    const Tmod = T * (1 + robustness);
    
    // Базові AMIGO формули
    const Kp = (0.2 + 0.45 * T / Tmod) / K;
    const Ti = T * (0.4 * Tmod + 0.8 * T) / (Tmod + 0.1 * T);
    const Td = T * 0.5 * Tmod / (0.3 * Tmod + T);
    
    return {
      p: scaleAndRound(Kp),
      i: scaleAndRound(Kp / Ti * 100),
      d: scaleAndRound(Kp * Td * 100),
      f: 0
    };
  } else if (model.order === 2) {
    // Для моделі другого порядку використовуємо принцип демпфірування
    const { K, wn, zeta: actualZeta } = model;
    
    // Розрахунок на основі бажаного затухання
    const zetaDiff = zeta - actualZeta;
    
    // Базові розрахунки з урахуванням робастності
    const Kp = (1 / K) * (1 + robustness);
    const Ki = Kp * wn * wn / (2 + robustness);
    const Kd = Kp * 2 * (zeta + zetaDiff * (1 + robustness)) / wn;
    
    return {
      p: scaleAndRound(Kp),
      i: scaleAndRound(Ki * 100),
      d: scaleAndRound(Kd * 100),
      f: 0
    };
  } else {
    throw new Error('Робастна оптимізація підтримується тільки для моделей 1-го і 2-го порядку');
  }
}

/**
 * Оптимізація PID за генетичним алгоритмом
 * @param {Function} objectiveFunction - Функція оцінки якості PID
 * @param {Object} options - Опції алгоритму
 * @returns {Object} - Оптимальні PID-параметри
 */
export function optimizePidGeneticAlgorithm(objectiveFunction, options = {}) {
  const {
    populationSize = 30,
    generations = 20,
    mutationRate = 0.1,
    initialPid = { p: 40, i: 40, d: 20, f: 0 },
    constraints = {
      p: { min: 10, max: 100 },
      i: { min: 10, max: 100 },
      d: { min: 0, max: 50 },
      f: { min: 0, max: 100 }
    }
  } = options;
  
  // Ініціалізація популяції
  let population = [];
  
  // Додаємо початкове значення як першу особину
  population.push(initialPid);
  
  // Створюємо решту популяції
  for (let i = 1; i < populationSize; i++) {
    population.push({
      p: randomInRange(constraints.p.min, constraints.p.max),
      i: randomInRange(constraints.i.min, constraints.i.max),
      d: randomInRange(constraints.d.min, constraints.d.max),
      f: randomInRange(constraints.f.min, constraints.f.max)
    });
  }
  
  // Еволюційний процес
  for (let gen = 0; gen < generations; gen++) {
    // Оцінка якості кожної особини
    const fitness = [];
    for (const individual of population) {
      fitness.push(objectiveFunction(individual));
    }
    
    // Створення нової популяції
    const newPopulation = [];
    
    // Елітизм - збереження найкращої особини
    const bestIndex = fitness.indexOf(Math.min(...fitness));
    newPopulation.push(population[bestIndex]);
    
    // Створюємо решту популяції через селекцію, схрещування і мутацію
    while (newPopulation.length < populationSize) {
      // Турнірна селекція
      const parent1 = tournamentSelection(population, fitness);
      const parent2 = tournamentSelection(population, fitness);
      
      // Схрещування
      const child = crossover(parent1, parent2);
      
      // Мутація
      if (Math.random() < mutationRate) {
        mutate(child, constraints);
      }
      
      newPopulation.push(child);
    }
    
    population = newPopulation;
  }
  
  // Повертаємо найкращу особину з фінальної популяції
  const finalFitness = population.map(individual => objectiveFunction(individual));
  const bestIndex = finalFitness.indexOf(Math.min(...finalFitness));
  
  return population[bestIndex];
}

/**
 * Турнірна селекція для генетичного алгоритму
 * @param {Array} population - Популяція
 * @param {Array} fitness - Значення функції якості (менше краще)
 * @returns {Object} - Вибрана особина
 */
function tournamentSelection(population, fitness) {
  const tournamentSize = 3;
  const indices = [];
  
  // Вибираємо випадкові особини для турніру
  for (let i = 0; i < tournamentSize; i++) {
    indices.push(Math.floor(Math.random() * population.length));
  }
  
  // Знаходимо найкращу особину в турнірі
  let bestIndex = indices[0];
  for (let i = 1; i < tournamentSize; i++) {
    if (fitness[indices[i]] < fitness[bestIndex]) {
      bestIndex = indices[i];
    }
  }
  
  return population[bestIndex];
}

/**
 * Схрещування двох особин
 * @param {Object} parent1 - Перший батько
 * @param {Object} parent2 - Другий батько
 * @returns {Object} - Потомок
 */
function crossover(parent1, parent2) {
  // Для PID використовуємо проміжне схрещування
  return {
    p: (parent1.p + parent2.p) / 2,
    i: (parent1.i + parent2.i) / 2,
    d: (parent1.d + parent2.d) / 2,
    f: (parent1.f + parent2.f) / 2
  };
}

/**
 * Мутація особини
 * @param {Object} individual - Особина для мутації
 * @param {Object} constraints - Обмеження параметрів
 */
function mutate(individual, constraints) {
  // Вибираємо випадковий параметр для мутації
  const params = ['p', 'i', 'd', 'f'];
  const param = params[Math.floor(Math.random() * params.length)];
  
  // Генеруємо значення мутації (±10% поточного значення)
  const mutationAmount = individual[param] * (Math.random() * 0.2 - 0.1);
  individual[param] += mutationAmount;
  
  // Перевіряємо обмеження
  individual[param] = Math.max(constraints[param].min, 
                             Math.min(constraints[param].max, individual[param]));
}

/**
 * Об'єктивна функція для оцінки якості PID-налаштувань
 * @param {Object} pid - PID-параметри
 * @param {Object} systemModel - Модель системи
 * @param {Array} setpoints - Цільові значення
 * @param {Object} options - Додаткові опції
 * @returns {number} - Значення якості (менше краще)
 */
export function evaluatePidQuality(pid, systemModel, setpoints, options = {}) {
  const {
    simulationSteps = 100,
    overshootWeight = 1.0,
    settlingTimeWeight = 1.0,
    steadyStateErrorWeight = 1.0,
    dt = 0.01
  } = options;
  
  // Створюємо симуляцію з обраними PID параметрами
  const { p, i, d, f } = pid;
  
  // Моделюємо відгук системи
  const response = simulateSystemResponse(systemModel, setpoints, { p, i, d, f, dt, steps: simulationSteps });
  
  // Аналізуємо характеристики відгуку
  const characteristics = analyzeResponse(response, setpoints);
  
  // Розраховуємо загальну оцінку якості
  const quality = 
    overshootWeight * characteristics.overshoot +
    settlingTimeWeight * characteristics.settlingTime / 10 +
    steadyStateErrorWeight * characteristics.steadyStateError * 100;
  
  return quality;
}

/**
 * Симуляція відгуку системи на керування PID-регулятором
 * @param {Object} model - Модель системи
 * @param {Array} setpoints - Цільові значення
 * @param {Object} options - Параметри PID і симуляції
 * @returns {Array} - Відгук системи
 */
function simulateSystemResponse(model, setpoints, options) {
  const { p, i, d, f, dt, steps } = options;
  
  // Ініціалізація змінних стану
  let output = 0;
  let prevOutput = 0;
  let prevError = 0;
  let integral = 0;
  let prevSetpoint = 0;
  
  const response = [output];
  
  // Основний цикл симуляції
  for (let step = 1; step < steps; step++) {
    const t = step * dt;
    
    // Обчислення поточного заданого значення (може бути функцією або масивом)
    const setpoint = Array.isArray(setpoints) ? 
      setpoints[Math.min(step, setpoints.length - 1)] : 
      (typeof setpoints === 'function' ? setpoints(t) : setpoints);
    
    // Обчислення помилки
    const error = setpoint - output;
    
    // Розрахунок P-терміну
    const pTerm = p * error;
    
    // Розрахунок I-терміну з обмеженням
    integral += error * dt;
    integral = Math.max(-100, Math.min(100, integral)); // Anti-windup
    const iTerm = i * integral;
    
    // Розрахунок D-терміну
    const errorDerivative = (error - prevError) / dt;
    const dTerm = d * errorDerivative;
    
    // Розрахунок FF-терміну
    const setpointDerivative = (setpoint - prevSetpoint) / dt;
    const fTerm = f * setpointDerivative;
    
    // Сумарний вихід PID
    let pidOutput = pTerm + iTerm + dTerm + fTerm;
    
    // Моделювання системи
    // В залежності від порядку моделі
    if (model.order === 1) {
      const { K, T } = model;
      
      // Рівняння стану для системи першого порядку
      const systemDerivative = (K * pidOutput - output) / T;
      output += systemDerivative * dt;
    } else if (model.order === 2) {
      const { K, T1, T2 } = model;
      
      // Для спрощення використовуємо різницеве рівняння
      // y(k) = (2 + dt^2/(T1)) * y(k-1) - y(k-2) + (K * dt^2 / T1) * u(k-1)
      const a1 = 2 - dt*dt / T1;
      const a2 = 1 - dt*T2/T1;
      const b = dt*dt*K / T1;
      
      const newOutput = a1 * output - a2 * prevOutput + b * pidOutput;
      prevOutput = output;
      output = newOutput;
    } else {
      // Для ARX моделі
      const { A, B } = model;
      
      // Застосування різницевого рівняння ARX моделі
      let newOutput = 0;
      
      // Додавання авторегресійної частини
      for (let j = 1; j < A.length; j++) {
        if (step - j >= 0) {
          newOutput -= A[j] * response[step - j];
        }
      }
      
      // Додавання частини зовнішнього входу
      for (let j = 0; j < B.length; j++) {
        if (step - j - 1 >= 0) {
          newOutput += B[j] * pidOutput;
        }
      }
      
      output = newOutput;
    }
    
    // Зберігаємо вихід для наступного кроку
    response.push(output);
    
    // Оновлення змінних для наступної ітерації
    prevError = error;
    prevSetpoint = setpoint;
  }
  
  return response;
}

/**
 * Аналіз характеристик відгуку системи
 * @param {Array} response - Відгук системи
 * @param {Array|number} setpoints - Цільові значення
 * @returns {Object} - Характеристики відгуку
 */
function analyzeResponse(response, setpoints) {
  // Визначення цільового значення
  const finalSetpoint = Array.isArray(setpoints) ? 
    setpoints[setpoints.length - 1] : 
    (typeof setpoints === 'function' ? setpoints(response.length) : setpoints);
  
  // Знаходження максимального значення для оцінки перерегулювання
  const maxValue = Math.max(...response);
  const overshoot = finalSetpoint !== 0 ? 
    (maxValue - finalSetpoint) / Math.abs(finalSetpoint) * 100 : 0;
  
  // Час встановлення (час до досягнення ±2% від фінального значення)
  const settlingThreshold = Math.abs(finalSetpoint) * 0.02;
  let settlingTime = response.length;
  
  for (let i = 0; i < response.length; i++) {
    if (Math.abs(response[i] - finalSetpoint) <= settlingThreshold) {
      // Перевіряємо, чи не покидає сигнал зону встановлення
      let settled = true;
      for (let j = i; j < Math.min(i + 10, response.length); j++) {
        if (Math.abs(response[j] - finalSetpoint) > settlingThreshold) {
          settled = false;
          break;
        }
      }
      
      if (settled) {
        settlingTime = i;
        break;
      }
    }
  }
  
  // Усталена помилка
  const steadyStateError = Math.abs(response[response.length - 1] - finalSetpoint);
  
  return {
    overshoot: Math.max(0, overshoot),
    settlingTime,
    steadyStateError
  };
}

// Допоміжні функції

/**
 * Нормалізація даних
 * @param {Array} data - Вхідні дані
 * @returns {Array} - Нормалізовані дані
 */
function normalizeData(data) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  
  if (max === min) return data.map(() => 0);
  
  return data.map(value => (value - min) / (max - min));
}

/**
 * Знаходження піків у сигналі
 * @param {Array} signal - Вхідний сигнал
 * @returns {Array} - Піки сигналу
 */
function findPeaks(signal) {
  const peaks = [];
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i-1] && signal[i] > signal[i+1]) {
      peaks.push({ index: i, value: signal[i] });
    }
  }
  
  return peaks;
}

/**
 * Середнє значення масиву
 * @param {Array} array - Вхідний масив
 * @returns {number} - Середнє значення
 */
function mean(array) {
  return array.reduce((sum, val) => sum + val, 0) / array.length;
}

/**
 * Випадкове значення в заданому діапазоні
 * @param {number} min - Мінімальне значення
 * @param {number} max - Максимальне значення
 * @returns {number} - Випадкове значення
 */
function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Масштабування та округлення значення для PID-параметрів
 * @param {number} value - Вхідне значення
 * @returns {number} - Округлене значення
 */
function scaleAndRound(value) {
  if (value < 10) {
    return Math.round(value * 10) / 10; // Округлення до 0.1
  } else {
    return Math.round(value);
  }
}

/**
 * Пошук імені колонки за шаблоном
 * @param {string} pattern - Шаблон для пошуку
 * @param {Array} headers - Заголовки колонок
 * @returns {string|null} - Ім'я колонки або null
 */
function findColumnByPattern(pattern, headers) {
  // Спочатку шукаємо точне співпадіння
  if (headers.includes(pattern)) return pattern;
  
  // Якщо точного співпадіння нема, шукаємо схожі
  const patternLower = pattern.toLowerCase();
  
  for (const header of headers) {
    if (header.toLowerCase() === patternLower) {
      return header;
    }
  }
  
  // Альтернативні шаблони
  const alternatives = {
    'time': ['timestamp', 'looptime'],
    'setpoint[0]': ['setpoint[roll]', 'rcCommand[0]', 'roll_target'],
    'setpoint[1]': ['setpoint[pitch]', 'rcCommand[1]', 'pitch_target'],
    'setpoint[2]': ['setpoint[yaw]', 'rcCommand[2]', 'yaw_target'],
    'gyroADC[0]': ['gyro[0]', 'gyroData[0]', 'roll_gyro'],
    'gyroADC[1]': ['gyro[1]', 'gyroData[1]', 'pitch_gyro'],
    'gyroADC[2]': ['gyro[2]', 'gyroData[2]', 'yaw_gyro']
  };
  
  // Перевіряємо альтернативи
  for (const [key, options] of Object.entries(alternatives)) {
    if (pattern === key || options.includes(pattern)) {
      for (const option of [key, ...options]) {
        const match = headers.find(h => h.toLowerCase() === option.toLowerCase());
        if (match) return match;
      }
    }
  }
  
  return null;
}

/**
 * Основна функція для оптимізації PID на основі даних польоту
 * @param {Array} flightData - Дані польоту
 * @param {Array} dataHeaders - Заголовки колонок
 * @param {Object} options - Опції оптимізації
 * @returns {Object} - Оптимізовані PID-параметри
 */
export function optimizePidFromFlightData(flightData, dataHeaders, options = {}) {
  const {
    axis = 'roll',
    tuningMethod = 'genetic',
    modelOrder = 2,
    currentPid = { p: 40, i: 40, d: 20, f: 0 },
    optimizationGoals = {
      overshootWeight: 1.0,
      settlingTimeWeight: 1.0,
      steadyStateErrorWeight: 1.0
    }
  } = options;
  
  // Крок 1: Системна ідентифікація - створення моделі системи
  const systemModel = identifySystem(flightData, dataHeaders, {
    axis,
    modelOrder
  });
  
  // Крок 2: Залежно від методу оптимізації
  if (tuningMethod === 'genetic') {
    // Витягаємо дані для цільової функції
    const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
    const setpointCol = findColumnByPattern(`setpoint[${axisIndex}]`, dataHeaders);
    
    // Отримуємо setpoint дані з логу для реалістичної оцінки
    const setpoints = flightData.map(row => parseFloat(row[setpointCol]));
    
    // Функція оцінки якості для генетичного алгоритму
    const objectiveFunction = (pid) => {
      return evaluatePidQuality(
        pid, 
        systemModel, 
        setpoints, 
        {
          simulationSteps: 200,
          ...optimizationGoals
        }
      );
    };
    
    // Запуск генетичного алгоритму
    return optimizePidGeneticAlgorithm(objectiveFunction, {
      initialPid: currentPid,
      constraints: {
        p: { min: 10, max: 150 },
        i: { min: 10, max: 150 },
        d: { min: 0, max: 80 },
        f: { min: 0, max: 150 }
      },
      populationSize: 40,
      generations: 30
    });
  } else {
    // Альтернативно, використовуємо аналітичні методи (IMC, ZN, etc.)
    return designPidController(systemModel, {
      tuningMethod,
      responseTime: 0.2,  // Можна налаштувати
      dampingRatio: 0.7,  // Можна налаштувати
      robustness: 0.5     // Можна налаштувати
    });
  }
}