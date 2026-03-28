-- Seed: built-in experiments shipped with the platform
-- These are human-authored, status=active, no pending review needed.
-- html_content is a stub — the nginx web server serves the actual files from /experiments/{slug}/index.html
-- The dashboard links to those static files directly; html_content here is only used for AI-generated experiments.

INSERT INTO experiments (slug, name, description, type, html_content, manifest, status, generated_by)
VALUES
  (
    'target-watts',
    'Watt Hunter',
    'Hit and hold power targets across 8 progressive intervals. Score points for staying in the zone.',
    'game',
    '<meta http-equiv="refresh" content="0;url=/experiments/target-watts/index.html">',
    '{"type":"game","difficulty":"medium","tags":["power","target","interval"],"metric_weights":{"watts":0.5,"completion":0.3,"fun":0.2}}',
    'active',
    'human'
  )
ON CONFLICT (slug) DO NOTHING;
