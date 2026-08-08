-- Migration: 001_outbox_correctness.sql
-- StageOps PostgreSQL Correctness Baseline Schema

-- Transactional Outbox Table
CREATE TABLE IF NOT EXISTS outbox_messages (
  id              UUID PRIMARY KEY,
  aggregate_type  VARCHAR(100) NOT NULL,
  aggregate_id    UUID NOT NULL,
  event_type      VARCHAR(200) NOT NULL,
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Claimed', 'Failed', 'Published', 'DeadLetter')),
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 5,
  next_retry_at   TIMESTAMPTZ,
  last_error      TEXT,
  locked_by       VARCHAR(100),
  locked_until    TIMESTAMPTZ,
  lease_version   INT NOT NULL DEFAULT 0,
  occurred_at     TIMESTAMPTZ NOT NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_messages (status, next_retry_at)
  WHERE status IN ('Pending', 'Failed');

-- Consumer Idempotency Table
CREATE TABLE IF NOT EXISTS processed_events (
  event_id       UUID NOT NULL,
  consumer_name  VARCHAR(200) NOT NULL,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, consumer_name)
);

-- Sales Channels Table (Authoritative Persistence for Sales Channel Metadata)
CREATE TABLE IF NOT EXISTS sales_channels (
  id                    VARCHAR(100) PRIMARY KEY,
  name                  VARCHAR(200) NOT NULL,
  commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sales_channels (id, name, commission_percentage) VALUES
  ('biletix', 'Biletix', 6.0),
  ('passo', 'Passo', 5.0),
  ('bugece', 'Bugece', 3.5),
  ('desk', 'Organizasyon Masası', 0.0),
  ('corporate', 'Kurumsal Acente', 2.0)
ON CONFLICT (id) DO NOTHING;

-- Sales Table (Aggregate Persistence)
CREATE TABLE IF NOT EXISTS sales (
  id                   UUID PRIMARY KEY,
  organization_id      VARCHAR(100) NOT NULL,
  event_id             VARCHAR(100) NOT NULL,
  reservation_id       VARCHAR(100),
  sales_channel_id     VARCHAR(100) NOT NULL,
  external_reference   VARCHAR(100) NOT NULL,
  purchaser_name       VARCHAR(200),
  purchaser_phone      VARCHAR(50),
  purchaser_email      VARCHAR(200),
  gross_price          NUMERIC(15,2) NOT NULL,
  commission_paid      NUMERIC(15,2) NOT NULL,
  net_revenue          NUMERIC(15,2) NOT NULL,
  currency             VARCHAR(3) NOT NULL,
  status               VARCHAR(30) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchaser_phone VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchaser_email VARCHAR(200);

-- Command Idempotency Unique Index (Prevents duplicate Sale creation for same channel + reference)
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_external_reference ON sales (sales_channel_id, external_reference);

-- Sale Lines Table (Aggregate Line Items)
CREATE TABLE IF NOT EXISTS sale_lines (
  id                UUID PRIMARY KEY,
  sale_id           UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  venue_asset_id    VARCHAR(100) NOT NULL,
  quantity          INT NOT NULL DEFAULT 1,
  unit_price        NUMERIC(15,2) NOT NULL,
  total_price       NUMERIC(15,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id ON sale_lines (sale_id);

-- Reservations Table (Aggregate Persistence & Reservation Holds with Status CHECK Constraint)
CREATE TABLE IF NOT EXISTS reservations (
  id                  UUID PRIMARY KEY,
  organization_id     VARCHAR(100) NOT NULL,
  event_id            VARCHAR(100) NOT NULL,
  asset_id            VARCHAR(100) NOT NULL,
  customer_id         VARCHAR(100),
  customer_name       VARCHAR(200) NOT NULL,
  customer_phone      VARCHAR(50),
  customer_email      VARCHAR(200),
  guest_count_pax     INT NOT NULL DEFAULT 1,
  status              VARCHAR(30) NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Cancelled', 'Expired', 'ConvertedToSale')),
  cancellation_reason VARCHAR(50),
  expiration_date     TIMESTAMPTZ NOT NULL,
  version             INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_asset ON reservations (asset_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_expiration ON reservations (expiration_date, status) WHERE status = 'Confirmed';

-- Accounting Entries (Business Mutation)
CREATE TABLE IF NOT EXISTS accounting_entries (
  id                UUID PRIMARY KEY,
  organization_id   VARCHAR(100) NOT NULL,
  event_id          UUID NOT NULL,
  source_type       VARCHAR(50) NOT NULL,
  source_id         UUID NOT NULL,
  entry_type        VARCHAR(50) NOT NULL,
  amount            NUMERIC(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL,
  accounting_amount NUMERIC(15,2) NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defense in depth: Business-level Unique constraint per (organization_id, source_type, source_id, entry_type)
DROP INDEX IF EXISTS ux_accounting_source_entry;
CREATE UNIQUE INDEX ux_accounting_source_entry ON accounting_entries (organization_id, source_type, source_id, entry_type);

-- Operations Projections (Business Mutation & Authoritative Asset State Locking)
CREATE TABLE IF NOT EXISTS venue_asset_projections (
  asset_id         VARCHAR(100) PRIMARY KEY,
  name             VARCHAR(200) NOT NULL,
  category         VARCHAR(50) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'Available',
  display_color    VARCHAR(30),
  occupancy_state  VARCHAR(30) NOT NULL DEFAULT 'Vacant',
  sale_id          VARCHAR(100),
  reservation_id   VARCHAR(100),
  pax_capacity     INT NOT NULL DEFAULT 0,
  base_price       NUMERIC(15,2) NOT NULL DEFAULT 0,
  version          INT NOT NULL DEFAULT 1,
  last_updated     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_rights (
  asset_id              VARCHAR(100) PRIMARY KEY,
  purchaser_name        VARCHAR(200),
  is_allowed            BOOLEAN NOT NULL DEFAULT FALSE,
  sale_id               VARCHAR(100),
  reservation_id        VARCHAR(100),
  already_admitted_count INT NOT NULL DEFAULT 0,
  max_capacity_pax      INT NOT NULL DEFAULT 0
);
