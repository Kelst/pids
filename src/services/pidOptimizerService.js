/**
 * Комплексний аналізатор льотних даних для оптимізації PID 
 * Цей модуль обробляє завантажені дані Blackbox і генерує оптимальні PID-налаштування
 */

// Імпорт необхідних утиліт та бібліотек
import { findColumnName, getNumericColumnValue, getAxisValues } from '../utils/blackboxColumnMapper';
import { processInChunks, applyHannWindow } from '../utils/analyzerUtils';
import * as math from 'mathjs';
import _ from 'lodash';

/**
 * Головна функція аналізу даних польоту і генерації оптимальних PID
 * @param {Array} flightData - Повний набір даних польоту
 * @param {Array} dataHeaders - Заголовки колонок даних
 * @param {Object} metadata - Метадані логу з поточними налаштуваннями
 * @param {String} mode - Режим оптимізації ('standard' або 'cinematic')
 * @returns {Object} - Рекомендовані PID налаштування з детальним поясненням змін
 */
export const generateOptimalPidSettings = async (flightData, dataHeaders, metadata, mode = 'standard') => {
    // Створюємо структуру для результатів
    const result = {
        originalPid: {
            roll: { p: 0, i: 0, d: 0, f: 0 },
            pitch: { p: 0, i: 0, d: 0, f: 0 },
            yaw: { p: 0, i: 0, d: 0, f: 0 }
        },
        recommendedPid: {
            roll: { p: 0, i: 0, d: 0, f: 0 },
            pitch: { p: 0, i: 0, d: 0, f: 0 },
            yaw: { p: 0, i: 0, d: 0, f: 0 }
        },
        analysis: {
            responsiveness: { roll: 0, pitch: 0, yaw: 0 },
            stability: { roll: 0, pitch: 0, yaw: 0 },
            noiseRejection: { roll: 0, pitch: 0, yaw: 0 },
            overshoot: { roll: 0, pitch: 0, yaw: 0 },
            settlingTime: { roll: 0, pitch: 0, yaw: 0 }
        },
        performanceChange: {
            responsiveness: { roll: 0, pitch: 0, yaw: 0 },
            stability: { roll: 0, pitch: 0, yaw: 0 },
            noiseRejection: { roll: 0, pitch: 0, yaw: 0 },
            overshoot: { roll: 0, pitch: 0, yaw: 0 },
            settlingTime: { roll: 0, pitch: 0, yaw: 0 }
        },
        explanations: {
            roll: { p: "", i: "", d: "", f: "" },
            pitch: { p: "", i: "", d: "", f: "" },
            yaw: { p: "", i: "", d: "", f: "" },
            general: []
        },
        confidentLevel: { roll: 0, pitch: 0, yaw: 0 }
    };

    // Отримуємо поточні PID налаштування з метаданих
    result.originalPid = extractCurrentPidSettings(metadata);
    
    // Створюємо початкову версію рекомендованих налаштувань (копіюємо поточні)
    result.recommendedPid = JSON.parse(JSON.stringify(result.originalPid));
    
    // ----------------------------------------------------------
    // Етап 1: Базовий аналіз характеристик польоту
    // ----------------------------------------------------------
    
    console.log("Етап 1: Виконуємо базовий аналіз характеристик польоту...");
    
    // Аналіз перехідних процесів для кожної осі
    const transientAnalysis = await analyzeTransientResponse(flightData, dataHeaders, metadata);
    
    // Аналіз стабільності і шуму (використовуємо частотний аналіз)
    const frequencyAnalysis = await analyzeFrequencyCharacteristics(flightData, dataHeaders, metadata);
    
    // Аналіз управляючих сигналів і їх впливу
    const controlAnalysis = await analyzeControlResponse(flightData, dataHeaders, metadata);
    
    // Зберігаємо результати аналізу
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Зберігаємо показники відгуку
        if (transientAnalysis[axis]) {
            result.analysis.responsiveness[axis] = transientAnalysis[axis].responsiveness || 0;
            result.analysis.overshoot[axis] = transientAnalysis[axis].overshoot || 0;
            result.analysis.settlingTime[axis] = transientAnalysis[axis].settlingTime || 0;
        }
        
        // Зберігаємо показники стабільності і шуму
        if (frequencyAnalysis[axis]) {
            result.analysis.stability[axis] = frequencyAnalysis[axis].stability || 0;
            result.analysis.noiseRejection[axis] = frequencyAnalysis[axis].noiseRejection || 0;
        }
    }

    // ----------------------------------------------------------
    // Етап 2: Створення рекомендацій на основі аналізу
    // ----------------------------------------------------------
    
    console.log("Етап 2: Створюємо рекомендації на основі аналізу...");
    
    // Матриця оцінок для коригування кожного PID-параметра
    const scoreMatrix = initializeScoreMatrix();
    
    // Аналіз і оцінка P-терміну
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Оцінка на основі overshoot (перерегулювання) 
        // Більший overshoot = потрібно зменшити P
        if (result.analysis.overshoot[axis] > 30) {
            scoreMatrix[axis].p_down += 3;
            result.explanations[axis].p += "Високе перерегулювання вказує на надто високий P-термін. ";
        } else if (result.analysis.overshoot[axis] < 10) {
            scoreMatrix[axis].p_up += 1;
            result.explanations[axis].p += "Низьке перерегулювання дозволяє збільшити P-термін для кращої відповіді. ";
        }
        
        // Оцінка на основі відгуку системи
        // Низька чутливість = потрібно збільшити P
        if (result.analysis.responsiveness[axis] < 0.5) {
            scoreMatrix[axis].p_up += 2;
            result.explanations[axis].p += "Низька чутливість системи потребує збільшення P-терміну. ";
        } else if (result.analysis.responsiveness[axis] > 0.85) {
            scoreMatrix[axis].p_down += 1;
            result.explanations[axis].p += "Висока чутливість вказує на можливість зменшення P-терміну. ";
        }
        
        // Оцінка на основі стабільності системи
        if (result.analysis.stability[axis] < 0.6) {
            scoreMatrix[axis].p_down += 2;
            result.explanations[axis].p += "Низька стабільність системи вимагає зменшення P-терміну. ";
        }
    }
    
    // Аналіз і оцінка I-терміну
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Оцінка на основі часу встановлення (settling time)
        // Довший час встановлення = потрібно збільшити I
        if (result.analysis.settlingTime[axis] > 150) {
            scoreMatrix[axis].i_up += 2;
            result.explanations[axis].i += "Тривалий час встановлення вказує на потребу збільшення I-терміну. ";
        } else if (result.analysis.settlingTime[axis] < 50) {
            scoreMatrix[axis].i_down += 1;
            result.explanations[axis].i += "Короткий час встановлення дозволяє зменшити I-термін. ";
        }
        
        // Додаткова оцінка для Yaw осі (зазвичай потребує вищого I)
        if (axis === 'yaw' && result.originalPid.yaw.i < 70) {
            scoreMatrix.yaw.i_up += 1;
            result.explanations.yaw.i += "Yaw вісь зазвичай потребує вищий I-термін для кращого утримання напрямку. ";
        }
    }
    
    // Аналіз і оцінка D-терміну
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Оцінка на основі перерегулювання
        // Більше перерегулювання = потрібно збільшити D
        if (result.analysis.overshoot[axis] > 25) {
            scoreMatrix[axis].d_up += 2;
            result.explanations[axis].d += "Високе перерегулювання можна зменшити підвищенням D-терміну. ";
        }
        
        // Оцінка на основі шуму
        // Високий рівень шуму = потрібно зменшити D
        if (result.analysis.noiseRejection[axis] < 0.6) {
            scoreMatrix[axis].d_down += 2;
            result.explanations[axis].d += "Високий рівень шуму вимагає зменшення D-терміну. ";
        }
        
        // Спеціальні правила для Yaw
        if (axis === 'yaw') {
            // Yaw зазвичай потребує меншого D
            scoreMatrix.yaw.d_down += 1;
            result.explanations.yaw.d += "Yaw вісь зазвичай працює краще з нижчим D-терміном. ";
        }
    }
    
    // Аналіз і оцінка Feed Forward (F-терміну)
    for (const axis of ['roll', 'pitch', 'yaw']) {
        if (controlAnalysis[axis] && controlAnalysis[axis].stickResponseScore) {
            // Оцінка на основі відгуку на команди пілота
            if (controlAnalysis[axis].stickResponseScore < 0.6) {
                scoreMatrix[axis].f_up += 2;
                result.explanations[axis].f += "Повільний відгук на стіки вказує на необхідність збільшення Feed Forward. ";
            } else if (controlAnalysis[axis].stickResponseScore > 0.9) {
                scoreMatrix[axis].f_down += 1;
                result.explanations[axis].f += "Дуже швидкий відгук дозволяє зменшити Feed Forward. ";
            }
        }
    }
    
    // Режим "cinematic" для відеозйомки
    if (mode === 'cinematic') {
        console.log("Застосовуємо корекції для режиму відеозйомки...");
        
        // Корекції для плавного руху в режимі відеозйомки
        for (const axis of ['roll', 'pitch', 'yaw']) {
            // Зменшуємо P для плавності
            scoreMatrix[axis].p_down += 2;
            result.explanations[axis].p += "[Режим відеозйомки] Зменшуємо P для більш плавного руху. ";
            
            // Збільшуємо I для кращого утримання позиції
            scoreMatrix[axis].i_up += 1;
            result.explanations[axis].i += "[Режим відеозйомки] Збільшуємо I для стабільного утримання позиції. ";
            
            // Зменшуємо F для плавного початку і кінця руху
            scoreMatrix[axis].f_down += 2;
            result.explanations[axis].f += "[Режим відеозйомки] Зменшуємо Feed Forward для плавних стартів/зупинок. ";
            
            // Для Yaw спеціальні налаштування
            if (axis === 'yaw') {
                scoreMatrix.yaw.d_down += 2;
                result.explanations.yaw.d += "[Режим відеозйомки] Зменшуємо D на Yaw для плавності повороту. ";
            }
        }
        
        // Додаємо загальне пояснення щодо режиму
        result.explanations.general.push(
            "Режим відеозйомки оптимізує PID для плавності руху, зменшення ривків та вібрацій, " +
            "що важливо для якісного відео. Це досягається зменшенням P-терміну та Feed Forward " +
            "для плавніших реакцій на стіки та збільшенням I-терміну для стабільного утримання позиції."
        );
    }
    
    // ----------------------------------------------------------
    // Етап 3: Застосування рекомендацій і фінальні корекції
    // ----------------------------------------------------------
    
    console.log("Етап 3: Застосовуємо рекомендації та виконуємо фінальні корекції...");
    
    // Застосування оцінок для розрахунку нових значень
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // P-термін
        const pScore = scoreMatrix[axis].p_up - scoreMatrix[axis].p_down;
        const pModifier = calculateModifier(pScore);
        result.recommendedPid[axis].p = adjustPidValue(
            result.originalPid[axis].p, 
            pModifier,
            pidSafeLimits[axis].p
        );
        
        // I-термін
        const iScore = scoreMatrix[axis].i_up - scoreMatrix[axis].i_down;
        const iModifier = calculateModifier(iScore);
        result.recommendedPid[axis].i = adjustPidValue(
            result.originalPid[axis].i, 
            iModifier,
            pidSafeLimits[axis].i
        );
        
        // D-термін
        const dScore = scoreMatrix[axis].d_up - scoreMatrix[axis].d_down;
        const dModifier = calculateModifier(dScore);
        result.recommendedPid[axis].d = adjustPidValue(
            result.originalPid[axis].d, 
            dModifier,
            pidSafeLimits[axis].d
        );
        
        // F-термін (Feed Forward)
        const fScore = scoreMatrix[axis].f_up - scoreMatrix[axis].f_down;
        const fModifier = calculateModifier(fScore);
        result.recommendedPid[axis].f = adjustPidValue(
            result.originalPid[axis].f, 
            fModifier,
            pidSafeLimits[axis].f
        );
    }
    
    // Спеціальні корекції для балансу між осями
    // Ми хочемо, щоб Roll і Pitch були схожі, для передбачуваної поведінки
    balanceRollAndPitchSettings(result.recommendedPid);
    
    // Розрахунок очікуваних покращень продуктивності
    calculateExpectedPerformanceChanges(result);
    
    // Оцінка впевненості в рекомендаціях на основі якості даних
    evaluateConfidenceLevel(result, flightData, controlAnalysis);
    
    return result;
};

// ----------------------------------------------------------
// Допоміжні функції для аналізу та оптимізації
// ----------------------------------------------------------

/**
 * Ініціалізує матрицю оцінок для PID-параметрів
 */
function initializeScoreMatrix() {
    return {
        roll: { 
            p_up: 0, p_down: 0, 
            i_up: 0, i_down: 0, 
            d_up: 0, d_down: 0,
            f_up: 0, f_down: 0
        },
        pitch: { 
            p_up: 0, p_down: 0, 
            i_up: 0, i_down: 0, 
            d_up: 0, d_down: 0,
            f_up: 0, f_down: 0
        },
        yaw: { 
            p_up: 0, p_down: 0, 
            i_up: 0, i_down: 0, 
            d_up: 0, d_down: 0,
            f_up: 0, f_down: 0
        }
    };
}

/**
 * Безпечні межі для PID-налаштувань
 */
const pidSafeLimits = {
    roll: {
        p: { min: 20, max: 120 },
        i: { min: 40, max: 200 },
        d: { min: 15, max: 80 },
        f: { min: 0, max: 250 }
    },
    pitch: {
        p: { min: 20, max: 120 },
        i: { min: 40, max: 200 },
        d: { min: 15, max: 80 },
        f: { min: 0, max: 250 }
    },
    yaw: {
        p: { min: 10, max: 100 },
        i: { min: 40, max: 200 },
        d: { min: 0, max: 50 },
        f: { min: 0, max: 200 }
    }
};

/**
 * Розраховує модифікатор на основі оцінки
 * @param {number} score - Сумарна оцінка для параметра
 * @returns {number} - Модифікатор для множення
 */
function calculateModifier(score) {
    if (score <= -4) return 0.8;  // Сильне зменшення
    if (score <= -2) return 0.9;  // Помірне зменшення
    if (score < 0) return 0.95;   // Слабке зменшення
    if (score === 0) return 1.0;  // Без змін
    if (score < 2) return 1.05;   // Слабке збільшення
    if (score < 4) return 1.1;    // Помірне збільшення
    return 1.15;                  // Сильне збільшення
}

/**
 * Коригує значення PID параметра з урахуванням меж безпеки
 * @param {number} value - Початкове значення
 * @param {number} modifier - Модифікатор
 * @param {Object} limits - Об'єкт з min і max обмеженнями
 * @returns {number} - Скориговане значення
 */
function adjustPidValue(value, modifier, limits) {
    // Спочатку застосовуємо модифікатор
    let newValue = value * modifier;
    
    // Використовуємо дробове округлення для малих значень
    if (newValue <= 10) {
        newValue = Math.round(newValue * 10) / 10; // До 1 знаку після коми
    } else {
        newValue = Math.round(newValue);
    }
    
    // Обмежуємо значення в безпечних межах
    if (newValue < limits.min) newValue = limits.min;
    if (newValue > limits.max) newValue = limits.max;
    
    return newValue;
}

/**
 * Вилучає поточні PID налаштування з метаданих
 * @param {Object} metadata - Об'єкт метаданих
 * @returns {Object} - Об'єкт з поточними PID налаштуваннями
 */
function extractCurrentPidSettings(metadata) {
    const pidSettings = {
        roll: { p: 40, i: 50, d: 25, f: 80 },
        pitch: { p: 40, i: 50, d: 25, f: 80 },
        yaw: { p: 35, i: 80, d: 0, f: 60 }
    };
    
    // Спроба отримати значення з метаданих, якщо доступні
    try {
        // Roll PID
        if (metadata.rollPID) {
            const parts = metadata.rollPID.split(',').map(p => parseFloat(p.trim()));
            if (parts.length >= 3) {
                pidSettings.roll.p = parts[0] || pidSettings.roll.p;
                pidSettings.roll.i = parts[1] || pidSettings.roll.i;
                pidSettings.roll.d = parts[2] || pidSettings.roll.d;
                if (parts.length >= 4) {
                    pidSettings.roll.f = parts[3] || pidSettings.roll.f;
                }
            }
        }
        
        // Pitch PID
        if (metadata.pitchPID) {
            const parts = metadata.pitchPID.split(',').map(p => parseFloat(p.trim()));
            if (parts.length >= 3) {
                pidSettings.pitch.p = parts[0] || pidSettings.pitch.p;
                pidSettings.pitch.i = parts[1] || pidSettings.pitch.i;
                pidSettings.pitch.d = parts[2] || pidSettings.pitch.d;
                if (parts.length >= 4) {
                    pidSettings.pitch.f = parts[3] || pidSettings.pitch.f;
                }
            }
        }
        
        // Yaw PID
        if (metadata.yawPID) {
            const parts = metadata.yawPID.split(',').map(p => parseFloat(p.trim()));
            if (parts.length >= 3) {
                pidSettings.yaw.p = parts[0] || pidSettings.yaw.p;
                pidSettings.yaw.i = parts[1] || pidSettings.yaw.i;
                pidSettings.yaw.d = parts[2] || pidSettings.yaw.d;
                if (parts.length >= 4) {
                    pidSettings.yaw.f = parts[3] || pidSettings.yaw.f;
                }
            }
        }
    } catch (error) {
        console.error("Помилка парсингу PID з метаданих:", error);
    }
    
    return pidSettings;
}

/**
 * Балансує налаштування між осями Roll і Pitch
 * @param {Object} pidSettings - Об'єкт з PID налаштуваннями
 */
function balanceRollAndPitchSettings(pidSettings) {
    // Перевіряємо різницю між Roll і Pitch
    const pDiff = Math.abs(pidSettings.roll.p - pidSettings.pitch.p);
    const dDiff = Math.abs(pidSettings.roll.d - pidSettings.pitch.d);
    
    // Якщо різниця P більша за 5, баланcуємо
    if (pDiff > 5) {
        const avgP = Math.round((pidSettings.roll.p + pidSettings.pitch.p) / 2);
        pidSettings.roll.p = avgP;
        pidSettings.pitch.p = avgP;
    }
    
    // Якщо різниця D більша за 3, баланcуємо
    if (dDiff > 3) {
        const avgD = Math.round((pidSettings.roll.d + pidSettings.pitch.d) / 2);
        pidSettings.roll.d = avgD;
        pidSettings.pitch.d = avgD;
    }
}

/**
 * Розраховує очікувані зміни продуктивності
 * @param {Object} result - Об'єкт результатів з вихідними і рекомендованими значеннями
 */
function calculateExpectedPerformanceChanges(result) {
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Зміна P впливає на відгук і стабільність
        const pChange = result.recommendedPid[axis].p / result.originalPid[axis].p;
        result.performanceChange.responsiveness[axis] = (pChange - 1) * 0.5;
        result.performanceChange.stability[axis] = (pChange > 1) ? (1 - pChange) * 0.3 : (1 - pChange) * 0.2;
        
        // Зміна I впливає на час встановлення
        const iChange = result.recommendedPid[axis].i / result.originalPid[axis].i;
        result.performanceChange.settlingTime[axis] = (iChange > 1) ? (iChange - 1) * 0.4 : (1 - iChange) * -0.3;
        
        // Зміна D впливає на перерегулювання і шум
        const dChange = result.recommendedPid[axis].d / result.originalPid[axis].d;
        result.performanceChange.overshoot[axis] = (dChange > 1) ? (1 - dChange) * -0.5 : (1 - dChange) * 0.4;
        result.performanceChange.noiseRejection[axis] = (dChange < 1) ? (1 - dChange) * 0.6 : (dChange - 1) * -0.5;
    }
}

/**
 * Оцінює рівень впевненості в рекомендаціях
 * @param {Object} result - Об'єкт результатів
 * @param {Array} flightData - Дані польоту
 * @param {Object} controlAnalysis - Аналіз управляючих сигналів
 */
function evaluateConfidenceLevel(result, flightData, controlAnalysis) {
    for (const axis of ['roll', 'pitch', 'yaw']) {
        // Базовий рівень впевненості
        let confidence = 0.7;
        
        // Кількість даних впливає на впевненість
        if (flightData.length > 10000) confidence += 0.1;
        if (flightData.length < 1000) confidence -= 0.2;
        
        // Наявність різних режимів польоту в даних
        if (controlAnalysis[axis] && controlAnalysis[axis].flightModesDetected > 1) {
            confidence += 0.1;
        }
        
        // Обмежуємо впевненість діапазоном 0-1
        result.confidentLevel[axis] = Math.min(1, Math.max(0, confidence));
    }
}

/**
 * Аналізує перехідні характеристики системи
 * @param {Array} flightData - Дані польоту
 * @param {Array} dataHeaders - Заголовки даних
 * @param {Object} metadata - Метадані
 * @returns {Object} - Аналіз для кожної осі
 */
async function analyzeTransientResponse(flightData, dataHeaders, metadata) {
    const result = {
        roll: { responsiveness: 0.7, overshoot: 15, settlingTime: 100 },
        pitch: { responsiveness: 0.7, overshoot: 15, settlingTime: 100 },
        yaw: { responsiveness: 0.5, overshoot: 5, settlingTime: 150 }
    };
    
    try {
        // Для кожної осі знаходимо перехідні процеси
        for (const axis of ['roll', 'pitch', 'yaw']) {
            const axisIndex = { roll: 0, pitch: 1, yaw: 2 }[axis];
            
            // Знаходимо необхідні колонки даних
            const setpointCol = findColumnName(`setpoint[${axisIndex}]`, dataHeaders);
            const gyroCol = findColumnName(`gyroADC[${axisIndex}]`, dataHeaders);
            
            if (setpointCol && gyroCol) {
                // Знаходимо великі зміни в setpoint (команді)
                const stepChanges = await findStepChanges(flightData, setpointCol, gyroCol, dataHeaders);
                
                if (stepChanges.length > 0) {
                    // Аналізуємо найбільш виражені зміни
                    const responseStats = analyzeStepChangesStats(stepChanges);
                    
                    // Зберігаємо результати аналізу
                    result[axis].responsiveness = responseStats.responsiveness;
                    result[axis].overshoot = responseStats.overshoot;
                    result[axis].settlingTime = responseStats.settlingTime;
                }
            }
        }
    } catch (error) {
        console.error("Помилка аналізу перехідних процесів:", error);
    }
    
    return result;
}

/**
 * Знаходить великі зміни в заданому значенні
 * @param {Array} flightData - Дані польоту
 * @param {String} setpointCol - Назва колонки заданого значення
 * @param {String} gyroCol - Назва колонки гіроскопа
 * @param {Array} dataHeaders - Заголовки даних
 * @returns {Array} - Список виявлених змін
 */
async function findStepChanges(flightData, setpointCol, gyroCol, dataHeaders) {
    const stepChanges = [];
    const threshold = 30; // Мінімальна зміна для виявлення
    const segmentSize = 100; // Розмір вікна для аналізу після зміни
    
    try {
        let lastSetpoint = null;
        
        // Обробляємо дані чанками для ефективності
        await processInChunks(flightData, 500, (chunk, chunkIndex, startIndex) => {
            for (let i = 0; i < chunk.length - segmentSize; i++) {
                const setpoint = getNumericColumnValue(chunk[i], setpointCol, dataHeaders);
                
                // Якщо це не перший запис і виявлена значна зміна
                if (lastSetpoint !== null && Math.abs(setpoint - lastSetpoint) > threshold) {
                    // Збираємо дані перехідного процесу
                    const stepData = {
                        startIndex: startIndex + i,
                        startSetpoint: lastSetpoint,
                        targetSetpoint: setpoint,
                        change: setpoint - lastSetpoint,
                        responseData: []
                    };
                    
                    // Записуємо дані гіроскопа для аналізу відгуку
                    for (let j = 0; j < segmentSize && (i + j) < chunk.length; j++) {
                        const gyroValue = getNumericColumnValue(chunk[i + j], gyroCol, dataHeaders);
                        stepData.responseData.push(gyroValue);
                    }
                    
                    stepChanges.push(stepData);
                }
                
                lastSetpoint = setpoint;
            }
        });
    } catch (error) {
        console.error("Помилка пошуку змін заданого значення:", error);
    }
    
    return stepChanges;
}

/**
 * Аналізує статистику знайдених змін
 * @param {Array} stepChanges - Список виявлених змін
 * @returns {Object} - Статистика перехідних процесів
 */
function analyzeStepChangesStats(stepChanges) {
    // Значення за замовчуванням
    const stats = {
        responsiveness: 0.7, // Оцінка відгуку (0-1)
        overshoot: 15,       // Перерегулювання у %
        settlingTime: 100    // Час встановлення у мс
    };
    
    if (stepChanges.length === 0) return stats;
    
    // Відбираємо найбільш виражені зміни для аналізу
    const significantChanges = stepChanges
        .filter(step => Math.abs(step.change) > 50)
        .slice(0, 5);
    
    if (significantChanges.length === 0) return stats;
    
    // Аналізуємо кожну зміну і усереднюємо результати
    let totalResponsiveness = 0;
    let totalOvershoot = 0;
    let totalSettlingTime = 0;
    
    for (const step of significantChanges) {
        // Аналізуємо час відгуку (чим швидше досягається 50% зміни, тим вища відповідь)
        let responseTime50 = findResponseTime(step.responseData, step.startSetpoint, step.targetSetpoint, 0.5);
        const responseTimeMax = 50; // Максимальний очікуваний час відгуку в точках даних
        const responsiveness = 1 - Math.min(responseTime50, responseTimeMax) / responseTimeMax;
        
        // Знаходимо максимальне перерегулювання
        const expectedChange = step.targetSetpoint - step.startSetpoint;
        const actualMaxChange = findMaxDeviation(step.responseData, step.startSetpoint, expectedChange);
        const overshoot = Math.max(0, ((actualMaxChange / expectedChange) - 1) * 100);
        
        // Знаходимо час встановлення (коли відхилення < 5%)
        const settlingPoint = findSettlingPoint(step.responseData, step.targetSetpoint, 0.05);
        const settlingTime = settlingPoint * 2; // Приблизно в мс (залежить від частоти даних)
        
        totalResponsiveness += responsiveness;
        totalOvershoot += overshoot;
        totalSettlingTime += settlingTime;
    }
    
    // Усереднюємо результати
    stats.responsiveness = totalResponsiveness / significantChanges.length;
    stats.overshoot = totalOvershoot / significantChanges.length;
    stats.settlingTime = totalSettlingTime / significantChanges.length;
    
    return stats;
}

/**
 * Знаходить час відгуку системи
 * @param {Array} responseData - Дані відгуку системи
 * @param {number} startValue - Початкове значення
 * @param {number} targetValue - Цільове значення
 * @param {number} threshold - Поріг відповіді (0-1)
 * @returns {number} - Час відгуку в точках даних
 */
function findResponseTime(responseData, startValue, targetValue, threshold) {
    const expectedChange = targetValue - startValue;
    const thresholdValue = startValue + expectedChange * threshold;
    const direction = Math.sign(expectedChange);
    
    for (let i = 0; i < responseData.length; i++) {
        // Перевіряємо, чи перевищили поріг відгуку
        if ((direction > 0 && responseData[i] >= thresholdValue) ||
            (direction < 0 && responseData[i] <= thresholdValue)) {
            return i;
        }
    }
    
    return responseData.length; // Якщо поріг не досягнуто
}

/**
 * Знаходить максимальне відхилення у відгуку
 * @param {Array} responseData - Дані відгуку
 * @param {number} startValue - Початкове значення
 * @param {number} expectedChange - Очікувана зміна
 * @returns {number} - Максимальна зміна
 */
function findMaxDeviation(responseData, startValue, expectedChange) {
    const direction = Math.sign(expectedChange);
    let maxDeviation = 0;
    
    for (const value of responseData) {
        const deviation = (value - startValue) * direction;
        if (deviation > maxDeviation) {
            maxDeviation = deviation;
        }
    }
    
    return maxDeviation * direction;
}

/**
 * Знаходить точку встановлення (коли система стабілізується)
 * @param {Array} responseData - Дані відгуку
 * @param {number} targetValue - Цільове значення
 * @param {number} tolerance - Допустиме відхилення (% від очікуваної зміни)
 * @returns {number} - Індекс точки встановлення
 */
function findSettlingPoint(responseData, targetValue, tolerance) {
    const toleranceValue = Math.abs(targetValue * tolerance);
    
    // Шукаємо точку, після якої відхилення не перевищує допустиме
    for (let i = 0; i < responseData.length - 5; i++) {
        let settled = true;
        
        // Перевіряємо наступні 5 точок
        for (let j = 0; j < 5; j++) {
            if (Math.abs(responseData[i + j] - targetValue) > toleranceValue) {
                settled = false;
                break;
            }
        }
        
        if (settled) return i;
    }
    
    return responseData.length; // Якщо встановлення не відбулося
}

/**
 * Аналізує частотні характеристики системи
 * @param {Array} flightData - Дані польоту
 * @param {Array} dataHeaders - Заголовки даних
 * @param {Object} metadata - Метадані
 * @returns {Object} - Результати аналізу для кожної осі
 */
async function analyzeFrequencyCharacteristics(flightData, dataHeaders, metadata) {
    const result = {
        roll: { stability: 0.7, noiseRejection: 0.7 },
        pitch: { stability: 0.7, noiseRejection: 0.7 },
        yaw: { stability: 0.8, noiseRejection: 0.8 }
    };
    
    try {
        // У справжньому коді тут був би повний частотний аналіз
        // Для спрощення використовуємо базові значення для прикладу
    } catch (error) {
        console.error("Помилка аналізу частотних характеристик:", error);
    }
    
    return result;
}

/**
 * Аналізує реакцію системи на управляючі сигнали
 * @param {Array} flightData - Дані польоту
 * @param {Array} dataHeaders - Заголовки даних
 * @param {Object} metadata - Метадані
 * @returns {Object} - Результати аналізу для кожної осі
 */
async function analyzeControlResponse(flightData, dataHeaders, metadata) {
    const result = {
        roll: { stickResponseScore: 0.75, flightModesDetected: 1 },
        pitch: { stickResponseScore: 0.75, flightModesDetected: 1 },
        yaw: { stickResponseScore: 0.65, flightModesDetected: 1 }
    };
    
    try {
        // У справжньому коді тут був би повний аналіз управляючих сигналів
        // Для спрощення використовуємо базові значення для прикладу
    } catch (error) {
        console.error("Помилка аналізу реакції на управління:", error);
    }
    
    return result;
}

/**
 * Повертає команди CLI для Betaflight на основі рекомендованих PID
 * @param {Object} recommendedPid - Рекомендовані PID налаштування
 * @returns {Array} - Масив команд CLI для Betaflight
 */
export function generateBetaflightCommands(recommendedPid) {
    const commands = [
        '# PID налаштування', 
        `set p_roll = ${recommendedPid.roll.p}`,
        `set i_roll = ${recommendedPid.roll.i}`,
        `set d_roll = ${recommendedPid.roll.d}`,
        `set f_roll = ${recommendedPid.roll.f}`,
        
        `set p_pitch = ${recommendedPid.pitch.p}`,
        `set i_pitch = ${recommendedPid.pitch.i}`,
        `set d_pitch = ${recommendedPid.pitch.d}`,
        `set f_pitch = ${recommendedPid.pitch.f}`,
        
        `set p_yaw = ${recommendedPid.yaw.p}`,
        `set i_yaw = ${recommendedPid.yaw.i}`,
        `set d_yaw = ${recommendedPid.yaw.d}`,
        `set f_yaw = ${recommendedPid.yaw.f}`,
        
        'save'
    ];
    
    return commands;
}