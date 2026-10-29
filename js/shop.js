// Live price and stock for shop cards marked data-sku, and "Add to Cart" (js/cart.js).
// Prices and stock come from the inventory sheet via /.netlify/functions/get-inventory;
// the price shown here is display only — create-checkout re-reads the sheet before charging.
(function () {
  var INVENTORY_URL = '/.netlify/functions/get-inventory';
  var LOW_STOCK = 2; // at or below this, the tag reads "Only N Left"
  var ADDED_MS = 1600; // how long the button says "Added"

  var cards = document.querySelectorAll('.card[data-sku]');
  var status = document.getElementById('shop-status');
  var inventory = {}; // sku -> item from the sheet

  function showStatus(message, tone) {
    if (!status) return;
    status.textContent = message;
    status.className = 'shop-status' + (tone ? ' shop-status-' + tone : '');
    status.hidden = !message;
  }

  function setButton(card, label, enabled) {
    var button = card.querySelector('button');
    button.textContent = label;
    button.disabled = !enabled;
  }

  function setTag(card, label, outline) {
    var tag = card.querySelector('.tag');
    tag.className = 'tag ' + (outline ? 'tag-outline' : 'tag-neutral');
    tag.textContent = label;
  }

  function formatPrice(price) {
    return '$' + (Number.isInteger(price) ? price : price.toFixed(2));
  }

  function render(items) {
    inventory = {};
    items.forEach(function (item) { inventory[item.sku] = item; });

    cards.forEach(function (card) {
      var item = inventory[card.dataset.sku];
      card.classList.remove('is-sold-out');
      if (!item || item.price === null) {
        setTag(card, 'Coming Soon', false);
        setButton(card, 'Not Available Yet', false);
        return;
      }
      card.querySelector('.card-meta').textContent = formatPrice(item.price);
      if (!item.inStock) {
        card.classList.add('is-sold-out');
        setTag(card, 'Sold Out', true);
        setButton(card, 'Sold Out', false);
        return;
      }
      var low = item.quantity <= LOW_STOCK;
      setTag(card, low ? 'Only ' + item.quantity + ' Left' : item.quantity + ' in Stock', low);
      setButton(card, 'Add to Cart', true);
    });
  }

  function loadInventory() {
    if (!cards.length) return;
    cards.forEach(function (card) { setButton(card, 'Checking Stock…', false); });
    fetch(INVENTORY_URL, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('Inventory request failed (' + res.status + ')');
        return res.json();
      })
      .then(render)
      .catch(function (err) {
        console.error('Could not load inventory:', err);
        cards.forEach(function (card) { setButton(card, 'Unavailable Right Now', false); });
        showStatus("We couldn't load current stock. Please refresh the page in a few minutes.", 'error');
      });
  }

  function addToCart(card) {
    var item = inventory[card.dataset.sku];
    var button = card.querySelector('button');
    if (!item || !window.PoppasCart) return;
    var image = card.querySelector('.plate img');
    var result = window.PoppasCart.add(
      { sku: item.sku, name: item.name, price: item.price, image: image ? image.getAttribute('src') : '' },
      1,
      item.quantity
    );
    setButton(card, result.capped ? 'All ' + item.quantity + ' in Your Cart' : 'Added ✓', false);
    clearTimeout(button._resetTimer);
    button._resetTimer = setTimeout(function () { setButton(card, 'Add to Cart', true); }, ADDED_MS);
  }

  document.addEventListener('click', function (e) {
    var button = e.target.closest('.card[data-sku] button');
    if (button && !button.disabled) addToCart(button.closest('.card'));
  });

  // Coming back with the browser's Back button restores the page as it was, so refresh stock.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) loadInventory();
  });

  var outcome = new URLSearchParams(window.location.search).get('checkout');
  if (outcome === 'success') {
    if (window.PoppasCart) window.PoppasCart.clear();
    showStatus("Thank you! Your order is confirmed. We'll be in touch about shipping.", 'success');
  }
  if (outcome && window.history.replaceState) {
    // Drop ?checkout=… so a refresh or a shared link doesn't show the message again.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  loadInventory();
})();
