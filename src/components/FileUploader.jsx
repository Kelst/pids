import React, { useState, useRef } from 'react'

export function FileUploader({ onFileUpload, loading }) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)
  
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }
  
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0])
    }
  }
  
  const handleChange = (e) => {
    e.preventDefault()
    
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0])
    }
  }
  
  const onButtonClick = () => {
    inputRef.current.click()
  }
  
  return (
    <div className="flex flex-col items-center">
      <div 
        className={`w-full max-w-lg p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
      >
        <input 
          ref={inputRef}
          type="file" 
          className="hidden"
          onChange={handleChange}
          accept=".csv,.txt,.log,.BBL,.bbl" 
        />
        
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        
        <p className="text-lg font-medium text-gray-700 mb-1">
          {loading ? 'Обробка файлу...' : 'Перетягніть або клацніть для вибору файлу логу Blackbox'}
        </p>
        <p className="text-sm text-gray-500 mb-2">
          Підтримуються формати .CSV, .TXT, .LOG та .BBL із Betaflight
        </p>
        <p className="text-xs text-blue-600">
          Тепер з підтримкою бінарних .BBL файлів!
        </p>
      </div>
    </div>
  )
}