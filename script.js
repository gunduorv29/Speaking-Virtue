// Initialize AOS Animation Library
AOS.init({
  once: true,
  offset: 100,
  duration: 800,
  easing: 'ease-out-cubic',
});

// --- NAVIGATION LOGIC ---
function navigateTo(pageId) {
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Fade out current
  const pages = document.querySelectorAll('.page-view');

  // Simple transition logic
  pages.forEach(page => {
    page.style.opacity = '0';
    setTimeout(() => {
      page.classList.remove('active');
      page.style.display = 'none';
    }, 400);
  });

  // Fade in new
  setTimeout(() => {
    const target = document.getElementById(pageId);
    if (target) {
      target.style.display = 'block';
      // Trigger reflow
      void target.offsetWidth;
      target.classList.add('active');
      target.style.opacity = '1';

      // Refresh animations for the new page
      setTimeout(() => AOS.refresh(), 100);
    }
  }, 400);
}

// --- CART LOGIC ---
let cart = [];

// Load cart from localStorage on page load
function loadCart() {
  try {
    const savedCart = localStorage.getItem('speakingVirtueCart');
    if (savedCart) {
      cart = JSON.parse(savedCart);
      updateCartUI();
    }
  } catch (error) {
    console.error('Error loading cart from localStorage:', error);
  }
}

// Save cart to localStorage
function saveCart() {
  try {
    localStorage.setItem('speakingVirtueCart', JSON.stringify(cart));
  } catch (error) {
    console.error('Error saving cart to localStorage:', error);
  }
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3000);
}

function addToCart(id, title, price, img) {
  try {
    const existing = cart.find(item => item.id === id);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ id, title, price, img, qty: 1 });
    }
    saveCart();
    updateCartUI();
    showToast();
  } catch (error) {
    console.error('Error adding item to cart:', error);
    alert('Sorry, there was an error adding the item to your cart. Please try again.');
  }
}

function updateQty(id, change) {
  try {
    const item = cart.find(i => i.id === id);
    if (item) {
      item.qty += change;
      if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
      }
      saveCart();
      updateCartUI();
    }
  } catch (error) {
    console.error('Error updating item quantity:', error);
    alert('Sorry, there was an error updating your cart. Please try again.');
  }
}

function removeItem(id) {
  try {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    updateCartUI();
  } catch (error) {
    console.error('Error removing item from cart:', error);
    alert('Sorry, there was an error removing the item. Please try again.');
  }
}

function updateCartUI() {
  try {
    // Badge
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('cart-badge');
    if (badge) {
      badge.innerText = count;
      badge.style.opacity = count > 0 ? '1' : '0';
    }

    // HTML Elements
    const container = document.getElementById('cart-container');
    const emptyMsg = document.getElementById('empty-cart-msg');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    const modalTotalEl = document.getElementById('modal-total');

    // Safety check
    if (!container || !emptyMsg) return;

    if (cart.length === 0) {
      emptyMsg.style.display = 'block';
      container.style.display = 'none';
      container.innerHTML = '';
      if (subtotalEl) subtotalEl.innerText = '$0.00';
      if (totalEl) totalEl.innerText = '$0.00';
      return;
    }

    // Cart has items
    emptyMsg.style.display = 'none';
    container.style.display = 'block';
    container.innerHTML = '';

    let total = 0;

    cart.forEach(item => {
      total += item.price * item.qty;
      const div = document.createElement('div');
      div.className = 'flex flex-col sm:flex-row gap-6 py-6 border-b border-gray-100 items-center animate-[fadeIn_0.5s_ease-out]';
      div.innerHTML = `
        <div class="w-24 h-32 bg-gray-100 flex-shrink-0 rounded overflow-hidden">
          ${item.img ? `<img src="${item.img}" class="w-full h-full object-cover" alt="${item.title}">` : '<div class="w-full h-full flex items-center justify-center"><i class="fas fa-image text-gray-300"></i></div>'}
        </div>
        <div class="flex-1 w-full text-center sm:text-left">
          <h4 class="font-serif text-lg mb-1">${item.title}</h4>
          <p class="text-sm text-virtue-grey mb-4">$${item.price.toFixed(2)}</p>
          <div class="flex items-center justify-center sm:justify-start gap-4">
            <div class="flex items-center border border-gray-200 rounded">
              <button onclick="updateQty(${item.id}, -1)" class="w-8 h-8 hover:bg-gray-100 transition-colors" aria-label="Decrease quantity">-</button>
              <span class="w-8 text-center text-sm font-bold">${item.qty}</span>
              <button onclick="updateQty(${item.id}, 1)" class="w-8 h-8 hover:bg-gray-100 transition-colors" aria-label="Increase quantity">+</button>
            </div>
            <button onclick="removeItem(${item.id})" class="text-xs uppercase underline text-virtue-grey hover:text-red-500 transition-colors" aria-label="Remove item">Remove</button>
          </div>
        </div>
        <div class="text-right">
          <span class="font-bold text-xl text-virtue-purple">$${(item.price * item.qty).toFixed(2)}</span>
        </div>
      `;
      container.appendChild(div);
    });

    const formattedTotal = '$' + total.toFixed(2);
    if (subtotalEl) subtotalEl.innerText = formattedTotal;
    if (totalEl) totalEl.innerText = formattedTotal;
    if (modalTotalEl) modalTotalEl.innerText = formattedTotal;
  } catch (error) {
    console.error('Error updating cart UI:', error);
  }
}

// --- CHECKOUT MODAL LOGIC ---
function openCheckout() {
  if (cart.length === 0) {
    alert("Your cart is empty.");
    return;
  }
  document.getElementById('checkout-modal').classList.remove('hidden');
  // Focus management for accessibility
  document.getElementById('checkout-modal').focus();
}

function closeCheckout() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// --- DARK MODE LOGIC ---
function initDarkMode() {
  const savedTheme = localStorage.getItem('speakingVirtueTheme') || 'light';
  setTheme(savedTheme);
}

function toggleDarkMode() {
  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('speakingVirtueTheme', theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    const isDark = document.documentElement.classList.contains('dark');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
}

// --- SEARCH FUNCTIONALITY ---
function initSearch() {
  // Shop search
  const shopSearch = document.getElementById('shop-search');
  if (shopSearch) {
    shopSearch.addEventListener('input', filterProducts);
  }

  // Articles search
  const articlesSearch = document.getElementById('articles-search');
  if (articlesSearch) {
    articlesSearch.addEventListener('input', filterArticles);
  }
}

function filterProducts() {
  const searchTerm = document.getElementById('shop-search').value.toLowerCase();
  const products = document.querySelectorAll('#shop .group');

  products.forEach(product => {
    const title = product.querySelector('h3').textContent.toLowerCase();
    const shouldShow = title.includes(searchTerm);
    product.style.display = shouldShow ? 'block' : 'none';
  });
}

function filterArticles() {
  const searchTerm = document.getElementById('articles-search').value.toLowerCase();
  const articles = document.querySelectorAll('#articles article');

  articles.forEach(article => {
    const title = article.querySelector('h2').textContent.toLowerCase();
    const content = article.querySelector('p').textContent.toLowerCase();
    const shouldShow = title.includes(searchTerm) || content.includes(searchTerm);
    article.style.display = shouldShow ? 'block' : 'none';
  });
}

// --- LAZY LOADING ---
function initLazyLoading() {
  const images = document.querySelectorAll('img[data-src]');

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy-loading');
          img.classList.add('img-zoom');
          observer.unobserve(img);
        }
      });
    });

    images.forEach(img => {
      img.classList.add('lazy-loading');
      imageObserver.observe(img);
    });
  } else {
    // Fallback for browsers without IntersectionObserver
    images.forEach(img => {
      img.src = img.dataset.src;
    });
  }
}

// --- KEYBOARD NAVIGATION ---
function initKeyboardNavigation() {
  const nav = document.querySelector('nav');
  const menuItems = nav.querySelectorAll('[onclick^="navigateTo"]');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileMenuButton = document.querySelector('[aria-label="Open mobile menu"]');

  // Desktop navigation
  menuItems.forEach((item, index) => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextItem = menuItems[index + 1] || menuItems[0];
        nextItem.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevItem = menuItems[index - 1] || menuItems[menuItems.length - 1];
        prevItem.focus();
      }
    });
  });

  // Mobile menu
  mobileMenuButton.addEventListener('click', () => {
    const isHidden = mobileMenu.classList.contains('hidden');
    if (isHidden) {
      mobileMenu.classList.remove('hidden');
      mobileMenu.querySelector('button').focus();
    } else {
      mobileMenu.classList.add('hidden');
      mobileMenuButton.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    // Escape key closes modals and mobile menu
    if (e.key === 'Escape') {
      closeCheckout();
      if (!mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
        mobileMenuButton.focus();
      }
    }

    // Mobile menu toggle with keyboard
    if (e.key === 'Enter' && e.target.matches('.mobile-menu-toggle')) {
      document.getElementById('mobile-menu').classList.toggle('hidden');
    }
  });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  initDarkMode();
  initSearch();
  initLazyLoading();
  initKeyboardNavigation();
  navigateTo('home');
});
