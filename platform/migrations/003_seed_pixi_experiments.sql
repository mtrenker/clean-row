-- Seed: PixiJS-powered experiments
-- Added 2026-03-28

INSERT INTO experiments (id, slug, name, description, type, html_content, manifest, status, generated_by)
VALUES
  (
    '391feb50-5ee5-4afc-8ef6-d43bdf625896',
    'void-swarm',
    'Void Swarm',
    'Survive 5 minutes against an endless swarm of enemies. Your watts power your speed and weapons — row harder to shoot faster and spread further.',
    'game',
    '',
    '{"type":"game","difficulty":"medium","tags":["autobattler","pixi","survive"],"metric_weights":{"watts":0.4,"completion":0.4,"fun":0.2}}',
    'active',
    'human'
  )
ON CONFLICT (slug) DO NOTHING;
