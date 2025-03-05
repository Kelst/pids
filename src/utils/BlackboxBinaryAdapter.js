/**
 * Адаптер для роботи з бінарними файлами Betaflight Blackbox
 * Використовує BBLParser для реального парсингу замість моків
 */
import { BBLParser } from './BBLParser';

export class BlackboxBinaryAdapter {
    /**
     * Аналізує бінарний файл Betaflight Blackbox (.bbl)
     * @param {ArrayBuffer} buffer - Бінарні дані файлу
     * @returns {Object} - Розібрані та нормалізовані дані
     * @throws {Error} - Помилка, якщо файл не вдалося розпарсити
     */
    static parseBinaryFile(buffer) {
      console.log("Аналізую бінарний файл, розмір:", buffer.byteLength, "байт");
      
      try {
        // Використовуємо BBLParser для реального парсингу даних
        const parsedData = BBLParser.parseBuffer(buffer);
        
        // Додаємо тип для сумісності
        parsedData.type = 'binary';
        
        return parsedData;
      } catch (err) {
        console.error("Помилка під час аналізу бінарного файлу:", err);
        throw new Error(`Помилка аналізу бінарного файлу: ${err.message}`);
      }
    }
    
    /**
     * Перевіряє, чи файл є бінарним файлом Betaflight Blackbox
     * @param {ArrayBuffer} buffer - Бінарні дані файлу
     * @returns {boolean} - true, якщо файл є бінарним файлом Betaflight
     */
    static isBetaflightBinaryFile(buffer) {
      try {
        const view = new Uint8Array(buffer);
        
        // Використовуємо метод перевірки сигнатури з BBLParser
        return BBLParser.checkBetaflightSignature(view);
      } catch (error) {
        console.warn("Помилка при перевірці сигнатури бінарного файлу:", error);
        return false;
      }
    }
    
    /**
     * Витягує метадані з бінарного файлу
     * @param {ArrayBuffer} buffer - Бінарні дані файлу
     * @returns {Object} - Об'єкт з метаданими
     * @throws {Error} - Помилка, якщо не вдалося витягти метадані
     */
    static extractMetadata(buffer) {
      try {
        const view = new Uint8Array(buffer);
        
        // Використовуємо метод витягу заголовків з BBLParser
        return BBLParser.extractHeaders(view);
      } catch (error) {
        console.error("Помилка при витягу метаданих з бінарного файлу:", error);
        throw new Error(`Не вдалося витягти метадані: ${error.message}`);
      }
    }
    
    /**
     * Перевіряє розмір і структуру бінарного файлу
     * @param {ArrayBuffer} buffer - Бінарні дані файлу
     * @returns {Object} - Результат перевірки (valid: boolean, message: string)
     */
    static validateBinaryFile(buffer) {
      // Мінімальний розмір для реальних BBL файлів
      const MIN_FILE_SIZE = 1024; // 1KB
      
      if (!buffer || buffer.byteLength < MIN_FILE_SIZE) {
        return {
          valid: false,
          message: `Файл занадто малий (${buffer ? buffer.byteLength : 0} байт). Мінімальний розмір для BBL файлу: ${MIN_FILE_SIZE} байт.`
        };
      }
      
      // Перевіряємо, чи має файл коректну сигнатуру Betaflight
      if (!this.isBetaflightBinaryFile(buffer)) {
        return {
          valid: false,
          message: "Файл не має коректної сигнатури Betaflight Blackbox."
        };
      }
      
      return {
        valid: true,
        message: "Файл є коректним бінарним файлом Betaflight Blackbox."
      };
    }
}