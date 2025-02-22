'use client';

import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { CameraIcon, XCircleIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import emailjs from '@emailjs/browser';

interface Position {
  lat: number;
  lng: number;
}

interface PhotoData {
  base64: string;
  location?: {
    lat: number;
    lng: number;
  };
  isTrackingLocation?: boolean;
  analysisProgress?: number;
  showSignalWarning?: boolean;
}

const defaultCenter = { lat: 3.5952, lng: 98.6722 }; // Medan center coordinates

const NOMINATIM_USER_AGENT = 'FormPesanan_1.0'; // Identify our app to Nominatim

export default function Home() {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Position>(defaultCenter);
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [isFrontCamera, setIsFrontCamera] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showGpsWarning, setShowGpsWarning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const [isFocusing, setIsFocusing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [loadingState, setLoadingState] = useState<{
    show: boolean;
    message: string;
    progress?: number;
    showCancel?: boolean;
    isCancellable?: boolean;
  }>({ show: false, message: '' });
  const [hasUsedAutoLocation, setHasUsedAutoLocation] = useState(false);
  const [hasGpsError, setHasGpsError] = useState(false);
  const [gpsRetryCount, setGpsRetryCount] = useState<number>(0);
  const selfieWebcamRef = useRef<Webcam | null>(null);
  const [selfieCaptured, setSelfieCaptured] = useState<string | null>(null);
  const [isSelfieWebcamReady, setIsSelfieWebcamReady] = useState(false);
  const [showPermissionWarning, setShowPermissionWarning] = useState<{
    show: boolean;
    type: 'gps' | 'camera';
    message: string;
  }>({ show: false, type: 'gps', message: '' });
  const [isCapturingSelfie, setIsCapturingSelfie] = useState(false);

  // Initialize EmailJS when component mounts
  useEffect(() => {
    emailjs.init("QqfRuAT26wedsAjAA");
  }, []);

  const resetGpsTracking = () => {
    setHasGpsError(false);
    setGpsRetryCount(0);
    setShowGpsWarning(false);
  };

  const getLocationWithRetry = async (maxRetries = 5, onProgress?: (count: number) => void): Promise<Position | null> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        onProgress?.(attempt);
        setGpsRetryCount(attempt);

        // First try with high accuracy but shorter timeout
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 0
            });
          });
          
          resetGpsTracking();
          return {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        } catch (highAccuracyError) {
          // If high accuracy fails, try with lower accuracy settings
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 30000 // Allow cached positions up to 30 seconds old
            });
          });
          
          resetGpsTracking();
          return {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        }
      } catch (error) {
        console.log(`GPS attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          setHasGpsError(true);
          setShowGpsWarning(true);
          return null;
        }

        // Show warning after 3rd attempt
        if (attempt > 3) {
          setPhotos(prev => prev.map(photo => ({
            ...photo,
            showSignalWarning: true
          })));
        }

        // Wait 3 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    return null;
  };

  // Add this function to check GPS availability
  const checkGpsAvailability = async (): Promise<boolean> => {
    if (!navigator.geolocation) return false;

    try {
      // Try to get a quick position with low accuracy
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 60000 // Allow positions up to 1 minute old
        });
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  // Add startLocationTracking at component scope
  const startLocationTracking = async (photoIndex: number) => {
    let progress = 0;
    const interval = setInterval(() => {
      if (progress < 95) {
        progress += 5;
        setPhotos(prev => prev.map((photo, idx) => 
          idx === photoIndex 
            ? { ...photo, analysisProgress: progress }
            : photo
        ));
      }
    }, 250);

    try {
      // Check GPS availability first
      const isGpsAvailable = await checkGpsAvailability();
      if (!isGpsAvailable) {
        throw new Error('GPS not available');
      }

      const location = await getLocationWithRetry(5, (attempt) => {
        if (attempt > 3) {
          setPhotos(prev => prev.map((photo, idx) => 
            idx === photoIndex 
              ? { ...photo, showSignalWarning: true }
              : photo
          ));
        }
      });

      clearInterval(interval);
      setPhotos(prev => prev.map((photo, idx) => 
        idx === photoIndex 
          ? { 
              ...photo, 
              location: location || undefined,
              isTrackingLocation: false,
              analysisProgress: 100,
              showSignalWarning: false
            }
          : photo
      ));
    } catch (error) {
      clearInterval(interval);
      console.log('Location tracking error:', error);
      setPhotos(prev => prev.map((photo, idx) => 
        idx === photoIndex 
          ? { ...photo, analysisProgress: 0 }
          : photo
      ));
      await new Promise(resolve => setTimeout(resolve, 3000));
      startLocationTracking(photoIndex); // Retry
    }
  };

  const capturePhoto = () => {
    if (webcamRef.current) {
      const photoData = webcamRef.current.getScreenshot();
      if (photoData) {
        const img = new Image();
        img.src = photoData;
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedData = canvas.toDataURL('image/jpeg', 0.5);
            
            const newPhotoIndex = photos.length;
            setPhotos(prev => [...prev, { 
              base64: compressedData,
              isTrackingLocation: true,
              analysisProgress: 0
            }]);
            setShowCamera(false);

            startLocationTracking(newPhotoIndex);
          }
        };
      }
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCamera = () => {
    setIsFrontCamera(!isFrontCamera);
  };

  const fetchWithRetry = async (url: string, retries = 3, delay = 2000) => {
    let attempt = 1;
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempt <= retries) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': NOMINATIM_USER_AGENT,
            'Accept-Language': 'id'
          }
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
          await wait(waitTime);
          attempt++;
          continue;
        }

        if (!response.ok) return { success: false, data: null };

        const data = await response.json();
        return { success: true, data };
      } catch (_) {
        if (attempt === retries) {
          return { success: false, data: null };
        }
        await wait(delay * Math.pow(2, attempt - 1));
        attempt++;
      }
    }
    return { success: false, data: null };
  };

  const requestPermission = async (type: 'gps' | 'camera') => {
    if (type === 'gps') {
      try {
        // First check if permission is already denied
        const result = await navigator.permissions.query({ name: 'geolocation' });
        if (result.state === 'denied') {
          setShowPermissionWarning({
            show: true,
            type: 'gps',
            message: 'Mohon izinkan akses lokasi di pengaturan browser Anda untuk melanjutkan.'
          });
          return false;
        }
        
        // If not denied, try to get location (this will trigger the browser permission prompt if needed)
        try {
          await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          return true;
        } catch (error: any) {
          // Only show warning if permission was denied
          if (error.code === 1) { // 1 is PERMISSION_DENIED
            setShowPermissionWarning({
              show: true,
              type: 'gps',
              message: 'Mohon nyalakan GPS dan izinkan akses lokasi untuk melanjutkan.'
            });
            return false;
          }
          // For other errors (timeout, position unavailable), just return false without showing warning
          return false;
        }
      } catch (error) {
        // For errors in checking permission, just return false without showing warning
        return false;
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Clean up
        return true;
      } catch (error: any) {
        // Only show warning if permission was denied
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setShowPermissionWarning({
            show: true,
            type: 'camera',
            message: 'Mohon izinkan akses kamera di pengaturan browser Anda untuk melanjutkan.'
          });
        }
        return false;
      }
    }
  };

  const handlePermissionWarningClose = async () => {
    const type = showPermissionWarning.type;
    setShowPermissionWarning({ show: false, type: 'gps', message: '' });
    
    // Try requesting permission again
    const granted = await requestPermission(type);
    
    if (granted) {
      if (type === 'camera') {
        setShowCamera(true);
      }
    }
  };

  const handleCancelLocationTracking = () => {
    // Cancel location tracking for all photos
    setPhotos(prev => prev.map(photo => ({
      ...photo,
      isTrackingLocation: false,
      location: undefined
    })));
    
    // Hide loading state
    setLoadingState({ show: false, message: '' });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Check if any locations are still being tracked
    const isStillTracking = photos.some(photo => photo.isTrackingLocation);
    
    if (isStillTracking) {
      setLoadingState({
        show: true,
        message: 'Mohon tunggu, sedang mengambil lokasi...',
        progress: 0,
        showCancel: true,
        isCancellable: true
      });

      // Try to get locations for any remaining photos
      const photoPromises = photos.map(async (photo, index) => {
        if (photo.isTrackingLocation) {
          const location = await getLocationWithRetry();
          setPhotos(prev => prev.map((p, i) => 
            i === index ? { 
              ...p, 
              location: location || undefined,
              isTrackingLocation: false
            } : p
          ));
        }
      });

      try {
        await Promise.all(photoPromises);
      } catch (error) {
        console.error('Error tracking locations:', error);
      }
      
      // Hide loading state
      setLoadingState({ show: false, message: '' });
      return;
    }

    setLoadingState({
      show: true,
      message: 'Mengirim Pesanan...',
      progress: 0,
      showCancel: true,
      isCancellable: false
    });
    
    try {
      const form = e.target as HTMLFormElement;
      const nama = (form.elements.namedItem('nama') as HTMLInputElement).value;
      const tanggal = (form.elements.namedItem('tanggal') as HTMLInputElement).value;
      const jumlah = (form.elements.namedItem('jumlah') as HTMLInputElement).value;
      const alasan = (form.elements.namedItem('alasan') as HTMLTextAreaElement).value;
      const nohp = (form.elements.namedItem('nohp') as HTMLInputElement).value;
      
      setLoadingState(prev => ({ ...prev, progress: 10 }));
      const totalUploads = photos.length + (canvasRef.current ? 1 : 0);
      let completedUploads = 0;
      
      // Upload all photos and get their URLs with locations
      const photoUrlsWithLocations = await Promise.all(photos.map(async (photo, index) => {
        const url = await uploadToImgBB(photo.base64);
        completedUploads++;
        setLoadingState(prev => ({ ...prev, progress: 10 + (completedUploads / totalUploads) * 60 }));
        return {
          url,
          location: photo.location,
          index: index + 1
        };
      }));
      
      // Upload signature if exists
      let signatureUrl = null;
      if (canvasRef.current) {
        const signatureData = canvasRef.current.toDataURL('image/jpeg', 0.8);
        signatureUrl = await uploadToImgBB(signatureData);
        completedUploads++;
        setLoadingState(prev => ({ ...prev, progress: 10 + (completedUploads / totalUploads) * 60 }));
      }

      // Format photos with their locations
      const photosListWithLocations = photoUrlsWithLocations.map(photo => 
        `Foto ${photo.index}: ${photo.url}\n${photo.location ? `Lokasi Diambilnya Foto ${photo.index}: ${photo.location ? `https://www.google.com/maps?q=${photo.location.lat},${photo.location.lng}` : 'Lokasi tidak tersedia'}` : ''}`
      ).join('\n\n');

      setLoadingState(prev => ({ ...prev, progress: 80 }));

      // Format signature with location
      const signatureWithLocation = signatureUrl 
        ? `Tanda Tangan Digital: ${signatureUrl}\n${selectedLocation 
            ? `Lokasi Saat Tanda Tangan: https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}` 
            : 'Lokasi tanda tangan tidak tersedia'}`
        : '';

      // Prepare email template parameters
      const templateParams = {
        to_email: 'vallian476@gmail.com',
        from_name: nama,
        tanggal: tanggal,
        nohp: nohp,
        alamat: address,
        alamat_detail: addressDetail,
        jumlah_pesanan: jumlah,
        alasan: alasan,
        lokasi: hasUsedAutoLocation ? `https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}` : 'Tidak ada koordinat',
        photos: photosListWithLocations,
        signature: signatureUrl ? `Tanda Tangan Digital: ${signatureUrl}${selfieCaptured ? `\n\nFoto Selfie Saat Tanda Tangan: ${selfieCaptured}` : ''}` : '',
        message: `
Pesanan Baru:

Informasi Pelanggan:
- Nama: ${nama}
- Tanggal: ${tanggal}
- No HP: ${nohp}

Detail Lokasi Pengiriman:
- Alamat: ${address}
- Detail Alamat: ${addressDetail}

Detail Pesanan:
- Jumlah (kotak/dus): ${jumlah}
- Alasan: ${alasan}

Foto Bukti dan Lokasinya:
${photosListWithLocations}

${signatureUrl ? `Tanda Tangan Digital: ${signatureUrl}` : ''}
${selfieCaptured ? `\nFoto Selfie Saat Tanda Tangan: ${selfieCaptured}` : ''}

Salam,
Form System
        `.trim()
      };

      setLoadingState(prev => ({ ...prev, progress: 90 }));

      // Send email using EmailJS
      const response = await emailjs.send(
        'service_2aeab6q',
        'template_02s1qwe',
        templateParams
      );

      setLoadingState(prev => ({ ...prev, progress: 100 }));
      console.log('Email sent successfully:', response);
      alert('Pesanan berhasil dikirim!');
      
      // Reset form
      form.reset();
      setPhotos([]);
      setAddress('');
      setAddressDetail('');
      setSelectedLocation(defaultCenter);
      setShowSignature(false);
      if (canvasRef.current && contextRef.current) {
        clearSignature();
      }
    } catch (error: any) {
      console.error('Detailed error:', error);
      alert(`Maaf, terjadi kesalahan: ${error.message || error.text || 'Unknown error'}`);
    } finally {
      setLoadingState({ show: false, message: '' });
    }
  };

  const handleCancelSubmit = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoadingState({ show: false, message: '' });
  };

  const handleTouchToFocus = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isFrontCamera) return;

    // Just show focus indicator at tap location
    setIsFocusing(true);
    setTimeout(() => setIsFocusing(false), 1000);
  };

  useEffect(() => {
    if (showSignature && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      // Set canvas size to match display size
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      const context = canvas.getContext('2d');
      if (context) {
        // Fill white background
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        context.lineCap = 'round';
        context.strokeStyle = 'black';
        context.lineWidth = 3;
        contextRef.current = context;
      }
    }
  }, [showSignature]);

  const getCoordinates = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    
    if ('touches' in event) {
      // Touch event
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = async (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling on touch devices
    
    const coords = getCoordinates(e);
    if (!contextRef.current || !coords) return;
    
    setIsDrawing(true);
    contextRef.current.beginPath();
    contextRef.current.moveTo(coords.x, coords.y);

    // Only try to capture selfie if not already captured
    if (!selfieCaptured) {
      try {
        await captureSelfie();
      } catch (error) {
        console.error('Failed to capture selfie:', error);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling on touch devices
    
    if (!isDrawing || !contextRef.current) return;
    
    const coords = getCoordinates(e);
    if (!coords) return;
    
    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!contextRef.current) return;
    contextRef.current.closePath();
    setIsDrawing(false);
  };

  const clearSignature = () => {
    if (!contextRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    contextRef.current.fillStyle = 'white';
    contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
    
    // Reset selfie and restart camera
    setSelfieCaptured(null);
    setIsSelfieWebcamReady(false);
    
    // Small delay to ensure camera restarts properly
    setTimeout(() => {
      setIsSelfieWebcamReady(true);
    }, 500);
  };

  useEffect(() => {
    if (showSignature) {
      // Initialize selfie webcam when signature pad is shown
      setIsSelfieWebcamReady(false);
    }
  }, [showSignature]);

  const handleSignatureToggle = () => {
    if (photos.length === 0) {
      alert('Mohon upload foto bukti terlebih dahulu sebelum menambahkan tanda tangan');
      return;
    }

    if (showSignature) {
      // If hiding signature, reset everything
      setShowSignature(false);
      if (canvasRef.current && contextRef.current) {
        clearSignature();
      }
    } else {
      // If showing signature, first close the main camera if it's open
      if (showCamera) {
        // Stop main camera if it's running
        if (webcamRef.current) {
          const stream = webcamRef.current.stream;
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
        }
        setShowCamera(false);
      }
      // Then start fresh with signature
      setShowSignature(true);
    }
  };

  const captureSelfie = async (retryCount = 0, maxRetries = 3) => {
    if (!selfieWebcamRef.current) {
      console.error('Webcam reference not available');
      return;
    }

    try {
      // Wait for webcam to be ready
      if (!isSelfieWebcamReady) {
        console.log('Waiting for selfie webcam to initialize...');
        await new Promise((resolve, reject) => {
          let attempts = 0;
          const checkReady = setInterval(() => {
            attempts++;
            if (isSelfieWebcamReady) {
              clearInterval(checkReady);
              resolve(true);
            }
            if (attempts > 10) { // Wait up to 5 seconds
              clearInterval(checkReady);
              reject('Webcam initialization timeout');
            }
          }, 500);
        });
      }

      // Additional wait to ensure video is playing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to get screenshot
      let photoData = selfieWebcamRef.current.getScreenshot();
      if (!photoData || photoData === 'data:,') {
        throw new Error('Failed to capture photo');
      }

      console.log('Selfie photo captured successfully');

      // Upload to ImgBB
      try {
        const url = await uploadToImgBB(photoData);
        if (!url) {
          throw new Error('No URL returned from upload');
        }
        console.log('Selfie uploaded successfully:', url);
        setSelfieCaptured(url);
        
        // Stop the selfie camera after successful capture
        if (selfieWebcamRef.current) {
          const stream = selfieWebcamRef.current.stream;
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
        }
        setIsSelfieWebcamReady(false);
        
        return url;
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        if (retryCount < maxRetries) {
          console.log(`Retrying selfie capture (${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return captureSelfie(retryCount + 1, maxRetries);
        }
        throw uploadError;
      }
    } catch (error) {
      console.error('Capture error:', error);
      if (retryCount < maxRetries) {
        console.log(`Retrying selfie capture (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return captureSelfie(retryCount + 1, maxRetries);
      }
      throw error;
    }
  };

  const handleCameraOpen = async () => {
    // If signature area is open, close it first to prevent camera conflicts
    if (showSignature) {
      // Stop selfie camera if it's running
      if (selfieWebcamRef.current) {
        const stream = selfieWebcamRef.current.stream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
      setIsSelfieWebcamReady(false);
      setShowSignature(false);
      if (canvasRef.current && contextRef.current) {
        clearSignature();
      }
    }
    
    const hasPermission = await requestPermission('camera');
    if (hasPermission) {
      setShowCamera(true);
    }
  };

  const uploadToImgBB = async (base64Image: string): Promise<string> => {
    try {
      // Remove data:image/jpeg;base64, prefix if exists
      const base64Data = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      
      const formData = new FormData();
      formData.append('image', base64Data);
      
      const response = await fetch('https://api.imgbb.com/1/upload?key=7fff1d3963bee543b5eae27b68466222', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`ImgBB API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || !data.data || !data.data.url) {
        throw new Error('Invalid response from ImgBB');
      }

      // Convert i.bb.co URL to direct display URL
      const directUrl = data.data.display_url || data.data.url;
      return directUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('Failed to upload image');
    }
  };

  const handleRetryGps = () => {
    resetGpsTracking();
    // Retry for photos
    photos.forEach((photo, index) => {
      if (!photo.location) {
        startLocationTracking(index);
      }
    });
  };

  const handleContactAdmin = () => {
    window.open('https://wa.me/6285172196650', '_blank');
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          FORM PESANAN (beta ver test)
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nama */}
          <div>
            <label htmlFor="nama" className="block text-sm font-medium mb-2">
              Nama
            </label>
            <input
              type="text"
              id="nama"
              required
              className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Tanggal */}
          <div>
            <label htmlFor="tanggal" className="block text-sm font-medium mb-2">
              Tanggal
            </label>
            <input
              type="date"
              id="tanggal"
              required
              className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* No HP */}
          <div>
            <label htmlFor="nohp" className="block text-sm font-medium mb-2">
              No HP Pembeli
            </label>
            <input
              type="tel"
              id="nohp"
              required
              pattern="[0-9]*"
              placeholder="Contoh: 08123456789"
              className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Alamat */}
          <div>
            <label htmlFor="alamat" className="block text-sm font-medium mb-2">
              Alamat
            </label>
            <div className="space-y-2">
              <textarea
                id="alamat"
                required
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
              />

              {/* Alamat Detail */}
              <div>
                <label htmlFor="alamat_detail" className="block text-sm font-medium mb-2">
                  Alamat Detail
                  <span className="text-xs text-gray-400 ml-1">
                    (contoh: Nomor rumah, RT/RW, Patokan, dll)
                  </span>
                </label>
                <textarea
                  id="alamat_detail"
                  required
                  rows={2}
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="Masukkan detail alamat seperti nomor rumah, RT/RW, atau patokan lokasi"
                  className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* Jumlah Pesanan */}
          <div>
            <label htmlFor="jumlah" className="block text-sm font-medium mb-2">
              Jumlah Pesanan (kotak/dus)
            </label>
            <input
              type="number"
              id="jumlah"
              required
              min="1"
              className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Alasan */}
          <div>
            <label htmlFor="alasan" className="block text-sm font-medium mb-2">
              Alasan
            </label>
            <textarea
              id="alasan"
              required
              rows={2}
              placeholder="Masukkan alasan pemesanan"
              className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Foto Bukti */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Foto Bukti (Capture Kamera)
            </label>
            
            <div className="space-y-4">
              {/* Photo Grid */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img src={photo.base64} alt={`Captured ${index + 1}`} className="w-full rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-600"
                      >
                        <XCircleIcon className="w-6 h-6" />
                      </button>
                      {(() => {
                        const progress = photo.analysisProgress ?? 100;
                        return progress < 100 ? (
                          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2">
                            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-center mt-1">Analyzing...</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {/* Camera UI or Add Photo Button */}
              {!showCamera ? (
                <button
                  type="button"
                  onClick={handleCameraOpen}
                  className="w-full px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 hover:bg-gray-800 transition flex items-center justify-center gap-2"
                >
                  <CameraIcon className="w-5 h-5" />
                  {photos.length === 0 ? 'Buka Kamera' : 'Tambah Foto'}
                </button>
              ) : (
                <div className="relative">
                  <div 
                    className="relative cursor-crosshair" 
                    onClick={handleTouchToFocus}
                  >
                    <Webcam
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full rounded-lg"
                      mirrored={isFrontCamera}
                      videoConstraints={{
                        facingMode: isFrontCamera ? 'user' : 'environment'
                      }}
                    />
                    {/* Focus indicator */}
                    {isFocusing && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-12 h-12 border-2 border-white rounded-full animate-ping opacity-50" />
                      </div>
                    )}
                    {/* Camera instructions */}
                    {!isFrontCamera && (
                      <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white bg-black/50 rounded-lg py-1">
                        Ketuk layar untuk fokus kamera
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={toggleCamera}
                      className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700 transition flex items-center justify-center gap-2"
                    >
                      <CameraIcon className="w-5 h-5" />
                      {isFrontCamera ? 'Gunakan Kamera Belakang' : 'Gunakan Kamera Depan'}
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="flex-1 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                    >
                      Ambil Foto
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Signature Area */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleSignatureToggle}
              className={`w-full px-4 py-2 rounded-lg border transition flex items-center justify-center gap-2 ${
                photos.length === 0 
                  ? 'bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-900 border-gray-700 hover:bg-gray-800'
              }`}
              disabled={photos.length === 0}
            >
              {showSignature ? 'Tutup (Reset Tanda Tangan)' : 'Tanda Tangan (Sign)'}
              {photos.length === 0 && (
                <span className="text-xs text-red-400 ml-2">(Upload foto bukti terlebih dahulu)</span>
              )}
            </button>

            {showSignature && photos.length > 0 && (
              <div className="space-y-2">
                <div className="relative bg-gray-900 rounded-lg p-4">
                  {/* Hidden selfie webcam - moved to top level for better initialization */}
                  <div className="fixed top-0 left-0 opacity-0 pointer-events-none">
                    <Webcam
                      ref={selfieWebcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{
                        facingMode: 'user',
                        width: 640,
                        height: 480
                      }}
                      audio={false}
                      imageSmoothing={true}
                      screenshotQuality={1}
                      mirrored={false}
                      forceScreenshotSourceSize={true}
                      onUserMedia={() => {
                        console.log('Selfie camera initialized');
                        setIsSelfieWebcamReady(true);
                      }}
                      onUserMediaError={(error) => {
                        console.error('Selfie camera error:', error);
                        setIsSelfieWebcamReady(false);
                      }}
                    />
                  </div>
                  
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-[400px] bg-white rounded-lg"
                    style={{ touchAction: "none" }}
                  />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
                    >
                      Hapus
                    </button>
                  </div>
                  <p className="text-center text-sm text-gray-400 mt-2">
                    Tanda tangan di area putih di atas
                  </p>
                  {/* Show loading bar while capturing selfie */}
                  {isCapturingSelfie && (
                    <div className="mt-2">
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 animate-pulse"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <p className="text-xs text-center mt-1">Mengambil foto selfie...</p>
                    </div>
                  )}
                  {/* Show status after capture attempt */}
                  {!isCapturingSelfie && (
                    <div className="mt-2 text-center text-sm">
                      {selfieCaptured ? (
                        <p className="text-green-500">✓ Foto selfie berhasil diambil</p>
                      ) : (
                        <p className="text-yellow-500">Tanda tangan untuk mengambil foto selfie (Pastikan wajah menghadap ke kamera)</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* GPS Error Message and Admin Contact */}
          {hasGpsError && (
            <div className="space-y-4">
              <p className="text-red-500 text-sm text-center">
              Sinyal buruk, gagal terhubung ke server. silahkan hubungi admin untuk konfirmasi manual atau coba lagi.
              
              </p>
              <button
                type="button"
                onClick={handleContactAdmin}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium"
              >
                HUBUNGI ADMIN
              </button>
              <button
                type="button"
                onClick={handleRetryGps}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm"
              >
                TEKAN UNTUK COBA CONNECT LAGI
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              photos.some(photo => photo.isTrackingLocation || (photo.analysisProgress ?? 0) < 100) || 
              hasGpsError ||
              (showSignature && !selfieCaptured)
            }
            className={`w-full px-4 py-3 rounded-lg transition font-medium ${
              photos.some(photo => photo.isTrackingLocation || (photo.analysisProgress ?? 0) < 100) || 
              hasGpsError ||
              (showSignature && !selfieCaptured)
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {hasGpsError ? 'GPS Error - Hubungi Admin' : 
              photos.some(photo => photo.isTrackingLocation || (photo.analysisProgress ?? 0) < 100)
                ? 'Menunggu Analisis Selesai...' :
                (showSignature && !selfieCaptured)
                  ? 'Mohon Selesaikan Tanda Tangan dengan Selfie'
                  : 'Submit'}
          </button>
        </form>
    </div>

    {/* Unified Loading Overlay */}
    {loadingState.show && (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-8 rounded-xl max-w-md w-full mx-4 relative">
          <h3 className="text-xl font-semibold mb-4">{loadingState.message}</h3>
          
          {loadingState.progress !== undefined && (
            <>
              <div className="h-2 bg-gray-700 rounded-full mb-4 overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${loadingState.progress}%` }}
                />
              </div>
              
              <p className="text-sm text-gray-400 mb-6">
                {loadingState.progress < 10 && "Mempersiapkan..."}
                {loadingState.progress >= 10 && loadingState.progress < 80 && "Mengupload foto dan tanda tangan..."}
                {loadingState.progress >= 80 && loadingState.progress < 90 && "Menyiapkan email..."}
                {loadingState.progress >= 90 && loadingState.progress < 100 && "Mengirim pesanan..."}
                {loadingState.progress === 100 && "Selesai!"}
              </p>
            </>
          )}

          {/* Cancel Button - show during location tracking or submission */}
          {loadingState.showCancel && (
            <button
              type="button"
              onClick={loadingState.isCancellable ? handleCancelLocationTracking : handleCancelSubmit}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
            >
              Batalkan
            </button>
          )}
        </div>
      </div>
    )}

    {/* GPS Warning Overlay */}
    {showGpsWarning && (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-8 rounded-xl max-w-md w-full mx-4 relative">
          <h3 className="text-xl font-semibold mb-4 text-red-500">Peringatan GPS</h3>
          <p className="text-sm text-gray-400 mb-6">
            Mohon nyalakan GPS Anda untuk melanjutkan.
          </p>
          <button
            type="button"
            onClick={() => setShowGpsWarning(false)}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Mengerti
          </button>
        </div>
      </div>
    )}

    {/* Permission Warning Overlay */}
    {showPermissionWarning.show && (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-8 rounded-xl max-w-md w-full mx-4 relative">
          <h3 className="text-xl font-semibold mb-4 text-red-500">
            {showPermissionWarning.type === 'gps' ? 'Akses Lokasi Diperlukan' : 'Akses Kamera Diperlukan'}
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {showPermissionWarning.message}
          </p>
          <button
            type="button"
            onClick={handlePermissionWarningClose}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Mengerti
          </button>
        </div>
      </div>
    )}
    </main>
  );
}
