// Maha Eco-Bazaar — Government Portal Controller
// Manages citizen Eco Points, product redemptions, category filtering, and order receipts

// Initialize Lucide Icons
lucide.createIcons();

// Points State
let currentPoints = 142;

function loadPoints() {
  const stored = sessionStorage.getItem('nomad-eco-points');
  if (stored !== null) {
    currentPoints = parseInt(stored, 10);
  } else {
    currentPoints = 142;
    sessionStorage.setItem('nomad-eco-points', '142');
  }
  updatePointsUI();
}

function updatePointsUI() {
  // Update sidebar balance display
  const pointsVal = document.getElementById('points-val');
  if (pointsVal) {
    pointsVal.textContent = currentPoints;
  }

  // Update all redeem buttons based on current balance
  const buttons = document.querySelectorAll('.redeem-btn');
  buttons.forEach(btn => {
    const cost = parseInt(btn.getAttribute('data-cost'), 10);
    if (cost > currentPoints) {
      btn.disabled = true;
      btn.textContent = 'Insufficient';
    } else {
      btn.disabled = false;
      btn.textContent = 'Redeem';
    }
  });
}

// Category Filtering
function setupCategoryFilters() {
  const categoryBtns = document.querySelectorAll('.category-list button[data-cat]');
  const productRows = document.querySelectorAll('.product-row');
  const itemCountLabel = document.getElementById('item-count-label');

  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      categoryBtns.forEach(b => b.classList.remove('cat-active'));
      btn.classList.add('cat-active');

      const cat = btn.getAttribute('data-cat');
      let visibleCount = 0;

      productRows.forEach(row => {
        if (cat === 'all' || row.getAttribute('data-category') === cat) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      if (itemCountLabel) {
        itemCountLabel.textContent = `Showing ${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;
      }
    });
  });
}

// Purchase / Redemption Handler
function setupRedemptions() {
  const buttons = document.querySelectorAll('.redeem-btn');
  const receiptModal = document.getElementById('receipt-modal');
  const closeBtn = document.getElementById('close-receipt-modal');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cost = parseInt(btn.getAttribute('data-cost'), 10);
      const reward = btn.getAttribute('data-reward');
      const artisan = btn.getAttribute('data-artisan');

      if (currentPoints < cost) return;

      // Deduct points
      currentPoints -= cost;
      sessionStorage.setItem('nomad-eco-points', currentPoints.toString());
      updatePointsUI();

      // Generate government order reference
      const ref = Math.random().toString(16).substring(2, 6).toUpperCase();
      const orderCode = `MH-ECOB-${cost}-${ref}`;

      // Copy to clipboard
      navigator.clipboard.writeText(orderCode).catch(() => {
        // Fallback: silently fail on non-HTTPS contexts
      });

      // Populate receipt modal
      document.getElementById('receipt-item-name').textContent = reward;
      document.getElementById('receipt-artisan-name').textContent = artisan;
      document.getElementById('receipt-credit-val').textContent = `₹${cost * 10} (${cost} Eco Points)`;
      document.getElementById('receipt-code-val').textContent = orderCode;

      // Show modal
      if (receiptModal) {
        receiptModal.style.display = 'flex';
      }
    });
  });

  // Close modal
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (receiptModal) {
        receiptModal.style.display = 'none';
      }
    });
  }

  // Click outside modal to close
  if (receiptModal) {
    receiptModal.addEventListener('click', (e) => {
      if (e.target === receiptModal) {
        receiptModal.style.display = 'none';
      }
    });
  }
}

// Accessibility: Font size controls
function setupAccessibility() {
  const buttons = document.querySelectorAll('.font-size-controls button');
  let currentSize = 14;

  buttons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (index === 0) currentSize = Math.max(11, currentSize - 1);
      else if (index === 1) currentSize = 14;
      else currentSize = Math.min(18, currentSize + 1);
      document.body.style.fontSize = currentSize + 'px';
    });
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  loadPoints();
  setupCategoryFilters();
  setupRedemptions();
  setupAccessibility();
});
