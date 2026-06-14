// NOMAD Mobility Operating System - Desktop Workspace Controller

// Initialize Lucide Icons
lucide.createIcons();

// State Configuration
let map = null;
let currentTileLayer = null;
let activeMarker = null;
let animationFrameId = null;

// Track active map path layers
let routeLayers = [];
let mapMarkers = [];

// Global Coordinates State (Defaults to Mumbai BOM to BKC)
let originCoords = { lat: 19.0896, lng: 72.8656, name: "Chhatrapati Shivaji Maharaj Airport (BOM)" };
let destCoords = { lat: 19.0607, lng: 72.8617, name: "Bandra Kurla Complex (BKC)" };

// Map Tile URLs
const mapStyles = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
};

// 1. Initialize Map
function initMap() {
  const savedTheme = sessionStorage.getItem('nomad-theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);

  // Set navbar toggle icon state to match
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const darkIcon = themeToggle.querySelector('.theme-icon-dark');
    const lightIcon = themeToggle.querySelector('.theme-icon-light');
    if (darkIcon && lightIcon) {
      if (savedTheme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
      } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
      }
    }
  }

  // Centered on Mumbai initially
  map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    dragPan: true,
    keyboard: true
  }).setView([19.0760, 72.8777], 12);

  // Set the map tile style depending on theme
  currentTileLayer = L.tileLayer(mapStyles[savedTheme], {
    attribution: mapStyles.attribution,
    maxZoom: 20
  }).addTo(map);

  // Add zoom control at bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Pre-load default markers
  updateInputMarkers();
}

// 2. Map Theme Swap
function updateMapTheme(theme) {
  if (!map || !currentTileLayer) return;
  map.removeLayer(currentTileLayer);
  
  currentTileLayer = L.tileLayer(mapStyles[theme], {
    attribution: mapStyles.attribution,
    maxZoom: 20
  }).addTo(map);
}

// 3. Clear existing paths & markers
function clearMapLayers() {
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
  
  mapMarkers.forEach(marker => map.removeLayer(marker));
  mapMarkers = [];
  
  if (activeMarker) {
    map.removeLayer(activeMarker);
    activeMarker = null;
  }
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// 4. Nominatim Autocomplete Place Fetcher
async function fetchSuggestions(query) {
  if (!query || query.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NOMAD-Mobility-Operating-System'
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.map(item => {
      const parts = item.display_name.split(',');
      const name = parts.slice(0, 3).join(',').trim();
      return {
        name: name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      };
    });
  } catch (e) {
    console.error("Nominatim Autocomplete Error: ", e);
    return [];
  }
}

// 5. OSRM Route Geometry Fetcher
async function fetchRouteGeometry(start, end) {
  try {
    const url = `https://router.projectosrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
    
    const routePath = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
    const durationSeconds = data.routes[0].duration;
    const distanceMeters = data.routes[0].distance;
    
    return {
      path: routePath,
      durationMins: Math.round(durationSeconds / 60),
      distanceKm: parseFloat((distanceMeters / 1000).toFixed(1))
    };
  } catch (e) {
    console.error("OSRM Routing Error: ", e);
    return null;
  }
}

// 6. Autocomplete Field Binder
function setupAutocomplete(inputId, suggestionsId, isOrigin) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(suggestionsId);
  if (!input || !container) return;

  let debounceTimer;

  function renderSuggestions(matches) {
    container.innerHTML = '';
    if (matches.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    matches.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      div.innerHTML = `
        <i data-lucide="map-pin" class="suggestion-icon"></i>
        <span>${item.name}</span>
      `;
      div.addEventListener('click', () => {
        input.value = item.name;
        container.style.display = 'none';
        
        // Store selected coordinates
        if (isOrigin) {
          originCoords = { lat: item.lat, lng: item.lng, name: item.name };
        } else {
          destCoords = { lat: item.lat, lng: item.lng, name: item.name };
        }
        
        // Center view on update
        map.setView([item.lat, item.lng], 14);

        // Update markers instantly
        updateInputMarkers();
      });
      container.appendChild(div);
    });
    
    container.style.display = 'flex';
    lucide.createIcons();
  }

  // Type input debouncer
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const val = e.target.value.trim();
    if (val.length < 3) {
      container.style.display = 'none';
      return;
    }

    container.innerHTML = `
      <div class="suggestion-item" style="cursor: default;">
        <div class="spinner-ring"></div>
        <span>Searching places...</span>
      </div>
    `;
    container.style.display = 'flex';

    debounceTimer = setTimeout(async () => {
      const matches = await fetchSuggestions(val);
      renderSuggestions(matches);
    }, 400);
  });

  // Focus trigger (shows top default recommendations for Mumbai if text empty)
  input.addEventListener('focus', () => {
    const val = input.value.trim();
    if (!val || val.length < 3) {
      const defaults = [
        { name: "Chhatrapati Shivaji Maharaj Airport (BOM)", lat: 19.0896, lng: 72.8656 },
        { name: "Bandra Kurla Complex (BKC)", lat: 19.0607, lng: 72.8617 },
        { name: "Gateway of India, Colaba", lat: 19.0302, lng: 72.8338 },
        { name: "Marine Drive, Churchgate", lat: 18.9415, lng: 72.8236 },
        { name: "Nariman Point Financial District", lat: 18.9256, lng: 72.8242 }
      ];
      renderSuggestions(defaults);
    }
  });

  // Clicking outside dismisses suggestion boxes
  document.addEventListener('click', (e) => {
    if (e.target !== input && !container.contains(e.target)) {
      container.style.display = 'none';
    }
  });
}

// 7. Update current start/end pins
function updateInputMarkers() {
  // Clear old pins
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  const originIcon = L.divIcon({
    className: 'map-origin-pin',
    html: '<div style="background-color: var(--text-primary); color: var(--bg-primary); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; border: 2px solid white; box-shadow: var(--shadow-md);">A</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const destIcon = L.divIcon({
    className: 'map-dest-pin',
    html: '<div style="background-color: var(--accent); color: var(--bg-primary); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; border: 2px solid white; box-shadow: var(--shadow-md);">B</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const m1 = L.marker([originCoords.lat, originCoords.lng], { icon: originIcon }).addTo(map);
  const m2 = L.marker([destCoords.lat, destCoords.lng], { icon: destIcon }).addTo(map);
  
  mapMarkers.push(m1, m2);

  const group = L.featureGroup([m1, m2]);
  map.fitBounds(group.getBounds(), { padding: [100, 100] });
}

// 8. Vehicle Marker Interpolation along active route path
function animateMarkerAlongRoute(coords, color) {
  if (activeMarker) map.removeLayer(activeMarker);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  let segmentIndex = 0;
  let progress = 0;
  const speed = 0.006;

  // Adapt glowing color to match route type
  const customIcon = L.divIcon({
    className: 'custom-vehicle-marker',
    html: `<div class="glowing-marker" style="background-color: ${color}; box-shadow: 0 0 0 4px ${color}66, 0 0 10px ${color}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  activeMarker = L.marker(coords[0], { icon: customIcon }).addTo(map);

  function step() {
    if (!activeMarker) return;

    const startPt = coords[segmentIndex];
    const endPt = coords[segmentIndex + 1];

    if (!endPt) {
      setTimeout(() => {
        if (activeMarker) {
          segmentIndex = 0;
          progress = 0;
          activeMarker.setLatLng(coords[0]);
          animationFrameId = requestAnimationFrame(step);
        }
      }, 1500);
      return;
    }

    const lat = startPt[0] + (endPt[0] - startPt[0]) * progress;
    const lng = startPt[1] + (endPt[1] - startPt[1]) * progress;
    
    activeMarker.setLatLng([lat, lng]);
    progress += speed;

    if (progress >= 1) {
      progress = 0;
      segmentIndex++;
    }

    animationFrameId = requestAnimationFrame(step);
  }

  animationFrameId = requestAnimationFrame(step);
}

// Helper to generate a curved/shifted coordinate route for alternative rendering
function generateShiftedCoords(coords, offsetLat, offsetLng) {
  return coords.map(c => [c[0] + offsetLat, c[1] + offsetLng]);
}

// 9. AI Decision Routing Engine — CINEMATIC ADVISOR EXPERIENCE
// Utility: async delay
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Utility: Speak a line using Web Speech API, returns a promise
function speakLine(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      // Fallback: just wait proportional to text length
      setTimeout(resolve, text.length * 50 + 600);
      return;
    }

    // Cancel any pending utterances
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to pick a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Microsoft'))
    ) || voices.find(v => v.lang.startsWith('en')) || null;

    if (preferred) utterance.voice = preferred;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

// Utility: Typewriter text display
async function typewriterText(element, text, speed = 28) {
  element.textContent = '';
  for (let i = 0; i < text.length; i++) {
    element.textContent += text[i];
    await wait(speed);
  }
}

// Utility: Animate a Leaflet polyline drawing (returns promise)
function animatePolylineDraw(polylineLayer, durationMs = 1600) {
  return new Promise((resolve) => {
    const pathEl = polylineLayer.getElement();
    if (!pathEl) { resolve(); return; }

    const pathNode = pathEl.querySelector('path') || pathEl;
    const length = pathNode.getTotalLength ? pathNode.getTotalLength() : 1000;

    pathNode.style.strokeDasharray = `${length}`;
    pathNode.style.strokeDashoffset = `${length}`;
    pathNode.style.transition = `stroke-dash-offset ${durationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;

    // Force reflow
    pathNode.getBoundingClientRect();

    pathNode.style.strokeDashoffset = '0';
    setTimeout(resolve, durationMs);
  });
}

// AI Advisor DOM refs
function getAIElements() {
  return {
    overlay: document.getElementById('ai-cinematic-overlay'),
    orbContainer: document.getElementById('ai-orb-container'),
    orb: document.getElementById('ai-orb'),
    orbLabel: document.getElementById('ai-orb-label'),
    transcriptBar: document.getElementById('ai-transcript-bar'),
    transcriptText: document.getElementById('ai-transcript-text'),
    analyzingHud: document.getElementById('ai-analyzing-hud'),
  };
}

// Show/Hide AI elements
function showAIElement(el) { if (el) el.classList.add('active'); }
function hideAIElement(el) { if (el) el.classList.remove('active'); }

async function handleFormSubmit(e) {
  e.preventDefault();

  const loader = document.getElementById('analysis-loader');
  const results = document.getElementById('analysis-results');
  const submitBtn = document.getElementById('btn-analyze');
  const departureTime = document.getElementById('input-time').value;
  const ai = getAIElements();

  // --- PHASE 0: Reset state & disable ---
  results.style.display = 'none';
  loader.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader" class="spinner-ring" style="animation: spin-loop 0.8s linear infinite;"></i> Advisor Active...';
  lucide.createIcons();

  clearMapLayers();
  updateInputMarkers();

  // Ensure voices are loaded (Chrome requires user gesture first)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  // --- PHASE 1: Fetch route data ---
  let routeData = await fetchRouteGeometry(originCoords, destCoords);

  // Fallback simulator
  if (!routeData) {
    const startLat = originCoords.lat;
    const startLng = originCoords.lng;
    const endLat = destCoords.lat;
    const endLng = destCoords.lng;

    const path = [];
    const segments = 6;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let lat = startLat + (endLat - startLat) * t;
      let lng = startLng + (endLng - startLng) * t;
      const offset = 0.006 * Math.sin(t * Math.PI);
      lat += offset;
      lng += offset;
      path.push([lat, lng]);
    }

    const latDiff = endLat - startLat;
    const lngDiff = endLng - startLng;
    const distanceKm = parseFloat((Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111.3).toFixed(1));
    const durationMins = Math.max(8, Math.round(distanceKm * 1.8));

    routeData = { path: path, durationMins: durationMins, distanceKm: distanceKm };
  }

  const baseCoords = routeData.path;
  const distance = routeData.distanceKm;
  const baseDuration = routeData.durationMins;

  // Traffic multipliers
  let trafficFactor = 1.2;
  if (departureTime === 'morning') trafficFactor = 2.1;
  if (departureTime === 'later-1') trafficFactor = 1.5;
  if (departureTime === 'later-2') trafficFactor = 1.3;

  const isIndia = originCoords.lat >= 8 && originCoords.lat <= 37 && originCoords.lng >= 68 && originCoords.lng <= 97;
  const currency = isIndia ? "₹" : "$";

  // Travel options
  const travelOptions = {
    transit: {
      id: 'transit',
      name: isIndia ? 'Metro Line 2' : 'Metro Transit Link',
      color: 'var(--color-time)',
      duration: Math.round(baseDuration * 1.1),
      cost: isIndia ? 40 : 2.50,
      carbonOffset: 75,
      safety: 9.5,
      coords: baseCoords
    },
    ebike: {
      id: 'ebike',
      name: 'Eco E-Bike',
      color: 'var(--color-carbon)',
      duration: Math.round(distance * 3.5),
      cost: isIndia ? 30 : 2.00,
      carbonOffset: 95,
      safety: 8.0,
      coords: generateShiftedCoords(baseCoords, 0.0015, -0.0015)
    },
    rideshare: {
      id: 'rideshare',
      name: 'Private Rideshare',
      color: '#e28743',
      duration: Math.round(baseDuration * trafficFactor),
      cost: Math.round(distance * (isIndia ? 15 : 2.0) + (isIndia ? 60 : 6.0)),
      carbonOffset: 0,
      safety: 7.2,
      coords: generateShiftedCoords(baseCoords, -0.0015, 0.0015)
    }
  };

  const optionsList = [travelOptions.transit, travelOptions.ebike, travelOptions.rideshare];

  // AI Scoring
  optionsList.forEach(opt => {
    const timeScore = Math.max(0, 1 - (opt.duration / 120));
    const maxCost = isIndia ? 800 : 60;
    const costScore = Math.max(0, 1 - (opt.cost / maxCost));
    const safetyScore = opt.safety / 10;
    const envScore = opt.carbonOffset / 100;
    opt.aiScore = (timeScore * 0.40) + (costScore * 0.30) + (safetyScore * 0.20) + (envScore * 0.10);
  });

  optionsList.sort((a, b) => b.aiScore - a.aiScore);
  const preferredOption = optionsList[0];

  const fastestOpt = optionsList.reduce((min, opt) => opt.duration < min.duration ? opt : min, optionsList[0]);
  const cheapestOpt = optionsList.reduce((min, opt) => opt.cost < min.cost ? opt : min, optionsList[0]);
  const safestOpt = optionsList.reduce((max, opt) => opt.safety > max.safety ? opt : max, optionsList[0]);
  const greenestOpt = optionsList.reduce((max, opt) => opt.carbonOffset > max.carbonOffset ? opt : max, optionsList[0]);

  const rideShareCost = travelOptions.rideshare.cost;
  const savings = Math.max(0, rideShareCost - preferredOption.cost);

  // ═══════════════════════════════════════════
  // CINEMATIC SEQUENCE START
  // ═══════════════════════════════════════════

  // --- PHASE 2: Map zooms to route bounds ---
  const group = L.featureGroup(mapMarkers);
  map.fitBounds(group.getBounds(), { padding: [100, 100], animate: true, duration: 1.5 });
  await wait(1600);

  // --- PHASE 3: Cinematic overlay + analyzing HUD ---
  showAIElement(ai.overlay);
  await wait(400);
  showAIElement(ai.analyzingHud);
  await wait(2200);
  hideAIElement(ai.analyzingHud);
  await wait(400);

  // --- PHASE 4: Draw route polylines with animation ---
  const drawnPolylines = [];
  for (const opt of optionsList) {
    const isPreferred = opt.id === preferredOption.id;
    const polyline = L.polyline(opt.coords, {
      color: isPreferred ? opt.color : '#86868b',
      weight: isPreferred ? 6 : 3,
      opacity: 0,
      dashArray: isPreferred ? '10, 10' : '5, 8',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    routeLayers.push(polyline);
    drawnPolylines.push(polyline);
  }

  // Fit bounds with all routes now
  const fullGroup = L.featureGroup([...mapMarkers, ...routeLayers]);
  map.fitBounds(fullGroup.getBounds(), { padding: [80, 80], animate: true, duration: 1.0 });
  await wait(800);

  // Animate preferred route appearing first, then others
  const preferredIdx = optionsList.findIndex(o => o.id === preferredOption.id);
  
  // Show preferred route with cinematic draw
  drawnPolylines[preferredIdx].setStyle({ opacity: 0.9 });
  const preferredPathEl = drawnPolylines[preferredIdx].getElement();
  if (preferredPathEl) {
    const pathNode = preferredPathEl.querySelector('path') || preferredPathEl;
    const len = pathNode.getTotalLength ? pathNode.getTotalLength() : 1000;
    pathNode.style.strokeDasharray = `${len}`;
    pathNode.style.strokeDashoffset = `${len}`;
    pathNode.style.transition = `stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1)`;
    pathNode.getBoundingClientRect();
    pathNode.style.strokeDashoffset = '0';
  }
  await wait(1200);

  // Show other routes fading in
  drawnPolylines.forEach((pl, idx) => {
    if (idx !== preferredIdx) {
      pl.setStyle({ opacity: 0.35 });
    }
  });
  await wait(600);

  // Start vehicle animation
  animateMarkerAlongRoute(preferredOption.coords, preferredOption.color);

  // --- PHASE 5: AI Orb rises + begins speaking ---
  showAIElement(ai.orbContainer);
  showAIElement(ai.transcriptBar);
  await wait(600);

  // Determine greeting
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const startName = originCoords.name.split(',')[0].trim();
  const endName = destCoords.name.split(',')[0].trim();

  // Build script lines — each line is: { text, highlightCard (optional CSS selector) }
  const script = [
    { text: `${greeting}. I've analyzed your commute from ${startName} to ${endName}.`, highlight: null },
    { text: `The ${preferredOption.name.toLowerCase()} is your best option today.`, highlight: null },
    { text: `You'll arrive in ${preferredOption.duration} minutes.`, highlight: '.perspective-card.time-border' },
  ];

  if (preferredOption.id !== 'rideshare' && savings > 0) {
    script.push({
      text: `You'll save ${currency}${savings} compared to ride-sharing.`,
      highlight: '.perspective-card.cost-border'
    });
  } else {
    script.push({
      text: `The fare is ${currency}${preferredOption.cost}.`,
      highlight: '.perspective-card.cost-border'
    });
  }

  if (preferredOption.carbonOffset > 0) {
    script.push({
      text: `This route reduces your carbon emissions by ${preferredOption.carbonOffset} percent.`,
      highlight: '.perspective-card.env-border'
    });
  }

  if (preferredOption.id === 'transit') {
    script.push({ text: `Proceed to the nearest metro station gate. Have a safe commute.`, highlight: '.perspective-card.safety-border' });
  } else if (preferredOption.id === 'ebike') {
    script.push({ text: `Your E-bike is available at the nearest docking station. Ride safe.`, highlight: '.perspective-card.safety-border' });
  } else {
    script.push({ text: `Your cab has been requested. Please wait at the pickup zone.`, highlight: '.perspective-card.safety-border' });
  }

  // Populate perspective text data (reused from original)
  populatePerspectiveTexts(preferredOption, travelOptions, originCoords, destCoords, isIndia, currency);
  populateRecommendedDecisionCard(preferredOption, travelOptions, isIndia, currency);

  // --- PHASE 6: Speak each line sequentially ---
  ai.orb.classList.add('speaking');

  for (const line of script) {
    // Show transcript text with typewriter
    ai.transcriptText.textContent = '';
    ai.transcriptText.textContent = line.text;

    // Highlight perspective card if applicable
    document.querySelectorAll('.perspective-card').forEach(c => c.classList.remove('ai-highlight'));
    if (line.highlight) {
      const card = document.querySelector(line.highlight);
      if (card) card.classList.add('ai-highlight');
    }

    // Speak
    await speakLine(line.text);
    await wait(500);
  }

  ai.orb.classList.remove('speaking');

  // --- PHASE 7: Wrap up — reveal sidebar results, fade out orb ---
  await wait(600);

  // Clear highlights
  document.querySelectorAll('.perspective-card').forEach(c => c.classList.remove('ai-highlight'));

  // Reveal analysis results in sidebar
  results.style.display = 'flex';
  lucide.createIcons();

  // Mark active perspective cards
  const timeCard = document.querySelector('.perspective-card.time-border');
  const costCard = document.querySelector('.perspective-card.cost-border');
  const safetyCard = document.querySelector('.perspective-card.safety-border');
  const envCard = document.querySelector('.perspective-card.env-border');

  if (preferredOption.id === fastestOpt.id && timeCard) timeCard.classList.add('active');
  if (preferredOption.id === cheapestOpt.id && costCard) costCard.classList.add('active');
  if (preferredOption.id === safestOpt.id && safetyCard) safetyCard.classList.add('active');
  if (preferredOption.id === greenestOpt.id && envCard) envCard.classList.add('active');

  // Bind click handlers on perspective cards
  if (timeCard) timeCard.addEventListener('click', () => highlightSelectedRoute(fastestOpt));
  if (costCard) costCard.addEventListener('click', () => highlightSelectedRoute(cheapestOpt));
  if (safetyCard) safetyCard.addEventListener('click', () => highlightSelectedRoute(safestOpt));
  if (envCard) envCard.addEventListener('click', () => highlightSelectedRoute(greenestOpt));

  // Fade out AI overlay elements
  await wait(1200);
  hideAIElement(ai.transcriptBar);
  hideAIElement(ai.orbContainer);
  await wait(800);
  hideAIElement(ai.overlay);

  // Re-enable submit button
  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i data-lucide="sparkles"></i> Analyze Route';
  lucide.createIcons();

  // Route highlight handler (shared across perspective card clicks)
  function highlightSelectedRoute(selectedOpt) {
    animateMarkerAlongRoute(selectedOpt.coords, selectedOpt.color);

    routeLayers.forEach((layer, idx) => {
      const opt = optionsList[idx];
      const isSelected = opt.id === selectedOpt.id;
      layer.setStyle({
        color: isSelected ? opt.color : '#86868b',
        weight: isSelected ? 6 : 3,
        opacity: isSelected ? 0.9 : 0.4,
        dashArray: isSelected ? '10, 10' : '5, 8'
      });
    });

    populatePerspectiveTexts(selectedOpt, travelOptions, originCoords, destCoords, isIndia, currency);

    const cards = [timeCard, costCard, safetyCard, envCard];
    cards.forEach(c => { if (c) c.classList.remove('active'); });

    if (selectedOpt.id === fastestOpt.id && timeCard) timeCard.classList.add('active');
    if (selectedOpt.id === cheapestOpt.id && costCard) costCard.classList.add('active');
    if (selectedOpt.id === safestOpt.id && safetyCard) safetyCard.classList.add('active');
    if (selectedOpt.id === greenestOpt.id && envCard) envCard.classList.add('active');
  }
}

// Extracted helper: Populate perspective card text
function populatePerspectiveTexts(opt, travelOptions, originCoords, destCoords, isIndia, currency) {
  const endName = destCoords.name.split(',')[0];
  const rideShareCost = travelOptions.rideshare.cost;
  const savings = Math.max(0, rideShareCost - opt.cost);

  if (opt.id === 'transit') {
    document.getElementById('time-reasoning').textContent =
      `Metro grids secure transport to ${endName} in exactly ${opt.duration} minutes, bypassing road delays entirely.`;
  } else if (opt.id === 'ebike') {
    document.getElementById('time-reasoning').textContent =
      `E-bike pathing routes you along designated lanes, arriving in ${opt.duration} minutes at a steady, active pace.`;
  } else {
    document.getElementById('time-reasoning').textContent =
      `Private rideshare requires ${opt.duration} minutes due to current traffic density levels at the highway junctions.`;
  }

  if (opt.id === 'rideshare') {
    document.getElementById('cost-reasoning').textContent =
      `Rideshare fares total ${currency}${opt.cost}, including premium road toll tariffs and fuel charges.`;
  } else {
    document.getElementById('cost-reasoning').textContent =
      `Choosing ${opt.name} costs only ${currency}${opt.cost}, saving you ${currency}${savings} compared to highway rideshare booking.`;
  }

  if (opt.id === 'transit') {
    document.getElementById('safety-reasoning').textContent =
      `Dedicated tracks and pedestrian skywalk links yield a grade-separated journey with the highest safety score.`;
  } else if (opt.id === 'ebike') {
    document.getElementById('safety-reasoning').textContent =
      `Local bicycle lanes offer separated road markings, reducing standard vehicular merging risks.`;
  } else {
    document.getElementById('safety-reasoning').textContent =
      `Highway driving shares the flow with heavy commercial vehicles, matching average safety metrics.`;
  }

  if (opt.id === 'rideshare') {
    document.getElementById('env-reasoning').textContent =
      `Single-occupancy combustion vehicles result in standard road emissions, yielding no carbon offsets.`;
  } else {
    document.getElementById('env-reasoning').textContent =
      `Electric-powered ${opt.name} reduces tailpipe output, securing a ${opt.carbonOffset}% lower carbon footprint.`;
  }
}

// Extracted helper: Populate recommended decision card
function populateRecommendedDecisionCard(opt, travelOptions, isIndia, currency) {
  const rideShareCost = travelOptions.rideshare.cost;
  const savings = Math.max(0, rideShareCost - opt.cost);

  document.getElementById('rec-mode').textContent = `Take ${opt.name}.`;
  document.getElementById('metric-time').textContent = `${opt.duration} mins.`;

  if (opt.id === 'rideshare') {
    document.getElementById('metric-cost').textContent = `${currency}${opt.cost} fare.`;
    document.getElementById('metric-carbon').textContent = "Standard emissions.";
    document.getElementById('metric-safety').textContent = "Standard safety score.";
  } else {
    document.getElementById('metric-cost').textContent = `${currency}${savings} cheaper.`;
    document.getElementById('metric-carbon').textContent = `${opt.carbonOffset}% lower emissions.`;
    document.getElementById('metric-safety').textContent = opt.id === 'transit' ? "Highest safety score." : "High safety score.";
  }
}

// Initialize dynamic local departure time dropdown options
function initDepartureTime() {
  const timeSelect = document.getElementById('input-time');
  if (!timeSelect) return;

  const now = new Date();
  const formatTime = (date) => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes}`;
  };

  const timeNow = formatTime(now);
  const time30 = formatTime(new Date(now.getTime() + 30 * 60 * 1000));
  const time60 = formatTime(new Date(now.getTime() + 60 * 60 * 1000));

  timeSelect.innerHTML = `
    <option value="now">Leave Now (${timeNow})</option>
    <option value="later-1">Later today (+30 mins: ${time30})</option>
    <option value="later-2">Later today (+1 hour: ${time60})</option>
    <option value="morning">Morning peak (09:00)</option>
  `;
}

// Setup Event Listeners
function setupEvents() {
  initDepartureTime();

  setupAutocomplete('input-origin', 'origin-suggestions', true);
  setupAutocomplete('input-destination', 'dest-suggestions', false);

  // Theme switch logic
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const darkIcon = themeToggle.querySelector('.theme-icon-dark');
    const lightIcon = themeToggle.querySelector('.theme-icon-light');

    themeToggle.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme') || 'light';
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      
      document.body.setAttribute('data-theme', nextTheme);
      sessionStorage.setItem('nomad-theme', nextTheme);
      updateMapTheme(nextTheme);

      if (nextTheme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
      } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
      }
    });
  }

  const plannerForm = document.getElementById('planner-form');
  if (plannerForm) {
    plannerForm.addEventListener('submit', handleFormSubmit);
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEvents();
  });
} else {
  initMap();
  setupEvents();
}
