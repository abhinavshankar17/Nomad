// NOMAD Mobility Operating System Controller

// Initialize Lucide Icons
lucide.createIcons();

// State Configuration
let map = null;
let currentTileLayer = null;
let currentRouteLine = null;
let animationMarker = null;
let activeRouteId = 'transit';
let isDemoMode = false;
let animationFrameId = null;

// Map Coordinates for Commute Routes in Bengaluru, India
const routesData = {
  transit: {
    color: 'var(--color-time)',
    coords: [
      [12.9784, 77.6408], // Start: Indiranagar Metro
      [12.9860, 77.6487], // Swami Vivekananda Road
      [12.9912, 77.6494], // Baiyappanahalli
      [12.9896, 77.6610], // Benniganahalli
      [13.0012, 77.6748], // K.R. Puram
      [12.9942, 77.6881], // Singayyanapalya
      [12.9866, 77.7121], // Garudacharpalya
      [12.9892, 77.7275], // Hoodi
      [12.9842, 77.7490]  // End: ITPL (Pattandur Agrahara)
    ]
  },
  ebike: {
    color: 'var(--color-carbon)',
    coords: [
      [12.9784, 77.6408], // Start: Indiranagar
      [12.9602, 77.6418], // Old Airport Rd / Domlur
      [12.9600, 77.6600], // Wind Tunnel Rd
      [12.9500, 77.6800], // Yamalur
      [12.9550, 77.7000], // Marathahalli outer road
      [12.9680, 77.7180], // Brookefield
      [12.9842, 77.7490]  // End: ITPL
    ]
  },
  rideshare: {
    color: 'var(--color-money)',
    coords: [
      [12.9784, 77.6408], // Start: Indiranagar
      [12.9602, 77.6418], // Old Airport Rd
      [12.9650, 77.6600], // Jeevan Bima Nagar
      [12.9550, 77.6800], // HAL Airport
      [12.9556, 77.6978], // Marathahalli Bridge
      [12.9675, 77.7130], // Kundalahalli Gate
      [12.9780, 77.7230], // Vydehi Hospital
      [12.9842, 77.7490]  // End: ITPL
    ]
  }
};

// Custom Map Tiles
const mapStyles = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
};

// 1. Initialize Map
function initMap() {
  // Check sessionStorage for saved theme first
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

  // Set initial map position centered slightly out for the atmospheric background
  map = L.map('map', {
    zoomControl: false,
    scrollWheelZoom: false, // Disabled during landing hero mode
    doubleClickZoom: false,
    boxZoom: false,
    dragPan: false, // Locked map in landing mode
    keyboard: false
  }).setView([12.9716, 77.6408], 12);

  // Set the map tile style depending on theme
  currentTileLayer = L.tileLayer(mapStyles[savedTheme], {
    attribution: mapStyles.attribution,
    maxZoom: 20
  }).addTo(map);

  // Add zoom control at bottom right (hidden initially)
  L.control.zoom({ position: 'bottomright' }).addTo(map);
}

// 2. Map Theme Updater
function updateMapTheme(theme) {
  if (!map || !currentTileLayer) return;
  map.removeLayer(currentTileLayer);
  
  currentTileLayer = L.tileLayer(mapStyles[theme], {
    attribution: mapStyles.attribution,
    maxZoom: 20
  }).addTo(map);
}

// 3. Draw Commute Route and Animate Pulsing Marker (Vehicle Sim)
function drawRoute(routeId) {
  // Clear any existing route
  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
  }
  if (animationMarker) {
    map.removeLayer(animationMarker);
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const route = routesData[routeId];
  if (!route) return;

  // Render the polyline path
  currentRouteLine = L.polyline(route.coords, {
    color: route.color,
    weight: 5,
    opacity: 0.9,
    dashArray: '10, 10',
    lineCap: 'round',
    lineJoin: 'round',
    className: 'route-path-line' // Bind CSS animation
  }).addTo(map);

  // Auto-fit path boundaries on screen
  map.fitBounds(currentRouteLine.getBounds(), {
    padding: [80, 80]
  });

  // Create Glowing marker representing vehicle/commuter
  const customIcon = L.divIcon({
    className: 'custom-vehicle-marker',
    html: '<div class="glowing-marker"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  animationMarker = L.marker(route.coords[0], { icon: customIcon }).addTo(map);

  // Animate marker along the coordinates array
  animateMarkerAlongRoute(route.coords);
}

// Marker Interpolation Animation
function animateMarkerAlongRoute(coords) {
  let segmentIndex = 0;
  let progress = 0; // progress along the current segment (0 to 1)
  const speed = 0.008; // Adjust to speed up/slow down travel

  function step() {
    if (!isDemoMode || !animationMarker) return;

    const startPt = coords[segmentIndex];
    const endPt = coords[segmentIndex + 1];

    if (!endPt) {
      // Route complete, restart animation from beginning after brief pause
      setTimeout(() => {
        if (isDemoMode && animationMarker) {
          segmentIndex = 0;
          progress = 0;
          animationMarker.setLatLng(coords[0]);
          animationFrameId = requestAnimationFrame(step);
        }
      }, 2000);
      return;
    }

    // Linear interpolation of coordinates
    const lat = startPt[0] + (endPt[0] - startPt[0]) * progress;
    const lng = startPt[1] + (endPt[1] - startPt[1]) * progress;
    
    animationMarker.setLatLng([lat, lng]);
    progress += speed;

    if (progress >= 1) {
      progress = 0;
      segmentIndex++;
    }

    animationFrameId = requestAnimationFrame(step);
  }

  animationFrameId = requestAnimationFrame(step);
}

// 4. Transition to Interactive Demo mode
function enterDemoMode() {
  if (isDemoMode) return;
  isDemoMode = true;
  document.body.classList.add('demo-mode');

  // Change Navbar Launch Demo button text
  const navBtn = document.getElementById('nav-demo-btn');
  if (navBtn) navBtn.textContent = 'Demo Active';

  // Unlock map interactions for the demo experience
  map.dragging.enable();
  map.scrollWheelZoom.enable();
  map.doubleClickZoom.enable();

  // Highlight first route by default
  setTimeout(() => {
    drawRoute(activeRouteId);
  }, 600);
}

// Exit Demo mode
function exitDemoMode() {
  if (!isDemoMode) return;
  isDemoMode = false;
  document.body.classList.remove('demo-mode');

  // Change Navbar button back
  const navBtn = document.getElementById('nav-demo-btn');
  if (navBtn) navBtn.textContent = 'Launch App';

  // Lock map interactions again
  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.doubleClickZoom.disable();

  // Clear map layers
  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }
  if (animationMarker) {
    map.removeLayer(animationMarker);
    animationMarker = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  // Zoom back out to generic Bengaluru context view
  map.setView([12.9716, 77.6408], 12);
}

// 5. Setup Action Event Listeners
function setupEvents() {
  // Theme Toggle Button
  const themeToggle = document.getElementById('theme-toggle');
  const darkIcon = themeToggle.querySelector('.theme-icon-dark');
  const lightIcon = themeToggle.querySelector('.theme-icon-light');

  themeToggle.addEventListener('click', () => {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', nextTheme);
    sessionStorage.setItem('nomad-theme', nextTheme);
    updateMapTheme(nextTheme);

    // Swap visible icon
    if (nextTheme === 'dark') {
      darkIcon.style.display = 'none';
      lightIcon.style.display = 'block';
    } else {
      darkIcon.style.display = 'block';
      lightIcon.style.display = 'none';
    }
  });

  // CTA triggers
  document.getElementById('see-demo-btn').addEventListener('click', (e) => {
    e.preventDefault();
    enterDemoMode();
  });
  
  document.getElementById('exit-demo-btn').addEventListener('click', exitDemoMode);

  // Route Selection Cards
  const cards = document.querySelectorAll('.route-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      // Deactivate siblings
      cards.forEach(c => c.classList.remove('active'));
      // Activate clicked
      card.classList.add('active');
      
      activeRouteId = card.getAttribute('data-route-id');
      drawRoute(activeRouteId);
    });
  });

  // Below-the-fold scroll entry animation with Intersection Observer
  const featureCards = document.querySelectorAll('.feature-card');
  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target); // Trigger only once
      }
    });
  }, observerOptions);

  featureCards.forEach(card => observer.observe(card));

  // Smooth scroll logic for standard hash links
  document.getElementById('scroll-indicator').addEventListener('click', function(e) {
    e.preventDefault();
    const targetElement = document.getElementById('features');
    targetElement.scrollIntoView({ behavior: 'smooth' });
  });
}

// 6. Bootstrap Initial Setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEvents();
  });
} else {
  initMap();
  setupEvents();
}
