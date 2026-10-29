// Live price and stock for shop cards marked data-sku, and Stripe Checkout on "Buy Now".
// Prices and stock come from the inventory sheet via /.netlify/functions/get-inventory;
// the price shown here is display only — create-checkout re-reads the sheet before charging.
(function () {
  var INVENTORY_URL = '/.netlify/functions/get-inventory';
  var CHECKOUT_URL = '/.netlify/functions/create-checkout';
  var LOW_STOCK = 2; // at or below this, the tag reads "Only N Left"

  var cards = document.querySelectorAll('.card[data-sku]');
  var status = document.getElementById('shop-status');
  if (!cards.length) return;

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
    var bySku = {};
    items.forEach(function (item) { bySku[item.sku] = item; });

    cards.forEach(function (card) {
      var item = bySku[card.dataset.sku];
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
      setButton(card, 'Buy Now', true);
    });
  }

  function loadInventory() {
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

  function startCheckout(card) {
    setButton(card, 'Starting Checkout…', false);
    showStatus('');
    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ sku: card.dataset.sku, quantity: 1 }] })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (result.ok && result.data.url) {
          window.location.href = result.data.url;
          return;
        }
        throw new Error(result.data.error || 'Checkout could not start.');
      })
      .catch(function (err) {
        showStatus(err.message || 'Checkout could not start. Please try again.', 'error');
        setButton(card, 'Buy Now', true);
      });
  }

  document.addEventListener('click', function (e) {
    var button = e.target.closest('.card[data-sku] button');
    if (button && !button.disabled) startCheckout(button.closest('.card'));
  });

  // Coming back from Stripe with the browser's Back button restores the page as it was
  // ("Starting Checkout…"), so refresh stock instead.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) loadInventory();
  });

  var outcome = new URLSearchParams(window.location.search).get('checkout');
  if (outcome === 'success') {
    showStatus('Thank you! Your order is confirmed, and a receipt is on its way to your email.', 'success');
  } else if (outcome === 'cancelled') {
    showStatus('Checkout was cancelled, and nothing was charged.');
  }

  loadInventory();
})();
