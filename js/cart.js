// Shopping cart kept in the browser, shared by every page; also keeps the nav cart count current.
// Each entry: { sku, quantity, name, price, image }. name/price/image are only a snapshot for
// display — the cart page re-checks them against the inventory sheet, and checkout charges the
// sheet's price on the server, never these.
//
// If localStorage is blocked (private modes, strict settings), the cart lives in memory and the
// nav cart link carries it to the cart page in its #hash, so adding items and checking out still work.
(function () {
  var KEY = 'poppas-cart-v1';
  var SKU_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
  var IMAGE_PATTERN = /^images\/[\w.-]+$/;
  var MAX_QUANTITY = 99;

  var storageWorks = (function () {
    try {
      localStorage.setItem(KEY + '-test', '1');
      localStorage.removeItem(KEY + '-test');
      return true;
    } catch (e) {
      return false;
    }
  })();
  var memory = storageWorks ? null : fromHash();

  function clean(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    return list.filter(function (entry) {
      if (!entry || typeof entry.sku !== 'string' || !SKU_PATTERN.test(entry.sku) || seen[entry.sku]) return false;
      seen[entry.sku] = true;
      return true;
    }).map(function (entry) {
      var quantity = Math.floor(Number(entry.quantity));
      return {
        sku: entry.sku,
        quantity: Math.min(MAX_QUANTITY, quantity >= 1 ? quantity : 1),
        name: typeof entry.name === 'string' && entry.name ? entry.name.slice(0, 120) : entry.sku,
        price: typeof entry.price === 'number' && isFinite(entry.price) && entry.price > 0 ? entry.price : null,
        image: typeof entry.image === 'string' && IMAGE_PATTERN.test(entry.image) ? entry.image : ''
      };
    });
  }

  // "#cart=WI-01*2,WI-05*1" — only used when storage is blocked.
  function fromHash() {
    var match = /(?:^#|&)cart=([^&]*)/.exec(window.location.hash || '');
    if (!match) return [];
    return clean(decodeURIComponent(match[1]).split(',').map(function (part) {
      var bits = part.split('*');
      return { sku: bits[0], quantity: Number(bits[1]) };
    }));
  }

  function toHash(list) {
    return list.length ? '#cart=' + encodeURIComponent(list.map(function (e) { return e.sku + '*' + e.quantity; }).join(',')) : '';
  }

  function items() {
    if (!storageWorks) return clean(memory);
    try {
      return clean(JSON.parse(localStorage.getItem(KEY) || '[]'));
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    list = clean(list);
    if (storageWorks) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch (e) {
        storageWorks = false; // e.g. quota exceeded: fall back to memory for the rest of this visit
        memory = list;
      }
    } else {
      memory = list;
    }
    refreshNav();
    document.dispatchEvent(new CustomEvent('poppas:cart-change'));
    return list;
  }

  function count() {
    return items().reduce(function (sum, e) { return sum + e.quantity; }, 0);
  }

  function refreshNav() {
    var total = count();
    var list = items();
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = total > MAX_QUANTITY ? MAX_QUANTITY + '+' : String(total);
      badge.hidden = total === 0;
      var link = badge.closest('a');
      if (!link) return;
      link.setAttribute('aria-label', total ? 'Cart, ' + total + (total === 1 ? ' item' : ' items') : 'Cart, empty');
      if (!storageWorks) link.setAttribute('href', './cart.html' + toHash(list));
    });
  }

  // Adds `quantity` of an item, never going above `max` (current stock) when it's known.
  // Returns { quantity, capped }: capped is true when the cart already held everything available.
  function add(entry, quantity, max) {
    var list = items();
    var limit = Math.min(MAX_QUANTITY, max > 0 ? max : MAX_QUANTITY);
    var existing = list.filter(function (e) { return e.sku === entry.sku; })[0];
    var current = existing ? existing.quantity : 0;
    if (current >= limit) return { quantity: current, capped: true };
    var next = Math.min(limit, current + (quantity || 1));
    if (existing) {
      existing.quantity = next;
      existing.name = entry.name || existing.name;
      existing.price = entry.price;
      existing.image = entry.image || existing.image;
    } else {
      list.push({ sku: entry.sku, quantity: next, name: entry.name, price: entry.price, image: entry.image });
    }
    save(list);
    return { quantity: next, capped: false };
  }

  function setQuantity(sku, quantity) {
    return save(items().map(function (e) {
      if (e.sku === sku) e.quantity = quantity;
      return e;
    }));
  }

  function remove(sku) {
    return save(items().filter(function (e) { return e.sku !== sku; }));
  }

  function clear() {
    return save([]);
  }

  window.PoppasCart = {
    items: items,
    save: save,
    add: add,
    setQuantity: setQuantity,
    remove: remove,
    clear: clear,
    count: count,
    storageWorks: function () { return storageWorks; },
    hashFor: function (list) { return toHash(clean(list)); }
  };

  // Keep the count right when the cart changes in another tab.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) refreshNav();
  });
  refreshNav();
})();
