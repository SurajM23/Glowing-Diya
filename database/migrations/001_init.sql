CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Key/value business settings (brand, contact, delivery, payment, costs, site content)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Festival campaigns: theme and content only; never prices or delivery settings
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  festival TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  theme JSONB NOT NULL DEFAULT '{}',
  hero JSONB NOT NULL DEFAULT '{}',
  promo_heading TEXT NOT NULL DEFAULT '',
  promo_description TEXT NOT NULL DEFAULT '',
  offer_text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_campaign ON campaigns (active) WHERE active;

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pieces_per_box INTEGER NOT NULL DEFAULT 1 CHECK (pieces_per_box > 0),
  unit_cost INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  specs JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product ON product_images(product_id);

CREATE TABLE price_tiers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty INTEGER NOT NULL CHECK (min_qty >= 1),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  UNIQUE (product_id, min_qty)
);

-- Stock on hand = SUM(delta). Orders write 'reserve' (negative) and 'release' (positive).
CREATE TABLE inventory_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('add','reserve','release','damaged','lost','adjust')),
  note TEXT NOT NULL DEFAULT '',
  order_id INTEGER,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_product ON inventory_movements(product_id);

CREATE TABLE delivery_batches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  planned_date DATE,
  actual_km DOUBLE PRECISION,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new_enquiry' CHECK (status IN
    ('new_enquiry','awaiting_confirmation','confirmed','preparing','ready_for_delivery','out_for_delivery','delivered','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN
    ('unpaid','payment_pending','partially_paid','paid','refunded')),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  pin TEXT NOT NULL,
  landmark TEXT NOT NULL DEFAULT '',
  preferred_slot TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  batch_id INTEGER REFERENCES delivery_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_status ON orders(status);
CREATE INDEX orders_created ON orders(created_at);
CREATE INDEX orders_pin ON orders(pin);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX order_items_order ON order_items(order_id);

-- Snapshot of the delivery quote exactly as shown to the customer
CREATE TABLE delivery_quotes (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ok','manual_review','out_of_range')),
  provider TEXT NOT NULL,
  distance_km DOUBLE PRECISION,
  billed_km INTEGER,
  rate_per_km DOUBLE PRECISION NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  note TEXT NOT NULL DEFAULT '',
  quoted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX delivery_quotes_order ON delivery_quotes(order_id);

CREATE TABLE order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_history_order ON order_status_history(order_id);

CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  method TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL
);
CREATE INDEX payments_order ON payments(order_id);

CREATE TABLE delivery_attempts (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES delivery_batches(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('delivered','failed')),
  reason TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX delivery_attempts_order ON delivery_attempts(order_id);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded logos/banners/product photos live in the database so they survive redeploys
CREATE TABLE media (
  id SERIAL PRIMARY KEY,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
