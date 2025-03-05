import React from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

export function DataVisualizer({ data }) {
  const { gyroData, pidData, motorData, batteryData } = data
  
  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Value'
        }
      }
    }
  }

  // Create gyro data chart
  const gyroChartData = {
    labels: gyroData.time,
    datasets: [
      {
        label: 'Gyro X',
        data: gyroData.x,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Gyro Y',
        data: gyroData.y,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: 'Gyro Z',
        data: gyroData.z,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
    ],
  }

  // Create PID data chart
  const pidChartData = {
    labels: pidData.time,
    datasets: [
      {
        label: 'P',
        data: pidData.p,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'I',
        data: pidData.i,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: 'D',
        data: pidData.d,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
    ],
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium mb-2">Gyro Data</h3>
        <div className="h-64">
          <Line options={options} data={gyroChartData} />
        </div>
        
        <div className="mt-4 px-4 py-3 bg-blue-50 text-blue-800 rounded-md">
          <h4 className="font-medium mb-1">Analysis</h4>
          <p className="text-sm">
            {data.analysis.gyro}
          </p>
        </div>
      </div>
      
      <div>
        <h3 className="text-lg font-medium mb-2">PID Response</h3>
        <div className="h-64">
          <Line options={options} data={pidChartData} />
        </div>
        
        <div className="mt-4 px-4 py-3 bg-blue-50 text-blue-800 rounded-md">
          <h4 className="font-medium mb-1">Analysis</h4>
          <p className="text-sm">
            {data.analysis.pid}
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-4 bg-gray-50 rounded-md">
          <h4 className="font-medium mb-2">Noise Analysis</h4>
          <p className="text-sm text-gray-700">{data.analysis.noise}</p>
        </div>
        
        <div className="p-4 bg-gray-50 rounded-md">
          <h4 className="font-medium mb-2">Performance Metrics</h4>
          <div className="space-y-2">
            {Object.entries(data.metrics).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-sm text-gray-600">{key}:</span>
                <span className="text-sm font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}