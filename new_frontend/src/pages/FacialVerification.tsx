import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

// Use CDN models instead of local files to avoid loading issues
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DISTANCE_THRESHOLD = 0.6;
const LIVENESS_DURATION_MS = 3000;
const MOVEMENT_THRESHOLD = 10;

interface VerificationResult {
  isMatch: boolean;
  distance: number;
  livenessSuccess: boolean;
}

// Declare faceapi as global
declare global {
  interface Window {
    faceapi: any;
  }
}

const FacialVerification: React.FC = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [idPhotoDescriptor, setIdPhotoDescriptor] = useState<Float32Array | null>(null);
  const [livenessCheckActive, setLivenessCheckActive] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  
  // Status messages
  const [modelStatus, setModelStatus] = useState('Initializing...');
  const [cameraStatus, setCameraStatus] = useState('Camera not activated');
  const [photoStatus, setPhotoStatus] = useState('No photo uploaded');
  const [livenessStatus, setLivenessStatus] = useState('Ready');
  const [livenessProgress, setLivenessProgress] = useState(0);
  
  // Error handling
  const [error, setError] = useState<string | null>(null);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);

  // Detection interval
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load face-api.js library dynamically
  useEffect(() => {
    const loadFaceApiScript = () => {
      return new Promise((resolve, reject) => {
        if (window.faceapi) {
          resolve(true);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
        script.async = true;
        script.onload = () => {
          console.log('✅ Face-API script loaded');
          resolve(true);
        };
        script.onerror = () => {
          reject(new Error('Failed to load face-api.js library'));
        };
        document.body.appendChild(script);
      });
    };

    loadFaceApiScript()
      .then(() => {
        setFaceApiLoaded(true);
        loadModels();
      })
      .catch((err) => {
        setError(`Failed to load face-api.js: ${err.message}`);
        setModelStatus('Script loading failed');
      });

    return () => {
      // Cleanup
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      stopCamera();
    };
  }, []);

  const loadModels = async () => {
    try {
      setModelStatus('Loading AI models from CDN...');
      const faceapi = window.faceapi;
      
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      
      setModelsLoaded(true);
      setModelStatus('✓ Models loaded successfully');
      console.log('✅ Face-API models loaded from CDN');
    } catch (err) {
      const errorMsg = `Failed to load models: ${err instanceof Error ? err.message : 'Unknown error'}`;
      setError(errorMsg);
      setModelStatus('❌ Model loading failed');
      console.error('Model loading error:', err);
    }
  };

  const startCamera = async () => {
    try {
      // Check browser compatibility
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setShowSecurityWarning(true);
        throw new Error('Camera API not supported. Please use HTTPS or localhost.');
      }

      setCameraStatus('Requesting camera access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
          setCameraStatus('✓ Camera active');
          startFaceDetection();
        };
      }
    } catch (err) {
      let errorMsg = 'Failed to access camera. ';
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMsg += 'Permission denied. Please allow camera access.';
        } else if (err.name === 'NotFoundError') {
          errorMsg += 'No camera found on this device.';
        } else if (err.name === 'NotReadableError') {
          errorMsg += 'Camera is in use by another application.';
        } else {
          errorMsg += err.message;
        }
      }
      
      setError(errorMsg);
      setCameraStatus('❌ Camera activation failed');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStatus('Camera stopped');
    
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  };

  const startFaceDetection = () => {
    if (!videoRef.current || !canvasRef.current || !window.faceapi) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const faceapi = window.faceapi;

    detectionIntervalRef.current = setInterval(async () => {
      if (!modelsLoaded || !video.srcObject) return;

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptors();

        const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
        faceapi.matchDimensions(canvas, displaySize);

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          faceapi.draw.drawDetections(canvas, resizedDetections);
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }

        // Update camera status based on face detection
        if (!livenessCheckActive && idPhotoDescriptor) {
          if (detections.length === 0) {
            setCameraStatus('⚠️ No face detected - position yourself in frame');
          } else {
            setCameraStatus('✓ Face detected - ready for verification');
          }
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    }, 100);
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setVerificationResult(null);

    // File size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`);
      return;
    }

    if (!modelsLoaded || !window.faceapi) {
      setError('AI models not loaded yet. Please wait.');
      return;
    }

    try {
      setPhotoStatus('Processing photo...');
      const faceapi = window.faceapi;

      // Display preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setIdPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Process face detection
      const img = await faceapi.bufferToImage(file);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        setIdPhotoDescriptor(detection.descriptor);
        setPhotoStatus('✓ Face detected in ID photo');
      } else {
        setError('No face detected in uploaded photo. Please use a clear photo.');
        setPhotoStatus('❌ Face detection failed');
        setIdPhotoDescriptor(null);
      }
    } catch (err) {
      setError(`Photo processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPhotoStatus('❌ Processing failed');
    }
  };

  const startLivenessCheck = async () => {
    if (!idPhotoDescriptor) {
      setError('Please upload your ID photo first');
      return;
    }

    if (!cameraActive || !videoRef.current) {
      setError('Camera is not active');
      return;
    }

    if (!window.faceapi) {
      setError('Face API not loaded');
      return;
    }

    setLivenessCheckActive(true);
    setError(null);
    setVerificationResult(null);
    setLivenessProgress(0);

    const video = videoRef.current;
    const faceapi = window.faceapi;
    const detectionResults: Float32Array[] = [];
    const startTime = Date.now();
    let lastX: number | null = null;
    let totalMovement = 0;

    setLivenessStatus('Move your head gently (YES/NO motion)');

    const livenessInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / LIVENESS_DURATION_MS) * 100, 100);
      setLivenessProgress(progress);

      const remaining = Math.ceil((LIVENESS_DURATION_MS - elapsed) / 1000);
      
      if (elapsed >= LIVENESS_DURATION_MS) {
        clearInterval(livenessInterval);

        // Evaluate liveness
        const livenessSuccess = totalMovement > MOVEMENT_THRESHOLD * 5;

        if (livenessSuccess && detectionResults.length > 0) {
          setLivenessStatus('✓ Liveness check passed! Verifying...');
          const finalDescriptor = detectionResults[detectionResults.length - 1];
          await verifyFace(finalDescriptor, true);
        } else {
          setLivenessStatus('❌ Liveness check failed');
          setVerificationResult({
            isMatch: false,
            distance: 1,
            livenessSuccess: false
          });
          setError('Liveness check failed. Insufficient movement detected.');
        }

        setLivenessCheckActive(false);
        setLivenessProgress(0);
        return;
      }

      // Detect face
      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          detectionResults.push(detection.descriptor);

          // Track movement
          const currentX = detection.detection.box.x;
          if (lastX !== null) {
            totalMovement += Math.abs(currentX - lastX);
          }
          lastX = currentX;

          setLivenessStatus(`Keep moving your head... ${remaining}s remaining`);
        } else {
          setLivenessStatus(`⚠️ Face not visible! ${remaining}s remaining`);
        }
      } catch (err) {
        console.error('Liveness detection error:', err);
      }
    }, 200);
  };

  const verifyFace = async (liveDescriptor: Float32Array, livenessSuccess: boolean) => {
    if (!idPhotoDescriptor || !window.faceapi) return;

    try {
      setLivenessStatus('Computing facial match...');
      const faceapi = window.faceapi;

      const distance = faceapi.euclideanDistance(idPhotoDescriptor, liveDescriptor);
      const isMatch = distance < DISTANCE_THRESHOLD;

      setVerificationResult({
        isMatch,
        distance,
        livenessSuccess
      });

      setLivenessStatus(isMatch ? '✓ Verification successful!' : '❌ Verification failed');
    } catch (err) {
      setError(`Verification error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLivenessStatus('❌ Verification error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">YoTouch Identity Verification</h1>
          <p className="text-slate-600">Secure facial verification with liveness detection</p>
        </div>

        {/* Security Warning */}
        {showSecurityWarning && (
          <Alert className="mb-6 border-yellow-400 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>Security Notice:</strong> Camera access requires HTTPS or localhost. Please ensure you're using a secure connection.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-400 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Status Bar */}
        <Card className="mb-6 bg-white shadow-sm border-slate-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${modelsLoaded ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                <span className="text-sm text-slate-600">{modelStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className="text-sm text-slate-600">{cameraStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${idPhotoDescriptor ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className="text-sm text-slate-600">{photoStatus}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* ID Photo Upload */}
          <Card className="bg-white shadow-lg border-slate-200">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-indigo-600">
                <Upload className="w-5 h-5" />
                Step 1: Upload ID Photo
              </CardTitle>
              <CardDescription>Upload a clear photo of your government-issued ID</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full mb-4 border-indigo-200 hover:bg-indigo-50"
                disabled={!modelsLoaded}
              >
                <Upload className="w-4 h-4 mr-2" />
                Choose ID Photo
              </Button>

              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[300px] flex items-center justify-center">
                {idPhotoPreview ? (
                  <img
                    src={idPhotoPreview}
                    alt="ID Preview"
                    className="max-h-[280px] max-w-full rounded-lg shadow-md"
                  />
                ) : (
                  <div className="text-center text-slate-400">
                    <Upload className="w-12 h-12 mx-auto mb-2" />
                    <p>No photo uploaded</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Camera Feed */}
          <Card className="bg-white shadow-lg border-slate-200">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-green-600">
                <Camera className="w-5 h-5" />
                Step 2: Live Verification
              </CardTitle>
              <CardDescription>Activate camera for liveness detection</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="relative aspect-[4/3] bg-slate-900 rounded-lg overflow-hidden mb-4">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{ transform: 'scaleX(-1)' }}
                />
                
                {!cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90">
                    <div className="text-center text-white p-4">
                      <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="mb-4">Camera not active</p>
                      <Button
                        onClick={startCamera}
                        disabled={!modelsLoaded}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Activate Camera
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {livenessCheckActive && (
                <div className="mb-4">
                  <Progress value={livenessProgress} className="h-2" />
                  <p className="text-sm text-slate-600 mt-2 text-center">{livenessStatus}</p>
                </div>
              )}

              <Button
                onClick={startLivenessCheck}
                disabled={!cameraActive || !idPhotoDescriptor || livenessCheckActive}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {livenessCheckActive ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Start Liveness & Verification
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Verification Results */}
        {verificationResult && (
          <Card className={`mt-6 shadow-lg ${verificationResult.isMatch ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {verificationResult.isMatch ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <span className="text-green-800">Verification Successful</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-6 h-6 text-red-600" />
                    <span className="text-red-800">Verification Failed</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Match Score</p>
                  <p className={`text-2xl font-bold ${verificationResult.isMatch ? 'text-green-700' : 'text-red-700'}`}>
                    {(1 - verificationResult.distance).toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Distance</p>
                  <p className="text-2xl font-bold text-slate-700">
                    {verificationResult.distance.toFixed(4)}
                  </p>
                  <p className="text-xs text-slate-500">Threshold: {DISTANCE_THRESHOLD}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Liveness Check</p>
                  <p className={`text-2xl font-bold ${verificationResult.livenessSuccess ? 'text-green-700' : 'text-red-700'}`}>
                    {verificationResult.livenessSuccess ? 'Passed' : 'Failed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FacialVerification;