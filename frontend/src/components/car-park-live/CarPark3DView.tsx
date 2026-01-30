import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Activity } from 'lucide-react';

// ==================== TYPES ====================
interface CameraData {
  id: string;
  name: string;
  ip: string;
  floor: number;
  position: { x: number; y: number; z: number };
  rotation?: { y: number };
  type: string;
}

interface EventData {
  id: number;
  type: 'motion' | 'person' | 'vehicle' | 'plate' | 'alert';
  title: string;
  cameraId: string;
  cameraName: string;
  details?: string;
  timestamp: Date;
}

interface CameraMesh {
  mesh: THREE.Group;
  data: CameraData;
  body: THREE.Mesh;
  cone: THREE.Mesh;
}

// ==================== CONFIG ====================
const CAMERAS: CameraData[] = [
  {
    id: '692dd5480096ea03e4000423',
    name: 'Ground Floor Front',
    ip: '10.10.10.30',
    floor: 0,
    position: { x: -15, y: 2, z: 20 },
    rotation: { y: Math.PI * 0.1 },
    type: 'AI Turret',
  },
  {
    id: '692dd54800e1ea03e4000424',
    name: 'Ground Floor Rear',
    ip: '10.10.10.197',
    floor: 0,
    position: { x: 15, y: 2, z: -20 },
    rotation: { y: Math.PI * -0.9 },
    type: 'AI Turret',
  },
  {
    id: '692dd5480117ea03e4000426',
    name: 'Ground Floor & Ramp',
    ip: '10.10.10.14',
    floor: 0,
    position: { x: -20, y: 2, z: -5 },
    rotation: { y: Math.PI * 0.5 },
    type: 'AI Turret',
  },
];

const FLOOR_COUNT = 6; // GF + 5 floors
const FLOOR_HEIGHT = 3;
const BUILDING_WIDTH = 50;
const BUILDING_DEPTH = 40;

// ==================== COMPONENT ====================
export function CarPark3DView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const floorMeshesRef = useRef<THREE.Mesh[]>([]);
  const cameraMeshesRef = useRef<CameraMesh[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const [selectedFloor, setSelectedFloor] = useState(0);
  const [events, setEvents] = useState<EventData[]>([]);
  const [stats, setStats] = useState({ events: 0, vehicles: 0, people: 0, alerts: 0 });
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mouse drag state
  const isDraggingRef = useRef(false);
  const previousMouseRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const currentRotationRef = useRef({ x: 0, y: 0 });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);
    scene.fog = new THREE.Fog(0x0a0a12, 100, 200);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(80, 60, 80);
    camera.lookAt(0, 10, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(120, 40, 0x1a1a2e, 0x1a1a2e);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);

    // Build the car park
    createBuilding(scene);
    createCameras(scene);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      updateCameraPosition();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Mouse interaction
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - previousMouseRef.current.x;
      const deltaY = e.clientY - previousMouseRef.current.y;

      targetRotationRef.current.x += deltaX * 0.003;
      targetRotationRef.current.y = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 6, targetRotationRef.current.y + deltaY * 0.003)
      );

      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  const createBuilding = (scene: THREE.Scene) => {
    const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 0.5, BUILDING_DEPTH);

    for (let i = 0; i < FLOOR_COUNT; i++) {
      // Floor slab
      const floorMaterial = new THREE.MeshPhongMaterial({
        color: i === 0 ? 0x00d4ff : 0x2a2a4a,
        transparent: true,
        opacity: i === 0 ? 0.8 : 0.4,
        wireframe: false,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.y = i * FLOOR_HEIGHT;
      floor.userData = { floor: i };
      scene.add(floor);
      floorMeshesRef.current.push(floor);

      // Floor outline
      const edges = new THREE.EdgesGeometry(floorGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x00d4ff : 0x3a3a5a,
        transparent: true,
        opacity: 0.6,
      });
      const outline = new THREE.LineSegments(edges, lineMaterial);
      outline.position.y = i * FLOOR_HEIGHT;
      scene.add(outline);

      // Ramp connectors
      if (i < FLOOR_COUNT - 1) {
        const rampGeometry = new THREE.BoxGeometry(8, 0.3, 15);
        const rampMaterial = new THREE.MeshPhongMaterial({
          color: 0x1a1a3a,
          transparent: true,
          opacity: 0.5,
        });
        const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
        ramp.position.set(-BUILDING_WIDTH / 2 + 5, i * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, 0);
        ramp.rotation.z = Math.PI * 0.15;
        scene.add(ramp);
      }
    }
  };

  const createCameras = (scene: THREE.Scene) => {
    CAMERAS.forEach((cam) => {
      const cameraGroup = new THREE.Group();

      // Camera housing
      const bodyGeometry = new THREE.SphereGeometry(1.2, 16, 16);
      const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.3,
      });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      cameraGroup.add(body);

      // Camera lens direction indicator
      const coneGeometry = new THREE.ConeGeometry(2, 6, 8);
      const coneMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.2,
      });
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.rotation.x = Math.PI / 2;
      cone.position.z = 3;
      cameraGroup.add(cone);

      // Position
      cameraGroup.position.set(
        cam.position.x,
        cam.floor * FLOOR_HEIGHT + cam.position.y,
        cam.position.z
      );
      if (cam.rotation) {
        cameraGroup.rotation.y = cam.rotation.y;
      }

      cameraGroup.userData = { camera: cam };
      scene.add(cameraGroup);
      cameraMeshesRef.current.push({ mesh: cameraGroup, data: cam, body, cone });
    });
  };

  const updateCameraPosition = () => {
    if (!cameraRef.current) return;

    const cameraDistance = 110;
    currentRotationRef.current.x +=
      (targetRotationRef.current.x - currentRotationRef.current.x) * 0.1;
    currentRotationRef.current.y +=
      (targetRotationRef.current.y - currentRotationRef.current.y) * 0.1;

    const centerY = selectedFloor * FLOOR_HEIGHT + 5;
    cameraRef.current.position.x =
      Math.sin(currentRotationRef.current.x) *
      Math.cos(currentRotationRef.current.y) *
      cameraDistance;
    cameraRef.current.position.y =
      Math.sin(currentRotationRef.current.y) * cameraDistance + centerY + 30;
    cameraRef.current.position.z =
      Math.cos(currentRotationRef.current.x) *
      Math.cos(currentRotationRef.current.y) *
      cameraDistance;
    cameraRef.current.lookAt(0, centerY, 0);
  };

  // Update floor selection visuals
  useEffect(() => {
    floorMeshesRef.current.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshPhongMaterial;
      material.color.setHex(i === selectedFloor ? 0x00d4ff : 0x2a2a4a);
      material.opacity = i === selectedFloor ? 0.8 : 0.4;
    });
  }, [selectedFloor]);

  // Simulate events
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const cam = CAMERAS[Math.floor(Math.random() * CAMERAS.length)];
        const types: EventData['type'][] = ['motion', 'person', 'vehicle', 'plate'];
        const type = types[Math.floor(Math.random() * types.length)];

        const titles: Record<string, string> = {
          motion: 'Motion Detected',
          person: 'Person Detected',
          vehicle: 'Vehicle Detected',
          plate: `Plate: ${generatePlate()}`,
        };

        const newEvent: EventData = {
          id: Date.now(),
          type,
          title: titles[type],
          cameraId: cam.id,
          cameraName: cam.name,
          details: type === 'plate' ? 'Entry' : '',
          timestamp: new Date(),
        };

        setEvents((prev) => [newEvent, ...prev].slice(0, 100));
        setStats((prev) => ({
          events: prev.events + 1,
          vehicles: prev.vehicles + (type === 'vehicle' ? 1 : 0),
          people: prev.people + (type === 'person' ? 1 : 0),
          alerts: prev.alerts + (type === 'alert' ? 1 : 0),
        }));

        triggerCameraAlert(cam.id, type);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Clock update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerCameraAlert = useCallback((cameraId: string, eventType: EventData['type']) => {
    const cam = cameraMeshesRef.current.find((c) => c.data.id === cameraId);
    if (!cam) return;

    const colors: Record<string, number> = {
      motion: 0xffaa00,
      person: 0x00d4ff,
      vehicle: 0x00ff88,
      plate: 0x8800ff,
      alert: 0xff4444,
    };
    const color = colors[eventType] || 0x00ff88;

    const bodyMaterial = cam.body.material as THREE.MeshPhongMaterial;
    const coneMaterial = cam.cone.material as THREE.MeshPhongMaterial;

    bodyMaterial.color.setHex(color);
    bodyMaterial.emissive.setHex(color);
    bodyMaterial.emissiveIntensity = 1;
    coneMaterial.color.setHex(color);
    coneMaterial.opacity = 0.5;

    setTimeout(() => {
      bodyMaterial.color.setHex(0x00ff88);
      bodyMaterial.emissive.setHex(0x00ff88);
      bodyMaterial.emissiveIntensity = 0.3;
      coneMaterial.color.setHex(0x00ff88);
      coneMaterial.opacity = 0.2;
    }, 2000);
  }, []);

  const generatePlate = () => {
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const nums = '0123456789';
    return `${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}${nums[Math.floor(Math.random() * nums.length)]}${nums[Math.floor(Math.random() * nums.length)]} ${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}`;
  };

  const getEventIcon = (type: EventData['type']) => {
    const icons: Record<string, string> = {
      motion: '🔵',
      person: '🚶',
      vehicle: '🚗',
      plate: '🔢',
      alert: '⚠️',
    };
    return icons[type] || '📍';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const filteredEvents =
    activeFilter === 'all' ? events : events.filter((e) => e.type === activeFilter);

  const floors = ['GF', 'F1', 'F2', 'F3', 'F4', 'F5'];

  return (
    <div className="h-[calc(100vh-280px)] min-h-[600px] grid grid-cols-[1fr_380px] gap-0 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-800">
      {/* 3D View */}
      <div className="relative bg-gradient-to-br from-slate-900 to-slate-950">
        <div ref={containerRef} className="w-full h-full" />

        {/* Floor selector */}
        <div className="absolute left-5 top-1/2 -translate-y-1/2 flex flex-col gap-1">
          {floors.map((label, i) => (
            <button
              key={label}
              onClick={() => setSelectedFloor(5 - i)}
              className={`w-11 h-9 border rounded-md text-xs font-semibold transition-all ${
                selectedFloor === 5 - i
                  ? 'bg-cyan-500/30 border-cyan-500 text-cyan-400 shadow-[0_0_12px_rgba(0,212,255,0.3)]'
                  : 'bg-black/40 border-white/20 text-gray-500 hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-6 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-5 py-2.5">
          <div className="text-center">
            <div className="text-xl font-semibold text-cyan-400">{stats.events}</div>
            <div className="text-[10px] uppercase text-gray-500">Events Today</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-cyan-400">{stats.vehicles}</div>
            <div className="text-[10px] uppercase text-gray-500">Vehicles</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-cyan-400">{stats.people}</div>
            <div className="text-[10px] uppercase text-gray-500">People</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-cyan-400">{stats.alerts}</div>
            <div className="text-[10px] uppercase text-gray-500">Alerts</div>
          </div>
        </div>

        {/* Camera legend */}
        <div className="absolute bottom-5 left-5 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 px-4">
          <div className="text-[11px] uppercase text-gray-500 mb-2">Camera Status</div>
          <div className="flex items-center gap-2 text-xs py-1">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="text-gray-300">Idle</span>
          </div>
          <div className="flex items-center gap-2 text-xs py-1">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-gray-300">Motion Detected</span>
          </div>
          <div className="flex items-center gap-2 text-xs py-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-gray-300">Alert</span>
          </div>
        </div>

        {/* Clock */}
        <div className="absolute top-5 right-5 text-cyan-400 font-mono text-sm bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5">
          {formatTime(currentTime)}
        </div>
      </div>

      {/* Event Panel */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-l border-white/10 flex flex-col">
        {/* Panel header */}
        <div className="p-4 border-b border-white/10">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2 text-white">
            <Activity className="w-4 h-4" />
            Live Event Feed
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'all', label: 'All', icon: null },
              { key: 'motion', label: 'Motion', icon: '🔵' },
              { key: 'person', label: 'Person', icon: '🚶' },
              { key: 'vehicle', label: 'Vehicle', icon: '🚗' },
              { key: 'plate', label: 'Plate', icon: '🔢' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`px-2.5 py-1.5 border rounded-md text-[11px] transition-all ${
                  activeFilter === key
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-transparent border-white/15 text-gray-500 hover:border-white/30 hover:text-gray-300'
                }`}
              >
                {icon && <span className="mr-1">{icon}</span>}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No events yet</div>
          ) : (
            filteredEvents.slice(0, 50).map((event, index) => (
              <div
                key={event.id}
                className={`flex gap-3 p-3 rounded-lg bg-white/[0.03] border border-transparent hover:bg-white/[0.06] hover:border-white/10 cursor-pointer transition-all ${
                  index === 0 ? 'animate-slide-in' : ''
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                    event.type === 'motion'
                      ? 'bg-amber-500/20'
                      : event.type === 'person'
                        ? 'bg-cyan-500/20'
                        : event.type === 'vehicle'
                          ? 'bg-green-500/20'
                          : event.type === 'plate'
                            ? 'bg-purple-500/20'
                            : 'bg-red-500/20'
                  }`}
                >
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white truncate">{event.title}</div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-2">
                    <span className="text-cyan-400">{event.cameraName}</span>
                    {event.details && (
                      <>
                        <span>•</span>
                        <span>{event.details}</span>
                      </>
                    )}
                    <span className="ml-auto tabular-nums">{formatTime(event.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
