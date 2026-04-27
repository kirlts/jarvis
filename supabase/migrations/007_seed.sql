-- Seed for Phase 1 Sandbox testing
INSERT INTO tenants (id, name) 
VALUES ('01905555-5555-7555-8555-555555555556', 'Baileys Test Tenant') 
ON CONFLICT DO NOTHING;
