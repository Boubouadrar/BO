-- Migration : renommer / renforcer la table departments et ajouter table service_user (si besoin)
-- S'appuie sur le schéma initial. Exécuter dans PostgreSQL.

-- Si la table departments existe déjà, cette migration vérifie les colonnes et ajoute les colonnes utiles.
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Table de liaison utilisateurs <-> services (pour plusieurs attributions)
CREATE TABLE IF NOT EXISTS service_users (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_service VARCHAR(100), -- ex: responsable, secrétaire
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherche par nom / code
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);

-- Exemple d'insertion initiale (optionnel)
INSERT INTO departments (name, code, description) VALUES
  ('Direction des ressources humaines', 'DRH', 'DRH centrale') 
  ON CONFLICT DO NOTHING;