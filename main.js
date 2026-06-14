// NOMAD Mobility Operating System - Main Mobile-First Workspace Controller

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

  // Pre-load default markers
  updateInputMarkers();
}

// 1b. Initialize Eco Points from sessionStorage
function initPoints() {
  let points = sessionStorage.getItem('nomad-eco-points');
  if (points === null) {
    points = '142';
    sessionStorage.setItem('nomad-eco-points', '142');
  }
  const appPointsVal = document.getElementById('app-points-val');
  if (appPointsVal) appPointsVal.textContent = points;
  const marketplacePointsVal = document.getElementById('app-marketplace-points');
  if (marketplacePointsVal) marketplacePointsVal.textContent = points;

  updateAppRedeemButtons(parseInt(points, 10));
}

function updateAppRedeemButtons(balance) {
  const buttons = document.querySelectorAll('.app-redeem-btn');
  buttons.forEach(btn => {
    const cost = parseInt(btn.getAttribute('data-cost'), 10);
    if (cost > balance) {
      btn.disabled = true;
      btn.textContent = 'Insufficient';
    } else {
      btn.disabled = false;
      btn.textContent = 'Redeem';
    }
  });
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
  if (!map) return;
  
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
  map.fitBounds(group.getBounds(), { padding: [60, 60] });
}

// 8. Vehicle Marker Interpolation along active route path
function animateMarkerAlongRoute(coords, color) {
  if (!map) return;
  if (activeMarker) map.removeLayer(activeMarker);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  let segmentIndex = 0;
  let progress = 0;
  const speed = 0.006;

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

// 9. AI Decision Routing Engine
async function handleFormSubmit(e) {
  if (e) e.preventDefault();

  const loader = document.getElementById('analysis-loader');
  const results = document.getElementById('analysis-results');
  const submitBtn = document.getElementById('btn-analyze');
  const departureTime = document.getElementById('input-time').value;
  const sheet = document.getElementById('route-bottom-sheet');

  // Set loading state
  results.style.display = 'none';
  loader.style.display = 'flex';
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader" class="spinner-ring" style="animation: spin-loop 0.8s linear infinite;"></i> Analyzing...';
  lucide.createIcons();

  // Move bottom sheet to half expanded to show loader neatly
  if (sheet) {
    sheet.className = 'bottom-sheet half-expanded';
  }

  clearMapLayers();
  updateInputMarkers();

  // 1. Fetch main base road path via OSRM
  let routeData = await fetchRouteGeometry(originCoords, destCoords);

  // Fallback simulator if projectosrm fails
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

    routeData = {
      path: path,
      durationMins: durationMins,
      distanceKm: distanceKm
    };
  }

  const baseCoords = routeData.path;
  const distance = routeData.distanceKm;
  const baseDuration = routeData.durationMins;

  // Traffic offsets based on selected time
  let trafficFactor = 1.2;
  if (departureTime === 'morning') trafficFactor = 2.1;
  if (departureTime === 'later-1') trafficFactor = 1.5;
  if (departureTime === 'later-2') trafficFactor = 1.3;

  const isIndia = originCoords.lat >= 8 && originCoords.lat <= 37 && originCoords.lng >= 68 && originCoords.lng <= 97;
  const currency = isIndia ? "₹" : "$";

  // Mode Options
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

  // Render polyline paths
  optionsList.forEach(opt => {
    const isPreferred = opt.id === preferredOption.id;
    const polyline = L.polyline(opt.coords, {
      color: isPreferred ? opt.color : '#86868b',
      weight: isPreferred ? 6 : 3,
      opacity: isPreferred ? 0.9 : 0.4,
      dashArray: isPreferred ? '10, 10' : '5, 8',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    routeLayers.push(polyline);
    polyline.on('click', () => highlightSelectedRoute(opt));
  });

  const group = L.featureGroup([...mapMarkers, ...routeLayers]);
  map.fitBounds(group.getBounds(), { padding: [40, 40] });

  // GLOW Marker movement
  animateMarkerAlongRoute(preferredOption.coords, preferredOption.color);

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

    populatePerspectiveTexts(selectedOpt);

    const timeCard = document.querySelector('.perspective-card.time-border');
    const costCard = document.querySelector('.perspective-card.cost-border');
    const safetyCard = document.querySelector('.perspective-card.safety-border');
    const envCard = document.querySelector('.perspective-card.env-border');
    const cards = [timeCard, costCard, safetyCard, envCard];
    
    cards.forEach(c => { if (c) c.classList.remove('active'); });

    if (selectedOpt.id === fastestOpt.id && timeCard) timeCard.classList.add('active');
    if (selectedOpt.id === cheapestOpt.id && costCard) costCard.classList.add('active');
    if (selectedOpt.id === safestOpt.id && safetyCard) safetyCard.classList.add('active');
    if (selectedOpt.id === greenestOpt.id && envCard) envCard.classList.add('active');
  }

  function populatePerspectiveTexts(opt) {
    const startName = originCoords.name.split(',')[0];
    const endName = destCoords.name.split(',')[0];

    if (opt.id === 'transit') {
      document.getElementById('time-reasoning').textContent = `Metro arrives at ${endName} in ${opt.duration}m, bypassing gridlock.`;
    } else if (opt.id === 'ebike') {
      document.getElementById('time-reasoning').textContent = `Eco E-bike uses cycleways, reaching BKC in ${opt.duration}m.`;
    } else {
      document.getElementById('time-reasoning').textContent = `Rideshare reaches in ${opt.duration}m depending on roadway signals.`;
    }

    const rideShareCost = travelOptions.rideshare.cost;
    const savings = Math.max(0, rideShareCost - opt.cost);

    if (opt.id === 'rideshare') {
      document.getElementById('cost-reasoning').textContent = `Rideshare totals ${currency}${opt.cost} including tolls.`;
    } else {
      document.getElementById('cost-reasoning').textContent = `Saves you ${currency}${savings} compared to Private Rideshare.`;
    }

    if (opt.id === 'transit') {
      document.getElementById('safety-reasoning').textContent = `Grade-separated tracks offer maximum safety scoring.`;
    } else if (opt.id === 'ebike') {
      document.getElementById('safety-reasoning').textContent = `Separate active lanes keep commuters safe from traffic.`;
    } else {
      document.getElementById('safety-reasoning').textContent = `Standard freeway driving. Average roadway risk.`;
    }

    if (opt.id === 'rideshare') {
      document.getElementById('env-reasoning').textContent = `No carbon offsets. Combustion vehicle outputs.`;
    } else {
      document.getElementById('env-reasoning').textContent = `Reduces greenhouse outputs by ${opt.carbonOffset}%.`;
    }
  }

  function populateRecommendedDecisionCard(opt) {
    const rideShareCost = travelOptions.rideshare.cost;
    const savings = Math.max(0, rideShareCost - opt.cost);
    
    document.getElementById('rec-mode').textContent = `Take ${opt.name}.`;
    document.getElementById('metric-time').textContent = `${opt.duration} mins.`;
    
    if (opt.id === 'rideshare') {
      document.getElementById('metric-cost').textContent = `${currency}${opt.cost} fare.`;
      document.getElementById('metric-carbon').textContent = "Standard emissions.";
      document.getElementById('metric-safety').textContent = "Standard safety.";
    } else {
      document.getElementById('metric-cost').textContent = `${currency}${savings} cheaper.`;
      document.getElementById('metric-carbon').textContent = `${opt.carbonOffset}% greener.`;
      document.getElementById('metric-safety').textContent = opt.id === 'transit' ? "Highest safety." : "High safety.";
    }
  }

  // Bind perspective clicks
  const timeCard = document.querySelector('.perspective-card.time-border');
  const costCard = document.querySelector('.perspective-card.cost-border');
  const safetyCard = document.querySelector('.perspective-card.safety-border');
  const envCard = document.querySelector('.perspective-card.env-border');

  if (timeCard) timeCard.onclick = () => highlightSelectedRoute(fastestOpt);
  if (costCard) costCard.onclick = () => highlightSelectedRoute(cheapestOpt);
  if (safetyCard) safetyCard.onclick = () => highlightSelectedRoute(safestOpt);
  if (envCard) envCard.onclick = () => highlightSelectedRoute(greenestOpt);

  populatePerspectiveTexts(preferredOption);
  populateRecommendedDecisionCard(preferredOption);

  if (preferredOption.id === fastestOpt.id && timeCard) timeCard.classList.add('active');
  if (preferredOption.id === cheapestOpt.id && costCard) costCard.classList.add('active');
  if (preferredOption.id === safestOpt.id && safetyCard) safetyCard.classList.add('active');
  if (preferredOption.id === greenestOpt.id && envCard) envCard.classList.add('active');

  setTimeout(() => {
    loader.style.display = 'none';
    results.style.display = 'flex';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="sparkles"></i> Analyze Route';
    lucide.createIcons();
    
    // Auto shift to fully expanded to view results clearly
    if (sheet) {
      sheet.className = 'bottom-sheet fully-expanded';
    }
  }, 1000);
}

// Simulated status clock updates
function initClock() {
  const clockEl = document.getElementById('status-clock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    clockEl.textContent = `${hours}:${minutes}`;
  }
  setInterval(update, 30000);
  update();
}

// Expandable / Draggable Bottom Sheet setup
function setupBottomSheet() {
  const sheet = document.getElementById('route-bottom-sheet');
  const dragHeader = document.getElementById('sheet-drag-trigger');
  const searchTrigger = document.getElementById('collapsed-search-trigger');
  const formWrapper = document.getElementById('planner-form-wrapper');
  const results = document.getElementById('analysis-results');

  if (!sheet || !dragHeader) return;

  // Expand form when clicking searchbar trigger
  if (searchTrigger) {
    searchTrigger.addEventListener('click', () => {
      searchTrigger.style.display = 'none';
      formWrapper.style.display = 'block';
      sheet.className = 'bottom-sheet half-expanded';
    });
  }

  // Header click toggles states: collapsed -> half -> fully -> collapsed
  dragHeader.addEventListener('click', () => {
    if (sheet.classList.contains('collapsed')) {
      if (results.style.display === 'flex') {
        sheet.className = 'bottom-sheet half-expanded';
      } else {
        searchTrigger.style.display = 'none';
        formWrapper.style.display = 'block';
        sheet.className = 'bottom-sheet half-expanded';
      }
    } else if (sheet.classList.contains('half-expanded')) {
      sheet.className = 'bottom-sheet fully-expanded';
    } else {
      // Go back to collapsed
      sheet.className = 'bottom-sheet collapsed';
      // If we haven't run search results yet, restore the search trigger bar
      if (results.style.display !== 'flex') {
        searchTrigger.style.display = 'flex';
        formWrapper.style.display = 'none';
      }
    }
  });
}

// Dynamic departure times dropdown loader
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
    <option value="later-1">Later (+30m: ${time30})</option>
    <option value="later-2">Later (+1h: ${time60})</option>
    <option value="morning">Morning peak (09:00)</option>
  `;
}

// Insights dashboard (Sustainability) animations
function triggerInsightsAnimations() {
  const barBike = document.getElementById('bar-bike');
  const barMetro = document.getElementById('bar-metro');
  const barBus = document.getElementById('bar-bus');
  const barCar = document.getElementById('bar-car');

  if (barBike) barBike.style.width = '0%';
  if (barMetro) barMetro.style.width = '0%';
  if (barBus) barBus.style.width = '0%';
  if (barCar) barCar.style.width = '0%';

  setTimeout(() => {
    if (barBike) barBike.style.width = '5%';
    if (barMetro) barMetro.style.width = '10%';
    if (barBus) barBus.style.width = '20%';
    if (barCar) barCar.style.width = '100%';
  }, 200);
}

// Profile dashboard (Your Travel Profile) animations & tooltips
function triggerProfileAnimations() {
  // 1. Carbon Savings ring
  const carbonRing = document.getElementById('carbon-ring');
  if (carbonRing) {
    carbonRing.style.strokeDashoffset = '251.2';
    setTimeout(() => {
      carbonRing.style.strokeDashoffset = '50.24';
    }, 200);
  }

  // 2. Donut segments
  const metroSeg = document.getElementById('donut-segment-metro');
  const bikeSeg = document.getElementById('donut-segment-bike');
  const rideSeg = document.getElementById('donut-segment-ride');
  
  if (metroSeg) metroSeg.setAttribute('stroke-dasharray', '0 251.2');
  if (bikeSeg) bikeSeg.setAttribute('stroke-dasharray', '0 251.2');
  if (rideSeg) rideSeg.setAttribute('stroke-dasharray', '0 251.2');

  setTimeout(() => {
    if (metroSeg) metroSeg.setAttribute('stroke-dasharray', '138.16 251.2');
    if (bikeSeg) bikeSeg.setAttribute('stroke-dasharray', '75.36 251.2');
    if (rideSeg) rideSeg.setAttribute('stroke-dasharray', '37.68 251.2');
  }, 400);

  // 3. Line graph paths morphing
  const linePath = document.getElementById('chart-line');
  const areaPath = document.getElementById('chart-area');

  const baselineLineD = 'M 50 150 L 50 150 L 196 150 L 342 150 L 488 150 L 634 150 L 780 150';
  const baselineAreaD = 'M 50 150 L 50 150 L 196 150 L 342 150 L 488 150 L 634 150 L 780 150 L 780 150 Z';
  
  const actualLineD = 'M 50 92 L 50 92 L 196 84 L 342 74 L 488 78 L 634 67 L 780 51';
  const actualAreaD = 'M 50 150 L 50 92 L 196 84 L 342 74 L 488 78 L 634 67 L 780 51 L 780 150 Z';

  if (linePath) linePath.setAttribute('d', baselineLineD);
  if (areaPath) areaPath.setAttribute('d', baselineAreaD);

  const pointsData = [
    { id: 'pt-0', cy: 92 },
    { id: 'pt-1', cy: 84 },
    { id: 'pt-2', cy: 74 },
    { id: 'pt-3', cy: 78 },
    { id: 'pt-4', cy: 67 },
    { id: 'pt-5', cy: 51 }
  ];

  pointsData.forEach(pt => {
    const node = document.getElementById(pt.id);
    if (node) node.setAttribute('cy', '150');
  });

  setTimeout(() => {
    if (linePath) linePath.setAttribute('d', actualLineD);
    if (areaPath) areaPath.setAttribute('d', actualAreaD);

    pointsData.forEach(pt => {
      const node = document.getElementById(pt.id);
      if (node) {
        node.setAttribute('cy', pt.cy);
        node.style.transition = 'cy 1.5s cubic-bezier(0.16, 1, 0.3, 1)';
      }
    });
  }, 600);
}

// Setup SPA navigation click handlers
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.app-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-target');

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      panels.forEach(p => p.classList.remove('active'));
      const activePanel = document.getElementById(targetId);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      // If switching back to Home, refresh Leaflet viewport size
      if (targetId === 'panel-home' && map) {
        setTimeout(() => {
          map.invalidateSize();
        }, 150);
      }

      if (targetId === 'panel-insights') {
        triggerInsightsAnimations();
      } else if (targetId === 'panel-profile') {
        triggerProfileAnimations();
      }
    });
  });
}

// Setup Marketplace panel navigation & purchase handlers
function setupMarketplace() {
  const redeemBtn = document.getElementById('btn-redeem-app');
  const statCardPoints = document.getElementById('stat-card-points');
  const backBtn = document.getElementById('marketplace-back-btn');
  const marketplacePanel = document.getElementById('panel-marketplace');
  const profilePanel = document.getElementById('panel-profile');
  const tabs = document.querySelectorAll('.nav-tab');
  const orderModal = document.getElementById('app-order-modal');
  const closeOrderBtn = document.getElementById('app-close-order');

  function showMarketplace() {
    // Hide all panels and bottom nav active state
    document.querySelectorAll('.app-tab-panel').forEach(p => p.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    if (marketplacePanel) marketplacePanel.classList.add('active');

    // Sync balance display
    const pts = sessionStorage.getItem('nomad-eco-points') || '142';
    const bal = document.getElementById('app-marketplace-points');
    if (bal) bal.textContent = pts;
    updateAppRedeemButtons(parseInt(pts, 10));
  }

  function backToProfile() {
    document.querySelectorAll('.app-tab-panel').forEach(p => p.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    if (profilePanel) profilePanel.classList.add('active');
    const profileTab = document.querySelector('.nav-tab[data-target="panel-profile"]');
    if (profileTab) profileTab.classList.add('active');

    // Sync points
    const pts = sessionStorage.getItem('nomad-eco-points') || '142';
    const appPtsVal = document.getElementById('app-points-val');
    if (appPtsVal) appPtsVal.textContent = pts;
  }

  if (redeemBtn) redeemBtn.addEventListener('click', showMarketplace);
  if (statCardPoints) statCardPoints.addEventListener('click', showMarketplace);
  if (backBtn) backBtn.addEventListener('click', backToProfile);

  // Purchase handlers
  const purchaseBtns = document.querySelectorAll('.app-redeem-btn');
  purchaseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cost = parseInt(btn.getAttribute('data-cost'), 10);
      const reward = btn.getAttribute('data-reward');
      const artisan = btn.getAttribute('data-artisan');
      let balance = parseInt(sessionStorage.getItem('nomad-eco-points') || '142', 10);

      if (balance < cost) return;

      balance -= cost;
      sessionStorage.setItem('nomad-eco-points', balance.toString());

      // Update all displays
      const appPtsVal = document.getElementById('app-points-val');
      if (appPtsVal) appPtsVal.textContent = balance;
      const marketPts = document.getElementById('app-marketplace-points');
      if (marketPts) marketPts.textContent = balance;
      updateAppRedeemButtons(balance);

      // Generate order code
      const ref = Math.random().toString(16).substring(2, 6).toUpperCase();
      const code = `MH-ECOB-${cost}-${ref}`;
      navigator.clipboard.writeText(code).catch(() => {});

      // Populate modal
      const receiptItem = document.getElementById('app-receipt-item');
      const receiptArtisan = document.getElementById('app-receipt-artisan');
      const receiptCode = document.getElementById('app-receipt-code');
      if (receiptItem) receiptItem.textContent = reward;
      if (receiptArtisan) receiptArtisan.textContent = artisan;
      if (receiptCode) receiptCode.textContent = code;

      // Show modal
      if (orderModal) orderModal.style.display = 'flex';
    });
  });

  // Close order modal
  if (closeOrderBtn) {
    closeOrderBtn.addEventListener('click', () => {
      if (orderModal) orderModal.style.display = 'none';
    });
  }
}

// Setup saved route quick loaders inside Trips
function setupSavedTrips() {
  const cards = document.querySelectorAll('.saved-route-card');
  const originInput = document.getElementById('input-origin');
  const destInput = document.getElementById('input-destination');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const origin = card.getAttribute('data-origin');
      const dest = card.getAttribute('data-dest');

      if (originInput) originInput.value = origin;
      if (destInput) destInput.value = dest;

      // Coordinate matching presets
      if (origin.includes("Airport")) {
        originCoords = { lat: 19.0896, lng: 72.8656, name: origin };
      } else if (origin.includes("Gateway")) {
        originCoords = { lat: 19.0302, lng: 72.8338, name: origin };
      } else if (origin.includes("Marine")) {
        originCoords = { lat: 18.9415, lng: 72.8236, name: origin };
      }

      if (dest.includes("BKC")) {
        destCoords = { lat: 19.0607, lng: 72.8617, name: dest };
      } else if (dest.includes("Nariman")) {
        destCoords = { lat: 18.9256, lng: 72.8242, name: dest };
      }

      // Flip back to Home Screen tab
      const homeTab = document.querySelector('.nav-tab[data-target="panel-home"]');
      if (homeTab) {
        homeTab.click();
      }

      // Ensure form wrapper is visible inside bottom sheet
      const sheet = document.getElementById('route-bottom-sheet');
      const searchTrigger = document.getElementById('collapsed-search-trigger');
      const formWrapper = document.getElementById('planner-form-wrapper');

      if (sheet) {
        if (searchTrigger) searchTrigger.style.display = 'none';
        if (formWrapper) formWrapper.style.display = 'block';
        sheet.className = 'bottom-sheet half-expanded';
      }

      updateInputMarkers();

      // Dispatch route analyzer submit automatically
      const plannerForm = document.getElementById('planner-form');
      if (plannerForm) {
        handleFormSubmit({ preventDefault: () => {} });
      }
    });
  });
}

// Line graph tooltips hover controller
function setupLineChartTooltips() {
  const tooltip = document.getElementById('chart-tooltip');
  const points = document.querySelectorAll('.chart-point');

  points.forEach(point => {
    point.addEventListener('mouseenter', (e) => {
      const val = point.getAttribute('data-val');
      const month = point.getAttribute('data-month');
      if (tooltip) {
        tooltip.innerHTML = `<strong>${month}</strong>: ${val}`;
        tooltip.style.opacity = '1';
      }
    });

    point.addEventListener('mousemove', (e) => {
      if (!tooltip) return;
      const containerRect = point.closest('.chart-container').getBoundingClientRect();
      const x = e.clientX - containerRect.left + 15;
      const y = e.clientY - containerRect.top - 40;
      tooltip.style.transform = `translate(${x}px, ${y}px)`;
    });

    point.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.opacity = '0';
    });
  });
}

// 10. Bootstrap setup events
function setupEvents() {
  initDepartureTime();
  initClock();
  setupBottomSheet();
  setupTabNavigation();
  setupSavedTrips();
  setupLineChartTooltips();
  setupMarketplace();

  // Autocomplete field bindings
  setupAutocomplete('input-origin', 'origin-suggestions', true);
  setupAutocomplete('input-destination', 'dest-suggestions', false);

  // Theme Toggler
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

  // Planner Form submission
  const plannerForm = document.getElementById('planner-form');
  if (plannerForm) {
    plannerForm.addEventListener('submit', handleFormSubmit);
  }
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initPoints();
    setupEvents();
  });
} else {
  initMap();
  initPoints();
  setupEvents();
}
