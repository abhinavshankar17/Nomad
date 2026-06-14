// NOMAD mobility Profile Workspace Controller
// Spotify Wrapped meets Apple Health aesthetic animations

// Initialize Lucide Icons
lucide.createIcons();

// 1. Initialize Theme from sessionStorage
function initTheme() {
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
}

// 1b. Initialize Points from sessionStorage
function initPoints() {
  let points = sessionStorage.getItem('nomad-eco-points');
  if (points === null) {
    points = '142';
    sessionStorage.setItem('nomad-eco-points', '142');
  }
  const pointsVal = document.getElementById('profile-points-val');
  if (pointsVal) {
    pointsVal.textContent = points;
  }
}

// 2. Setup Events
function setupEvents() {
  // Theme Switcher
  const themeToggle = document.getElementById('theme-toggle');
  const darkIcon = themeToggle.querySelector('.theme-icon-dark');
  const lightIcon = themeToggle.querySelector('.theme-icon-light');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.body.getAttribute('data-theme') || 'light';
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      
      document.body.setAttribute('data-theme', nextTheme);
      sessionStorage.setItem('nomad-theme', nextTheme);

      // Swap icons
      if (nextTheme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
      } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
      }
    });
  }

  // 3. Interactive Line Chart Tooltips
  const tooltip = document.getElementById('chart-tooltip');
  const points = document.querySelectorAll('.chart-point');

  points.forEach(point => {
    point.addEventListener('mouseenter', (e) => {
      const val = point.getAttribute('data-val');
      const month = point.getAttribute('data-month');
      
      tooltip.innerHTML = `<strong>${month}</strong>: ${val}`;
      tooltip.style.opacity = '1';
    });

    point.addEventListener('mousemove', (e) => {
      // Position tooltip relative to container bounds
      const containerRect = point.closest('.chart-container').getBoundingClientRect();
      const x = e.clientX - containerRect.left + 15;
      const y = e.clientY - containerRect.top - 40;
      
      tooltip.style.transform = `translate(${x}px, ${y}px)`;
    });

    point.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
    });
  });

  // Redeem Points redirect to marketplace
  const redeemBtn = document.getElementById('btn-redeem-profile');
  if (redeemBtn) {
    redeemBtn.addEventListener('click', () => {
      window.location.href = './marketplace.html';
    });
  }
}

// 4. Trigger Spotify Wrapped style SVG load animations
function triggerWrappedAnimations() {
  // A. Apple Health style carbon savings circle ring (80% target completed)
  // Circumference = 2 * PI * r = 2 * PI * 40 = 251.2
  // 80% completion: offset = 251.2 - (0.8 * 251.2) = 50.24
  const carbonRing = document.getElementById('carbon-ring');
  if (carbonRing) {
    setTimeout(() => {
      carbonRing.style.strokeDashoffset = '50.24';
    }, 200);
  }

  // B. Mode Distribution Donut segments (Metro 55%, E-bike 30%, Rideshare 15%)
  // Total Circumference = 251.2
  // Metro share (55%) = 138.16
  // Bike share (30%) = 75.36
  // Rideshare share (15%) = 37.68
  const metroSeg = document.getElementById('donut-segment-metro');
  const bikeSeg = document.getElementById('donut-segment-bike');
  const rideSeg = document.getElementById('donut-segment-ride');

  setTimeout(() => {
    if (metroSeg) metroSeg.setAttribute('stroke-dasharray', '138.16 251.2');
    if (bikeSeg) bikeSeg.setAttribute('stroke-dasharray', '75.36 251.2');
    if (rideSeg) rideSeg.setAttribute('stroke-dasharray', '37.68 251.2');
  }, 400);

  // C. Commute Trend Line Graph Coordinate transitions (from y=150 baseline to actual data points)
  const linePath = document.getElementById('chart-line');
  const areaPath = document.getElementById('chart-area');

  // Actual paths mapping
  const actualLineD = 'M 50 92 L 50 92 L 196 84 L 342 74 L 488 78 L 634 67 L 780 51';
  const actualAreaD = 'M 50 150 L 50 92 L 196 84 L 342 74 L 488 78 L 634 67 L 780 51 L 780 150 Z';

  // Target points data coordinates (y-axis values mapping)
  const pointsData = [
    { id: 'pt-0', cy: 92 },
    { id: 'pt-1', cy: 84 },
    { id: 'pt-2', cy: 74 },
    { id: 'pt-3', cy: 78 },
    { id: 'pt-4', cy: 67 },
    { id: 'pt-5', cy: 51 }
  ];

  setTimeout(() => {
    // Morph SVG paths
    if (linePath) linePath.setAttribute('d', actualLineD);
    if (areaPath) areaPath.setAttribute('d', actualAreaD);

    // Transition points circles cy coordinates
    pointsData.forEach(pt => {
      const node = document.getElementById(pt.id);
      if (node) {
        node.setAttribute('cy', pt.cy);
        node.style.transition = 'cy 1.5s cubic-bezier(0.16, 1, 0.3, 1)';
      }
    });
  }, 600);

  // D. Sustainability Dashboard Comparative Bars transition
  const barBike = document.getElementById('bar-bike');
  const barMetro = document.getElementById('bar-metro');
  const barBus = document.getElementById('bar-bus');
  const barCar = document.getElementById('bar-car');

  setTimeout(() => {
    if (barBike) barBike.style.width = '5%';
    if (barMetro) barMetro.style.width = '10%';
    if (barBus) barBus.style.width = '20%';
    if (barCar) barCar.style.width = '100%';
  }, 800);
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initPoints();
    setupEvents();
    triggerWrappedAnimations();
  });
} else {
  initTheme();
  initPoints();
  setupEvents();
  triggerWrappedAnimations();
}
