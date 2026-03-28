-- Seed: PixiJS-powered experiments (realm-raid and micro-sprint)
-- Added 2026-03-28

INSERT INTO experiments (slug, name, description, type, html_content, manifest, status, generated_by)
VALUES
  (
    'realm-raid',
    'Realm Raid',
    'Lead a party of three heroes into battle against waves of monsters. Your watts power your heroes'' damage — the harder you row, the harder they hit. Raise your SPM to speed up their attacks. Survive 5 waves and slay the Dark Overlord to clear the realm.',
    'game',
    '<meta http-equiv="refresh" content="0;url=/experiments/realm-raid/index.html">',
    '{"type":"game","difficulty":"medium","tags":["rpg","battler","pixi"],"metric_weights":{"watts":0.4,"completion":0.4,"fun":0.2}}',
    'active',
    'human'
  ),
  (
    'micro-sprint',
    'Micro Sprint',
    'Top-down circuit racing against 3 AI rivals on a classic oval track. Row harder to go faster — 150 W is full speed. Complete 10 laps before the competition to win. Slowing down below 30 W drops you to a crawl, so keep the power on!',
    'race',
    '<meta http-equiv="refresh" content="0;url=/experiments/micro-sprint/index.html">',
    '{"type":"race","difficulty":"medium","tags":["racing","top-down","pixi"],"metric_weights":{"watts":0.4,"completion":0.4,"fun":0.2}}',
    'active',
    'human'
  )
ON CONFLICT (slug) DO NOTHING;
