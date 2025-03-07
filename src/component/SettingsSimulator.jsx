import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Chart from 'chart.js/auto';
import { Line } from 'react-chartjs-2';

const SettingsSimulator = ({ currentSettings, recommendations, metadata }) => {
  // State for slider controls
  const [simulatedSettings, setSimulatedSettings] = useState({
    pid: {
      roll: { p: 0, i: 0, d: 0, f: 0 },
      pitch: { p: 0, i: 0, d: 0, f: 0 },
      yaw: { p: 0, i: 0, d: 0, f: 0 }
    },
    filters: {
      gyro_lowpass_hz: 0,
      dterm_lowpass_hz: 0,
      dyn_notch_count: 0,
      dyn_notch_q: 0
    }
  });

  // State for display modes
  const [activeTab, setActiveTab] = useState('step-response');
  const [activePidAxis, setActivePidAxis] = useState('roll');

  // Refs for chart elements
  const stepResponseChartRef = useRef(null);
  const filterResponseChartRef = useRef(null);
  const vibrationsChartRef = useRef(null);
  const droneSimRef = useRef(null);
  
  // Refs for chart instances
  const stepResponseChartInstance = useRef(null);
  const filterResponseChartInstance = useRef(null);
  const vibrationsChartInstance = useRef(null);
  
  // Refs for 3D simulation
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const droneRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Initialize simulated settings with recommended values
  useEffect(() => {
    if (recommendations) {
      setSimulatedSettings({
        pid: { ...recommendations.pid },
        filters: { ...recommendations.filters }
      });
    }
  }, [recommendations]);

  // Initialize charts when component mounts or settings change
  useEffect(() => {
    if (stepResponseChartRef.current || filterResponseChartRef.current || 
        vibrationsChartRef.current || droneSimRef.current) {
      initializeCharts();
      initializeDroneSimulation();
    }
    
    return () => {
      // Cleanup charts and simulation on unmount
      if (stepResponseChartInstance.current) {
        stepResponseChartInstance.current.destroy();
      }
      if (filterResponseChartInstance.current) {
        filterResponseChartInstance.current.destroy();
      }
      if (vibrationsChartInstance.current) {
        vibrationsChartInstance.current.destroy();
      }
      
      // Cleanup 3D resources
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && droneSimRef.current) {
        droneSimRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [simulatedSettings, activePidAxis]);

  // Function to initialize charts
  const initializeCharts = () => {
    if (!recommendations) return;
    
    // Create or update step response chart
    if (stepResponseChartRef.current) {
      createStepResponseChart();
    }
    
    // Create or update filter response chart
    if (filterResponseChartRef.current) {
      createFilterResponseChart();
    }
    
    // Create or update vibrations chart
    if (vibrationsChartRef.current) {
      createVibrationsChart();
    }
  };

  // Function to create step response chart
  const createStepResponseChart = () => {
    // Cleanup previous chart if exists
    if (stepResponseChartInstance.current) {
      stepResponseChartInstance.current.destroy();
    }
    
    // Generate step response data based on PID values
    const currentData = generateStepResponseData(
      currentSettings?.pid[activePidAxis].p || 0,
      currentSettings?.pid[activePidAxis].i || 0,
      currentSettings?.pid[activePidAxis].d || 0
    );
    
    const simulatedData = generateStepResponseData(
      simulatedSettings.pid[activePidAxis].p,
      simulatedSettings.pid[activePidAxis].i,
      simulatedSettings.pid[activePidAxis].d
    );
    
    // Create the chart
    const ctx = stepResponseChartRef.current.getContext('2d');
    stepResponseChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({ length: 100 }, (_, i) => i),
        datasets: [
          {
            label: 'Setpoint',
            data: Array(100).fill(100),
            borderColor: 'rgb(0, 0, 0)',
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0
          },
          {
            label: 'Current Settings',
            data: currentData,
            borderColor: 'rgb(128, 128, 128)',
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Simulated Settings',
            data: simulatedData,
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${activePidAxis.toUpperCase()} Axis Step Response`
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time (ms)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Response'
            },
            min: 0,
            max: 160
          }
        }
      }
    });
  };

  // Function to create filter response chart
  const createFilterResponseChart = () => {
    // Cleanup previous chart if exists
    if (filterResponseChartInstance.current) {
      filterResponseChartInstance.current.destroy();
    }
    
    // Generate filter response data
    const frequencyRange = Array.from({ length: 100 }, (_, i) => i * 5); // 0-500Hz
    
    const currentGyroResponse = generateFilterResponse(
      currentSettings?.filters.gyro_lowpass_hz || 100
    );
    
    const simulatedGyroResponse = generateFilterResponse(
      simulatedSettings.filters.gyro_lowpass_hz
    );
    
    const currentDtermResponse = generateFilterResponse(
      currentSettings?.filters.dterm_lowpass_hz || 100,
      0.2
    );
    
    const simulatedDtermResponse = generateFilterResponse(
      simulatedSettings.filters.dterm_lowpass_hz,
      0.2
    );
    
    // Create the chart
    const ctx = filterResponseChartRef.current.getContext('2d');
    filterResponseChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: frequencyRange,
        datasets: [
          {
            label: 'Current Gyro Filter',
            data: currentGyroResponse,
            borderColor: 'rgb(128, 128, 128)',
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Simulated Gyro Filter',
            data: simulatedGyroResponse,
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Current D-term Filter',
            data: currentDtermResponse,
            borderColor: 'rgb(170, 170, 170)',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Simulated D-term Filter',
            data: simulatedDtermResponse,
            borderColor: 'rgb(99, 207, 255)',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Filter Frequency Response'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Frequency (Hz)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Magnitude'
            },
            min: 0,
            max: 1
          }
        }
      }
    });
  };

  // Function to create vibrations chart
  const createVibrationsChart = () => {
    // Cleanup previous chart if exists
    if (vibrationsChartInstance.current) {
      vibrationsChartInstance.current.destroy();
    }
    
    // Generate expected vibration data based on all settings
    const frequencyRange = Array.from({ length: 50 }, (_, i) => i * 10); // 0-500Hz
    
    const currentVibrations = generateVibrationProfile(
      currentSettings?.pid[activePidAxis].p || 0,
      currentSettings?.pid[activePidAxis].d || 0,
      currentSettings?.filters.gyro_lowpass_hz || 100,
      currentSettings?.filters.dterm_lowpass_hz || 100,
      currentSettings?.filters.dyn_notch_q || 250
    );
    
    const simulatedVibrations = generateVibrationProfile(
      simulatedSettings.pid[activePidAxis].p,
      simulatedSettings.pid[activePidAxis].d,
      simulatedSettings.filters.gyro_lowpass_hz,
      simulatedSettings.filters.dterm_lowpass_hz,
      simulatedSettings.filters.dyn_notch_q
    );
    
    // Create the chart
    const ctx = vibrationsChartRef.current.getContext('2d');
    vibrationsChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: frequencyRange,
        datasets: [
          {
            label: 'Current Vibration Profile',
            data: currentVibrations,
            borderColor: 'rgb(128, 128, 128)',
            backgroundColor: 'rgba(128, 128, 128, 0.2)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Simulated Vibration Profile',
            data: simulatedVibrations,
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${activePidAxis.toUpperCase()} Axis Vibration Profile`
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Frequency (Hz)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Amplitude'
            },
            min: 0
          }
        }
      }
    });
  };

  // Function to initialize 3D drone simulation
  const initializeDroneSimulation = () => {
    if (!droneSimRef.current) return;
    
    // Clean up previous simulation
    if (rendererRef.current) {
      droneSimRef.current.removeChild(rendererRef.current.domElement);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      droneSimRef.current.clientWidth / droneSimRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(3, 3, 3);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(droneSimRef.current.clientWidth, droneSimRef.current.clientHeight);
    droneSimRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    
    // Create drone model
    createDroneModel(scene);
    
    // Add grid
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    
    // Animation
    let time = 0;
    const overshoot = calculateOvershoot(
      simulatedSettings.pid[activePidAxis].p,
      simulatedSettings.pid[activePidAxis].i,
      simulatedSettings.pid[activePidAxis].d
    );
    
    const animate = () => {
      time += 0.01;
      
      // Simulate step response in 3D
      if (droneRef.current) {
        const response = simulateStepResponse(
          time,
          simulatedSettings.pid[activePidAxis].p,
          simulatedSettings.pid[activePidAxis].i,
          simulatedSettings.pid[activePidAxis].d
        );
        
        // Apply rotation based on active axis
        if (activePidAxis === 'roll') {
          droneRef.current.rotation.z = THREE.MathUtils.degToRad(-response * 0.45);
        } else if (activePidAxis === 'pitch') {
          droneRef.current.rotation.x = THREE.MathUtils.degToRad(response * 0.45);
        } else if (activePidAxis === 'yaw') {
          droneRef.current.rotation.y = THREE.MathUtils.degToRad(response * 0.45);
        }
        
        // Simulate vibrations based on PID and filter settings
        const vibrationAmplitude = 0.003 * (1 - calculateVibrationDamping(
          simulatedSettings.pid[activePidAxis].d,
          simulatedSettings.filters.gyro_lowpass_hz,
          simulatedSettings.filters.dterm_lowpass_hz
        ));
        
        // Add small vibrations to model
        droneRef.current.position.x += (Math.random() - 0.5) * vibrationAmplitude;
        droneRef.current.position.y += (Math.random() - 0.5) * vibrationAmplitude;
        droneRef.current.position.z += (Math.random() - 0.5) * vibrationAmplitude;
        
        // Rotate propellers
        if (droneRef.current.userData.propellers) {
          droneRef.current.userData.propellers.forEach(prop => {
            prop.rotation.y += 0.3;
          });
        }
      }
      
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!droneSimRef.current) return;
      
      camera.aspect = droneSimRef.current.clientWidth / droneSimRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(droneSimRef.current.clientWidth, droneSimRef.current.clientHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  // Function to create drone model
  const createDroneModel = (scene) => {
    // Create a group for all drone parts
    const drone = new THREE.Group();
    droneRef.current = drone;
    
    // Frame
    const frameGeometry = new THREE.BoxGeometry(1, 0.1, 1);
    const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    drone.add(frame);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
    const armMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
    
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(
        0.4 * Math.cos(i * Math.PI / 2),
        0,
        0.4 * Math.sin(i * Math.PI / 2)
      );
      drone.add(arm);
    }
    
    // Motors
    const motorGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16);
    const motorMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
    
    const propellers = [];
    const motorPositions = [
      { x: 0.5, y: 0.05, z: 0.5 },
      { x: -0.5, y: 0.05, z: 0.5 },
      { x: -0.5, y: 0.05, z: -0.5 },
      { x: 0.5, y: 0.05, z: -0.5 }
    ];
    
    const propColors = [0xff0000, 0xff8800, 0x0088ff, 0x00ff00];
    
    motorPositions.forEach((pos, index) => {
      // Motor
      const motor = new THREE.Mesh(motorGeometry, motorMaterial);
      motor.position.set(pos.x, pos.y, pos.z);
      drone.add(motor);
      
      // Propeller
      const propGeometry = new THREE.BoxGeometry(0.5, 0.01, 0.05);
      const propMaterial = new THREE.MeshPhongMaterial({ color: propColors[index] });
      const propeller = new THREE.Mesh(propGeometry, propMaterial);
      propeller.position.set(pos.x, pos.y + 0.07, pos.z);
      drone.add(propeller);
      propellers.push(propeller);
      
      // Crossed propeller
      const propCrossGeometry = new THREE.BoxGeometry(0.05, 0.01, 0.5);
      const propCross = new THREE.Mesh(propCrossGeometry, propMaterial);
      propCross.position.set(pos.x, pos.y + 0.07, pos.z);
      drone.add(propCross);
      propellers.push(propCross);
    });
    
    // Store propellers for animation
    drone.userData.propellers = propellers;
    
    // Add direction indicator (front)
    const indicatorGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
    const indicatorMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.rotation.x = Math.PI / 2;
    indicator.position.set(0, 0, 0.6);
    drone.add(indicator);
    
    // Add drone to scene
    scene.add(drone);
  };

  // Utility function to generate step response data
  const generateStepResponseData = (p, i, d) => {
    const timeSteps = 100;
    const response = new Array(timeSteps).fill(0);
    
    // Simple PID step response model
    let integral = 0;
    let prevError = 0;
    const setpoint = 100;
    
    response[0] = 0; // Start at 0
    
    for (let t = 1; t < timeSteps; t++) {
      const dt = 0.01;
      const error = setpoint - response[t-1];
      
      // Accumulate integral
      integral += error * dt;
      
      // Calculate derivative
      const derivative = (error - prevError) / dt;
      
      // PID formula
      const output = p * error + i * integral + d * derivative;
      
      // Update response with some physical constraints
      response[t] = response[t-1] + output * dt * 10;
      
      // Add some damping to model physical behavior
      response[t] *= 0.995;
      
      // Limit response to realistic range
      response[t] = Math.max(0, Math.min(160, response[t]));
      
      prevError = error;
    }
    
    return response;
  };

  // Utility function to simulate a step response at a given time
  const simulateStepResponse = (time, p, i, d) => {
    const setpoint = 100;
    const dampingRatio = 0.7 * (d / 30);
    const naturalFrequency = Math.sqrt(p / 10);
    
    // Simplified second-order system response
    if (time <= 0) return 0;
    
    const response = setpoint * (1 - Math.exp(-dampingRatio * naturalFrequency * time) * 
      (Math.cos(naturalFrequency * Math.sqrt(1 - dampingRatio * dampingRatio) * time) + 
       (dampingRatio / Math.sqrt(1 - dampingRatio * dampingRatio)) * 
       Math.sin(naturalFrequency * Math.sqrt(1 - dampingRatio * dampingRatio) * time)));
    
    return response;
  };

  // Utility function to generate filter response
  const generateFilterResponse = (cutoffHz, steepness = 0.1) => {
    // Generate a simple low-pass filter response
    const frequencyRange = Array.from({ length: 100 }, (_, i) => i * 5);
    return frequencyRange.map(f => {
      const normalizedFreq = f / cutoffHz;
      return 1 / Math.sqrt(1 + Math.pow(normalizedFreq, 1/steepness));
    });
  };

  // Utility function to generate expected vibration profile
  const generateVibrationProfile = (p, d, gyroLowpassHz, dtermLowpassHz, notchQ) => {
    const frequencyRange = Array.from({ length: 50 }, (_, i) => i * 10);
    
    // Generate a baseline vibration profile
    return frequencyRange.map(f => {
      // Add resonance peaks based on PID values
      const resonance1 = 20 * Math.exp(-Math.pow((f - 80) / 15, 2)) * (p / 40);
      const resonance2 = 15 * Math.exp(-Math.pow((f - 180) / 25, 2)) * (d / 35);
      const resonance3 = 5 * Math.exp(-Math.pow((f - 300) / 30, 2));
      
      // Add baseline noise that gets filtered
      const baselineNoise = 2 + f * 0.01;
      
      // Apply filter effects
      const gyroFilter = 1 / (1 + Math.pow(f / gyroLowpassHz, 4));
      const dtermFilter = 1 / (1 + Math.pow(f / dtermLowpassHz, 4));
      
      // Apply notch filter
      let notchEffect = 1;
      if (f > 80 && f < 400) { // Typical notch filter range
        // Simulate notch filter effect based on Q factor
        const notchWidth = 500 / notchQ;
        // Create several notches at typical motor frequency harmonics
        [120, 240, 360].forEach(notchFreq => {
          notchEffect *= 1 - Math.exp(-Math.pow((f - notchFreq) / notchWidth, 2));
        });
      }
      
      // Combine all factors
      return (baselineNoise + resonance1 + resonance2 + resonance3) * 
             gyroFilter * dtermFilter * notchEffect;
    });
  };

  // Calculate overshoot percentage
  const calculateOvershoot = (p, i, d) => {
    if (d === 0) return 100; // Prevent division by zero
    
    // Simplified model based on control theory
    const overshootFactor = Math.exp(-Math.PI * d / Math.sqrt(p));
    return overshootFactor * 100;
  };

  // Calculate settling time
  const calculateSettlingTime = (p, i, d) => {
    if (p === 0) return 100; // Prevent division by zero
    
    // Simplified model based on control theory
    const dampingRatio = d / (2 * Math.sqrt(p));
    const naturalFrequency = Math.sqrt(p);
    
    // For 2% settling criterion
    return 4 / (dampingRatio * naturalFrequency);
  };

  // Calculate vibration damping factor
  const calculateVibrationDamping = (d, gyroLowpassHz, dtermLowpassHz) => {
    // Simplified model to estimate vibration damping
    const dFactor = 0.5 * Math.min(d / 50, 1);
    const gyroFactor = 0.3 * Math.min(150 / gyroLowpassHz, 1);
    const dtermFactor = 0.2 * Math.min(100 / dtermLowpassHz, 1);
    
    return Math.min(dFactor + gyroFactor + dtermFactor, 1);
  };

  // Handle slider changes
  const handlePidChange = (axis, param, value) => {
    setSimulatedSettings(prev => ({
      ...prev,
      pid: {
        ...prev.pid,
        [axis]: {
          ...prev.pid[axis],
          [param]: Number(value)
        }
      }
    }));
  };

  // Handle filter change
  const handleFilterChange = (param, value) => {
    setSimulatedSettings(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [param]: Number(value)
      }
    }));
  };

  // Handle reset to recommended
  const handleResetToRecommended = () => {
    if (recommendations) {
      setSimulatedSettings({
        pid: { ...recommendations.pid },
        filters: { ...recommendations.filters }
      });
    }
  };
  
  // Handle applying custom settings
  const handleApplyCustomSettings = () => {
    // Here we would typically generate CLI commands for the custom settings
    // and update the recommendations object
    const customCommands = [];
    
    // PID commands
    customCommands.push('# Custom PID settings');
    customCommands.push(`set p_roll = ${simulatedSettings.pid.roll.p}`);
    customCommands.push(`set i_roll = ${simulatedSettings.pid.roll.i}`);
    customCommands.push(`set d_roll = ${simulatedSettings.pid.roll.d}`);
    
    customCommands.push(`set p_pitch = ${simulatedSettings.pid.pitch.p}`);
    customCommands.push(`set i_pitch = ${simulatedSettings.pid.pitch.i}`);
    customCommands.push(`set d_pitch = ${simulatedSettings.pid.pitch.d}`);
    
    customCommands.push(`set p_yaw = ${simulatedSettings.pid.yaw.p}`);
    customCommands.push(`set i_yaw = ${simulatedSettings.pid.yaw.i}`);
    customCommands.push(`set d_yaw = ${simulatedSettings.pid.yaw.d}`);
    
    // Filter commands
    customCommands.push('# Custom filter settings');
    customCommands.push(`set gyro_lowpass_hz = ${simulatedSettings.filters.gyro_lowpass_hz}`);
    customCommands.push(`set dterm_lowpass_hz = ${simulatedSettings.filters.dterm_lowpass_hz}`);
    customCommands.push(`set dyn_notch_q = ${simulatedSettings.filters.dyn_notch_q}`);
    
    // Save settings
    customCommands.push('save');
    
    // Create a copy of the recommendations with custom settings
    const customRecommendations = {
      ...recommendations,
      pid: { ...simulatedSettings.pid },
      filters: { ...simulatedSettings.filters },
      betaflightCommands: customCommands,
      explanations: {
        ...recommendations.explanations,
        custom: {
          note: "Це користувацькі налаштування, модифіковані із рекомендованих."
        }
      }
    };
    
    // Alert the user
    alert('Користувацькі налаштування застосовано! Тепер ви можете скопіювати оновлені команди CLI.');
  };

  // Create performance metrics for comparison
  const getPerformanceMetrics = () => {
    const currentOvershoot = calculateOvershoot(
      currentSettings?.pid[activePidAxis].p || 0,
      currentSettings?.pid[activePidAxis].i || 0,
      currentSettings?.pid[activePidAxis].d || 0
    );
    
    const simulatedOvershoot = calculateOvershoot(
      simulatedSettings.pid[activePidAxis].p,
      simulatedSettings.pid[activePidAxis].i,
      simulatedSettings.pid[activePidAxis].d
    );
    
    const currentSettlingTime = calculateSettlingTime(
      currentSettings?.pid[activePidAxis].p || 0,
      currentSettings?.pid[activePidAxis].i || 0,
      currentSettings?.pid[activePidAxis].d || 0
    );
    
    const simulatedSettlingTime = calculateSettlingTime(
      simulatedSettings.pid[activePidAxis].p,
      simulatedSettings.pid[activePidAxis].i,
      simulatedSettings.pid[activePidAxis].d
    );
    
    const currentVibrationDamping = calculateVibrationDamping(
      currentSettings?.pid[activePidAxis].d || 0,
      currentSettings?.filters.gyro_lowpass_hz || 100,
      currentSettings?.filters.dterm_lowpass_hz || 100
    );
    
    const simulatedVibrationDamping = calculateVibrationDamping(
      simulatedSettings.pid[activePidAxis].d,
      simulatedSettings.filters.gyro_lowpass_hz,
      simulatedSettings.filters.dterm_lowpass_hz
    );
    
    return {
      overshoot: {
        current: currentOvershoot.toFixed(1),
        simulated: simulatedOvershoot.toFixed(1),
        improvement: ((currentOvershoot - simulatedOvershoot) / currentOvershoot * 100).toFixed(1)
      },
      settlingTime: {
        current: currentSettlingTime.toFixed(1),
        simulated: simulatedSettlingTime.toFixed(1),
        improvement: ((currentSettlingTime - simulatedSettlingTime) / currentSettlingTime * 100).toFixed(1)
      },
      vibrationDamping: {
        current: (currentVibrationDamping * 100).toFixed(1),
        simulated: (simulatedVibrationDamping * 100).toFixed(1),
        improvement: ((simulatedVibrationDamping - currentVibrationDamping) / currentVibrationDamping * 100).toFixed(1)
      }
    };
  };

  // Don't render if no recommendations
  if (!recommendations) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <p className="text-center text-gray-500">
          Запустіть аналіз даних для отримання рекомендацій та імітації.
        </p>
      </div>
    );
  }

  const metrics = getPerformanceMetrics();

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Інтерактивний симулятор налаштувань</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left column - Controls */}
        <div className="space-y-6">
          {/* PID Control Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold">PID Налаштування</h3>
              <div className="space-x-2">
                <button
                  onClick={() => setActivePidAxis('roll')}
                  className={`px-3 py-1 rounded-md ${
                    activePidAxis === 'roll'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Roll
                </button>
                <button
                  onClick={() => setActivePidAxis('pitch')}
                  className={`px-3 py-1 rounded-md ${
                    activePidAxis === 'pitch'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Pitch
                </button>
                <button
                  onClick={() => setActivePidAxis('yaw')}
                  className={`px-3 py-1 rounded-md ${
                    activePidAxis === 'yaw'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Yaw
                </button>
              </div>
            </div>
            
            {/* P Control */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">P-term</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.pid[activePidAxis].p || 0} | 
                  Новий: {simulatedSettings.pid[activePidAxis].p}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simulatedSettings.pid[activePidAxis].p}
                onChange={(e) => handlePidChange(activePidAxis, 'p', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Впливає на чутливість та швидкість реакції
              </p>
            </div>
            
            {/* I Control */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">I-term</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.pid[activePidAxis].i || 0} | 
                  Новий: {simulatedSettings.pid[activePidAxis].i}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simulatedSettings.pid[activePidAxis].i}
                onChange={(e) => handlePidChange(activePidAxis, 'i', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Допомагає утримувати позицію і компенсує постійні відхилення
              </p>
            </div>
            
            {/* D Control */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">D-term</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.pid[activePidAxis].d || 0} | 
                  Новий: {simulatedSettings.pid[activePidAxis].d}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                value={simulatedSettings.pid[activePidAxis].d}
                onChange={(e) => handlePidChange(activePidAxis, 'd', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Зменшує перерегулювання та гасить коливання
              </p>
            </div>
          </div>
          
          {/* Filter Control Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Фільтри та Шумозаглушення</h3>
            
            {/* Gyro Lowpass Filter */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">Gyro Lowpass Hz</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.filters.gyro_lowpass_hz || 0} | 
                  Новий: {simulatedSettings.filters.gyro_lowpass_hz}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="250"
                value={simulatedSettings.filters.gyro_lowpass_hz}
                onChange={(e) => handleFilterChange('gyro_lowpass_hz', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Вище значення = менша затримка, але більше шуму
              </p>
            </div>
            
            {/* Dterm Lowpass Filter */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">D-term Lowpass Hz</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.filters.dterm_lowpass_hz || 0} | 
                  Новий: {simulatedSettings.filters.dterm_lowpass_hz}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="250"
                value={simulatedSettings.filters.dterm_lowpass_hz}
                onChange={(e) => handleFilterChange('dterm_lowpass_hz', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Фільтрує D-term, зменшуючи гарячі мотори та вібрації
              </p>
            </div>
            
            {/* Notch Q-factor */}
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium">Notch Filter Q-factor</label>
                <span className="text-sm text-gray-500">
                  Поточний: {currentSettings?.filters.dyn_notch_q || 0} | 
                  Новий: {simulatedSettings.filters.dyn_notch_q}
                </span>
              </div>
              <input
                type="range"
                min="100"
                max="500"
                step="10"
                value={simulatedSettings.filters.dyn_notch_q}
                onChange={(e) => handleFilterChange('dyn_notch_q', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                Регулює ширину режекторного фільтра (вище значення = вужчий фільтр)
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleResetToRecommended}
                className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-2 rounded-md text-sm font-medium transition"
              >
                Скинути до рекомендованих
              </button>
              <button
                onClick={handleApplyCustomSettings}
                className="bg-green-100 text-green-700 hover:bg-green-200 px-4 py-2 rounded-md text-sm font-medium transition"
              >
                Застосувати зміни
              </button>
            </div>
          </div>
          
          {/* Performance Metrics */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold mb-3 text-blue-800">Прогнозовані результати</h3>
            
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-sm font-medium">Метрика</div>
                <div className="text-sm font-medium text-center">Поточна</div>
                <div className="text-sm font-medium text-center">Нова</div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="text-sm">Перерегулювання</div>
                <div className="text-sm text-center">{metrics.overshoot.current}%</div>
                <div className="text-sm text-center font-medium">
                  {metrics.overshoot.simulated}%
                  <span className={`ml-1 text-xs ${Number(metrics.overshoot.improvement) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({Number(metrics.overshoot.improvement) > 0 ? '-' : '+'}
                    {Math.abs(Number(metrics.overshoot.improvement))}%)
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="text-sm">Час встановлення</div>
                <div className="text-sm text-center">{metrics.settlingTime.current} мс</div>
                <div className="text-sm text-center font-medium">
                  {metrics.settlingTime.simulated} мс
                  <span className={`ml-1 text-xs ${Number(metrics.settlingTime.improvement) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({Number(metrics.settlingTime.improvement) > 0 ? '-' : '+'}
                    {Math.abs(Number(metrics.settlingTime.improvement))}%)
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="text-sm">Гасіння вібрацій</div>
                <div className="text-sm text-center">{metrics.vibrationDamping.current}%</div>
                <div className="text-sm text-center font-medium">
                  {metrics.vibrationDamping.simulated}%
                  <span className={`ml-1 text-xs ${Number(metrics.vibrationDamping.improvement) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({Number(metrics.vibrationDamping.improvement) > 0 ? '+' : '-'}
                    {Math.abs(Number(metrics.vibrationDamping.improvement))}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right column - Visualizations */}
        <div className="space-y-6">
          {/* Visualization Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('step-response')}
                className={`mr-6 py-2 px-1 ${
                  activeTab === 'step-response'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Перехідні процеси
              </button>
              <button
                onClick={() => setActiveTab('filters')}
                className={`mr-6 py-2 px-1 ${
                  activeTab === 'filters'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Фільтрація
              </button>
              <button
                onClick={() => setActiveTab('vibrations')}
                className={`mr-6 py-2 px-1 ${
                  activeTab === 'vibrations'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Вібрації
              </button>
              <button
                onClick={() => setActiveTab('simulation')}
                className={`py-2 px-1 ${
                  activeTab === 'simulation'
                    ? 'border-b-2 border-blue-500 font-medium text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                3D Симуляція
              </button>
            </nav>
          </div>
          
          {/* Tab Content */}
          <div className="bg-gray-50 p-4 rounded-lg h-80">
            {activeTab === 'step-response' && (
              <div className="h-full">
                <canvas ref={stepResponseChartRef} className="h-full w-full"></canvas>
              </div>
            )}
            
            {activeTab === 'filters' && (
              <div className="h-full">
                <canvas ref={filterResponseChartRef} className="h-full w-full"></canvas>
              </div>
            )}
            
            {activeTab === 'vibrations' && (
              <div className="h-full">
                <canvas ref={vibrationsChartRef} className="h-full w-full"></canvas>
              </div>
            )}
            
            {activeTab === 'simulation' && (
              <div className="h-full">
                <div ref={droneSimRef} className="h-full w-full"></div>
              </div>
            )}
          </div>
          
          {/* Explanation of Current Visualization */}
          <div className="bg-gray-50 p-4 rounded-lg">
            {activeTab === 'step-response' && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Перехідні процеси {activePidAxis.toUpperCase()} осі</h4>
                <p className="text-sm text-gray-600">
                  Цей графік показує як дрон реагує на різку зміну заданого значення (наприклад, 
                  швидкий рух стіком). Менший час встановлення та менше перерегулювання означають
                  кращу керованість та точність руху.
                </p>
              </div>
            )}
            
            {activeTab === 'filters' && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Характеристики фільтрів</h4>
                <p className="text-sm text-gray-600">
                  Графік показує характеристики пропускання сигналу фільтрами. 
                  Низькочастотні фільтри (Gyro і Dterm) пропускають сигнали на низьких частотах
                  (льотні команди) і блокують високочастотні сигнали (шум і вібрації).
                </p>
              </div>
            )}
            
            {activeTab === 'vibrations' && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Профіль вібрацій {activePidAxis.toUpperCase()} осі</h4>
                <p className="text-sm text-gray-600">
                  Графік показує прогнозований профіль вібрацій. Поточні налаштування (сірий) та
                  нові налаштування (синій). Нижчі піки означають менше вібрацій, що покращує
                  якість відео та зменшує навантаження на мотори.
                </p>
              </div>
            )}
            
            {activeTab === 'simulation' && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">3D Симуляція польоту</h4>
                <p className="text-sm text-gray-600">
                  Інтерактивна 3D симуляція демонструє рух дрона з поточними налаштуваннями.
                  Зверніть увагу на плавність руху, перерегулювання та вібрації.
                  Використовуйте мишу для обертання огляду.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsSimulator;