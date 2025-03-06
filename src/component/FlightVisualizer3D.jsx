import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import useBlackboxStore from '../store/blackboxStore';

const FlightVisualizer3D = () => {
  const { flightData, dataHeaders } = useBlackboxStore();
  
  // Refs для DOM елементів та Three.js
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const droneRef = useRef(null);
  const pathRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // Стан для контролю візуалізації
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [flightDataInfo, setFlightDataInfo] = useState({
    time: 0,
    motors: [0, 0, 0, 0],
    rcSticks: { roll: 0, pitch: 0, yaw: 0, throttle: 0 },
    gyro: { roll: 0, pitch: 0, yaw: 0 }
  });
  
  // Знайти відповідні індекси стовпців
  const getDataColumnIndices = () => {
    // Знаходимо індекси для стовпців, що нас цікавлять
    const indices = {
      time: dataHeaders.findIndex(h => h === 'time'),
      motors: [
        dataHeaders.findIndex(h => h === 'motor[0]'),
        dataHeaders.findIndex(h => h === 'motor[1]'),
        dataHeaders.findIndex(h => h === 'motor[2]'),
        dataHeaders.findIndex(h => h === 'motor[3]')
      ],
      roll: dataHeaders.findIndex(h => h === 'rcCommand[0]'),
      pitch: dataHeaders.findIndex(h => h === 'rcCommand[1]'),
      yaw: dataHeaders.findIndex(h => h === 'rcCommand[2]'),
      throttle: dataHeaders.findIndex(h => h === 'rcCommand[3]'),
      gyroRoll: dataHeaders.findIndex(h => h === 'gyroADC[0]'),
      gyroPitch: dataHeaders.findIndex(h => h === 'gyroADC[1]'),
      gyroYaw: dataHeaders.findIndex(h => h === 'gyroADC[2]'),
    };
    
    return indices;
  };
  
  // Ініціалізація сцени Three.js
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Створення сцени
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    sceneRef.current = scene;
    
    // Додаємо освітлення
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 20, 10);
    scene.add(directionalLight);
    
    // Створення камери
    const camera = new THREE.PerspectiveCamera(
      75, // field of view
      mountRef.current.clientWidth / mountRef.current.clientHeight, // aspect ratio
      0.1, // near clipping plane
      1000 // far clipping plane
    );
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;
    
    // Створення рендерера
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Додаємо контроли для обертання камери
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controlsRef.current = controls;
    
    // Створюємо основу сцени - "землю"
    const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0x444444);
    scene.add(gridHelper);
    
    // Створюємо модель дрона
    createDroneModel(scene);
    
    // Створюємо лінію для відображення шляху
    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const pathGeometry = new THREE.BufferGeometry();
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    scene.add(pathLine);
    pathRef.current = pathLine;
    
    // Анімація
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // Обробка зміни розміру вікна
    const handleResize = () => {
      if (!mountRef.current) return;
      
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Очищення ресурсів при розмонтуванні
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, []);
  
  // Створення моделі дрона
  const createDroneModel = (scene) => {
    // Група для всіх елементів дрона
    const droneGroup = new THREE.Group();
    
    // Рама дрона (центральна частина)
    const frameGeometry = new THREE.BoxGeometry(1.5, 0.2, 1.5);
    const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    droneGroup.add(frame);
    
    // Стрілка напрямку (перед дрона)
    const directionGeometry = new THREE.ConeGeometry(0.2, 0.8, 8);
    const directionMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const direction = new THREE.Mesh(directionGeometry, directionMaterial);
    direction.position.set(0.9, 0, 0);
    direction.rotation.set(Math.PI / 2, 0, 0);
    droneGroup.add(direction);
    
    // Мотори з пропелерами (4 шт.)
    const motorPositions = [
      { x: 0.7, y: 0, z: 0.7 },    // передній правий
      { x: -0.7, y: 0, z: 0.7 },   // передній лівий
      { x: -0.7, y: 0, z: -0.7 },  // задній лівий
      { x: 0.7, y: 0, z: -0.7 }    // задній правий
    ];
    
    const motorColors = [
      0xff0000, // Червоний - передній правий
      0x00ff00, // Зелений - передній лівий
      0x0000ff, // Синій - задній лівий
      0xffff00  // Жовтий - задній правий
    ];
    
    const motors = [];
    
    motorPositions.forEach((pos, index) => {
      // Мотор
      const motorGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
      const motorMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
      const motor = new THREE.Mesh(motorGeometry, motorMaterial);
      motor.position.set(pos.x, pos.y + 0.15, pos.z);
      motor.rotation.set(0, 0, Math.PI / 2);
      droneGroup.add(motor);
      
      // Пропелер
      const propGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.8);
      const propMaterial = new THREE.MeshPhongMaterial({ color: motorColors[index] });
      const propeller = new THREE.Mesh(propGeometry, propMaterial);
      propeller.position.set(pos.x, pos.y + 0.25, pos.z);
      droneGroup.add(propeller);
      
      motors.push({ motor, propeller });
    });
    
    // Зберігаємо мотори для анімації
    droneGroup.userData.motors = motors;
    
    // Додаємо дрона до сцени та зберігаємо в ref
    scene.add(droneGroup);
    droneRef.current = droneGroup;
  };
  
  // Функція для оновлення позиції дрона та інших елементів
  const updateVisualization = (frameIndex) => {
    if (!flightData || !flightData.length || !droneRef.current) return;
    
    const dataIndices = getDataColumnIndices();
    const frame = flightData[frameIndex];
    
    if (!frame) return;
    
    // Отримуємо дані з поточного кадру
    const time = dataIndices.time >= 0 ? parseFloat(frame[dataHeaders[dataIndices.time]]) / 1000000 : 0; // Convert microseconds to seconds
    
    const motors = dataIndices.motors.map(idx => 
      idx >= 0 ? parseFloat(frame[dataHeaders[idx]]) || 0 : 0
    );
    
    const rcSticks = {
      roll: dataIndices.roll >= 0 ? parseFloat(frame[dataHeaders[dataIndices.roll]]) || 0 : 0,
      pitch: dataIndices.pitch >= 0 ? parseFloat(frame[dataHeaders[dataIndices.pitch]]) || 0 : 0,
      yaw: dataIndices.yaw >= 0 ? parseFloat(frame[dataHeaders[dataIndices.yaw]]) || 0 : 0,
      throttle: dataIndices.throttle >= 0 ? parseFloat(frame[dataHeaders[dataIndices.throttle]]) || 0 : 0
    };
    
    // Оновлюємо дані для відображення
    setFlightDataInfo({
      time,
      motors,
      rcSticks
    });
    
    // Обертаємо пропелери відповідно до значень моторів
    if (droneRef.current.userData.motors) {
      droneRef.current.userData.motors.forEach((motorObj, idx) => {
        const motorValue = motors[idx] || 0;
        // Обертаємо пропелер пропорційно потужності мотора
        motorObj.propeller.rotation.y += (motorValue / 1000) * Math.PI;
      });
    }
    
    // Оновлюємо положення та орієнтацію дрона на основі гіроскопа
    const gyroRoll = dataIndices.gyroRoll >= 0 ? parseFloat(frame[dataHeaders[dataIndices.gyroRoll]]) * 0.001 : 0;
    const gyroPitch = dataIndices.gyroPitch >= 0 ? parseFloat(frame[dataHeaders[dataIndices.gyroPitch]]) * 0.001 : 0;
    const gyroYaw = dataIndices.gyroYaw >= 0 ? parseFloat(frame[dataHeaders[dataIndices.gyroYaw]]) * 0.001 : 0;
    
    // Застосовуємо обертання (це спрощена модель, може знадобитися детальніше налаштування)
    droneRef.current.rotation.z = -gyroRoll * 0.01;  // roll (навколо осі X дрона)
    droneRef.current.rotation.x = gyroPitch * 0.01;  // pitch (навколо осі Y дрона)
    droneRef.current.rotation.y = gyroYaw * 0.01;    // yaw (навколо осі Z дрона)
    
    // Рух дрона вгору/вниз на основі газу
    const throttleValue = rcSticks.throttle / 1000;
    droneRef.current.position.y = Math.max(0.5, throttleValue * 5);
    
    // Оновлюємо шлях дрона більш ефективно
    // Оновлюємо шлях лише кожні 3 кадри для кращої продуктивності
    if (frameIndex % 3 === 0) {
      const pathGeometry = pathRef.current.geometry;
      const positions = pathGeometry.getAttribute('position');
      
      // Якщо атрибут позицій не існує або це новий шлях
      if (!positions || frameIndex === 0) {
        const pathPoints = [
          new THREE.Vector3(droneRef.current.position.x, droneRef.current.position.y, droneRef.current.position.z)
        ];
        pathGeometry.setFromPoints(pathPoints);
      } else {
        // Додаємо нову точку до шляху, але пропускаємо додавання точок, якщо зміни мінімальні
        const lastPointIndex = positions.count - 1;
        const lastX = positions.getX(lastPointIndex);
        const lastY = positions.getY(lastPointIndex);
        const lastZ = positions.getZ(lastPointIndex);
        
        const currentX = droneRef.current.position.x;
        const currentY = droneRef.current.position.y;
        const currentZ = droneRef.current.position.z;
        
        // Розраховуємо відстань між останньою та поточною точками
        const distance = Math.sqrt(
          Math.pow(currentX - lastX, 2) + 
          Math.pow(currentY - lastY, 2) + 
          Math.pow(currentZ - lastZ, 2)
        );
        
        // Додаємо точку лише якщо зміна позиції суттєва
        if (distance > 0.05) {
          const pathPoints = [];
          for (let i = 0; i < positions.count; i++) {
            pathPoints.push(new THREE.Vector3(
              positions.getX(i),
              positions.getY(i),
              positions.getZ(i)
            ));
          }
          
          pathPoints.push(new THREE.Vector3(currentX, currentY, currentZ));
          
          // Агресивніше обмежуємо кількість точок у шляху для продуктивності
          const maxPathPoints = 100; // Значно менше точок для кращої продуктивності
          if (pathPoints.length > maxPathPoints) {
            // Видаляємо стару точку кожну другу ітерацію для збереження форми шляху
            pathPoints.splice(0, Math.ceil(pathPoints.length / maxPathPoints));
          }
          
          pathGeometry.setFromPoints(pathPoints);
          pathGeometry.getAttribute('position').needsUpdate = true;
          pathGeometry.computeBoundingSphere();
        }
      }
    }
  };
  
  // Керування відтворенням з оптимізованим кроком
  useEffect(() => {
    let animationId;
    let lastTimestamp = 0;
    const frameStep = 5; // Крок кадрів для швидшого відтворення
    
    if (isPlaying && flightData && flightData.length > 0) {
      const animate = (timestamp) => {
        // Обмежуємо частоту оновлення для кращої продуктивності
        if (timestamp - lastTimestamp > 16) { // ~60 FPS
          lastTimestamp = timestamp;
          
          setCurrentFrameIndex(prevIndex => {
            const newIndex = prevIndex + (playbackSpeed * frameStep);
            if (newIndex >= flightData.length) {
              setIsPlaying(false);
              return prevIndex;
            }
            return newIndex;
          });
        }
        
        animationId = requestAnimationFrame(animate);
      };
      
      animationId = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPlaying, flightData, playbackSpeed]);
  
  // Обробляємо та оптимізуємо дані при їх зміні
  const [optimizedData, setOptimizedData] = useState([]);
  
  useEffect(() => {
    if (flightData && flightData.length > 0) {
      // Скорочуємо дані, беручи кожен третій елемент
      // Також додаємо спеціальний відбір даних при значних змінах
      const reduceData = () => {
        const indices = getDataColumnIndices();
        const result = [];
        let lastIncludedValues = {
          roll: 0,
          pitch: 0,
          yaw: 0,
          throttle: 0,
          motors: [0, 0, 0, 0]
        };
        
        for (let i = 0; i < flightData.length; i++) {
          // Завжди включаємо перший і останній елементи
          if (i === 0 || i === flightData.length - 1) {
            result.push(i);
            continue;
          }
          
          // Беремо кожен третій елемент для базового скорочення
          if (i % 3 === 0) {
            const frame = flightData[i];
            
            // Додаткова перевірка на значні зміни у даних
            const currentRoll = indices.roll >= 0 ? parseFloat(frame[dataHeaders[indices.roll]]) || 0 : 0;
            const currentPitch = indices.pitch >= 0 ? parseFloat(frame[dataHeaders[indices.pitch]]) || 0 : 0;
            const currentYaw = indices.yaw >= 0 ? parseFloat(frame[dataHeaders[indices.yaw]]) || 0 : 0;
            const currentThrottle = indices.throttle >= 0 ? parseFloat(frame[dataHeaders[indices.throttle]]) || 0 : 0;
            
            // Розраховуємо значні зміни
            const significantChange = 
              Math.abs(currentRoll - lastIncludedValues.roll) > 50 ||
              Math.abs(currentPitch - lastIncludedValues.pitch) > 50 ||
              Math.abs(currentYaw - lastIncludedValues.yaw) > 50 ||
              Math.abs(currentThrottle - lastIncludedValues.throttle) > 50;
            
            if (significantChange) {
              // Додаємо кілька кадрів до і після значної зміни для плавності
              for (let j = Math.max(0, i - 2); j <= Math.min(flightData.length - 1, i + 2); j++) {
                if (!result.includes(j)) {
                  result.push(j);
                }
              }
            }
            
            // Оновлюємо останні включені значення
            lastIncludedValues = {
              roll: currentRoll,
              pitch: currentPitch,
              yaw: currentYaw,
              throttle: currentThrottle,
              motors: indices.motors.map(idx => idx >= 0 ? parseFloat(frame[dataHeaders[idx]]) || 0 : 0)
            };
            
            result.push(i);
          }
        }
        
        // Сортуємо індекси за зростанням
        return result.sort((a, b) => a - b);
      };
      
      setOptimizedData(reduceData());
      console.log(`Оптимізовано даних: ${optimizedData.length} з ${flightData.length}`);
    }
  }, [flightData]);

  // Оновлення візуалізації при зміні кадру
  useEffect(() => {
    if (flightData && flightData.length > 0 && optimizedData.length > 0) {
      // Знаходимо найближчий індекс у оптимізованих даних
      const currentOptimizedIndex = Math.min(
        optimizedData.length - 1,
        Math.floor(currentFrameIndex * optimizedData.length / flightData.length)
      );
      
      // Використовуємо відповідний кадр з оптимізованих даних
      if (currentOptimizedIndex >= 0) {
        const frameIndex = optimizedData[currentOptimizedIndex];
        updateVisualization(frameIndex);
      }
    }
  }, [currentFrameIndex, flightData, optimizedData]);
  
  // Функція початку/паузи відтворення
  const togglePlayback = () => {
    setIsPlaying(prev => !prev);
  };
  
  // Функція скидання візуалізації
  const resetVisualization = () => {
    setIsPlaying(false);
    setCurrentFrameIndex(0);
    
    // Скидання положення дрона та шляху
    if (droneRef.current) {
      droneRef.current.position.set(0, 0.5, 0);
      droneRef.current.rotation.set(0, 0, 0);
    }
    
    if (pathRef.current) {
      pathRef.current.geometry.setFromPoints([]);
    }
  };
  
  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">3D Візуалізація польоту</h2>
      
      {!flightData || flightData.length === 0 ? (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Завантажте лог-файл Blackbox перш ніж запускати візуалізацію.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Панель керування */}
          <div className="flex flex-wrap items-center gap-4 mb-4 bg-gray-50 p-3 rounded-md">
            <button
              onClick={togglePlayback}
              className={`py-2 px-4 rounded-md font-medium ${
                isPlaying
                  ? 'bg-gray-500 hover:bg-gray-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isPlaying ? 'Пауза' : 'Старт'}
            </button>
            
            <button
              onClick={resetVisualization}
              className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-md font-medium"
            >
              Скинути
            </button>
            
            <div className="flex items-center">
              <span className="text-sm text-gray-600 mr-2">Швидкість:</span>
              <select
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded-md px-2 py-1 text-sm"
              >
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="5">5x</option>
                <option value="10">10x</option>
                <option value="20">20x</option>
                <option value="50">50x</option>
              </select>
            </div>
            
            <div className="ml-auto text-sm text-gray-600">
              Прогрес: {Math.floor((currentFrameIndex / flightData.length) * 100)}% 
              <span className="ml-2">({Math.floor(currentFrameIndex)} / {flightData.length})</span>
            </div>
            <div className="ml-4 text-sm text-green-600">
              Оптимізовано: {optimizedData?.length || 0} кадрів
            </div>
          </div>
          
          {/* Контейнер для 3D візуалізації */}
          <div className="relative">
            <div 
              ref={mountRef} 
              className="w-full rounded-lg overflow-hidden"
              style={{ height: '60vh' }}
            ></div>
            
            {/* Покращена інформаційна панель з візуалізацією стіків та моторів */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white p-3 rounded-md text-sm font-mono">
              <div>Час: {flightDataInfo.time.toFixed(2)} с</div>
              
              <div className="mt-2">
                <div>Стіки:</div>
                <div className="grid grid-cols-2 gap-x-4">
                  <div className="flex items-center">
                    <span className="w-16">Roll:</span>
                    <div className="w-24 bg-gray-700 h-4 rounded">
                      <div 
                        className="bg-blue-500 h-4 rounded"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.rcSticks.roll) / 10}%`, 
                          marginLeft: flightDataInfo.rcSticks.roll < 0 ? 0 : '50%',
                          marginRight: flightDataInfo.rcSticks.roll > 0 ? 0 : '50%',
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{flightDataInfo.rcSticks.roll.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Pitch:</span>
                    <div className="w-24 bg-gray-700 h-4 rounded">
                      <div 
                        className="bg-green-500 h-4 rounded"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.rcSticks.pitch) / 10}%`, 
                          marginLeft: flightDataInfo.rcSticks.pitch < 0 ? 0 : '50%',
                          marginRight: flightDataInfo.rcSticks.pitch > 0 ? 0 : '50%',
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{flightDataInfo.rcSticks.pitch.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Yaw:</span>
                    <div className="w-24 bg-gray-700 h-4 rounded">
                      <div 
                        className="bg-yellow-500 h-4 rounded"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.rcSticks.yaw) / 10}%`, 
                          marginLeft: flightDataInfo.rcSticks.yaw < 0 ? 0 : '50%',
                          marginRight: flightDataInfo.rcSticks.yaw > 0 ? 0 : '50%',
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{flightDataInfo.rcSticks.yaw.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Газ:</span>
                    <div className="w-24 bg-gray-700 h-4 rounded">
                      <div 
                        className="bg-red-500 h-4 rounded"
                        style={{ 
                          width: `${flightDataInfo.rcSticks.throttle / 20}%`, 
                          transition: 'width 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{flightDataInfo.rcSticks.throttle.toFixed(0)}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-2">
                <div>Мотори:</div>
                <div className="grid grid-cols-2 gap-2">
                  {flightDataInfo.motors.map((value, idx) => (
                    <div key={idx} className="flex items-center">
                      <span className="w-8">M{idx+1}:</span>
                      <div className="w-24 bg-gray-700 h-4 rounded">
                        <div 
                          className={`h-4 rounded ${
                            idx === 0 ? 'bg-red-500' : 
                            idx === 1 ? 'bg-green-500' : 
                            idx === 2 ? 'bg-blue-500' : 
                            'bg-yellow-500'
                          }`}
                          style={{ 
                            width: `${value / 20}%`, 
                            transition: 'width 0.1s ease'
                          }} 
                        />
                      </div>
                      <span className="ml-2">{value.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mt-2">
                <div>Гіроскоп:</div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center">
                    <span className="w-16">Roll:</span>
                    <div className="w-40 bg-gray-700 h-4 rounded relative">
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-gray-500"></div>
                      <div 
                        className="bg-purple-500 h-4 rounded absolute top-0"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.gyro?.roll || 0) / 50}%`,
                          left: (flightDataInfo.gyro?.roll || 0) >= 0 ? '50%' : `calc(50% - ${Math.abs(flightDataInfo.gyro?.roll || 0) / 50}%)`,
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{(flightDataInfo.gyro?.roll || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Pitch:</span>
                    <div className="w-40 bg-gray-700 h-4 rounded relative">
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-gray-500"></div>
                      <div 
                        className="bg-indigo-500 h-4 rounded absolute top-0"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.gyro?.pitch || 0) / 50}%`,
                          left: (flightDataInfo.gyro?.pitch || 0) >= 0 ? '50%' : `calc(50% - ${Math.abs(flightDataInfo.gyro?.pitch || 0) / 50}%)`,
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{(flightDataInfo.gyro?.pitch || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Yaw:</span>
                    <div className="w-40 bg-gray-700 h-4 rounded relative">
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-gray-500"></div>
                      <div 
                        className="bg-cyan-500 h-4 rounded absolute top-0"
                        style={{ 
                          width: `${Math.abs(flightDataInfo.gyro?.yaw || 0) / 50}%`,
                          left: (flightDataInfo.gyro?.yaw || 0) >= 0 ? '50%' : `calc(50% - ${Math.abs(flightDataInfo.gyro?.yaw || 0) / 50}%)`,
                          transition: 'all 0.1s ease'
                        }} 
                      />
                    </div>
                    <span className="ml-2">{(flightDataInfo.gyro?.yaw || 0).toFixed(1)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FlightVisualizer3D;