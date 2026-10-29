// Cart page: lists the cart (js/cart.js), re-checks it against fresh sheet data, and sends
// every item to create-checkout in one go. The server re-checks stock and price again before
// charging, so this page only keeps what the shopper sees honest.
(function () {
  var INVENTORY_URL = '/.netlify/functions/get-inventory?fresh=1';
  var CHECKOUT_URL = '/.netlify/functions/create-checkout';

  var cart = window.PoppasCart;
  var list = document.getElementById('cart-items');
  var emptyState = document.getElementById('cart-empty');
  var summary = document.getElementById('cart-summary');
  var subtotalEl = document.getElementById('cart-subtotal');
  var checkoutButton = document.getElementById('cart-checkout');
  var errorEl = document.getElementById('cart-error');
  var status = document.getElementById('shop-status');

  var inventory = null; // sku -> item from the sheet, once loaded
  var standingNotices = []; // shown above any later notices (cancelled checkout, blocked storage)
  var inventoryFailed = false;
  var busy = false;

  function money(amount) {
    return '$' + (Number.isInteger(amount) ? amount : amount.toFixed(2));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showNotices(messages, tone) {
    messages = standingNotices.concat(messages);
    status.textContent = '';
    messages.forEach(function (message) { status.appendChild(el('p', '', message)); });
    status.className = 'shop-status' + (tone ? ' shop-status-' + tone : '');
    status.hidden = messages.length === 0;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    if (message && errorEl.scrollIntoView) errorEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function keepHashInSync(items) {
    // Storage blocked: keep the cart in the address so a refresh doesn't lose it.
    if (!cart.storageWorks() && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + cart.hashFor(items));
    }
  }

  // Brings the cart in line with the sheet. Returns messages describing anything that changed.
  function reconcile() {
    var notices = [];
    var items = cart.items().filter(function (entry) {
      var item = inventory[entry.sku];
      if (!item || item.price === null) {
        notices.push(entry.name + " isn't available anymore, so we removed it from your cart.");
        return false;
      }
      if (!item.inStock) {
        notices.push('Sorry, ' + item.name + ' just sold out, so we removed it from your cart.');
        return false;
      }
      if (entry.quantity > item.quantity) {
        notices.push('Only ' + item.quantity + ' of ' + item.name + ' left, so we lowered your quantity to ' + item.quantity + '.');
        entry.quantity = item.quantity;
      }
      if (entry.price !== null && entry.price !== item.price) {
        notices.push('The price of ' + item.name + ' is now ' + money(item.price) + '.');
      }
      entry.price = item.price;
      entry.name = item.name;
      return true;
    });
    cart.save(items);
    return notices;
  }

  function render() {
    var items = cart.items();
    keepHashInSync(items);
    list.textContent = '';
    emptyState.hidden = items.length > 0;
    summary.hidden = items.length === 0;

    var subtotal = 0;
    items.forEach(function (entry) {
      var item = inventory && inventory[entry.sku];
      var price = item ? item.price : entry.price;
      var stock = item ? item.quantity : null;

      var row = el('li', 'cart-row');
      var thumb = el('div', 'plate cart-thumb');
      if (entry.image) {
        var img = el('img');
        img.src = entry.image;
        img.alt = '';
        thumb.appendChild(img);
      }
      row.appendChild(thumb);

      var info = el('div', 'cart-info');
      info.appendChild(el('div', 'card-title', entry.name));
      info.appendChild(el('div', 'text-muted cart-unit', price !== null ? money(price) + ' each' : 'Price to be confirmed'));
      if (stock !== null && entry.quantity >= stock) {
        info.appendChild(el('div', 'cart-note', stock === 1 ? 'Only 1 available' : 'All ' + stock + ' available are in your cart'));
      }
      row.appendChild(info);

      var qty = el('div', 'cart-qty');
      qty.setAttribute('role', 'group');
      qty.setAttribute('aria-label', 'Quantity of ' + entry.name);
      var minus = el('button', 'btn btn-secondary btn-icon', '−');
      minus.type = 'button';
      minus.dataset.action = 'decrease';
      minus.dataset.sku = entry.sku;
      minus.setAttribute('aria-label', 'One fewer');
      minus.disabled = entry.quantity <= 1 || busy;
      var value = el('span', 'cart-qty-value', String(entry.quantity));
      value.setAttribute('aria-live', 'polite');
      var plus = el('button', 'btn btn-secondary btn-icon', '+');
      plus.type = 'button';
      plus.dataset.action = 'increase';
      plus.dataset.sku = entry.sku;
      plus.setAttribute('aria-label', 'One more');
      plus.disabled = busy || stock === null || entry.quantity >= stock;
      qty.appendChild(minus);
      qty.appendChild(value);
      qty.appendChild(plus);
      row.appendChild(qty);

      var lineTotal = price !== null ? price * entry.quantity : null;
      if (lineTotal !== null) subtotal += lineTotal;
      row.appendChild(el('div', 'cart-line-total', lineTotal !== null ? money(lineTotal) : '—'));

      var removeButton = el('button', 'btn btn-ghost cart-remove', 'Remove');
      removeButton.type = 'button';
      removeButton.dataset.action = 'remove';
      removeButton.dataset.sku = entry.sku;
      removeButton.setAttribute('aria-label', 'Remove ' + entry.name);
      removeButton.disabled = busy;
      row.appendChild(removeButton);

      list.appendChild(row);
    });

    subtotalEl.textContent = money(Math.round(subtotal * 100) / 100);
    checkoutButton.disabled = busy || !inventory || items.length === 0;
    if (!busy) checkoutButton.textContent = inventory || inventoryFailed ? 'Checkout' : 'Checking Stock…';
  }

  function loadInventory() {
    inventory = null;
    inventoryFailed = false;
    render();
    return fetch(INVENTORY_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('Inventory request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (items) {
        inventory = {};
        items.forEach(function (item) { inventory[item.sku] = item; });
        var notices = reconcile();
        if (notices.length) showNotices(notices);
        showError('');
      })
      .catch(function (err) {
        console.error('Could not load inventory:', err);
        inventoryFailed = true;
        showError("We couldn't check current stock, so checkout is paused. Please refresh the page in a few minutes.");
      })
      .then(render);
  }

  // Applies the server's per-item answer when it refused the order (stock changed since this page loaded).
  function applyProblems(problems) {
    var notices = [];
    problems.forEach(function (problem) {
      var entry = cart.items().filter(function (e) { return e.sku === problem.sku; })[0];
      var name = problem.name || (entry && entry.name) || problem.sku;
      if (problem.reason === 'insufficient' && problem.available > 0) {
        cart.setQuantity(problem.sku, problem.available);
        if (inventory && inventory[problem.sku]) inventory[problem.sku].quantity = problem.available;
        notices.push('Only ' + problem.available + ' of ' + name + ' left, so we lowered your quantity to ' + problem.available + '.');
      } else {
        cart.remove(problem.sku);
        notices.push(problem.reason === 'sold_out'
          ? 'Sorry, ' + name + ' just sold out, so we removed it from your cart.'
          : name + " isn't available anymore, so we removed it from your cart.");
      }
    });
    if (notices.length) showNotices(notices);
  }

  function checkout() {
    var items = cart.items();
    if (busy || !items.length) return;
    busy = true;
    showError('');
    checkoutButton.textContent = 'Starting Checkout…';
    render();

    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items.map(function (e) { return { sku: e.sku, quantity: e.quantity }; }) })
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = JSON.parse(text); } catch (e) { /* not JSON, e.g. an error page */ }
          return { res: res, data: data };
        });
      })
      .then(function (result) {
        if (result.res.ok && result.data && result.data.url) {
          window.location.href = result.data.url;
          return;
        }
        if (result.data && Array.isArray(result.data.problems)) applyProblems(result.data.problems);
        throw new Error((result.data && result.data.error) ||
          "We couldn't start checkout just now (error " + result.res.status + '). Please try again in a few minutes.');
      })
      .catch(function (err) {
        console.error('Checkout failed:', err);
        busy = false;
        var offline = err && err.name === 'TypeError'; // fetch itself failed: offline or blocked
        showError(offline ? "We couldn't reach checkout. Please check your connection and try again." : err.message);
        render();
      });
  }

  list.addEventListener('click', function (e) {
    var button = e.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    var sku = button.dataset.sku;
    var entry = cart.items().filter(function (item) { return item.sku === sku; })[0];
    if (!entry) return;
    var stock = inventory && inventory[sku] ? inventory[sku].quantity : entry.quantity;
    if (button.dataset.action === 'increase') cart.setQuantity(sku, Math.min(stock, entry.quantity + 1));
    if (button.dataset.action === 'decrease') cart.setQuantity(sku, Math.max(1, entry.quantity - 1));
    if (button.dataset.action === 'remove') cart.remove(sku);
    showError('');
    render();
  });

  checkoutButton.addEventListener('click', checkout);

  // Cart changed in another tab: show it here too.
  window.addEventListener('storage', function (e) {
    if (e.key === 'poppas-cart-v1' && !busy) render();
  });

  // Back from Stripe via the Back button: the page is restored mid-"Starting Checkout…", so reset.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      busy = false;
      loadInventory();
    }
  });

  if (new URLSearchParams(window.location.search).get('checkout') === 'cancelled') {
    standingNotices.push('Checkout was cancelled, and nothing was charged. Your cart is just as you left it.');
    if (window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  if (!cart.storageWorks()) {
    standingNotices.push('Your browser is blocking site storage, so this cart is only kept while this page is open.');
  }
  showNotices([]);

  loadInventory();
})();
