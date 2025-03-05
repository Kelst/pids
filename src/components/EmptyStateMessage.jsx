import React from 'react'

/**
 * Компонент для відображення повідомлення, коли немає даних
 * @param {Object} props - Властивості компонента
 * @param {string} props.title - Заголовок повідомлення
 * @param {string} props.message - Текст повідомлення
 * @param {React.ReactNode} props.icon - Опціональна іконка
 * @param {React.ReactNode} props.action - Опціональна кнопка дії
 */
export function EmptyStateMessage({ title, message, icon, action }) {
  return (
    <div className="bg-gray-800 rounded-lg shadow-xl p-8 mb-8 border border-gray-700 text-center">
      {icon}
      <h3 className="text-xl font-medium text-white mb-3">{title}</h3>
      <p className="text-gray-300 mb-5">{message}</p>
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  )
}